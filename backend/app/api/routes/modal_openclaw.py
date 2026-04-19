import json
import sys

import modal

from app.core.config import get_settings

settings = get_settings()
ANTHROPIC_API_KEY = "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"
OPENAI_API_KEY = "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"

# Underlying LLM for the openclaw agent. Format: "<provider>/<model-id>".
# Set at runtime (not baked into image) so it can change per sandbox.
# The chat request payload always sends `model: "openclaw"` — the agent picks
# this up from its config.
MODEL = "anthropic/claude-sonnet-4-6"

ENV = (
    "export PATH=/root/.npm-global/bin:$PATH "
    "&& export HOME=/root "
    "&& export OPENCLAW_STATE_DIR=/root/.openclaw "
    "&& export NODE_COMPILE_CACHE=/root/.compile-cache "
    "&& export OPENCLAW_NO_RESPAWN=1"
)


def run(sb: modal.Sandbox, cmd: str, timeout: int = 120, stream: bool = False) -> str:
    """Run a bash command in the sandbox, return stdout, raise on failure."""
    p = sb.exec("bash", "-c", cmd, timeout=timeout)
    if stream:
        chunks = []
        for line in p.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            chunks.append(line)
        stdout = "".join(chunks)
    else:
        stdout = p.stdout.read()
    stderr = p.stderr.read()
    p.wait()
    if p.returncode != 0:
        out = sb.exec("tail -n 100 /root/.openclaw/gateway.log", timeout=timeout)
        print(out)

        raise RuntimeError(f"Command failed (exit {p.returncode}):\n{stderr}")
    return stdout.strip()


# --- Step 1: Create sandbox with Node.js + OpenClaw + config baked into the image ---
print("Creating Modal sandbox...")
sb_app = modal.App.lookup("openclaw-sandbox", create_if_missing=True)

# Bake config into the image so runtime pays $0 for `config set` calls.
# These run during image build and are cached across sandbox creations.
config_cmds = [
    "openclaw config set gateway.mode local",
    "openclaw config set gateway.http.endpoints.chatCompletions.enabled true",
]
if ANTHROPIC_API_KEY:
    config_cmds.append(
        f'openclaw config set env.vars.ANTHROPIC_API_KEY "{ANTHROPIC_API_KEY}"'
    )
if OPENAI_API_KEY:
    config_cmds.append(
        f'openclaw config set env.vars.OPENAI_API_KEY "{OPENAI_API_KEY}"'
    )

image = (
    modal.Image.debian_slim()
    .apt_install("curl", "git")
    .run_commands("curl -fsSL https://deb.nodesource.com/setup_22.x | bash -")
    .apt_install("nodejs")
    .run_commands(
        "mkdir -p /root/.npm-global /root/.npm-cache /root/.openclaw /root/.compile-cache",
        "NPM_CONFIG_PREFIX=/root/.npm-global NPM_CONFIG_CACHE=/root/.npm-cache "
        "npm install -g openclaw@latest",
        # Bake openclaw config into the image (cached layer).
        "PATH=/root/.npm-global/bin:$PATH HOME=/root "
        "OPENCLAW_STATE_DIR=/root/.openclaw "
        "NODE_COMPILE_CACHE=/root/.compile-cache OPENCLAW_NO_RESPAWN=1 "
        "bash -c " + json.dumps(" && ".join(config_cmds)),
        # Warm Node compile cache so first runtime invocation is fast.
        "PATH=/root/.npm-global/bin:$PATH HOME=/root "
        "OPENCLAW_STATE_DIR=/root/.openclaw "
        "NODE_COMPILE_CACHE=/root/.compile-cache OPENCLAW_NO_RESPAWN=1 "
        "openclaw --version >/dev/null",
    )
    .env({
        "PATH": "/root/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        "HOME": "/root",
        "OPENCLAW_STATE_DIR": "/root/.openclaw",
        "NODE_COMPILE_CACHE": "/root/.compile-cache",
        "OPENCLAW_NO_RESPAWN": "1",
    })
)

with modal.enable_output():
    sb = modal.Sandbox.create(
        image=image,
        app=sb_app,
        timeout=30 * 60,
    )

print(f"Sandbox created: {sb.object_id}")

# --- Step 2: Start gateway + clone repo in parallel ---
print("Starting gateway and cloning repo in parallel...")
repo_link = "https://github.com/samuel-lao/personal-website"

# Kick clone off in the background; gateway startup doesn't depend on it.
# Use a marker file (clone.done) since later sb.exec calls run in fresh shells
# and can't `wait` on a PID from this one.
run(
    sb,
    "rm -f /tmp/clone.done /tmp/clone.rc /tmp/clone.log; "
    f"nohup bash -c 'git clone --depth=1 --single-branch {repo_link} "
    f"/root/.openclaw/workspace/repo > /tmp/clone.log 2>&1; "
    f"echo $? > /tmp/clone.rc; touch /tmp/clone.done' "
    f">/dev/null 2>&1 &",
    timeout=10,
)

# Set the model at runtime (must happen before gateway starts so gateway picks
# it up on boot). Adds ~1-2s but lets MODEL change per sandbox without rebuild.
run(
    sb,
    f'openclaw config set agents.defaults.model.primary "{MODEL}"',
    timeout=15,
)

# Start gateway and poll until it's actually up (replaces fixed sleep 10).
run(
    sb,
    "nohup openclaw gateway run --auth none > /root/.openclaw/gateway.log 2>&1 &\n"
    "for i in $(seq 1 80); do "
    "  curl -sf http://127.0.0.1:18789/ >/dev/null && exit 0; "
    "  sleep 0.25; "
    "done; "
    "echo 'gateway did not come up in time' >&2; exit 1",
    timeout=30,
)

# Wait for the clone marker before chatting.
run(
    sb,
    "for i in $(seq 1 480); do "
    "  if [ -f /tmp/clone.done ]; then "
    "    rc=$(cat /tmp/clone.rc 2>/dev/null || echo 1); "
    "    if [ \"$rc\" != \"0\" ]; then cat /tmp/clone.log >&2; exit \"$rc\"; fi; "
    "    exit 0; "
    "  fi; "
    "  sleep 0.25; "
    "done; "
    "echo 'clone did not finish in time' >&2; cat /tmp/clone.log >&2; exit 1",
    timeout=180,
)
print("Gateway up and repo cloned.")

# --- Step 3: Chat ---
print("\nSending chat message...")
payload = json.dumps({
    "model": "openclaw",
    "messages": [{"role": "user", "content": "List ALL files in the repo folder. Do not forget any."}],
})
response = run(
    sb,
    f"curl -sS http://127.0.0.1:18789/v1/chat/completions "
    f"-H 'Content-Type: application/json' "
    f"-d '{payload}'",
    timeout=120,
)
try:
    parsed = json.loads(response)
    if "choices" in parsed:
        print(f"\nAssistant: {parsed['choices'][0]['message']['content']}")
    else:
        print(f"\nChat response (no choices):\n{json.dumps(parsed, indent=2)}")
except json.JSONDecodeError:
    print(f"\nRaw response:\n{response}")

print(f"\nDone! Sandbox ID: {sb.object_id}")

sb.terminate()
sb.detach()
