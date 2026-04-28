"""Warm sandbox pool — DB-backed.

Each fresh `Sandbox.create()` pays ~18s for the OpenClaw gateway cold-start.
If we keep one or more sandboxes pre-provisioned (gateway already up, model
already configured), the next deployment skips that 18s entirely.

Design
------
* Pool state lives in the `warm_sandboxes` table (see
  `app.models.warm_sandbox`). Each row tracks one Modal sandbox in one of
  four states: `warming → ready → claimed`, plus `failed` for tombstones.
* Capacity per model = `POOL_SIZE`.
* `acquire(model)` performs a single atomic UPDATE that flips one `ready`
  row to `claimed` and returns it, so two concurrent acquires can never
  grab the same sandbox.
* On miss (no ready sandbox for the requested model), we fall back to
  swapping the model on a wrong-model sandbox, then to a fully synchronous
  provision. Every acquire kicks `_replenish` in the background.
* Sandboxes have a 30-min Modal timeout. We refresh by filtering out rows
  whose `created_at` is older than `WARM_TTL_S`.

Why DB instead of an in-process list?
-------------------------------------
1. Warm sandboxes survive backend restarts and code redeploys — no more
   re-paying the gateway boot every ship.
2. The diagnostics endpoint becomes a real SQL snapshot.
3. Sets us up for multi-container scaling later (still gated today by the
   in-memory WS terminal session registry).

Concurrency notes
-----------------
* Claim is atomic via `UPDATE ... WHERE id = (SELECT … LIMIT 1) RETURNING …`.
  SQLite (>= 3.35) and Postgres both support this.
* `_replenishing` is a per-process set that prevents a single container from
  racing itself. Cross-process double-replenishment is possible (max 1
  extra warm sandbox per overlapping replenish call). With the current
  single-container deploy that's moot; if we ever scale out, swap this
  for a row-level advisory lock.
* `shutdown()` is intentionally a no-op — warm sandboxes outlive the
  backend process, and Modal's per-sandbox timeout handles eventual
  termination. Use `scripts/terminate_sandboxes.py` to nuke them manually.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select, update

from app.db.session import SessionLocal
from app.models.warm_sandbox import (
    WARM_ALIVE_STATUSES,
    WARM_STATUS_CLAIMED,
    WARM_STATUS_FAILED,
    WARM_STATUS_READY,
    WARM_STATUS_WARMING,
    WarmSandbox,
)
from app.services.sandbox import Sandbox

log = logging.getLogger(__name__)

POOL_SIZE = 3
WARM_TTL_S = 25 * 60  # refresh before Modal's 30-min timeout kicks in
PRUNE_AFTER_S = WARM_TTL_S * 2  # delete rows past 2x TTL on lazy sweeps

# Per-process dedup for concurrent replenish kicks. Cross-process dedup is
# not currently needed (single container) — swap for a DB advisory lock if
# we ever scale out.
_replenishing: set[str] = set()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def acquire(model: str) -> Sandbox:
    """Get a sandbox ready to chat.

    Order of preference:
      1. Atomically claim a `ready` row for the requested model.
      2. Atomically claim any `ready` row, swap its model in-place.
      3. Provision a fresh sandbox synchronously.

    Always kicks `_replenish` in the background so the pool refills before
    the next acquire. Never blocks on the refill.
    """
    claimed = await _claim_ready(model=model, allow_wrong_model=False)
    if claimed is not None:
        sb = Sandbox.from_id(claimed.sandbox_id)
        log.info(
            "pool: HIT (model=%s, sandbox=%s, age=%.1fs)",
            model, claimed.sandbox_id, _age_seconds(claimed),
        )
        asyncio.create_task(_replenish(model))
        return sb

    swapped = await _claim_ready(model=model, allow_wrong_model=True)
    if swapped is not None:
        sb = Sandbox.from_id(swapped.sandbox_id)
        log.info(
            "pool: WARM-WRONG-MODEL (had=%s, want=%s, sandbox=%s); swapping",
            swapped.model, model, swapped.sandbox_id,
        )
        try:
            await asyncio.to_thread(sb.set_model, model)
        except Exception:
            log.exception("pool: model swap failed; provisioning fresh")
            await asyncio.to_thread(sb.terminate)
            await _delete_row(swapped.id)
        else:
            asyncio.create_task(_replenish(model))
            return sb

    log.info("pool: MISS (model=%s); provisioning fresh sandbox synchronously", model)
    asyncio.create_task(_replenish(model))
    return await asyncio.to_thread(_provision_warm_sb, model)


async def prewarm(model: str) -> None:
    """Public entrypoint to seed the pool at startup. Also lazily prunes
    stale rows so the table doesn't grow unbounded across restarts.
    """
    asyncio.create_task(_prune_stale())
    asyncio.create_task(_replenish(model))


async def shutdown() -> None:
    """No-op. Warm sandboxes survive backend process exit so a redeploy
    doesn't re-pay the 18s gateway boot. Modal's per-sandbox timeout
    eventually reclaims them; use `scripts/terminate_sandboxes.py` to
    force-clean during dev.
    """
    log.info("pool: shutdown (no-op; warm sandboxes outlive process exit)")


async def snapshot() -> dict:
    """Return a JSON-friendly snapshot of the current pool state."""
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        rows = (
            await db.execute(
                select(WarmSandbox)
                .where(WarmSandbox.status.in_(WARM_ALIVE_STATUSES))
                .order_by(WarmSandbox.created_at.desc())
            )
        ).scalars().all()

    items = []
    for r in rows:
        age_s = (now - _aware(r.created_at)).total_seconds()
        items.append({
            "id": r.id,
            "sandbox_id": r.sandbox_id,
            "model": r.model,
            "status": r.status,
            "age_s": round(age_s, 1),
            "ttl_remaining_s": round(WARM_TTL_S - age_s, 1),
            "expired": age_s >= WARM_TTL_S,
            "ready_at": r.ready_at.isoformat() if r.ready_at else None,
        })

    ready = [i for i in items if i["status"] == WARM_STATUS_READY and not i["expired"]]
    return {
        "capacity": POOL_SIZE,
        "warm_ttl_s": WARM_TTL_S,
        "ready_count": len(ready),
        "replenishing_models": sorted(_replenishing),
        "items": items,
    }


# ---------------------------------------------------------------------------
# Atomic claim
# ---------------------------------------------------------------------------

async def _claim_ready(*, model: str, allow_wrong_model: bool) -> WarmSandbox | None:
    """Atomically flip one `ready` row to `claimed` and return it.

    Single-statement `UPDATE … WHERE id = (SELECT … LIMIT 1) RETURNING …`,
    so two concurrent claimers cannot pick the same row — the second one's
    SELECT no longer matches and they get None.
    """
    cutoff = datetime.now(UTC) - timedelta(seconds=WARM_TTL_S)

    candidate = (
        select(WarmSandbox.id)
        .where(
            WarmSandbox.status == WARM_STATUS_READY,
            WarmSandbox.created_at >= cutoff,
            WarmSandbox.sandbox_id.is_not(None),
        )
    )
    if not allow_wrong_model:
        candidate = candidate.where(WarmSandbox.model == model)
    candidate = candidate.order_by(WarmSandbox.created_at).limit(1).scalar_subquery()

    stmt = (
        update(WarmSandbox)
        .where(
            WarmSandbox.id == candidate,
            # Defensive double-check in case status changed between the
            # subquery and the update (shouldn't, but cheap insurance).
            WarmSandbox.status == WARM_STATUS_READY,
        )
        .values(status=WARM_STATUS_CLAIMED, claimed_at=datetime.now(UTC))
        .returning(
            WarmSandbox.id,
            WarmSandbox.sandbox_id,
            WarmSandbox.model,
            WarmSandbox.created_at,
        )
    )
    async with SessionLocal() as db:
        row = (await db.execute(stmt)).first()
        await db.commit()

    if row is None:
        return None
    # Rehydrate as a detached WarmSandbox for the caller's convenience.
    out = WarmSandbox(
        id=row.id,
        sandbox_id=row.sandbox_id,
        model=row.model,
        status=WARM_STATUS_CLAIMED,
        created_at=row.created_at,
    )
    return out


# ---------------------------------------------------------------------------
# Replenish
# ---------------------------------------------------------------------------

async def _replenish(model: str) -> None:
    """Top up the pool to POOL_SIZE for `model`.

    Loops one slot at a time (rather than provisioning POOL_SIZE in
    parallel) so a single failure doesn't burn the whole budget. Skips
    entirely if another in-process replenish for the same model is already
    running.
    """
    if model in _replenishing:
        return
    _replenishing.add(model)
    try:
        while True:
            slot_id = await _reserve_slot(model)
            if slot_id is None:
                return
            t0 = datetime.now(UTC)
            try:
                sb = await asyncio.to_thread(_provision_warm_sb, model)
            except Exception as e:
                log.exception("pool: replenish failed (model=%s)", model)
                await _mark_failed(slot_id, str(e))
                return
            elapsed_ms = int((datetime.now(UTC) - t0).total_seconds() * 1000)
            await _mark_ready(slot_id, sb.object_id)
            log.info(
                "pool: warm sandbox ready in %dms (model=%s, sandbox=%s)",
                elapsed_ms, model, sb.object_id,
            )
    finally:
        _replenishing.discard(model)


async def _reserve_slot(model: str) -> str | None:
    """Reserve a slot for warming. Returns the row id, or None if the pool
    is already at capacity for this model.

    Races with concurrent reservations from other processes are possible
    (no cross-process lock today). The worst case is provisioning one
    extra warm sandbox per overlapping call, which Modal's TTL eventually
    reclaims. Acceptable for single-container; revisit when scaling out.
    """
    cutoff = datetime.now(UTC) - timedelta(seconds=WARM_TTL_S)
    async with SessionLocal() as db:
        alive = await db.scalar(
            select(func.count())
            .select_from(WarmSandbox)
            .where(
                WarmSandbox.model == model,
                WarmSandbox.status.in_(WARM_ALIVE_STATUSES),
                WarmSandbox.created_at >= cutoff,
            )
        )
        if (alive or 0) >= POOL_SIZE:
            return None
        row = WarmSandbox(model=model, status=WARM_STATUS_WARMING)
        db.add(row)
        await db.commit()
        await db.refresh(row)
        return row.id


async def _mark_ready(slot_id: str, sandbox_id: str) -> None:
    async with SessionLocal() as db:
        row = await db.get(WarmSandbox, slot_id)
        if row is None:
            log.warning("pool: slot %s vanished before mark_ready", slot_id)
            return
        row.sandbox_id = sandbox_id
        row.status = WARM_STATUS_READY
        row.ready_at = datetime.now(UTC)
        await db.commit()


async def _mark_failed(slot_id: str, error: str) -> None:
    async with SessionLocal() as db:
        row = await db.get(WarmSandbox, slot_id)
        if row is None:
            return
        row.status = WARM_STATUS_FAILED
        row.error = error[:500]
        await db.commit()


async def _delete_row(slot_id: str) -> None:
    async with SessionLocal() as db:
        await db.execute(delete(WarmSandbox).where(WarmSandbox.id == slot_id))
        await db.commit()


async def _prune_stale() -> None:
    """Delete rows older than 2x TTL or in `failed` state. Best-effort —
    swallows errors so a failed prune doesn't cascade into prewarm/acquire."""
    cutoff = datetime.now(UTC) - timedelta(seconds=PRUNE_AFTER_S)
    try:
        async with SessionLocal() as db:
            res = await db.execute(
                delete(WarmSandbox).where(
                    (WarmSandbox.created_at < cutoff)
                    | (WarmSandbox.status == WARM_STATUS_FAILED)
                )
            )
            await db.commit()
            if res.rowcount:
                log.info("pool: pruned %d stale rows", res.rowcount)
    except Exception:
        log.exception("pool: prune failed (non-fatal)")


# ---------------------------------------------------------------------------
# Sync helpers (run inside `to_thread`)
# ---------------------------------------------------------------------------

def _provision_warm_sb(model: str) -> Sandbox:
    """Sync provision: create + set model + start gateway + warmup chat.

    The warmup chat forces OpenClaw to do its lazy first-request init
    (plugin loading, runtime backend, session bootstrap) HERE in the
    background, so the next real deploy doesn't pay that 30-60s tax.
    """
    sb = Sandbox.create()
    try:
        sb.set_model(model)
        sb.start_gateway()
        sb.warmup_chat()
    except Exception:
        sb.terminate()
        raise
    return sb


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _aware(dt: datetime) -> datetime:
    """SQLite's DATETIME column round-trips naive datetimes. Coerce back
    to UTC-aware so arithmetic against `datetime.now(UTC)` doesn't blow up.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _age_seconds(row: WarmSandbox) -> float:
    return (datetime.now(UTC) - _aware(row.created_at)).total_seconds()


__all__ = ["acquire", "prewarm", "shutdown", "snapshot", "POOL_SIZE", "WARM_TTL_S"]
