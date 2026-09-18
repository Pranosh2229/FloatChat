"""
Chains the three data-refresh steps in the order they actually depend on each other, for
scheduled/unattended runs (see .github/workflows/refresh-data.yml): fresh ARGO profiles and SST
readings need to land before event detection recomputes anomalies/events/evidence against them.

Each step is a real, independent script (see ingest_argo.py / ingest_sst.py / detect_events.py's
own docstrings) — run as a subprocess rather than imported, so one step's asyncio event loop
never collides with another's. All three are already idempotent/re-runnable on their own; running
them back to back here doesn't change that.

Usage:
    python scripts/refresh_data.py
"""

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
STEPS = ["ingest_argo.py", "ingest_sst.py", "detect_events.py"]


def run_step(script_name: str) -> None:
    print(f"\n{'=' * 60}\n[refresh_data] running {script_name}\n{'=' * 60}", flush=True)
    result = subprocess.run([sys.executable, str(SCRIPTS_DIR / script_name)])
    if result.returncode != 0:
        print(f"[refresh_data] {script_name} exited with code {result.returncode} — stopping.")
        sys.exit(result.returncode)


def main() -> None:
    for step in STEPS:
        run_step(step)
    print("\n[refresh_data] all three steps completed.")


if __name__ == "__main__":
    main()
