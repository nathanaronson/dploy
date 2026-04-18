import uuid

from sqlalchemy import BigInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _new_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_id)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    login: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)

    # The GitHub user-access token. Used so we can clone private repos on the
    # user's behalf during deployment.
    github_access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
