"""Terminate every running sandbox in the deployment Modal app.

Use this to stop everything (warm-pool sandboxes + any live deployments)
without restarting the backend.

Usage
-----
    cd backend
    uv run python scripts/terminate_sandboxes.py

Equivalent CLI alternative:
    uv run modal app stop dploy-deployments
(but `app stop` also tears down the app object itself; this script only
terminates sandboxes.)
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import modal  # noqa: E402

from app.services.sandbox import APP_NAME  # noqa: E402


def main() -> int:
    app = modal.App.lookup(APP_NAME, create_if_missing=False)
    sandboxes = list(modal.Sandbox.list(app_id=app.app_id))
    if not sandboxes:
        print(f"No sandboxes running in app {APP_NAME!r}.")
        return 0

    print(f"Found {len(sandboxes)} sandbox(es) in {APP_NAME!r}:")
    for sb in sandboxes:
        print(f"  - {sb.object_id}")

    for sb in sandboxes:
        try:
            sb.terminate()
            print(f"  terminated {sb.object_id}")
        except Exception as e:
            print(f"  FAIL  {sb.object_id}: {e}")

    print(f"Done. {len(sandboxes)} terminate calls issued.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
