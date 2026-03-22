from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from common.config import load_config
from common.math_utils import rotation_matrix_z
from common.telemetry import TelemetryLogger, summarize_metrics
from common.types import (
    CameraIntrinsics,
    ControlCommand,
    EpisodeMetrics,
    MissionPhase,
    TelemetryRecord,
)
from control.pid_controller import PIDConfig, PIDTrajectoryController
from estimation.filters import ExponentialPoseFilter, PoseFilterConfig
from estimation.pose_estimator import GatePoseEstimator, PnPConfig
from estimation.state_estimator import StateEstimator
from mission.manager import MissionConfig, MissionManager
from perception.pipeline import GatePerceptionPipeline
from planning.local_planner import LocalTrajectoryPlanner, PlannerConfig
from sim.factory import build_sim_backend
from sim.simulator import build_gates_from_config


@dataclass
class EpisodeResult:
    metrics: EpisodeMetrics
    output_dir: Path
    completed: bool


def _camera_from_cfg(cfg: dict) -> CameraIntrinsics:
    cam = cfg["sim"]["camera"]
    return CameraIntrinsics(fx=cam["fx"], fy=cam["fy"], cx=cam["cx"], cy=cam["cy"])


def _convert_gate_pose_to_world(drone_pos: np.ndarray, drone_yaw: float, rel_gate_pos: np.ndarray) -> np.ndarray:
    rot = rotation_matrix_z(drone_yaw)
    return drone_pos + rot @ rel_gate_pos


def run_episode(config_path: str, seed: int = 0) -> EpisodeResult:
    np.random.seed(seed)
    cfg = load_config(config_path)

    camera = _camera_from_cfg(cfg)
    gates = build_gates_from_config(cfg["sim"]["gates"])
    try:
        sim = build_sim_backend(cfg, camera, gates)
    except Exception:
        backend = str(cfg.get("sim", {}).get("backend", "internal"))
        fallback = bool(cfg.get("sim", {}).get("allow_backend_fallback", False))
        if backend == "airsim" and fallback:
            cfg["sim"]["backend"] = "internal"
            sim = build_sim_backend(cfg, camera, gates)
        else:
            raise
    sim.initialize_mission()

    perception = GatePerceptionPipeline(backend=cfg["perception"].get("backend", "classical"))
    pose_estimator = GatePoseEstimator(
        camera,
        PnPConfig(gate_width_m=float(gates[0].width_m), gate_height_m=float(gates[0].height_m)),
    )
    pose_filter = ExponentialPoseFilter(PoseFilterConfig(alpha=float(cfg["estimation"].get("pose_filter_alpha", 0.4))))

    estimator = StateEstimator()
    estimator.initialize(sim.observe().drone_state)
    planner = LocalTrajectoryPlanner(PlannerConfig(**cfg["planning"]))
    controller = PIDTrajectoryController(PIDConfig(**cfg["control"]))
    mission = MissionManager(gates, MissionConfig(**cfg["mission"]))

    output_dir = Path(cfg["runtime"].get("output_dir", "artifacts/default"))
    telemetry = TelemetryLogger(output_dir)

    max_steps = int(cfg["runtime"].get("max_steps", 500))
    replan_every_steps = int(cfg["runtime"].get("replan_every_steps", 3))

    true_positive = 0
    false_positive = 0
    false_negative = 0
    pose_errors: list[float] = []
    tracking_errors: list[float] = []

    current_traj = planner.plan(sim.state, gates[0].center_m, gates[0].normal_world())
    command = ControlCommand(accel_mps2=np.zeros(3, dtype=np.float64), yaw_rate_rps=0.0)

    try:
        for step in range(max_steps):
            obs = sim.step(command) if step > 0 else sim.observe()
            state = estimator.update(obs.drone_state, obs.imu_accel_mps2, sim.dt_s)

            perception_out = perception.run(obs.frame_bgr)
            best_det = perception_out.detections[0] if perception_out.detections else None

            if obs.active_gate_corners_px is not None and best_det is not None:
                true_positive += 1
            elif obs.active_gate_corners_px is None and best_det is not None:
                false_positive += 1
            elif obs.active_gate_corners_px is not None and best_det is None:
                false_negative += 1

            pose_raw = pose_estimator.estimate(best_det) if best_det is not None else None
            pose = pose_filter.update(pose_raw)

            if pose is not None and obs.active_gate_gt is not None:
                gate_world_pred = _convert_gate_pose_to_world(state.position_m, state.yaw_rad, pose.position_m)
                err = float(np.linalg.norm(gate_world_pred - obs.active_gate_gt.center_m))
                pose_errors.append(err)

            detection_conf = float(best_det.confidence) if best_det is not None else 0.0
            mission_status = mission.update(state.position_m, pose, detection_conf)

            if mission_status.phase == MissionPhase.ABORT:
                command = ControlCommand(accel_mps2=-0.6 * state.velocity_mps, yaw_rate_rps=0.0)
            elif mission_status.phase == MissionPhase.HOVER:
                command = ControlCommand(accel_mps2=-0.8 * state.velocity_mps, yaw_rate_rps=0.0)
            elif mission_status.phase == MissionPhase.COMPLETE:
                command = ControlCommand(accel_mps2=-0.7 * state.velocity_mps, yaw_rate_rps=0.0)
            else:
                active_gate = mission.current_gate() or gates[-1]
                if step % replan_every_steps == 0:
                    current_traj = planner.plan(state, active_gate.center_m, active_gate.normal_world())
                traj_duration = current_traj.points[-1].t if current_traj.points else 0.0
                sample_time = (sim.time_s % traj_duration) if traj_duration > 1e-6 else 0.0
                desired = current_traj.sample(sample_time)
                command = controller.command(state, desired, sim.dt_s)
                tracking_error = float(np.linalg.norm(desired.position_m - state.position_m))
                tracking_errors.append(tracking_error)

            telemetry.add(
                TelemetryRecord(
                    step=step,
                    sim_time_s=sim.time_s,
                    state=state,
                    mission_phase=mission_status.phase,
                    active_gate_index=mission_status.active_gate_index,
                    gate_detected=best_det is not None,
                    gate_confidence=detection_conf,
                    pose_confidence=0.0 if pose is None else pose.confidence,
                    tracking_error_m=tracking_errors[-1] if tracking_errors else 0.0,
                    command=command,
                )
            )

            if mission_status.phase in {MissionPhase.ABORT, MissionPhase.COMPLETE}:
                break
    finally:
        sim.close()

    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)

    metrics = EpisodeMetrics(
        detection_precision=float(precision),
        detection_recall=float(recall),
        mean_pose_error_m=float(np.mean(pose_errors)) if pose_errors else 99.0,
        traversal_success_rate=1.0 if mission.status.phase == MissionPhase.COMPLETE else 0.0,
        average_tracking_error_m=float(np.mean(tracking_errors)) if tracking_errors else 99.0,
        mission_completion_time_s=float(sim.time_s),
        abort_count=1 if mission.status.phase == MissionPhase.ABORT else 0,
        crash_count=0,
        traversed_gates=min(mission.status.active_gate_index, len(gates)),
        total_gates=len(gates),
        extra={"final_phase": mission.status.phase.value},
    )

    telemetry.flush()
    summarize_metrics(output_dir, metrics)
    return EpisodeResult(metrics=metrics, output_dir=output_dir, completed=mission.status.phase == MissionPhase.COMPLETE)
