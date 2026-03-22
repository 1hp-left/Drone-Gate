from __future__ import annotations

import argparse
import csv
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


def _find_repo_root() -> Path:
    candidates = [Path.cwd(), Path(__file__).resolve().parent, Path(__file__).resolve()]
    for candidate in candidates:
        for parent in [candidate, *candidate.parents]:
            if (parent / "pyproject.toml").exists() and (parent / "src").exists():
                return parent
    raise RuntimeError("Could not find repository root containing pyproject.toml and src/")


ROOT = _find_repo_root()
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from common.config import load_config
from mission.runner import run_episode


@dataclass
class TelemetryFrame:
    step: int
    time_s: float
    phase: str
    gate_index: int
    gate_detected: bool
    gate_confidence: float
    pose_confidence: float
    tracking_error_m: float
    position_m: np.ndarray
    velocity_mps: np.ndarray
    yaw_rad: float


def _load_telemetry_csv(path: Path) -> list[TelemetryFrame]:
    frames: list[TelemetryFrame] = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            frames.append(
                TelemetryFrame(
                    step=int(row["step"]),
                    time_s=float(row["sim_time_s"]),
                    phase=row["phase"],
                    gate_index=int(row["active_gate_index"]),
                    gate_detected=bool(int(row["gate_detected"])),
                    gate_confidence=float(row["gate_confidence"]),
                    pose_confidence=float(row["pose_confidence"]),
                    tracking_error_m=float(row["tracking_error_m"]),
                    position_m=np.array([float(row["x"]), float(row["y"]), float(row["z"])]),
                    velocity_mps=np.array([float(row["vx"]), float(row["vy"]), float(row["vz"])]),
                    yaw_rad=float(row["yaw_rad"]),
                )
            )
    return frames


def _gate_corners(center: np.ndarray, width_m: float, height_m: float, yaw_rad: float) -> np.ndarray:
    half_w = width_m / 2.0
    half_h = height_m / 2.0
    local = np.array(
        [
            [0.0, -half_w, -half_h],
            [0.0, half_w, -half_h],
            [0.0, half_w, half_h],
            [0.0, -half_w, half_h],
        ]
    )
    c = math.cos(yaw_rad)
    s = math.sin(yaw_rad)
    rot = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
    return (rot @ local.T).T + center


def _load_gates(config_path: Path | None) -> list[dict[str, Any]]:
    if config_path is None or not config_path.exists():
        return []
    cfg = load_config(config_path)
    return list(cfg.get("sim", {}).get("gates", []))


def _phase_color(phase: str) -> str:
    palette = {
        "acquire_gate": "#60a5fa",
        "approach": "#22c55e",
        "align": "#f59e0b",
        "traverse": "#ef4444",
        "exit": "#a855f7",
        "reacquire_next": "#0ea5e9",
        "hover": "#f97316",
        "abort": "#dc2626",
        "complete": "#16a34a",
    }
    return palette.get(phase, "#64748b")


def _render_static_snapshot(
    frames: list[TelemetryFrame],
    gates: list[dict[str, Any]],
    output_path: Path,
) -> None:
    import matplotlib.pyplot as plt

    xs = np.array([f.position_m[0] for f in frames])
    ys = np.array([f.position_m[1] for f in frames])
    zs = np.array([f.position_m[2] for f in frames])

    fig = plt.figure(figsize=(11, 7))
    ax3d = fig.add_subplot(121, projection="3d")
    axxy = fig.add_subplot(122)

    ax3d.plot(xs, ys, zs, color="#2563eb", linewidth=2, label="trajectory")
    ax3d.scatter(xs[-1], ys[-1], zs[-1], color="#ef4444", s=40, label="final")
    axxy.plot(xs, ys, color="#2563eb", linewidth=2)
    axxy.scatter(xs[-1], ys[-1], color="#ef4444", s=40)

    for gate in gates:
        corners = _gate_corners(
            np.array(gate["center_m"], dtype=np.float64),
            float(gate["width_m"]),
            float(gate["height_m"]),
            float(gate.get("yaw_rad", 0.0)),
        )
        loop = np.vstack([corners, corners[0]])
        ax3d.plot(loop[:, 0], loop[:, 1], loop[:, 2], color="#10b981", linewidth=2)
        axxy.plot(loop[:, 0], loop[:, 1], color="#10b981", linewidth=2)

    ax3d.set_title("3D Flight Path")
    ax3d.set_xlabel("x [m]")
    ax3d.set_ylabel("y [m]")
    ax3d.set_zlabel("z [m]")
    ax3d.legend(loc="upper right")

    axxy.set_title("Top-Down View")
    axxy.set_xlabel("x [m]")
    axxy.set_ylabel("y [m]")
    axxy.axis("equal")
    axxy.grid(alpha=0.3)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    print(f"Saved snapshot to {output_path}")


