from __future__ import annotations

import importlib
import math
from dataclasses import dataclass
from types import ModuleType
from typing import Optional

import numpy as np

from common.types import CameraIntrinsics, ControlCommand, DroneState
from sim.simulator import Gate, SimObservation


class AirSimUnavailableError(RuntimeError):
    pass


def _load_airsim_module() -> ModuleType:
    try:
        return importlib.import_module("airsim")
    except Exception as exc:
        raise AirSimUnavailableError(
            "AirSim Python client is unavailable. Install with `pip install airsim` and ensure AirSim is running."
        ) from exc


@dataclass
class _AirSimKinematics:
    position_m: np.ndarray
    velocity_mps: np.ndarray
    yaw_rad: float
    yaw_rate_rps: float


class AirSimAdapter:
    def __init__(
        self,
        dt_s: float,
        image_size: tuple[int, int],
        camera: CameraIntrinsics,
        gates: list[Gate],
        host: str = "127.0.0.1",
        port: int = 41451,
        vehicle_name: str = "",
        camera_name: str = "0",
        image_type: str = "Scene",
        control_mode: str = "acceleration",
        reset_on_start: bool = True,
        auto_takeoff: bool = True,
        takeoff_altitude_m: float = 1.0,
        takeoff_timeout_s: float = 8.0,
    ) -> None:
        self.dt_s = dt_s
        self.width, self.height = image_size
        self.camera = camera
        self.gates = gates
        self.vehicle_name = vehicle_name
        self.camera_name = camera_name
        self.image_type = image_type
        self.control_mode = control_mode
        self.reset_on_start = reset_on_start
        self.auto_takeoff = auto_takeoff
        self.takeoff_altitude_m = max(0.4, float(takeoff_altitude_m))
        self.takeoff_timeout_s = float(takeoff_timeout_s)
        self.time_s = 0.0

        self.airsim = _load_airsim_module()
        self.client = self.airsim.MultirotorClient(ip=host, port=port)
        self.client.confirmConnection()
        if self.reset_on_start:
            self.client.reset()
        self.client.enableApiControl(True, vehicle_name=self.vehicle_name)
        self.client.armDisarm(True, vehicle_name=self.vehicle_name)

        initial_state = self._read_kinematics()
        self.state = DroneState(
            position_m=initial_state.position_m,
            velocity_mps=initial_state.velocity_mps,
            yaw_rad=initial_state.yaw_rad,
            yaw_rate_rps=initial_state.yaw_rate_rps,
        )

    def reset_mission(self) -> None:
        self.time_s = 0.0
        self.client.reset()
        self.client.enableApiControl(True, vehicle_name=self.vehicle_name)
        self.client.armDisarm(True, vehicle_name=self.vehicle_name)
        kin = self._read_kinematics()
        self.state = DroneState(
            position_m=kin.position_m,
            velocity_mps=kin.velocity_mps,
            yaw_rad=kin.yaw_rad,
            yaw_rate_rps=kin.yaw_rate_rps,
        )

    def initialize_mission(self) -> None:
        if self.reset_on_start:
            self.reset_mission()
        if self.auto_takeoff:
            self.client.takeoffAsync(timeout_sec=self.takeoff_timeout_s, vehicle_name=self.vehicle_name).join()
            target_z_ned = -self.takeoff_altitude_m
            self.client.moveToZAsync(
                target_z_ned,
                velocity=1.5,
                timeout_sec=self.takeoff_timeout_s,
                vehicle_name=self.vehicle_name,
            ).join()
            kin = self._read_kinematics()
            self.state = DroneState(
                position_m=kin.position_m,
                velocity_mps=kin.velocity_mps,
                yaw_rad=kin.yaw_rad,
                yaw_rate_rps=kin.yaw_rate_rps,
            )

    def close(self) -> None:
        try:
            self.client.armDisarm(False, vehicle_name=self.vehicle_name)
            self.client.enableApiControl(False, vehicle_name=self.vehicle_name)
        except Exception:
            return

    def _to_local_position(self, vec3r) -> np.ndarray:
        return np.array([vec3r.x_val, vec3r.y_val, -vec3r.z_val], dtype=np.float64)

    def _to_local_velocity(self, vec3r) -> np.ndarray:
        return np.array([vec3r.x_val, vec3r.y_val, -vec3r.z_val], dtype=np.float64)

    def _read_kinematics(self) -> _AirSimKinematics:
        state = self.client.getMultirotorState(vehicle_name=self.vehicle_name)
        kin = state.kinematics_estimated
        pos = self._to_local_position(kin.position)
        vel = self._to_local_velocity(kin.linear_velocity)

        q = kin.orientation
        qw, qx, qy, qz = q.w_val, q.x_val, q.y_val, q.z_val
        yaw = math.atan2(2.0 * (qw * qz + qx * qy), 1.0 - 2.0 * (qy * qy + qz * qz))
        yaw_rate = float(kin.angular_velocity.z_val)
        return _AirSimKinematics(position_m=pos, velocity_mps=vel, yaw_rad=yaw, yaw_rate_rps=yaw_rate)

    def _active_gate(self) -> Optional[Gate]:
        if not self.gates:
            return None
        distances = [np.linalg.norm(g.center_m - self.state.position_m) for g in self.gates]
        return self.gates[int(np.argmin(distances))]

    def _read_frame_bgr(self) -> np.ndarray:
        image_enum = getattr(self.airsim.ImageType, self.image_type)
        request = self.airsim.ImageRequest(self.camera_name, image_enum, False, False)
        responses = self.client.simGetImages([request], vehicle_name=self.vehicle_name)
        if not responses:
            return np.full((self.height, self.width, 3), 0, dtype=np.uint8)

        resp = responses[0]
        if resp.width <= 0 or resp.height <= 0:
            return np.full((self.height, self.width, 3), 0, dtype=np.uint8)

        img = np.frombuffer(resp.image_data_uint8, dtype=np.uint8)
        img = img.reshape(resp.height, resp.width, 3)
        return img

    def observe(self) -> SimObservation:
        kin = self._read_kinematics()
        self.state = DroneState(
            position_m=kin.position_m,
            velocity_mps=kin.velocity_mps,
            yaw_rad=kin.yaw_rad,
            yaw_rate_rps=kin.yaw_rate_rps,
        )

        frame = self._read_frame_bgr()
        active_gate = self._active_gate()
        imu = np.zeros(3, dtype=np.float64)
        return SimObservation(
            frame_bgr=frame,
            drone_state=self.state,
            imu_accel_mps2=imu,
            active_gate_gt=active_gate,
            active_gate_corners_px=None,
        )

    def step(self, command: ControlCommand) -> SimObservation:
        ax, ay, az = float(command.accel_mps2[0]), float(command.accel_mps2[1]), float(command.accel_mps2[2])
        yaw_rate_deg = float(np.degrees(command.yaw_rate_rps))

        if self.control_mode == "velocity":
            vx = float(self.state.velocity_mps[0] + ax * self.dt_s)
            vy = float(self.state.velocity_mps[1] + ay * self.dt_s)
            vz = float(-(self.state.velocity_mps[2] + az * self.dt_s))
            self.client.moveByVelocityAsync(
                vx,
                vy,
                vz,
                self.dt_s,
                yaw_mode=self.airsim.YawMode(is_rate=True, yaw_or_rate=yaw_rate_deg),
                vehicle_name=self.vehicle_name,
            ).join()
        else:
            self.client.moveByAccelerationAsync(
                ax,
                ay,
                -az,
                self.dt_s,
                yaw_mode=self.airsim.YawMode(is_rate=True, yaw_or_rate=yaw_rate_deg),
                vehicle_name=self.vehicle_name,
            ).join()

        self.time_s += self.dt_s
        return self.observe()
