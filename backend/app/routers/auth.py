"""Authentication endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import select

from ..config import settings
from ..deps import DbSession, PrincipalDep, UserDep
from ..models import User
from ..schemas import ChangePasswordRequest, LoginRequest
from ..security import (
    PERMISSIONS,
    client_ip,
    create_access_token,
    hash_password,
    limiter,
    password_problems,
    verify_password,
    write_audit,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_payload(user: User) -> dict:
    return {
        **user.to_dict(),
        "permissions": {k: v for k, v in PERMISSIONS.get(user.role, {}).items() if v},
    }


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


@router.post("/login")
def login(payload: LoginRequest, request: Request, response: Response, db: DbSession):
    allowed, retry_after = limiter.check(f"login:{client_ip(request)}", settings.login_rate_limit_per_minute)
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again shortly.",
                            headers={"Retry-After": str(retry_after)})

    email = payload.email.lower().strip()
    user = db.scalar(select(User).where(User.email == email))
    generic_error = HTTPException(status_code=401, detail="Invalid email or password.")

    if not user:
        write_audit(db, action="auth.login_failed", entity_type="user", entity_id=email,
                    request=request, detail={"reason": "unknown_email"})
        raise generic_error

    now = datetime.now(timezone.utc)
    if user.locked_until and user.locked_until.replace(tzinfo=timezone.utc) > now:
        write_audit(db, action="auth.login_blocked", user=user, request=request,
                    detail={"reason": "locked"})
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="Account temporarily locked after repeated failed sign-ins.",
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    if not verify_password(payload.password, user.hashed_password):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= settings.login_max_attempts:
            user.locked_until = now + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_attempts = 0
        db.commit()
        write_audit(db, action="auth.login_failed", user=user, request=request,
                    detail={"reason": "bad_password"})
        raise generic_error

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now
    db.commit()

    token, expires = create_access_token(user)
    set_session_cookie(response, token)
    write_audit(db, action="auth.login", user=user, request=request)
    return {"user": _user_payload(user), "token": token, "expires_at": expires.isoformat(),
            "token_type": "bearer"}


@router.post("/logout")
def logout(response: Response, db: DbSession, principal: PrincipalDep):
    response.delete_cookie(settings.cookie_name, path="/")
    if principal.user:
        write_audit(db, action="auth.logout", user=principal.user)
    return {"ok": True}


@router.get("/me")
def me(user: UserDep):
    return {"user": _user_payload(user)}


@router.post("/change-password")
def change_password(payload: ChangePasswordRequest, db: DbSession, user: UserDep, request: Request):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Your current password is incorrect.")
    problems = password_problems(payload.new_password)
    if problems:
        raise HTTPException(status_code=400, detail=" ".join(problems))
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    write_audit(db, action="auth.password_changed", user=user, request=request)
    return {"ok": True}
