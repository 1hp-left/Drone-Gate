from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.math_utils import clamp_norm, wrap_angle_rad
from common.types import ControlCommand, DroneState, TrajectoryPoint


@dataclass
class PIDConfig:
    kp_pos: float = 1.8
    kd_vel: float = 1.1
    ki_pos: float = 0.0
    kp_yaw: float = 1.6
    max_accel_mps2: float = 4.0
    max_yaw_rate_rps: float = 1.5


class PIDTrajectoryController:
    def __init__(self, config: PIDConfig | None = None) -> None:
        self.config = config or PIDConfig()
        self.integral_error = np.zeros(3, dtype=np.float64)

    def reset(self) -> None:
        self.integral_error.fill(0.0)

    def command(self, state: DroneState, desired: TrajectoryPoint, dt_s: float) -> ControlCommand:
        pos_error = desired.position_m - state.position_m
        vel_error = desired.velocity_mps - state.velocity_mps
        self.integral_error = self.integral_error + pos_error * dt_s

        accel = (
            self.config.kp_pos * pos_error
            + self.config.kd_vel * vel_error
            + self.config.ki_pos * self.integral_error
        )
        accel = clamp_norm(accel, self.config.max_accel_mps2)

        yaw_error = wrap_angle_rad(desired.yaw_rad - state.yaw_rad)
        yaw_rate = float(np.clip(self.config.kp_yaw * yaw_error, -self.config.max_yaw_rate_rps, self.config.max_yaw_rate_rps))
        return ControlCommand(accel_mps2=accel, yaw_rate_rps=yaw_rate)
