from __future__ import annotations

import numpy as np

from common.types import DroneState
from planning.local_planner import LocalTrajectoryPlanner, PlannerConfig


def test_planner_generates_trajectory_through_gate_center() -> None:
    planner = LocalTrajectoryPlanner(PlannerConfig(num_points=21))
    state = DroneState(
        position_m=np.array([0.0, 0.0, 0.0]),
        velocity_mps=np.zeros(3),
        yaw_rad=0.0,
        yaw_rate_rps=0.0,
    )
    gate_center = np.array([5.0, 0.0, 0.0])
    gate_normal = np.array([1.0, 0.0, 0.0])

    traj = planner.plan(state, gate_center, gate_normal)
    positions = np.array([point.position_m for point in traj.points])
    min_dist = np.min(np.linalg.norm(positions - gate_center, axis=1))

    assert len(traj.points) == 21
    assert min_dist < 0.4
