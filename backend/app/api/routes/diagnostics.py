"""Operational diagnostics for the deploy stack.

These endpoints are intentionally light on auth — they're for inspecting how
the sandbox + OpenClaw are configured at runtime so we can tune things like
which built-in tools are enabled and what the agent loop iteration cap is.

NOTE: each call boots a fresh sandbox (or borrows a warm one) and tears it
down. Don't hammer these.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import sandbox_pool
from app.services.deploy import DEFAULT_MODEL
from app.services.sandbox import Sandbox

log = logging.getLogger(__name__)

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


class OpenClawConfigDump(BaseModel):
    sandbox_id: str
    model: str
    openclaw_version: str
    pool_size: int

    # The full openclaw.json (the agent's persistent config).
    config_file: str
    # The agent dir's `models.json` registry (provider list, alias map).
    models_json: str
    # `models status --json` (resolved model + auth + allowed list).
    models_status: str
    # **Every settable config key with type/description.** This is the most
    # important field for finding tunables we don't know about yet.
    config_schema: str
    # Help text for the gateway sub-command.
    gateway_help: str
    # Help text for the config sub-command.
    config_help: str
    # Anything in the agent dir we might want to inspect later.
    agent_dir_listing: str
    # Tail of the gateway log — sometimes reveals what tools are loaded.
    gateway_log_tail: str


@router.get("/openclaw-config", response_model=OpenClawConfigDump)
async def dump_openclaw_config() -> OpenClawConfigDump:
    """Borrow a sandbox and dump everything we can about OpenClaw's runtime
    config. Sandbox is terminated after the dump (not returned to the pool).
    """
    sb: Sandbox = await sandbox_pool.acquire(DEFAULT_MODEL)
    try:
        async def run(cmd: str, timeout: int = 15) -> str:
            res = await asyncio.to_thread(sb.exec, cmd, timeout_s=timeout)
            return res.stdout.strip() or res.stderr.strip()

        config_file = await run("cat /root/.openclaw/openclaw.json 2>&1 || echo '(missing)'")
        models_json = await run(
            "cat /root/.openclaw/agents/main/agent/models.json 2>&1 || echo '(missing)'"
        )
        models_status = await run("openclaw models status --json 2>&1 || true", timeout=20)
        # The schema lists EVERY settable key with type + description. Goldmine
        # for finding tunables (max iterations, prompt cache, tool toggles, etc.).
        config_schema = await run("openclaw config schema 2>&1 || true", timeout=20)
        gateway_help = await run("openclaw gateway --help 2>&1 || true")
        config_help = await run("openclaw config --help 2>&1 || true")
        agent_dir_listing = await run(
            "ls -la /root/.openclaw /root/.openclaw/agents/main/agent 2>&1 || true"
        )
        gateway_log_tail = await run("tail -n 200 /root/.openclaw/gateway.log 2>&1 || true")
        version = await run("openclaw --version", timeout=10)

        return OpenClawConfigDump(
            sandbox_id=sb.object_id,
            model=DEFAULT_MODEL,
            openclaw_version=version,
            pool_size=sandbox_pool.POOL_SIZE,
            config_file=config_file,
            models_json=models_json,
            models_status=models_status,
            config_schema=config_schema,
            gateway_help=gateway_help,
            config_help=config_help,
            agent_dir_listing=agent_dir_listing,
            gateway_log_tail=gateway_log_tail,
        )
    finally:
        await asyncio.to_thread(sb.terminate)