def _run_interactive_ui(frames: list[TelemetryFrame], gates: list[dict[str, Any]], fps: float) -> None:
    import matplotlib.pyplot as plt
    from matplotlib.widgets import Button, Slider

    xs = np.array([f.position_m[0] for f in frames])
    ys = np.array([f.position_m[1] for f in frames])
    zs = np.array([f.position_m[2] for f in frames])

    fig = plt.figure(figsize=(13, 8))
    ax3d = fig.add_axes([0.06, 0.2, 0.58, 0.72], projection="3d")
    axxy = fig.add_axes([0.68, 0.42, 0.28, 0.5])
    axinfo = fig.add_axes([0.68, 0.2, 0.28, 0.18])
    ax_slider = fig.add_axes([0.12, 0.1, 0.62, 0.04])
    ax_button = fig.add_axes([0.78, 0.09, 0.16, 0.055])

    axinfo.axis("off")

    for gate in gates:
        corners = _gate_corners(
            np.array(gate["center_m"], dtype=np.float64),
            float(gate["width_m"]),
            float(gate["height_m"]),
            float(gate.get("yaw_rad", 0.0)),
        )
        loop = np.vstack([corners, corners[0]])
        ax3d.plot(loop[:, 0], loop[:, 1], loop[:, 2], color="#10b981", linewidth=2)
        axxy.plot(loop[:, 0], loop[:, 1], color="#10b981", linewidth=2)

    path3d, = ax3d.plot([], [], [], color="#2563eb", linewidth=2)
    drone3d = ax3d.scatter([], [], [], color="#ef4444", s=36)
    heading3d, = ax3d.plot([], [], [], color="#f59e0b", linewidth=2)

    pathxy, = axxy.plot([], [], color="#2563eb", linewidth=2)
    dronexy = axxy.scatter([], [], color="#ef4444", s=36)

    ax3d.set_title("Drone Navigation UI")
    ax3d.set_xlabel("x [m]")
    ax3d.set_ylabel("y [m]")
    ax3d.set_zlabel("z [m]")

    axxy.set_title("Top-Down View")
    axxy.set_xlabel("x [m]")
    axxy.set_ylabel("y [m]")
    axxy.axis("equal")
    axxy.grid(alpha=0.3)

    margin = 1.0
    ax3d.set_xlim(float(np.min(xs) - margin), float(np.max(xs) + margin))
    ax3d.set_ylim(float(np.min(ys) - margin), float(np.max(ys) + margin))
    ax3d.set_zlim(float(np.min(zs) - margin), float(np.max(zs) + margin))
    axxy.set_xlim(float(np.min(xs) - margin), float(np.max(xs) + margin))
    axxy.set_ylim(float(np.min(ys) - margin), float(np.max(ys) + margin))

    slider = Slider(ax_slider, "Step", 0, len(frames) - 1, valinit=0, valstep=1)
    button = Button(ax_button, "Pause")

    state = {"idx": 0, "playing": True}

    def draw(idx: int) -> None:
        frame = frames[idx]
        path3d.set_data(xs[: idx + 1], ys[: idx + 1])
        path3d.set_3d_properties(zs[: idx + 1])

        drone3d._offsets3d = ([frame.position_m[0]], [frame.position_m[1]], [frame.position_m[2]])
        heading_len = 0.7
        hx = frame.position_m[0] + heading_len * math.cos(frame.yaw_rad)
        hy = frame.position_m[1] + heading_len * math.sin(frame.yaw_rad)
        hz = frame.position_m[2]
        heading3d.set_data([frame.position_m[0], hx], [frame.position_m[1], hy])
        heading3d.set_3d_properties([frame.position_m[2], hz])

        pathxy.set_data(xs[: idx + 1], ys[: idx + 1])
        dronexy.set_offsets(np.array([[frame.position_m[0], frame.position_m[1]]]))

        axinfo.clear()
        axinfo.axis("off")
        axinfo.text(
            0.01,
            0.92,
            f"time: {frame.time_s:.2f}s\\n"
            f"step: {frame.step}\\n"
            f"phase: {frame.phase}\\n"
            f"active gate: {frame.gate_index}\\n"
            f"detected: {int(frame.gate_detected)}\\n"
            f"gate conf: {frame.gate_confidence:.2f}\\n"
            f"pose conf: {frame.pose_confidence:.2f}\\n"
            f"track err: {frame.tracking_error_m:.2f}m",
            va="top",
            fontsize=10,
            color=_phase_color(frame.phase),
        )

        fig.canvas.draw_idle()

    def on_slider_change(val) -> None:
        state["idx"] = int(val)
        draw(state["idx"])

    def on_button_clicked(event) -> None:
        state["playing"] = not state["playing"]
        button.label.set_text("Pause" if state["playing"] else "Play")

    slider.on_changed(on_slider_change)
    button.on_clicked(on_button_clicked)

    timer = fig.canvas.new_timer(interval=max(10, int(1000.0 / max(1.0, fps))))

    def on_timer() -> None:
        if not state["playing"]:
            return
        state["idx"] = (state["idx"] + 1) % len(frames)
        slider.set_val(state["idx"])

    timer.add_callback(on_timer)
    timer.start()

    draw(0)
    plt.show()


