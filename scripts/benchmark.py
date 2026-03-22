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
    parser = argparse.ArgumentParser(description="Run benchmark across configs")
    parser.add_argument("--configs", nargs="+", required=True, help="List of config files")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--report", default="artifacts/benchmark_report.json")
    args = parser.parse_args()

    report = {}
    for cfg in args.configs:
        result = run_episode(cfg, seed=args.seed)
        report[cfg] = {
            "completed": result.completed,
            **result.metrics.__dict__,
            "output_dir": str(result.output_dir),
        }

    report_path = Path(args.report)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Benchmark report written to {report_path}")


if __name__ == "__main__":
    main()
