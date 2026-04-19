"""Inspect the warm sandbox pool — both the backend's in-process state
AND what Modal actually reports as running.

Useful for spotting:
* Pool not warming up (replenishing... never finishes)
* Orphaned sandboxes (Modal has them but the backend doesn't know)
* Old sandboxes near their 30-min Modal timeout
* Pool size != configured capacity

Usage
-----
    cd backend
    uv run python scripts/pool_status.py
    uv run python scripts/pool_status.py --backend http://localhost:8000

Exit code: 0 if everything looks healthy, 1 if there are orphans or the
backend can't be reached.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import modal  # noqa: E402

from app.services.sandbox import APP_NAME  # noqa: E402

DEFAULT_BACKEND = "http://localhost:8000"


def fetch_pool_status(base_url: str) -> dict | None:
    url = f"{base_url.rstrip('/')}/api/v1/diagnostics/sandbox-pool"
    try:
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read())
    except urllib.error.URLError as e:
        print(f"Could not reach backend at {url}: {e}", file=sys.stderr)
        return None


def list_modal_sandboxes() -> list[dict]:
    try:
        app = modal.App.lookup(APP_NAME, create_if_missing=False)
    except Exception as e:
        print(f"Could not look up modal app {APP_NAME!r}: {e}", file=sys.stderr)
        return []
    rows: list[dict] = []
    for sb in modal.Sandbox.list(app_id=app.app_id):
        rows.append({"sandbox_id": sb.object_id})
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--backend", default=DEFAULT_BACKEND,
        help=f"Backend base URL (default {DEFAULT_BACKEND})",
    )
    parser.add_argument(
        "--no-modal", action="store_true",
        help="Skip the Modal-side cross-check (faster, no Modal call).",
    )
    args = parser.parse_args()

    print(f"==> Pool status (backend: {args.backend})")
    pool = fetch_pool_status(args.backend)
    if pool is None:
        print()
        print("Backend unreachable. Is `make backend` running?")
        return 1

    print()
    print(f"  modal app:           {pool.get('modal_app_name')}")
    print(f"  default model:       {pool.get('default_model')}")
    print(f"  capacity:            {pool['capacity']}")
    print(f"  ready:               {pool['ready_count']} / {pool['capacity']}")
    print(f"  warm TTL:            {pool['warm_ttl_s']}s")
    if pool["replenishing_models"]:
        print(f"  REPLENISHING:        {', '.join(pool['replenishing_models'])}")
    print()

    if pool["items"]:
        print("  Warm sandboxes:")
        print(f"    {'sandbox_id':<28}  {'model':<32}  {'age':>7}  {'ttl':>7}  state")
        for item in pool["items"]:
            state = "EXPIRED" if item["expired"] else "ready"
            print(
                f"    {item['sandbox_id']:<28}  "
                f"{item['model']:<32}  "
                f"{item['age_s']:>6.1f}s  "
                f"{item['ttl_remaining_s']:>6.1f}s  "
                f"{state}"
            )
    else:
        print("  Warm sandboxes:      (none)")

    if args.no_modal:
        return 0

    print()
    print(f"==> Cross-checking with Modal (app={APP_NAME})")
    modal_sandboxes = list_modal_sandboxes()
    pool_ids = {item["sandbox_id"] for item in pool["items"]}
    modal_ids = {sb["sandbox_id"] for sb in modal_sandboxes}

    print(f"  modal-side total:    {len(modal_ids)}")
    print()

    in_pool_only = pool_ids - modal_ids
    in_modal_only = modal_ids - pool_ids
    in_both = pool_ids & modal_ids

    print(f"  in pool & running:   {len(in_both)}")
    if in_pool_only:
        print(f"  PHANTOM (in pool but not in Modal): {len(in_pool_only)}")
        for sid in sorted(in_pool_only):
            print(f"    - {sid}")
    if in_modal_only:
        # These are likely live deployments (acquired from pool, repo cloned,
        # gateway running an app). Not necessarily a problem — informational.
        print(
            f"  in Modal but not in pool (likely live deploys or "
            f"pre-pool sandboxes): {len(in_modal_only)}"
        )
        for sid in sorted(in_modal_only):
            print(f"    - {sid}")

    health = "OK" if not in_pool_only else "DEGRADED (phantom in pool)"
    print()
    print(f"==> Health: {health}")
    return 0 if not in_pool_only else 1


if __name__ == "__main__":
    raise SystemExit(main())