def main() -> None:
    parser = argparse.ArgumentParser(description="Interactive drone navigation visualizer")
    parser.add_argument("--telemetry", default="artifacts/easy/telemetry.csv", help="Path to telemetry CSV")
    parser.add_argument("--summary", default="", help="Optional summary.json path")
    parser.add_argument("--config", default="configs/easy.yaml", help="Config file for gate overlays")
    parser.add_argument("--run-config", default="", help="If set, run an episode first with this config")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--fps", type=float, default=20.0)
    parser.add_argument("--no-gui", action="store_true", help="Render a static snapshot instead of interactive UI")
    parser.add_argument("--snapshot-out", default="artifacts/ui_snapshot.png", help="Path for snapshot output")
    args = parser.parse_args()

    telemetry_path = (ROOT / args.telemetry).resolve() if not Path(args.telemetry).is_absolute() else Path(args.telemetry)
    summary_path = (ROOT / args.summary).resolve() if args.summary and not Path(args.summary).is_absolute() else Path(args.summary)
    config_path = (ROOT / args.config).resolve() if args.config and not Path(args.config).is_absolute() else Path(args.config)

    if args.run_config:
        run_cfg = (ROOT / args.run_config).resolve() if not Path(args.run_config).is_absolute() else Path(args.run_config)
        result = run_episode(str(run_cfg), seed=args.seed)
        telemetry_path = result.output_dir / "telemetry.csv"
        summary_path = result.output_dir / "summary.json"
        config_path = run_cfg

    if not telemetry_path.exists():
        raise FileNotFoundError(f"Telemetry file not found: {telemetry_path}")

    frames = _load_telemetry_csv(telemetry_path)
    if not frames:
        raise RuntimeError("No telemetry frames available to visualize")

    gates = _load_gates(config_path)

    print(f"Loaded {len(frames)} frames from {telemetry_path}")
    if summary_path and summary_path.exists():
        with summary_path.open("r", encoding="utf-8") as f:
            summary = json.load(f)
        print(f"Summary: completion={summary.get('traversal_success_rate')} aborts={summary.get('abort_count')}")

    if args.no_gui:
        snapshot_path = (ROOT / args.snapshot_out).resolve() if not Path(args.snapshot_out).is_absolute() else Path(args.snapshot_out)
        _render_static_snapshot(frames, gates, snapshot_path)
        return

    _run_interactive_ui(frames, gates, fps=args.fps)


if __name__ == "__main__":
    main()
