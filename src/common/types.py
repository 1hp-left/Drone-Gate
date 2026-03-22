from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional

import numpy as np


@dataclass(frozen=True)
class CameraIntrinsics:
    fx: float
    fy: float
    cx: float
    cy: float

    def matrix(self) -> np.ndarray:
        return np.array(
            [[self.fx, 0.0, self.cx], [0.0, self.fy, self.cy], [0.0, 0.0, 1.0]],
            dtype=np.float64,
        )


@dataclass
class GateDetection:
    bbox_xyxy: np.ndarray
    corners_px: np.ndarray
    confidence: float
    track_id: int


@dataclass
class GatePoseEstimate:
    position_m: np.ndarray
    rotation_rvec: np.ndarray
    confidence: float
    covariance_diag: np.ndarray


@dataclass
class DroneState:
    position_m: np.ndarray
    velocity_mps: np.ndarray
    yaw_rad: float
    yaw_rate_rps: float


@dataclass
class TrajectoryPoint:
    t: float
    position_m: np.ndarray
    velocity_mps: np.ndarray
    yaw_rad: float


@dataclass
class Trajectory:
    points: List[TrajectoryPoint]

    def sample(self, t: float) -> TrajectoryPoint:
        if not self.points:
            raise ValueError("Trajectory has no points")
        if t <= self.points[0].t:
            return self.points[0]
        if t >= self.points[-1].t:
            return self.points[-1]
        for left, right in zip(self.points[:-1], self.points[1:]):
            if left.t <= t <= right.t:
                ratio = (t - left.t) / (right.t - left.t)
                return TrajectoryPoint(
                    t=t,
                    position_m=(1.0 - ratio) * left.position_m + ratio * right.position_m,
                    velocity_mps=(1.0 - ratio) * left.velocity_mps + ratio * right.velocity_mps,
                    yaw_rad=(1.0 - ratio) * left.yaw_rad + ratio * right.yaw_rad,
                )
        return self.points[-1]


@dataclass
class ControlCommand:
    accel_mps2: np.ndarray
    yaw_rate_rps: float


class MissionPhase(str, Enum):
    ACQUIRE_GATE = "acquire_gate"
    APPROACH = "approach"
    ALIGN = "align"
    TRAVERSE = "traverse"
    EXIT = "exit"
    REACQUIRE_NEXT = "reacquire_next"
    HOVER = "hover"
    ABORT = "abort"
    COMPLETE = "complete"


@dataclass
class MissionStatus:
    phase: MissionPhase
    active_gate_index: int
    lost_gate_steps: int = 0
    retries: int = 0


@dataclass
class TelemetryRecord:
    step: int
    sim_time_s: float
    state: DroneState
    mission_phase: MissionPhase
    active_gate_index: int
    gate_detected: bool
    gate_confidence: float
    pose_confidence: float
    tracking_error_m: float
    command: ControlCommand
    notes: Optional[str] = None


@dataclass
class EpisodeMetrics:
    detection_precision: float = 0.0
    detection_recall: float = 0.0
    mean_pose_error_m: float = 0.0
    traversal_success_rate: float = 0.0
    average_tracking_error_m: float = 0.0
    mission_completion_time_s: float = 0.0
    abort_count: int = 0
    crash_count: int = 0
    traversed_gates: int = 0
    total_gates: int = 0
    extra: dict = field(default_factory=dict)
