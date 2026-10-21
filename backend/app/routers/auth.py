import hmac
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import google
from ..config import settings
from ..db import get_db
from ..deps import get_current_user
from ..models import User
from ..schemas import UserOut
from ..security import create_oauth_state, create_session_token, verify_oauth_state
from ..sync import store_refresh_token

router = APIRouter(prefix="/auth", tags=["auth"])

OAUTH_STATE_COOKIE = "presenze_oauth_state"
OAUTH_STATE_PATH = "/api/auth/google"


def _clear_oauth_state(response: RedirectResponse) -> None:
    response.delete_cookie(OAUTH_STATE_COOKIE, path=OAUTH_STATE_PATH)


@router.get("/google/login")
def google_login() -> RedirectResponse:
    if not google.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Google OAuth non configurato: imposta GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nel backend.",
        )
    state = create_oauth_state()
    response = RedirectResponse(google.build_auth_url(state), status_code=302)
    # Il cookie lega lo "state" a questo browser: impedisce il login CSRF.
    response.set_cookie(
        OAUTH_STATE_COOKIE,
        state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path=OAUTH_STATE_PATH,
    )
    return response


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    def fail(message: str) -> RedirectResponse:
        response = RedirectResponse(
            f"{settings.frontend_url}/?error={quote(message)}", status_code=302
        )
        _clear_oauth_state(response)
        return response

    expected_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if error:
        return fail(f"Accesso Google annullato: {error}")
    if (
        not code
        or not state
        or not expected_state
        or not hmac.compare_digest(state.encode(), expected_state.encode())
        or not verify_oauth_state(state)
    ):
        return fail("Richiesta OAuth non valida o scaduta. Riprova.")

    try:
        tokens = google.exchange_code(code)
        access_token = tokens.get("access_token")
        if not access_token:
            return fail("Google non ha restituito un token di accesso.")
        info = google.get_userinfo(access_token)
    except google.GoogleError as exc:
        return fail(str(exc))

    google_sub = info.get("sub")
    if not google_sub:
        return fail("Profilo Google senza identificativo.")

    email = (info.get("email") or "").strip()
    if not settings.is_email_allowed(email):
        return fail("Questo account Google non è autorizzato a usare l'app.")

    user = db.scalar(select(User).where(User.google_sub == google_sub))
    if user is None:
        user = User(
            google_sub=google_sub,
            email=email,
            name=info.get("name", ""),
            picture=info.get("picture"),
            selected_calendars=settings.default_calendars(),
        )
        db.add(user)

    user.email = email or user.email
    user.name = info.get("name", user.name)
    user.picture = info.get("picture", user.picture)
    store_refresh_token(user, tokens.get("refresh_token"))
    user.needs_reauth = False
    db.commit()

    response = RedirectResponse(f"{settings.frontend_url}/?login=ok", status_code=302)
    _clear_oauth_state(response)
    response.set_cookie(
        settings.cookie_name,
        create_session_token(user.id),
        max_age=settings.session_days * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    return response


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(settings.cookie_name, path="/")
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user
