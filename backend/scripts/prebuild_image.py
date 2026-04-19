"""Prebuild the deployment sandbox image so the first real deploy is fast.

Modal builds images lazily on first `Sandbox.create()`, and the OpenClaw +
Node + global-tools layers take a couple of minutes the first time. After
this script runs once successfully, the image is cached on Modal's side and
subsequent `Sandbox.create()` calls reuse it (~5-15s instead of ~3 min).

Run any time the image config changes (e.g. you edit `_build_image()` in
`app/services/sandbox.py` to add a tool, change a dependency, or tweak the
baked openclaw config). Re-running when nothing changed is a fast no-op.

Usage
-----
    cd backend
    uv run python scripts/prebuild_image.py

What it does
------------
1. Calls `Sandbox.create()` which forces Modal to build (or reuse) the image.
2. Runs a quick boot + sanity check:
   - sets the model
   - starts the openclaw gateway
   - polls the gateway health endpoint
3. Tears the sandbox down.

If anything fails it exits non-zero with the reason.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

# Make `app.*` importable when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.deploy import DEFAULT_MODEL  # noqa: E402
from app.services.sandbox import Sandbox  # noqa: E402


def main() -> int:
    print("==> Prebuilding deployment sandbox image")
    print(f"    model = {DEFAULT_MODEL}")
    print()

    overall = time.perf_counter()

    print("[1/3] Sandbox.create()  (Modal builds image if not cached)")
    t0 = time.perf_counter()
    try:
        sb = Sandbox.create(timeout_s=10 * 60)
    except Exception as e:
        print(f"FAIL: sandbox create failed: {e}")
        return 1
    print(f"      sandbox id = {sb.object_id}")
    print(f"      took {int((time.perf_counter() - t0) * 1000)}ms")
    print()

    try:
        print("[2/3] set_model + start_gateway  (warms openclaw + verifies HTTP)")
        t0 = time.perf_counter()
        sb.set_model(DEFAULT_MODEL)
        sb.start_gateway()
        print(f"      gateway up in {int((time.perf_counter() - t0) * 1000)}ms")
        print()

        print("[3/3] sanity: openclaw config get gateway.mode")
        res = sb.exec("openclaw config get gateway.mode", timeout_s=10)
        print(f"      stdout: {res.stdout.strip()}")
        if not res.ok():
            print(f"      FAIL stderr: {res.stderr.strip()}")
            return 1
        print()
    finally:
        print("Tearing sandbox down...")
        sb.terminate()

    print()
    print(f"DONE in {int((time.perf_counter() - overall) * 1000)}ms.")
    print("Image is now cached on Modal. Next Sandbox.create() will reuse it.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
