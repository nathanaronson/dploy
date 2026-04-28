"""Persistent state for the warm sandbox pool.

Each row tracks one Modal sandbox that's been pre-provisioned (gateway up,
model set) and is either still being warmed, ready to claim, or already
claimed by a deployment.
"""

import uuid
from datetime import datetime
from typing import Final

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

WARM_STATUS_WARMING: Final = "warming"
WARM_STATUS_READY: Final = "ready"
WARM_STATUS_CLAIMED: Final = "claimed"
WARM_STATUS_FAILED: Final = "failed"

WARM_STATUSES: Final = (
    WARM_STATUS_WARMING,
    WARM_STATUS_READY,
    WARM_STATUS_CLAIMED,
    WARM_STATUS_FAILED,
)

WARM_ALIVE_STATUSES: Final = (WARM_STATUS_WARMING, WARM_STATUS_READY)


def _new_id() -> str:
    return uuid.uuid4().hex


class WarmSandbox(Base):
    __tablename__ = "warm_sandboxes"

    # Local slot id. Stable from the moment _replenish() reserves a slot,
    # before we know the Modal sandbox_id.
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)

    # Modal sandbox object id. NULL while warming; set when status flips to
    # `ready`. Indexed because the diagnostics page joins by it.
    sandbox_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    model: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=WARM_STATUS_WARMING)

    # `created_at` / `updated_at` come from Base. We add explicit ready/claimed
    # timestamps so the diagnostics endpoint can show how long warmup took
    # and how stale a claim is.
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        # Hot path: "find me a ready sandbox for this model, oldest first".
        Index(
            "ix_warm_sandboxes_status_model_created",
            "status", "model", "created_at",
        ),
    )


__all__ = [
    "WarmSandbox",
    "WARM_STATUS_WARMING",
    "WARM_STATUS_READY",
    "WARM_STATUS_CLAIMED",
    "WARM_STATUS_FAILED",
    "WARM_STATUSES",
    "WARM_ALIVE_STATUSES",
]
