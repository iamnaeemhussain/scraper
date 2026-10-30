"""Security primitives: password hashing, JWTs, API keys, RBAC, rate limiting."""
from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import ApiKey, AuditLog, User

try:  # bcrypt is the preferred hasher; PBKDF2 keeps the app usable without it.
    import bcrypt

    _HAS_BCRYPT = True
except Exception:  # pragma: no cover - optional dependency
    _HAS_BCRYPT = False

JWT_ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 390_000


# --------------------------------------------------------------------------- #
# Passwords
# --------------------------------------------------------------------------- #
def hash_password(password: str) -> str:
    if _HAS_BCRYPT:
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    if hashed.startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt, digest = hashed.split("$", 3)
            candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations))
            return hmac.compare_digest(candidate.hex(), digest)
        except (ValueError, TypeError):
            return False
    if _HAS_BCRYPT:
        try:
            return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
        except ValueError:
            return False
    return False


def password_problems(password: str) -> list[str]:
    problems: list[str] = []
    if len(password) < settings.password_min_length:
        problems.append(f"Password must be at least {settings.password_min_length} characters.")
    if not any(c.isalpha() for c in password):
        problems.append("Password must contain a letter.")
    if not any(c.isdigit() for c in password):
        problems.append("Password must contain a number.")
    if password.lower() in {"password12", "letmein123", "admin12345", "changeme123"}:
        problems.append("Password is too common.")
    return problems


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #
def create_access_token(user: User) -> tuple[str, datetime]:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload: dict[str, Any] = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "iat": int(time.time()),
        "exp": int(expires.timestamp()),
        "typ": "access",
    }
    token = jwt.encode(payload, settings.secret_key, algorithm=JWT_ALGORITHM)
    return token, expires


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "access":
        return None
    return payload


# --------------------------------------------------------------------------- #
# API keys (for the extraction worker / server-to-server integrations)
# --------------------------------------------------------------------------- #
API_KEY_PREFIX = "lbk"


def generate_api_key() -> tuple[str, str, str]:
    """Returns (plaintext_key, prefix, hash). Plaintext is shown to the admin once."""
    raw = secrets.token_urlsafe(32)
    prefix = f"{API_KEY_PREFIX}_{secrets.token_hex(3)}"
    plaintext = f"{prefix}_{raw}"
    return plaintext, prefix, hash_api_key(plaintext)


def hash_api_key(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def resolve_api_key(db: Session, plaintext: str) -> ApiKey | None:
    if not plaintext.startswith(f"{API_KEY_PREFIX}_"):
        return None
    digest = hash_api_key(plaintext)
    keys = db.scalars(select(ApiKey).where(ApiKey.is_active.is_(True))).all()
    for key in keys:
        if hmac.compare_digest(key.hashed_key, digest):
            key.last_used_at = datetime.now(timezone.utc)
            db.commit()
            return key
    return None


# --------------------------------------------------------------------------- #
# Rate limiting (in-process sliding window; swap for Redis in multi-instance deploys)
# --------------------------------------------------------------------------- #
class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int = 60) -> tuple[bool, int]:
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            return False, retry_after
        bucket.append(now)
        # Opportunistic cleanup so the dict cannot grow unbounded.
        if len(self._hits) > 5000:
            for stale in [k for k, v in self._hits.items() if not v]:
                self._hits.pop(stale, None)
        return True, 0

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindowLimiter()


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# --------------------------------------------------------------------------- #
# RBAC
# --------------------------------------------------------------------------- #
PERMISSIONS: dict[str, dict[str, bool]] = {
    "admin": {
        "sources:manage": True,
        "jobs:manage": True,
        "leads:read_all": True,
        "leads:write": True,
        "leads:assign": True,
        "leads:verify": True,
        "leads:delete": True,
        "imports:manage": True,
        "exports:manage": True,
        "agents:manage": True,
        "reports:read": True,
        "settings:manage": True,
        "users:manage": True,
        "audit:read": True,
        "suppression:manage": True,
        "apikeys:manage": True,
        "backup:run": True,
        "retention:manage": True,
    },
    "manager": {
        "sources:manage": True,
        "jobs:manage": True,
        "leads:read_all": True,
        "leads:write": True,
        "leads:assign": True,
        "leads:verify": True,
        "leads:delete": False,
        "imports:manage": True,
        "exports:manage": True,
        "agents:manage": True,
        "reports:read": True,
        "settings:manage": False,
        "users:manage": False,
        "audit:read": True,
        "suppression:manage": True,
        "apikeys:manage": False,
        "backup:run": False,
        "retention:manage": False,
    },
    "agent": {
        "sources:manage": False,
        "jobs:manage": False,
        "leads:read_all": False,
        "leads:write": True,
        "leads:assign": False,
        "leads:verify": False,
        "leads:delete": False,
        "imports:manage": False,
        "exports:manage": False,
        "agents:manage": False,
        "reports:read": False,
        "settings:manage": False,
        "users:manage": False,
        "audit:read": False,
        "suppression:manage": False,
        "apikeys:manage": False,
        "backup:run": False,
        "retention:manage": False,
    },
}


def has_permission(user: User, permission: str) -> bool:
    return bool(PERMISSIONS.get(user.role, {}).get(permission, False))


def require_permission(user: User, permission: str) -> None:
    if not has_permission(user, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role ({user.role}) is not allowed to perform this action.",
        )


# --------------------------------------------------------------------------- #
# Audit trail
# --------------------------------------------------------------------------- #
def write_audit(
    db: Session,
    *,
    action: str,
    user: User | None = None,
    request: Request | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    detail: dict[str, Any] | None = None,
    commit: bool = True,
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        actor_email=user.email if user else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        ip_address=client_ip(request) if request else None,
        user_agent=request.headers.get("user-agent", "")[:300] if request else None,
        detail=detail or {},
    )
    db.add(entry)
    if commit:
        db.commit()
    return entry


def constant_time_compare(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
