from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.types import DroneState


@dataclass
class StateEstimatorConfig:
    use_sim_truth_priority: bool = True


class StateEstimator:
    def __init__(self, config: StateEstimatorConfig | None = None) -> None:
        self.config = config or StateEstimatorConfig()
        self._state: DroneState | None = None

    def initialize(self, state: DroneState) -> None:
        self._state = state

    def update(
        self,
        sim_truth_state: DroneState | None,
        imu_accel_mps2: np.ndarray | None,
        dt_s: float,
    ) -> DroneState:
        if self._state is None and sim_truth_state is None:
            raise RuntimeError("State estimator needs initial state")

        if self.config.use_sim_truth_priority and sim_truth_state is not None:
            self._state = sim_truth_state
            return sim_truth_state

        state = self._state
        if state is None:
            state = sim_truth_state
            self._state = state
            return state

        if imu_accel_mps2 is None:
            return state

        state.velocity_mps = state.velocity_mps + imu_accel_mps2 * dt_s
        state.position_m = state.position_m + state.velocity_mps * dt_s
        self._state = state
        return state
