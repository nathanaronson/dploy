import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.session import Session
from app.models.user import User
from app.services.github_oauth import GitHubUser


async def upsert_user(
    db: AsyncSession,
    gh_user: GitHubUser,
    access_token: str,
) -> User:
    user = await db.scalar(select(User).where(User.github_id == gh_user.id))
    if user is None:
        user = User(
            github_id=gh_user.id,
            login=gh_user.login,
            name=gh_user.name,
            email=gh_user.email,
            avatar_url=gh_user.avatar_url,
            github_access_token=access_token,
        )
        db.add(user)
    else:
        user.login = gh_user.login
        user.name = gh_user.name
        user.email = gh_user.email
        user.avatar_url = gh_user.avatar_url
        user.github_access_token = access_token
    await db.flush()
    return user


async def create_session(db: AsyncSession, user: User) -> Session:
    settings = get_settings()
    session = Session(
        token=secrets.token_urlsafe(32),
        user_id=user.id,
        expires_at=datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours),
    )
    db.add(session)
    await db.flush()
    return session


async def get_session_user(db: AsyncSession, token: str) -> User | None:
    session = await db.get(Session, token)
    if session is None:
        return None
    # SQLite drops tz info on read; assume stored values are UTC.
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=UTC)
    if expires_at < datetime.now(UTC):
        await db.delete(session)
        await db.flush()
        return None
    return await db.get(User, session.user_id)


async def delete_session(db: AsyncSession, token: str) -> None:
    session = await db.get(Session, token)
    if session is not None:
        await db.delete(session)
        await db.flush()
