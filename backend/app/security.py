import base64
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.fernet import Fernet, InvalidToken

from .config import settings


def _fernet() -> Fernet:
    key = base64.urlsafe_b64encode(hashlib.sha256(settings.secret_key.encode("utf-8")).digest())
    return Fernet(key)


def encrypt_token(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_token(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None


def create_session_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.session_days)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def read_session_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        return None


def create_oauth_state() -> str:
    now = int(time.time())
    payload = {
        "purpose": "oauth",
        "nonce": secrets.token_urlsafe(24),
        "iat": now,
        "exp": now + 600,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def verify_oauth_state(state: str) -> bool:
    try:
        payload = jwt.decode(state, settings.secret_key, algorithms=["HS256"])
        return payload.get("purpose") == "oauth"
    except jwt.PyJWTError:
        return False
