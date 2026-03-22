from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.types import GatePoseEstimate


@dataclass
class PoseFilterConfig:
    alpha: float = 0.4


class ExponentialPoseFilter:
    def __init__(self, config: PoseFilterConfig | None = None) -> None:
        self.config = config or PoseFilterConfig()
        self._prev: GatePoseEstimate | None = None

    def update(self, measurement: GatePoseEstimate | None) -> GatePoseEstimate | None:
        if measurement is None:
            return self._prev
        if self._prev is None:
            self._prev = measurement
            return measurement

        alpha = self.config.alpha
        fused_pos = alpha * measurement.position_m + (1.0 - alpha) * self._prev.position_m
        fused_rvec = alpha * measurement.rotation_rvec + (1.0 - alpha) * self._prev.rotation_rvec
        fused_cov = alpha * measurement.covariance_diag + (1.0 - alpha) * self._prev.covariance_diag
        fused_conf = float(alpha * measurement.confidence + (1.0 - alpha) * self._prev.confidence)

        self._prev = GatePoseEstimate(
            position_m=fused_pos,
            rotation_rvec=fused_rvec,
            confidence=fused_conf,
            covariance_diag=fused_cov,
        )
        return self._prev
