from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mission.runner import run_episode


def main() -> None:
    parser = argparse.ArgumentParser(description="Run drone gate navigation MVP demo")
    parser.add_argument("--config", required=True, help="Path to YAML config")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    result = run_episode(args.config, seed=args.seed)
    print(f"Demo complete={result.completed} output_dir={result.output_dir}")
    print(json.dumps(result.metrics.__dict__, indent=2))


if __name__ == "__main__":
    main()
