import secrets

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser, SessionDep
from app.core.config import get_settings
from app.schemas.user import UserRead
from app.services import github_oauth
from app.services.auth import create_session, delete_session, upsert_user

router = APIRouter(prefix="/auth", tags=["auth"])

_OAUTH_STATE_COOKIE = "dploy_oauth_state"


@router.get("/github/login")
async def github_login(request: Request) -> RedirectResponse:
    """Kick off the GitHub OAuth flow."""
    settings = get_settings()
    if not settings.github_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )

    state = secrets.token_urlsafe(16)
    redirect = RedirectResponse(
        url=github_oauth.build_authorize_url(state),
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
    redirect.set_cookie(
        _OAUTH_STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )
    return redirect


@router.get("/github/callback")
async def github_callback(
    request: Request,
    db: SessionDep,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    settings = get_settings()
    if error:
        raise HTTPException(status_code=400, detail=f"GitHub error: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")

    expected_state = request.cookies.get(_OAUTH_STATE_COOKIE)
    if not expected_state or not secrets.compare_digest(expected_state, state):
        raise HTTPException(status_code=400, detail="Invalid OAuth state")

    access_token = await github_oauth.exchange_code_for_token(code)
    gh_user = await github_oauth.fetch_user(access_token)

    user = await upsert_user(db, gh_user, access_token)
    session = await create_session(db, user)
    await db.commit()

    redirect = RedirectResponse(
        url=settings.frontend_url,
        status_code=status.HTTP_303_SEE_OTHER,
    )
    redirect.delete_cookie(_OAUTH_STATE_COOKIE)
    redirect.set_cookie(
        settings.session_cookie_name,
        session.token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return redirect


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: SessionDep) -> Response:
    settings = get_settings()
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await delete_session(db, token)
        await db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/login", include_in_schema=False)
async def login_alias() -> RedirectResponse:
    return RedirectResponse(
        url="/api/v1/auth/github/login",
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
