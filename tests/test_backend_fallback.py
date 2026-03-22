from __future__ import annotations

from pathlib import Path

from mission.runner import run_episode


def test_airsim_config_falls_back_and_runs() -> None:
    result = run_episode(str(Path("configs/airsim_local.yaml")), seed=3)
    assert result.metrics.abort_count == 0
    assert result.metrics.traversed_gates >= 1
