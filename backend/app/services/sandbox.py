"""Modal sandbox + OpenClaw gateway lifecycle for deployments.

Each deployment gets its own ephemeral sandbox. Boot sequence:

  1. `Sandbox.create()` — Modal sandbox from the cached `_build_image()`.
  2. `clone_repo()` (background) + `set_model()` + `start_gateway()`.
  3. `wait_for_repo()` + gateway poll.
  4. `chat(...)` — POST to the local OpenClaw gateway (OpenAI-compatible).
  5. `read_text(path)` / `read_json(path)` — pull structured output written
     by the agent.
  6. `tunnel(port)` — public Modal URL for the deployed app's port.
  7. `terminate()` on teardown.

The Modal SDK is synchronous; async callers should wrap in
`asyncio.to_thread`.

Image content
-------------
Debian + curl/git + Node 22 + global pnpm/yarn/bun + Python 3 + Go +
OpenClaw (npm-installed globally, config baked in for gateway + LLM keys).
The model is set at runtime, not baked, so it can change per deployment.
"""

from __future__ import annotations

import json
import logging
import shlex
import time
from dataclasses import dataclass
from typing import Any

import modal

from app.core.config import get_settings

log = logging.getLogger(__name__)

WORKSPACE_DIR = "/root/.openclaw/workspace"
REPO_DIR = f"{WORKSPACE_DIR}/repo"
APP_NAME = "dploy-deployments"
GATEWAY_PORT = 18789

# Common framework default ports — declared at sandbox creation so we can
# open a Modal tunnel for whichever one the deployed app picks. If the agent
# selects something exotic we fall back to "no public URL".
TUNNELABLE_PORTS = (3000, 3001, 4000, 4321, 5000, 5173, 8000, 8080, 8081, 8501, 8888, 9000)

_IMAGE: modal.Image | None = None
_APP: modal.App | None = None


def _build_image() -> modal.Image:
    settings = get_settings()
    anthropic_key = settings.anthropic_api_key
    openai_key = ""  # not in settings yet; add if needed

    # Tools we explicitly deny. Keep the file/exec/http tools the deployment
    # agents need (exec, read_file, write_file, edit_file, list_dir, glob,
    # grep, web_fetch, todo_write). Deny everything heavy/multimedia that the
    # agents would never use for our install-and-expose task — every disabled
    # tool's schema disappears from the system prompt sent to Anthropic on
    # every turn, saving prefill tokens.
    DENIED_TOOLS = [
        "web_search",
        "image_generate",
        "image_edit",
        "music_generate",
        "video_generate",
        "browser",
        "browser_navigate",
        "browser_screenshot",
        "pdf",
        "sound_generate",
        "computer_use",
        "discord_send",
        "slack_send",
    ]
    deny_json = json.dumps(DENIED_TOOLS)

    config_cmds = [
        "openclaw config set gateway.mode local",
        "openclaw config set gateway.http.endpoints.chatCompletions.enabled true",
        # Clear any allowlist that earlier config-set calls may have created.
        # Without this, OpenClaw rejects every model except the primary with
        # "Model X is not allowed", which silently breaks per-deployment
        # model overrides.
        "openclaw config unset agents.defaults.models 2>/dev/null || true",
        # Disable unused tools (deny always wins over allow). Shrinks every
        # LLM turn's system prompt by however many tool schemas these
        # represent.
        f"openclaw config set tools.deny {shlex.quote(deny_json)} --strict-json",
    ]
    if anthropic_key:
        config_cmds.append(
            f'openclaw config set env.vars.ANTHROPIC_API_KEY "{anthropic_key}"'
        )
    if openai_key:
        config_cmds.append(
            f'openclaw config set env.vars.OPENAI_API_KEY "{openai_key}"'
        )

    env_inline = (
        "PATH=/root/.npm-global/bin:$PATH HOME=/root "
        "OPENCLAW_STATE_DIR=/root/.openclaw "
        "NODE_COMPILE_CACHE=/root/.compile-cache OPENCLAW_NO_RESPAWN=1"
    )

    return (
        modal.Image.debian_slim()
        .apt_install(
            "curl",
            "git",
            "ca-certificates",
            "build-essential",
            "iproute2",
            "procps",
            "jq",
            "python3",
            "python3-pip",
            "python3-venv",
            "golang-go",
        )
        .run_commands("curl -fsSL https://deb.nodesource.com/setup_22.x | bash -")
        .apt_install("nodejs")
        .run_commands(
            "mkdir -p /root/.npm-global /root/.npm-cache /root/.openclaw "
            "/root/.openclaw/workspace /root/.compile-cache",
            "NPM_CONFIG_PREFIX=/root/.npm-global NPM_CONFIG_CACHE=/root/.npm-cache "
            "npm install -g openclaw@latest pnpm yarn bun",
            # Bake openclaw config (cached layer).
            f"{env_inline} bash -c " + json.dumps(" && ".join(config_cmds)),
            # Warm Node compile cache.
            f"{env_inline} openclaw --version >/dev/null",
            # Pre-warm the gateway: boot it briefly so V8 JITs the gateway
            # code paths, then kill it. Cuts ~3-5s off cold-start at runtime
            # because the bytecode cache is already populated.
            f"{env_inline} bash -c '"
            "nohup openclaw gateway run --auth none > /tmp/gw-warm.log 2>&1 & "
            "GW_PID=$!; "
            "for i in $(seq 1 40); do "
            f"  curl -sf http://127.0.0.1:{GATEWAY_PORT}/ >/dev/null && break; "
            "  sleep 0.25; "
            "done; "
            "kill -9 $GW_PID 2>/dev/null; "
            "wait $GW_PID 2>/dev/null; "
            "true'",
        )
        .env({
            "PATH": "/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:"
                    "/usr/sbin:/usr/bin:/sbin:/bin",
            "HOME": "/root",
            "OPENCLAW_STATE_DIR": "/root/.openclaw",
            "NODE_COMPILE_CACHE": "/root/.compile-cache",
            "OPENCLAW_NO_RESPAWN": "1",
            "DEBIAN_FRONTEND": "noninteractive",
        })
    )


