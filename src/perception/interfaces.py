from __future__ import annotations

from typing import Protocol

import numpy as np

from common.types import GateDetection


class GateDetector(Protocol):
    def detect(self, frame_bgr: np.ndarray) -> list[GateDetection]:
        ...
