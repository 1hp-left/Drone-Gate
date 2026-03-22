from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.types import GateDetection
from perception.classical_detector import ClassicalDetectorConfig, ClassicalGateDetector


@dataclass
class PerceptionOutput:
    detections: list[GateDetection]


class GatePerceptionPipeline:
    def __init__(self, backend: str = "classical") -> None:
        if backend != "classical":
            raise ValueError(f"Unsupported perception backend for MVP: {backend}")
        self.detector = ClassicalGateDetector(ClassicalDetectorConfig())

    def run(self, frame_bgr: np.ndarray) -> PerceptionOutput:
        detections = self.detector.detect(frame_bgr)
        return PerceptionOutput(detections=detections)
