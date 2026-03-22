from __future__ import annotations

import numpy as np

from common.types import CameraIntrinsics, GateDetection
from estimation.pose_estimator import GatePoseEstimator, PnPConfig


def test_pose_estimator_returns_pose_for_valid_quad() -> None:
    camera = CameraIntrinsics(fx=420.0, fy=420.0, cx=320.0, cy=240.0)
    estimator = GatePoseEstimator(camera, PnPConfig(gate_width_m=2.0, gate_height_m=2.0))

    corners = np.array([[280.0, 200.0], [360.0, 200.0], [360.0, 280.0], [280.0, 280.0]], dtype=np.float64)
    detection = GateDetection(
        bbox_xyxy=np.array([280.0, 200.0, 360.0, 280.0]),
        corners_px=corners,
        confidence=0.9,
        track_id=0,
    )

    pose = estimator.estimate(detection)

    assert pose is not None
    assert pose.position_m.shape == (3,)
    assert pose.confidence > 0.0
