from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.types import CameraIntrinsics, GateDetection, GatePoseEstimate

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None


@dataclass
class PnPConfig:
    gate_width_m: float
    gate_height_m: float


class GatePoseEstimator:
    def __init__(self, camera: CameraIntrinsics, config: PnPConfig) -> None:
        self.camera = camera
        self.config = config
        self.object_corners = np.array(
            [
                [-config.gate_width_m / 2.0, -config.gate_height_m / 2.0, 0.0],
                [config.gate_width_m / 2.0, -config.gate_height_m / 2.0, 0.0],
                [config.gate_width_m / 2.0, config.gate_height_m / 2.0, 0.0],
                [-config.gate_width_m / 2.0, config.gate_height_m / 2.0, 0.0],
            ],
            dtype=np.float64,
        )

    def estimate(self, detection: GateDetection) -> GatePoseEstimate | None:
        corners = detection.corners_px.astype(np.float64)
        if corners.shape != (4, 2):
            return None

        if cv2 is None:
            bbox = detection.bbox_xyxy
            pixel_width = max(1.0, bbox[2] - bbox[0])
            z = self.camera.fx * self.config.gate_width_m / pixel_width
            cx = float(np.mean(corners[:, 0]))
            cy = float(np.mean(corners[:, 1]))
            y = (cx - self.camera.cx) * z / self.camera.fx
            x = z
            z_axis = -(cy - self.camera.cy) * z / self.camera.fy
            pos = np.array([x, y, z_axis], dtype=np.float64)
            return GatePoseEstimate(
                position_m=pos,
                rotation_rvec=np.zeros(3, dtype=np.float64),
                confidence=float(detection.confidence * 0.7),
                covariance_diag=np.array([0.2, 0.2, 0.25], dtype=np.float64),
            )

        success, rvec, tvec = cv2.solvePnP(
            self.object_corners,
            corners,
            self.camera.matrix(),
            np.zeros((4, 1), dtype=np.float64),
            flags=cv2.SOLVEPNP_IPPE,
        )
        if not success:
            return None

        projected, _ = cv2.projectPoints(
            self.object_corners,
            rvec,
            tvec,
            self.camera.matrix(),
            np.zeros((4, 1), dtype=np.float64),
        )
        reproj_err = float(np.mean(np.linalg.norm(projected.reshape(-1, 2) - corners, axis=1)))
        confidence = float(np.clip(detection.confidence * np.exp(-reproj_err / 8.0), 0.0, 1.0))
        covariance = np.full(3, 0.05 + reproj_err * 0.01, dtype=np.float64)

        pos = tvec.reshape(-1).astype(np.float64)
        return GatePoseEstimate(
            position_m=pos,
            rotation_rvec=rvec.reshape(-1).astype(np.float64),
            confidence=confidence,
            covariance_diag=covariance,
        )
