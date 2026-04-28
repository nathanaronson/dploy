"""Modal deployment for the dploy backend.

Deploy with:

    cd backend && modal deploy _modal.py

Architecture
------------
The FastAPI app runs on Modal as a single-instance ASGI app. Single instance
is intentional: `app.services.sandbox_pool` (the warm Modal-sandbox pool) and
the WebSocket terminal session registry both live in process memory. Multiple
containers would split that state and break sandbox lookup mid-deploy.

Throughput is gated by `@modal.concurrent(max_inputs=100)` — one container
serves up to 100 concurrent HTTP/WS requests, plenty for current load.

State
-----
A Modal Volume is mounted at `/data` and used for the SQLite database. The
Secret sets `DATABASE_URL=sqlite+aiosqlite:////data/app.db` so the URL
survives container restarts/redeploys. (Switch to managed Postgres later if
you need backups, replicas, or zero-downtime deploys.)

Note: `backend/uploads/` is currently in-container only. It's not wired up
to the deploy flow yet (`upload-based deployments not yet supported`), so
losing it on restart is a no-op for now. When uploads ship, repoint
`UPLOAD_DIR` at `/data/uploads`.

Modal credentials
-----------------
This function runs *inside* Modal, so `modal.Sandbox.create()` authenticates
implicitly via the workspace identity — no `MODAL_TOKEN_*` env vars needed.

Secrets (one-time setup)
------------------------
Create a Modal Secret named `dploy-backend` before the first deploy:

    modal secret create dploy-backend \\
        ANTHROPIC_API_KEY=... \\
        GITHUB_CLIENT_ID=... \\
        GITHUB_CLIENT_SECRET=... \\
        SESSION_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(48))')" \\
        FRONTEND_URL=https://dploy.ryantanen.com \\
        GITHUB_REDIRECT_URI=https://api.dploy.ryantanen.com/api/v1/auth/github/callback \\
        CORS_ORIGINS='["https://dploy.ryantanen.com"]' \\
        SESSION_COOKIE_SECURE=true \\
        DATABASE_URL=sqlite+aiosqlite:////data/app.db
"""

import modal

app = modal.App(name="dploy-backend")

# Image build:
#   1. `pip_install_from_pyproject` reads ./pyproject.toml at deploy time and
#      installs the runtime deps. Cached across deploys unless pyproject changes.
#   2. `add_local_python_source("app")` ships the `app/` package (including
#      non-Python files like openclaw.json) into the image at deploy time.
#      This is the bit that was missing — without it, `from app.main import
#      create_app` fails with ModuleNotFoundError.
image = (
    modal.Image.debian_slim(python_version="3.13")
    .pip_install_from_pyproject("pyproject.toml")
    .add_local_dir("app", remote_path="/root/app")
)

volume = modal.Volume.from_name("dploy-backend-data", create_if_missing=True)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("dploy-secrets")],
    volumes={"/data": volume},
    # Pin to one container — sandbox_pool + WS terminal sessions are in-memory.
    min_containers=1,
    max_containers=1,
    # WebSocket terminal sessions can stay open for a long time.
    timeout=60 * 60,
    # Don't aggressively idle the container out — keeps the warm sandbox
    # pool alive between bursts of traffic.
    scaledown_window=60 * 30,
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def fastapi_app():
    from app.main import create_app
    return create_app()
