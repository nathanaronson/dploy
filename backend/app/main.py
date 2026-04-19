from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import init_db
from app.services import sandbox_pool
from app.services.deploy import DEFAULT_MODEL


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    await init_db()
    # Warm one sandbox on startup so the first deploy doesn't pay the
    # ~18s OpenClaw gateway cold-boot.
    await sandbox_pool.prewarm(DEFAULT_MODEL)
    try:
        yield
    finally:
        await sandbox_pool.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.project_name,
        version=settings.version,
        debug=settings.debug,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"message": f"{settings.project_name} is running"}

    return app


app = create_app()
