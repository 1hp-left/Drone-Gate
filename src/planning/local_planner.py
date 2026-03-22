from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.math_utils import clamp_norm
from common.types import DroneState, Trajectory, TrajectoryPoint


@dataclass
class PlannerConfig:
    approach_distance_m: float = 2.0
    exit_distance_m: float = 1.5
    max_velocity_mps: float = 3.0
    max_accel_mps2: float = 3.0
    max_yaw_rate_rps: float = 1.2
    horizon_s: float = 4.0
    num_points: int = 25


class LocalTrajectoryPlanner:
    def __init__(self, config: PlannerConfig | None = None) -> None:
        self.config = config or PlannerConfig()

    def _segment_time(self, p0: np.ndarray, p1: np.ndarray) -> float:
        distance = float(np.linalg.norm(p1 - p0))
        return max(0.2, distance / max(0.2, self.config.max_velocity_mps))

    def plan(
        self,
        state: DroneState,
        gate_center_world_m: np.ndarray,
        gate_normal_world: np.ndarray,
    ) -> Trajectory:
        gate_normal = gate_normal_world.astype(np.float64)
        gate_normal = gate_normal / (np.linalg.norm(gate_normal) + 1e-8)

        approach = gate_center_world_m - gate_normal * self.config.approach_distance_m
        traverse = gate_center_world_m
        exit_p = gate_center_world_m + gate_normal * self.config.exit_distance_m

        waypoints = [state.position_m.copy(), approach, traverse, exit_p]
        seg_times = [self._segment_time(a, b) for a, b in zip(waypoints[:-1], waypoints[1:])]
        total_time = max(0.5, sum(seg_times))

        points: list[TrajectoryPoint] = []
        for idx in range(self.config.num_points):
            tau = idx / max(1, self.config.num_points - 1)
            t = tau * total_time
            segment_acc = 0.0
            segment_idx = len(seg_times) - 1
            for j, seg_t in enumerate(seg_times):
                if segment_acc <= t <= segment_acc + seg_t:
                    segment_idx = j
                    break
                segment_acc += seg_t

            local_t = t - segment_acc
            seg_t = seg_times[segment_idx]
            ratio = np.clip(local_t / max(seg_t, 1e-5), 0.0, 1.0)
            p0 = waypoints[segment_idx]
            p1 = waypoints[segment_idx + 1]
            pos = (1.0 - ratio) * p0 + ratio * p1
            vel = (p1 - p0) / max(seg_t, 1e-5)
            vel = clamp_norm(vel, self.config.max_velocity_mps)
            yaw = float(np.arctan2(gate_normal[1], gate_normal[0]))
            points.append(TrajectoryPoint(t=t, position_m=pos, velocity_mps=vel, yaw_rad=yaw))

        return Trajectory(points=points)
