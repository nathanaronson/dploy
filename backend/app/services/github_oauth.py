from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import get_settings

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails"


@dataclass
class GitHubUser:
    id: int
    login: str
    name: str | None
    email: str | None
    avatar_url: str | None


def build_authorize_url(state: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "scope": settings.github_oauth_scopes,
        "state": state,
        "allow_signup": "true",
    }
    return f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"


async def exchange_code_for_token(code: str) -> str:
    """Exchange an OAuth `code` for a user access token."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            GITHUB_TOKEN_URL,
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
        )
        response.raise_for_status()
        body = response.json()

    token = body.get("access_token")
    if not token:
        raise ValueError(f"GitHub token exchange failed: {body!r}")
    return token


async def fetch_user(access_token: str) -> GitHubUser:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
        user_resp = await client.get(GITHUB_USER_URL)
        user_resp.raise_for_status()
        user = user_resp.json()

        email = user.get("email")
        if not email:
            # The /user endpoint omits the email when the user has it set to private;
            # /user/emails returns all verified addresses.
            emails_resp = await client.get(GITHUB_USER_EMAILS_URL)
            if emails_resp.status_code == 200:
                emails = emails_resp.json()
                primary = next(
                    (e for e in emails if e.get("primary") and e.get("verified")),
                    None,
                )
                email = primary["email"] if primary else None

    return GitHubUser(
        id=int(user["id"]),
        login=user["login"],
        name=user.get("name"),
        email=email,
        avatar_url=user.get("avatar_url"),
    )
