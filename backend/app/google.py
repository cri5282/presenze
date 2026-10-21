"""Client minimale per Google OAuth e Google Calendar API (v3)."""

from datetime import datetime, timezone
from urllib.parse import quote, urlencode

import httpx

from .config import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"
SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.readonly",
]

TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class GoogleError(Exception):
    def __init__(self, message: str, *, invalid_grant: bool = False, expired: bool = False):
        super().__init__(message)
        self.invalid_grant = invalid_grant
        self.expired = expired


def is_configured() -> bool:
    return bool(settings.google_client_id and settings.google_client_secret)


def build_auth_url(state: str) -> str:
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str) -> dict:
    data = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "redirect_uri": settings.google_redirect_uri,
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(TOKEN_URL, data=data)
    if res.status_code >= 400:
        raise GoogleError(f"Scambio codice fallito: {res.text[:300]}")
    return res.json()


def refresh_access_token(refresh_token: str) -> str:
    data = {
        "refresh_token": refresh_token,
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        "grant_type": "refresh_token",
    }
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.post(TOKEN_URL, data=data)
    if res.status_code >= 400:
        body = res.text.lower()
        raise GoogleError(
            f"Refresh token non valido: {res.text[:300]}", invalid_grant="invalid_grant" in body
        )
    return res.json()["access_token"]


def get_userinfo(access_token: str) -> dict:
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.get(USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"})
    if res.status_code >= 400:
        raise GoogleError(f"Lettura profilo Google fallita: {res.text[:300]}")
    return res.json()


def revoke_token(token: str) -> None:
    """Revoca il token Google quando l'utente cancella l'account.

    Google risponde 400 se il token è già scaduto o revocato: in quel caso non
    c'è nulla da revocare e l'operazione può considerarsi conclusa.
    """
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            res = client.post(REVOKE_URL, data={"token": token})
    except httpx.HTTPError as exc:
        raise GoogleError("Revoca token Google non raggiungibile") from exc
    if res.status_code not in (200, 400):
        raise GoogleError(f"Revoca token Google fallita ({res.status_code})")


def list_calendars(access_token: str) -> list[dict]:
    with httpx.Client(timeout=TIMEOUT) as client:
        res = client.get(
            f"{CALENDAR_API}/users/me/calendarList",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"minAccessRole": "reader", "maxResults": 250},
        )
    if res.status_code >= 400:
        raise GoogleError(f"Elenco calendari fallito: {res.text[:300]}")
    items = res.json().get("items", [])
    calendars = []
    for item in items:
        if item.get("deleted") is True:
            continue
        is_primary = bool(item.get("primary"))
        calendars.append(
            {
                # "primary" è l'alias accettato dall'API eventi: normalizziamo l'id
                "id": "primary" if is_primary else item["id"],
                "summary": item.get("summaryOverride") or item.get("summary") or item["id"],
                "primary": is_primary,
                "background_color": item.get("backgroundColor"),
            }
        )
    return calendars


def list_events(
    access_token: str,
    calendar_id: str,
    *,
    sync_token: str | None = None,
    time_min: datetime | None = None,
    time_max: datetime | None = None,
    page_token: str | None = None,
) -> dict:
    params: dict[str, str | int] = {
        "singleEvents": "true",
        "maxResults": 2500,
    }
    if sync_token:
        params["syncToken"] = sync_token
        params["showDeleted"] = "true"
    else:
        # Non usare orderBy: Google omette nextSyncToken se orderBy è presente,
        # disabilitando la sincronizzazione incrementale. L'ordinamento avviene in DB.
        if time_min:
            params["timeMin"] = time_min.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        if time_max:
            params["timeMax"] = time_max.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if page_token:
        params["pageToken"] = page_token

    with httpx.Client(timeout=httpx.Timeout(40.0, connect=10.0)) as client:
        res = client.get(
            f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
    if res.status_code == 410:
        raise GoogleError("Sync token scaduto", expired=True)
    if res.status_code == 404:
        raise GoogleError("Calendario non trovato o non accessibile", expired=False)
    if res.status_code >= 400:
        raise GoogleError(f"Lettura eventi fallita ({res.status_code}): {res.text[:300]}")
    return res.json()
