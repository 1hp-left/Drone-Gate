from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np

from common.math_utils import clamp_norm, rotation_matrix_z
from common.types import CameraIntrinsics, ControlCommand, DroneState

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None


@dataclass
class Gate:
    center_m: np.ndarray
    width_m: float
    height_m: float
    yaw_rad: float = 0.0

    def corners_world(self) -> np.ndarray:
        half_w = self.width_m / 2.0
        half_h = self.height_m / 2.0
        local = np.array(
            [
                [0.0, -half_w, -half_h],
                [0.0, half_w, -half_h],
                [0.0, half_w, half_h],
                [0.0, -half_w, half_h],
            ],
            dtype=np.float64,
        )
        rot = rotation_matrix_z(self.yaw_rad)
        return (rot @ local.T).T + self.center_m

    def normal_world(self) -> np.ndarray:
        rot = rotation_matrix_z(self.yaw_rad)
        return rot @ np.array([1.0, 0.0, 0.0], dtype=np.float64)


@dataclass
class SimObservation:
    frame_bgr: np.ndarray
    drone_state: DroneState
    imu_accel_mps2: Optional[np.ndarray]
    active_gate_gt: Optional[Gate]
    active_gate_corners_px: Optional[np.ndarray]


class SimpleDroneSimulator:
    def __init__(
        self,
        dt_s: float,
        image_size: tuple[int, int],
        camera: CameraIntrinsics,
        gates: List[Gate],
        image_noise_std: float = 0.0,
        occlusion_prob: float = 0.0,
        dynamics_noise_std: float = 0.0,
        max_accel_mps2: float = 6.0,
    ) -> None:
        self.dt_s = dt_s
        self.width, self.height = image_size
        self.camera = camera
        self.gates = gates
        self.image_noise_std = image_noise_std
        self.occlusion_prob = occlusion_prob
        self.dynamics_noise_std = dynamics_noise_std
        self.max_accel_mps2 = max_accel_mps2
        self.time_s = 0.0
        self.state = DroneState(
            position_m=np.array([0.0, 0.0, 0.0], dtype=np.float64),
            velocity_mps=np.zeros(3, dtype=np.float64),
            yaw_rad=0.0,
            yaw_rate_rps=0.0,
        )
        self._initial_state = DroneState(
            position_m=self.state.position_m.copy(),
            velocity_mps=self.state.velocity_mps.copy(),
            yaw_rad=self.state.yaw_rad,
            yaw_rate_rps=self.state.yaw_rate_rps,
        )

    def set_state(self, state: DroneState) -> None:
        self.state = state

    def set_initial_state(self, state: DroneState) -> None:
        self._initial_state = DroneState(
            position_m=state.position_m.copy(),
            velocity_mps=state.velocity_mps.copy(),
            yaw_rad=state.yaw_rad,
            yaw_rate_rps=state.yaw_rate_rps,
        )
        self.set_state(
            DroneState(
                position_m=state.position_m.copy(),
                velocity_mps=state.velocity_mps.copy(),
                yaw_rad=state.yaw_rad,
                yaw_rate_rps=state.yaw_rate_rps,
            )
        )

    def reset_mission(self) -> None:
        self.time_s = 0.0
        self.set_state(
            DroneState(
                position_m=self._initial_state.position_m.copy(),
                velocity_mps=self._initial_state.velocity_mps.copy(),
                yaw_rad=self._initial_state.yaw_rad,
                yaw_rate_rps=self._initial_state.yaw_rate_rps,
            )
        )

    def initialize_mission(self) -> None:
        self.reset_mission()

    def close(self) -> None:
        return

    def _world_to_camera(self, points_world: np.ndarray) -> np.ndarray:
        drone_to_world = rotation_matrix_z(self.state.yaw_rad)
        world_to_drone = drone_to_world.T
        rel = points_world - self.state.position_m
        points_drone = (world_to_drone @ rel.T).T
        return points_drone

    def _project_points(self, points_camera: np.ndarray) -> Optional[np.ndarray]:
        z = points_camera[:, 0]
        if np.any(z <= 0.05):
            return None
        x = points_camera[:, 1]
        y = -points_camera[:, 2]
        u = self.camera.fx * (x / z) + self.camera.cx
        v = self.camera.fy * (y / z) + self.camera.cy
        return np.stack([u, v], axis=1)

    def _render_gate(self, frame: np.ndarray, corners_px: np.ndarray) -> None:
        corners_int = corners_px.astype(np.int32)
        if cv2 is not None:
            cv2.fillConvexPoly(frame, corners_int, (0, 0, 220))
            cv2.polylines(frame, [corners_int], True, (0, 0, 255), 3)
        else:
            min_u = max(0, int(np.min(corners_int[:, 0])))
            max_u = min(self.width - 1, int(np.max(corners_int[:, 0])))
            min_v = max(0, int(np.min(corners_int[:, 1])))
            max_v = min(self.height - 1, int(np.max(corners_int[:, 1])))
            frame[min_v : max_v + 1, min_u : max_u + 1, 2] = 220

    def _active_gate_index(self) -> Optional[int]:
        if not self.gates:
            return None
        distances = [np.linalg.norm(g.center_m - self.state.position_m) for g in self.gates]
        idx = int(np.argmin(distances))
        return idx

    def observe(self) -> SimObservation:
        frame = np.full((self.height, self.width, 3), 40, dtype=np.uint8)
        gate_idx = self._active_gate_index()
        active_gate = self.gates[gate_idx] if gate_idx is not None else None
        active_corners_px: Optional[np.ndarray] = None

        if active_gate is not None:
            corners_world = active_gate.corners_world()
            corners_cam = self._world_to_camera(corners_world)
            corners_px = self._project_points(corners_cam)
            if corners_px is not None:
                in_image = (
                    np.all(corners_px[:, 0] >= 0)
                    and np.all(corners_px[:, 0] < self.width)
                    and np.all(corners_px[:, 1] >= 0)
                    and np.all(corners_px[:, 1] < self.height)
                )
                if in_image:
                    if np.random.rand() >= self.occlusion_prob:
                        self._render_gate(frame, corners_px)
                    active_corners_px = corners_px

        if self.image_noise_std > 0:
            noise = np.random.normal(0.0, self.image_noise_std, frame.shape).astype(np.float32)
            frame = np.clip(frame.astype(np.float32) + noise, 0, 255).astype(np.uint8)

        imu_accel = np.zeros(3, dtype=np.float64)
        return SimObservation(
            frame_bgr=frame,
            drone_state=self.state,
            imu_accel_mps2=imu_accel,
            active_gate_gt=active_gate,
            active_gate_corners_px=active_corners_px,
        )

    def step(self, command: ControlCommand) -> SimObservation:
        accel = clamp_norm(command.accel_mps2.astype(np.float64), self.max_accel_mps2)
        if self.dynamics_noise_std > 0:
            accel = accel + np.random.normal(0.0, self.dynamics_noise_std, size=3)

        self.state.velocity_mps = self.state.velocity_mps + accel * self.dt_s
        self.state.position_m = self.state.position_m + self.state.velocity_mps * self.dt_s
        self.state.yaw_rate_rps = command.yaw_rate_rps
        self.state.yaw_rad = self.state.yaw_rad + self.state.yaw_rate_rps * self.dt_s
        self.time_s += self.dt_s
        return self.observe()


def build_gates_from_config(gate_cfgs: List[Dict]) -> List[Gate]:
    gates: List[Gate] = []
    for cfg in gate_cfgs:
        gates.append(
            Gate(
                center_m=np.array(cfg["center_m"], dtype=np.float64),
                width_m=float(cfg["width_m"]),
                height_m=float(cfg["height_m"]),
                yaw_rad=float(cfg.get("yaw_rad", 0.0)),
            )
        )
    return gates