def _get_app() -> modal.App:
    global _APP
    if _APP is None:
        _APP = modal.App.lookup(APP_NAME, create_if_missing=True)
    return _APP


def _get_image() -> modal.Image:
    global _IMAGE
    if _IMAGE is None:
        _IMAGE = _build_image()
    return _IMAGE


@dataclass
class ExecResult:
    exit_code: int
    stdout: str
    stderr: str

    def ok(self) -> bool:
        return self.exit_code == 0


class SandboxError(RuntimeError):
    pass


class Sandbox:
    """Wrapper around `modal.Sandbox` with OpenClaw + exec helpers."""

    def __init__(self, sb: modal.Sandbox) -> None:
        self._sb = sb

    @property
    def object_id(self) -> str:
        return self._sb.object_id

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @classmethod
    def create(cls, *, timeout_s: int = 30 * 60) -> "Sandbox":
        log.info("creating modal sandbox (timeout=%ds, ports=%s)",
                 timeout_s, list(TUNNELABLE_PORTS))
        t0 = time.perf_counter()
        sb = modal.Sandbox.create(
            image=_get_image(),
            app=_get_app(),
            timeout=timeout_s,
            encrypted_ports=list(TUNNELABLE_PORTS),
        )
        log.info("sandbox created: id=%s in %dms",
                 sb.object_id, int((time.perf_counter() - t0) * 1000))
        return cls(sb)

    @classmethod
    def from_id(cls, sandbox_id: str) -> "Sandbox":
        return cls(modal.Sandbox.from_id(sandbox_id))

    def terminate(self) -> None:
        try:
            self._sb.terminate()
            log.info("sandbox terminated: id=%s", self._sb.object_id)
        except Exception:
            log.exception("sandbox terminate failed: id=%s", self._sb.object_id)

    # ------------------------------------------------------------------
    # Exec
    # ------------------------------------------------------------------

    def exec(
        self,
        command: str,
        *,
        timeout_s: int = 60,
        cwd: str | None = None,
        env: dict[str, str] | None = None,
        stdout_limit: int = 16_000,
        stderr_limit: int = 16_000,
    ) -> ExecResult:
        prefix = ""
        if env:
            for k, v in env.items():
                prefix += f"export {shlex.quote(k)}={shlex.quote(v)}; "
        if cwd:
            prefix += f"cd {shlex.quote(cwd)} && "
        full = prefix + command

        log.debug("exec(timeout=%ds): %s", timeout_s, _short(command, 200))
        t0 = time.perf_counter()
        p = self._sb.exec("bash", "-c", full, timeout=timeout_s)
        stdout = _read_truncated(p.stdout, stdout_limit)
        stderr = _read_truncated(p.stderr, stderr_limit)
        p.wait()
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        rc = p.returncode or 0
        if rc != 0:
            log.warning(
                "exec failed (exit=%d, %dms): %s\n  stderr: %s",
                rc, elapsed_ms, _short(command, 120), _short(stderr, 300),
            )
        else:
            log.debug("exec ok (exit=0, %dms): %s", elapsed_ms, _short(command, 120))
        return ExecResult(exit_code=rc, stdout=stdout, stderr=stderr)

    def check_exec(self, command: str, **kwargs) -> ExecResult:
        """Run `exec` and raise on non-zero exit."""
        res = self.exec(command, **kwargs)
        if not res.ok():
            raise SandboxError(
                f"command failed (exit {res.exit_code}): {command}\n"
                f"stderr:\n{res.stderr}\nstdout:\n{res.stdout}"
            )
        return res

    # ------------------------------------------------------------------
    # File helpers
    # ------------------------------------------------------------------

    def read_text(self, path: str, *, max_bytes: int = 200_000) -> str:
        res = self.exec(
            f"head -c {max_bytes} {shlex.quote(path)}",
            timeout_s=15,
            stdout_limit=max_bytes + 1024,
        )
        if not res.ok():
            raise SandboxError(f"could not read {path}: {res.stderr.strip()}")
        return res.stdout

    def read_json(self, path: str, *, max_bytes: int = 200_000) -> dict[str, Any]:
        text = self.read_text(path, max_bytes=max_bytes)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise SandboxError(
                f"file at {path} is not valid JSON: {e}\nfirst 500 chars:\n"
                + text[:500]
            ) from e

    # ------------------------------------------------------------------
    # OpenClaw bring-up
    # ------------------------------------------------------------------

    def set_model(self, model: str) -> None:
        """Set the agent's underlying LLM. Must be called before start_gateway.

        Also clears `agents.defaults.models` (the allowlist), because OpenClaw
        auto-populates that with just the primary model and then rejects any
        other model with "Model X is not allowed". Clearing the allowlist
        means any provider/model the gateway has auth for can be requested.
        """
        log.info("set openclaw model: %s (and clearing allowlist)", model)
        self.check_exec(
            "openclaw config set agents.defaults.model.primary "
            f"{shlex.quote(model)} && "
            # Reset allowlist to a single-entry list containing only the
            # primary; we then immediately unset to remove the gating.
            # `config unset` removes the key entirely so OpenClaw treats it
            # as "no allowlist" -> all configured providers allowed.
            "openclaw config unset agents.defaults.models 2>/dev/null || true",
            timeout_s=15,
        )

    def start_gateway(self, *, poll_iters: int = 80, poll_interval_s: float = 0.25) -> None:
        """Start the local OpenClaw gateway and poll until it answers HTTP."""
        log.info("starting openclaw gateway on :%d", GATEWAY_PORT)
        max_wait = int(poll_iters * poll_interval_s) + 5
        cmd = (
            "nohup openclaw gateway run --auth none "
            "> /root/.openclaw/gateway.log 2>&1 &\n"
            f"for i in $(seq 1 {poll_iters}); do "
            f"  curl -sf http://127.0.0.1:{GATEWAY_PORT}/ >/dev/null && exit 0; "
            f"  sleep {poll_interval_s}; "
            "done; "
            "echo 'gateway did not come up in time' >&2; "
            "tail -n 50 /root/.openclaw/gateway.log >&2; exit 1"
        )
        t0 = time.perf_counter()
        self.check_exec(cmd, timeout_s=max_wait + 5)
        log.info("openclaw gateway up in %dms",
                 int((time.perf_counter() - t0) * 1000))

    def clone_repo_async(self, github_url: str, *, depth: int = 1) -> None:
        """Kick off a background clone. Use `wait_for_repo` to join."""
        log.info("cloning repo (background): %s -> %s (depth=%d)",
                 github_url, REPO_DIR, depth)
        self.check_exec(
            "rm -f /tmp/clone.done /tmp/clone.rc /tmp/clone.log; "
            f"nohup bash -c 'rm -rf {shlex.quote(REPO_DIR)} && "
            f"git clone --depth={depth} --single-branch "
            f"{shlex.quote(github_url)} {shlex.quote(REPO_DIR)} "
            f"> /tmp/clone.log 2>&1; "
            "echo $? > /tmp/clone.rc; touch /tmp/clone.done' "
            ">/dev/null 2>&1 &",
            timeout_s=10,
        )

    def wait_for_repo(self, *, max_wait_s: int = 120) -> None:
        log.info("waiting for repo clone to finish (max=%ds)", max_wait_s)
        iters = max_wait_s * 4
        cmd = (
            f"for i in $(seq 1 {iters}); do "
            "  if [ -f /tmp/clone.done ]; then "
            "    rc=$(cat /tmp/clone.rc 2>/dev/null || echo 1); "
            "    if [ \"$rc\" != \"0\" ]; then cat /tmp/clone.log >&2; exit \"$rc\"; fi; "
            "    exit 0; "
            "  fi; "
            "  sleep 0.25; "
            "done; "
            "echo 'clone did not finish in time' >&2; cat /tmp/clone.log >&2; exit 1"
        )
        t0 = time.perf_counter()
        self.check_exec(cmd, timeout_s=max_wait_s + 10)
        size = self.exec(f"du -sh {shlex.quote(REPO_DIR)} 2>/dev/null | cut -f1",
                         timeout_s=5)
        log.info("repo cloned in %dms (size=%s)",
                 int((time.perf_counter() - t0) * 1000),
                 size.stdout.strip() or "?")

    # ------------------------------------------------------------------
    # OpenClaw chat
    # ------------------------------------------------------------------

    def chat(
        self,
        *,
        system: str,
        user: str,
        timeout_s: int = 600,
        model: str = "openclaw",
    ) -> dict[str, Any]:
        """Send a single user turn (with system prompt) to the gateway.

        Returns the parsed JSON response from /v1/chat/completions. The
        assistant's text is at `["choices"][0]["message"]["content"]`.
        """
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        payload_b = json.dumps(payload).encode()
        # Base64-pipe the body in to dodge any shell escaping weirdness.
        import base64
        b64 = base64.b64encode(payload_b).decode()
        cmd = (
            f"echo {shlex.quote(b64)} | base64 -d > /tmp/dploy-chat-req.json && "
            f"curl -sS --max-time {timeout_s - 5} "
            f"http://127.0.0.1:{GATEWAY_PORT}/v1/chat/completions "
            "-H 'Content-Type: application/json' "
            "--data @/tmp/dploy-chat-req.json"
        )
        log.info(
            "chat -> openclaw (model=%s, system=%dB, user=%dB, timeout=%ds)",
            model, len(system), len(user), timeout_s,
        )
        t0 = time.perf_counter()
        res = self.exec(cmd, timeout_s=timeout_s, stdout_limit=400_000)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        if not res.ok():
            log.error(
                "chat call failed (%dms, exit=%d): %s",
                elapsed_ms, res.exit_code, _short(res.stderr, 300),
            )
            raise SandboxError(
                f"chat call failed (exit {res.exit_code}): {res.stderr.strip()}"
            )
        try:
            parsed = json.loads(res.stdout)
        except json.JSONDecodeError as e:
            log.error(
                "openclaw returned non-JSON (%dms): %s",
                elapsed_ms, _short(res.stdout, 300),
            )
            raise SandboxError(
                f"openclaw response was not JSON: {e}\nfirst 500 chars:\n"
                + res.stdout[:500]
            ) from e
        usage = parsed.get("usage", {}) or {}
        text = ""
        try:
            text = parsed["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError):
            pass
        log.info(
            "chat <- openclaw (%dms, tokens in=%s out=%s, reply=%dB) tail: %s",
            elapsed_ms,
            usage.get("prompt_tokens"),
            usage.get("completion_tokens"),
            len(text),
            _short(text[-200:] if text else "(empty)", 200),
        )
        return parsed

    # ------------------------------------------------------------------
    # Public ingress
    # ------------------------------------------------------------------

    def tunnel(self, port: int) -> str | None:
        if port not in TUNNELABLE_PORTS:
            log.warning(
                "tunnel: port %d not in TUNNELABLE_PORTS=%s; cannot expose publicly",
                port, list(TUNNELABLE_PORTS),
            )
            return None
        try:
            tunnels = self._sb.tunnels()
        except Exception:
            log.exception("tunnel: modal tunnels() call failed")
            return None
        t = tunnels.get(port)
        if t is None:
            log.warning("tunnel: no tunnel for port %d (got %s)",
                        port, list(tunnels.keys()))
            return None
        url = getattr(t, "url", None)
        log.info("tunnel: port %d -> %s", port, url)
        return url

    def tunnel_all(self, ports: list[int]) -> dict[int, str]:
        """Get tunnel URLs for multiple ports. Returns {port: url} for each
        port that has an available tunnel."""
        try:
            tunnels = self._sb.tunnels()
        except Exception:
            log.exception("tunnel_all: modal tunnels() call failed")
            return {}
        result: dict[int, str] = {}
        for port in ports:
            if port not in TUNNELABLE_PORTS:
                log.warning("tunnel_all: port %d not in TUNNELABLE_PORTS, skipping", port)
                continue
            t = tunnels.get(port)
            if t is not None:
                url = getattr(t, "url", None)
                if url:
                    result[port] = url
                    log.info("tunnel_all: port %d -> %s", port, url)
        return result


def _read_truncated(stream, limit: int) -> str:
    chunks: list[str] = []
    total = 0
    for line in stream:
        chunks.append(line)
        total += len(line)
        if total >= limit:
            chunks.append(f"\n... [truncated at {limit} bytes] ...\n")
            break
    return "".join(chunks)


def _short(value: Any, limit: int) -> str:
    s = str(value).replace("\n", " ").replace("\r", " ")
    if len(s) > limit:
        return s[:limit] + f"...(+{len(s) - limit})"
    return s
