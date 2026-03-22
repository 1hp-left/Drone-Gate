from __future__ import annotations

import importlib

import pytest

from sim.airsim_adapter import AirSimUnavailableError, _load_airsim_module


def test_airsim_module_loader_raises_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    original = importlib.import_module

    def fake_import(name: str):
        if name == "airsim":
            raise ModuleNotFoundError("airsim")
        return original(name)

    monkeypatch.setattr(importlib, "import_module", fake_import)

    with pytest.raises(AirSimUnavailableError):
        _load_airsim_module()
