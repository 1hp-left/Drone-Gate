from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.types import GatePoseEstimate, MissionPhase, MissionStatus
from sim.simulator import Gate


@dataclass
class MissionConfig:
    min_detection_confidence: float = 0.35
    max_lost_steps: int = 20
    max_retries: int = 2
    gate_reached_distance_m: float = 0.8
    gate_exit_distance_m: float = 1.2


class MissionManager:
    def __init__(self, gates: list[Gate], config: MissionConfig | None = None) -> None:
        self.gates = gates
        self.config = config or MissionConfig()
        self.status = MissionStatus(phase=MissionPhase.ACQUIRE_GATE, active_gate_index=0)

    def current_gate(self) -> Gate | None:
        if self.status.active_gate_index >= len(self.gates):
            return None
        return self.gates[self.status.active_gate_index]

    def _advance_gate(self) -> None:
        self.status.active_gate_index += 1
        self.status.lost_gate_steps = 0
        self.status.retries = 0
        if self.status.active_gate_index >= len(self.gates):
            self.status.phase = MissionPhase.COMPLETE
        else:
            self.status.phase = MissionPhase.REACQUIRE_NEXT

    def update(
        self,
        drone_position_m: np.ndarray,
        gate_pose: GatePoseEstimate | None,
        gate_detection_confidence: float,
    ) -> MissionStatus:
        gate = self.current_gate()
        if gate is None:
            self.status.phase = MissionPhase.COMPLETE
            return self.status

        rel = drone_position_m - gate.center_m
        gate_normal = gate.normal_world()
        gate_normal = gate_normal / (np.linalg.norm(gate_normal) + 1e-8)
        signed_progress = float(np.dot(rel, gate_normal))

        if signed_progress > self.config.gate_exit_distance_m:
            self.status.phase = MissionPhase.EXIT
            self._advance_gate()
            return self.status

        gate_detected = gate_detection_confidence >= self.config.min_detection_confidence

        if not gate_detected:
            self.status.lost_gate_steps += 1
            if self.status.lost_gate_steps > self.config.max_lost_steps:
                if self.status.retries < self.config.max_retries:
                    self.status.retries += 1
                    self.status.phase = MissionPhase.HOVER
                    self.status.lost_gate_steps = 0
                else:
                    self.status.phase = MissionPhase.ABORT
            return self.status

        self.status.lost_gate_steps = 0
        lateral_error = float(np.linalg.norm(rel - signed_progress * gate_normal))
        distance_to_gate = float(np.linalg.norm(rel))

        if self.status.phase in {MissionPhase.ACQUIRE_GATE, MissionPhase.REACQUIRE_NEXT, MissionPhase.HOVER}:
            self.status.phase = MissionPhase.APPROACH
        elif self.status.phase == MissionPhase.APPROACH and (distance_to_gate < 2.5 or signed_progress > -2.0):
            self.status.phase = MissionPhase.ALIGN
        elif self.status.phase == MissionPhase.ALIGN and (
            (signed_progress > -0.2 and lateral_error < self.config.gate_reached_distance_m)
            or signed_progress > 0.2
        ):
            self.status.phase = MissionPhase.TRAVERSE
        elif self.status.phase == MissionPhase.TRAVERSE and signed_progress > self.config.gate_exit_distance_m:
            self.status.phase = MissionPhase.EXIT
            self._advance_gate()
        elif self.status.phase in {MissionPhase.APPROACH, MissionPhase.ALIGN} and signed_progress > self.config.gate_exit_distance_m:
            self.status.phase = MissionPhase.EXIT
            self._advance_gate()

        return self.status
