from __future__ import annotations

from pathlib import Path

from mission.runner import run_episode


def test_single_gate_episode_completes() -> None:
    config = Path("configs/easy.yaml")
    result = run_episode(str(config), seed=1)
    assert result.metrics.detection_recall >= 0.6
    assert result.metrics.abort_count == 0
