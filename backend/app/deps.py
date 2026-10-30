"""Shared FastAPI dependencies: authentication, rate limits, pagination."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import User
from .security import decode_access_token, limiter, resolve_api_key

DbSession = Annotated[Session, Depends(get_db)]

SERVICE_PRINCIPAL = "service-worker"


@dataclass
class Principal:
    """An authenticated caller: either a user session or a service API key."""

    user: User | None
    kind: str  # "user" | "service"
    scopes: list[str]
    api_key_id: int | None = None

    @property
    def role(self) -> str:
        return self.user.role if self.user else "service"

    @property
    def label(self) -> str:
        return self.user.full_name if self.user else SERVICE_PRINCIPAL


def _unauthorized(detail: str = "Not authenticated") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_principal(request: Request, db: DbSession) -> Principal:
    token = request.cookies.get(settings.cookie_name)
    auth_header = request.headers.get("authorization", "")
    has_api_key = False
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        has_api_key = token.startswith("lbk_")

    if not token:
        raise _unauthorized()

    if has_api_key:
        key = resolve_api_key(db, token)
        if not key:
            raise _unauthorized("Invalid API key")
        return Principal(user=None, kind="service", scopes=key.scopes or [], api_key_id=key.id)

    payload = decode_access_token(token)
    if not payload:
        raise _unauthorized("Session expired, please sign in again")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise _unauthorized("Account is inactive")
    return Principal(user=user, kind="user", scopes=[])


def current_user(principal: Annotated[Principal, Depends(get_principal)]) -> User:
    if not principal.user:
        raise HTTPException(status_code=403, detail="This endpoint requires a signed-in user")
    return principal.user


def require_service_or(permission: str):
    """Allow service API keys with the matching scope, or users with the permission."""

    def dependency(principal: Annotated[Principal, Depends(get_principal)]) -> Principal:
        from .security import has_permission

        if principal.kind == "service":
            if permission in principal.scopes or "*" in principal.scopes:
                return principal
            raise HTTPException(status_code=403, detail="API key is missing the required scope")
        if principal.user and has_permission(principal.user, permission):
            return principal
        raise HTTPException(
            status_code=403,
            detail=f"Your role is not allowed to perform this action ({permission}).",
        )

    return dependency


def rate_limit(request: Request, bucket: str | None = None, limit: int | None = None) -> None:
    from .security import client_ip

    key = f"{bucket or 'global'}:{client_ip(request)}"
    allowed, retry_after = limiter.check(key, limit or settings.rate_limit_per_minute)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down.",
            headers={"Retry-After": str(retry_after)},
        )


class Pagination:
    def __init__(self, page: int = 1, page_size: int = 25):
        self.page = max(1, page)
        self.page_size = min(max(1, page_size), 200)
        self.offset = (self.page - 1) * self.page_size


def pagination(page: int = 1, page_size: int = 25) -> Pagination:
    return Pagination(page=page, page_size=page_size)


UserDep = Annotated[User, Depends(current_user)]
PrincipalDep = Annotated[Principal, Depends(get_principal)]
PaginationDep = Annotated[Pagination, Depends(pagination)]
