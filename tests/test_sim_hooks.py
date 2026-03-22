from __future__ import annotations

import numpy as np

from common.types import CameraIntrinsics, DroneState
from sim.simulator import Gate, SimpleDroneSimulator


def test_internal_sim_reset_and_initialize_hooks() -> None:
    sim = SimpleDroneSimulator(
        dt_s=0.05,
        image_size=(320, 240),
        camera=CameraIntrinsics(fx=250.0, fy=250.0, cx=160.0, cy=120.0),
        gates=[Gate(center_m=np.array([5.0, 0.0, 0.0]), width_m=2.0, height_m=2.0)],
    )

    init_state = DroneState(
        position_m=np.array([1.0, 2.0, 0.3]),
        velocity_mps=np.array([0.1, 0.2, 0.0]),
        yaw_rad=0.25,
        yaw_rate_rps=0.0,
    )
    sim.set_initial_state(init_state)

    sim.state.position_m[:] = np.array([9.0, 9.0, 9.0])
    sim.time_s = 12.0
    sim.reset_mission()

    assert np.allclose(sim.state.position_m, init_state.position_m)
    assert np.allclose(sim.state.velocity_mps, init_state.velocity_mps)
    assert sim.time_s == 0.0

    sim.state.position_m[:] = np.array([3.0, 3.0, 3.0])
    sim.initialize_mission()
    assert np.allclose(sim.state.position_m, init_state.position_m)
