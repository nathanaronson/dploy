"""Deployment agents.

Two prompts, run sequentially against an OpenClaw gateway inside a sandbox:

    Agent #1 (analyze) → produces an install/start plan as JSON.
    Agent #2 (expose)  → executes the plan and reports the public port.

The agents communicate their final answer by writing a JSON file at a known
workspace path (see `prompts.ANALYZE_REPORT_PATH` / `EXPOSE_REPORT_PATH`)
and ending the chat reply with a sentinel string. The orchestrator reads
the file via `sb.exec("cat ...")` after each chat round-trip.
"""

from .prompts import (
    ANALYZE_REPORT_PATH,
    ANALYZE_SENTINEL,
    ANALYZE_SYSTEM,
    ANALYZE_USER_TEMPLATE,
    ENVIRONMENT,
    EXPOSE_REPORT_PATH,
    EXPOSE_SENTINEL,
    EXPOSE_SYSTEM,
    EXPOSE_USER_TEMPLATE,
    FAILURE_SENTINEL,
    REPO_DIR,
    WORKSPACE_DIR,
    render_analyze_user,
    render_expose_user,
)

__all__ = [
    "ANALYZE_REPORT_PATH",
    "ANALYZE_SENTINEL",
    "ANALYZE_SYSTEM",
    "ANALYZE_USER_TEMPLATE",
    "ENVIRONMENT",
    "EXPOSE_REPORT_PATH",
    "EXPOSE_SENTINEL",
    "EXPOSE_SYSTEM",
    "EXPOSE_USER_TEMPLATE",
    "FAILURE_SENTINEL",
    "REPO_DIR",
    "WORKSPACE_DIR",
    "render_analyze_user",
    "render_expose_user",
]
