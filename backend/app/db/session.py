from collections.abc import AsyncIterator

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.db.base import Base

_settings = get_settings()

engine = create_async_engine(
    _settings.database_url,
    echo=_settings.db_echo,
    future=True,
)

SessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def init_db() -> None:
    """Create all tables. Imports models so they register on Base.metadata."""
    from app import models  # noqa: F401  (ensure models are imported)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if engine.dialect.name == "sqlite":
            await conn.run_sync(_migrate_sqlite_deployments_table)


def _migrate_sqlite_deployments_table(sync_conn) -> None:
    """Backfill additive schema changes for the local SQLite dev DB.

    `create_all()` will create missing tables, but it won't add new columns to
    an existing `deployments` table. We keep the migration intentionally tiny
    and additive so current dev DBs keep working without manual resets.
    """
    inspector = inspect(sync_conn)
    tables = set(inspector.get_table_names())
    if "deployments" not in tables:
        return

    cols = {col["name"] for col in inspector.get_columns("deployments")}

    if "kind" not in cols:
        sync_conn.execute(
            text(
                "ALTER TABLE deployments "
                "ADD COLUMN kind VARCHAR(16) NOT NULL DEFAULT 'web'"
            )
        )
        sync_conn.execute(text("UPDATE deployments SET kind = 'web' WHERE kind IS NULL"))

    if "entrypoint" not in cols:
        sync_conn.execute(text("ALTER TABLE deployments ADD COLUMN entrypoint JSON"))


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
