from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from common.types import GateDetection

try:
    import cv2
except Exception:  # pragma: no cover
    cv2 = None


@dataclass
class ClassicalDetectorConfig:
    min_area_px: float = 800.0
    confidence_threshold: float = 0.35


class ClassicalGateDetector:
    def __init__(self, config: ClassicalDetectorConfig | None = None) -> None:
        self.config = config or ClassicalDetectorConfig()
        self.track_counter = 0

    def _order_corners(self, corners: np.ndarray) -> np.ndarray:
        center = np.mean(corners, axis=0)
        angles = np.arctan2(corners[:, 1] - center[1], corners[:, 0] - center[0])
        ordered = corners[np.argsort(angles)]
        idx = int(np.argmin(np.sum(ordered, axis=1)))
        return np.roll(ordered, -idx, axis=0)

    def _fallback_detect(self, frame_bgr: np.ndarray) -> list[GateDetection]:
        red = frame_bgr[:, :, 2].astype(np.float32)
        mask = red > 160
        ys, xs = np.where(mask)
        if len(xs) == 0:
            return []
        min_x, max_x = int(np.min(xs)), int(np.max(xs))
        min_y, max_y = int(np.min(ys)), int(np.max(ys))
        area = (max_x - min_x) * (max_y - min_y)
        if area < self.config.min_area_px:
            return []
        corners = np.array(
            [[min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y]],
            dtype=np.float64,
        )
        conf = min(1.0, area / (frame_bgr.shape[0] * frame_bgr.shape[1] * 0.15))
        if conf < self.config.confidence_threshold:
            return []
        return [
            GateDetection(
                bbox_xyxy=np.array([min_x, min_y, max_x, max_y], dtype=np.float64),
                corners_px=corners,
                confidence=conf,
                track_id=0,
            )
        ]

    def detect(self, frame_bgr: np.ndarray) -> list[GateDetection]:
        if cv2 is None:
            return self._fallback_detect(frame_bgr)

        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        lower_red1 = np.array([0, 60, 60])
        upper_red1 = np.array([10, 255, 255])
        lower_red2 = np.array([170, 60, 60])
        upper_red2 = np.array([180, 255, 255])
        mask = cv2.inRange(hsv, lower_red1, upper_red1) | cv2.inRange(hsv, lower_red2, upper_red2)

        kernel = np.ones((3, 3), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections: list[GateDetection] = []

        for contour in contours:
            area = cv2.contourArea(contour)
            if area < self.config.min_area_px:
                continue
            perimeter = cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, 0.03 * perimeter, True)
            if len(approx) != 4:
                continue

            corners = approx.reshape(-1, 2).astype(np.float64)
            corners = self._order_corners(corners)
            min_x = float(np.min(corners[:, 0]))
            max_x = float(np.max(corners[:, 0]))
            min_y = float(np.min(corners[:, 1]))
            max_y = float(np.max(corners[:, 1]))
            bbox = np.array([min_x, min_y, max_x, max_y], dtype=np.float64)

            rect_area = max(1.0, (max_x - min_x) * (max_y - min_y))
            solidity = float(area / rect_area)
            confidence = float(min(1.0, 0.7 * solidity + 0.3 * min(1.0, area / 5000.0)))
            if confidence < self.config.confidence_threshold:
                continue

            detections.append(
                GateDetection(
                    bbox_xyxy=bbox,
                    corners_px=corners,
                    confidence=confidence,
                    track_id=0,
                )
            )

        detections.sort(key=lambda item: item.confidence, reverse=True)
        return detections
