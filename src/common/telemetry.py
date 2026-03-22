from __future__ import annotations

import csv
import json
from dataclasses import asdict
from pathlib import Path
from typing import List

import numpy as np

from common.types import EpisodeMetrics, TelemetryRecord


class TelemetryLogger:
    def __init__(self, output_dir: str | Path) -> None:
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.records: List[TelemetryRecord] = []

    def add(self, record: TelemetryRecord) -> None:
        self.records.append(record)

    def flush(self) -> None:
        jsonl_path = self.output_dir / "telemetry.jsonl"
        with jsonl_path.open("w", encoding="utf-8") as f:
            for record in self.records:
                payload = {
                    "step": record.step,
                    "sim_time_s": record.sim_time_s,
                    "phase": record.mission_phase.value,
                    "active_gate_index": record.active_gate_index,
                    "gate_detected": record.gate_detected,
                    "gate_confidence": record.gate_confidence,
                    "pose_confidence": record.pose_confidence,
                    "tracking_error_m": record.tracking_error_m,
                    "position_m": record.state.position_m.tolist(),
                    "velocity_mps": record.state.velocity_mps.tolist(),
                    "yaw_rad": record.state.yaw_rad,
                    "accel_cmd_mps2": record.command.accel_mps2.tolist(),
                    "yaw_rate_cmd_rps": record.command.yaw_rate_rps,
                    "notes": record.notes,
                }
                f.write(json.dumps(payload) + "\n")

        csv_path = self.output_dir / "telemetry.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "step",
                    "sim_time_s",
                    "phase",
                    "active_gate_index",
                    "gate_detected",
                    "gate_confidence",
                    "pose_confidence",
                    "tracking_error_m",
                    "x",
                    "y",
                    "z",
                    "vx",
                    "vy",
                    "vz",
                    "yaw_rad",
                    "ax_cmd",
                    "ay_cmd",
                    "az_cmd",
                    "yaw_rate_cmd",
                ]
            )
            for record in self.records:
                writer.writerow(
                    [
                        record.step,
                        record.sim_time_s,
                        record.mission_phase.value,
                        record.active_gate_index,
                        int(record.gate_detected),
                        record.gate_confidence,
                        record.pose_confidence,
                        record.tracking_error_m,
                        *record.state.position_m.tolist(),
                        *record.state.velocity_mps.tolist(),
                        record.state.yaw_rad,
                        *record.command.accel_mps2.tolist(),
                        record.command.yaw_rate_rps,
                    ]
                )


def summarize_metrics(output_dir: str | Path, metrics: EpisodeMetrics) -> None:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = asdict(metrics)
    for key, value in list(payload.items()):
        if isinstance(value, np.ndarray):
            payload[key] = value.tolist()
    with (out_dir / "summary.json").open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
