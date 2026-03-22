from __future__ import annotations

from common.types import CameraIntrinsics
from sim.airsim_adapter import AirSimAdapter
from sim.simulator import Gate, SimpleDroneSimulator


def build_sim_backend(cfg: dict, camera: CameraIntrinsics, gates: list[Gate]):
    backend = cfg["sim"].get("backend", "internal")
    if backend == "internal":
        return SimpleDroneSimulator(
            dt_s=float(cfg["sim"]["dt_s"]),
            image_size=tuple(cfg["sim"]["image_size"]),
            camera=camera,
            gates=gates,
            image_noise_std=float(cfg["sim"].get("image_noise_std", 0.0)),
            occlusion_prob=float(cfg["sim"].get("occlusion_prob", 0.0)),
            dynamics_noise_std=float(cfg["sim"].get("dynamics_noise_std", 0.0)),
            max_accel_mps2=float(cfg["control"].get("max_accel_mps2", 4.0)),
        )
    if backend == "airsim":
        airsim_cfg = cfg["sim"].get("airsim", {})
        return AirSimAdapter(
            dt_s=float(cfg["sim"].get("dt_s", 0.05)),
            image_size=tuple(cfg["sim"]["image_size"]),
            camera=camera,
            gates=gates,
            host=str(airsim_cfg.get("host", "127.0.0.1")),
            port=int(airsim_cfg.get("port", 41451)),
            vehicle_name=str(airsim_cfg.get("vehicle_name", "")),
            camera_name=str(airsim_cfg.get("camera_name", "0")),
            image_type=str(airsim_cfg.get("image_type", "Scene")),
            control_mode=str(airsim_cfg.get("control_mode", "acceleration")),
            reset_on_start=bool(airsim_cfg.get("reset_on_start", True)),
            auto_takeoff=bool(airsim_cfg.get("auto_takeoff", True)),
            takeoff_altitude_m=float(airsim_cfg.get("takeoff_altitude_m", 1.0)),
            takeoff_timeout_s=float(airsim_cfg.get("takeoff_timeout_s", 8.0)),
        )
    raise ValueError(f"Unsupported sim backend: {backend}")
