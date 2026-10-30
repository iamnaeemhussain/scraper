"""Dashboard aggregates for the home screen."""
from __future__ import annotations

from fastapi import APIRouter, Query

from ..deps import DbSession, UserDep
from ..services.analytics import dashboard as build_dashboard
from ..services.analytics import quality_report

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("")
def get_dashboard(db: DbSession, user: UserDep, days: int = Query(default=30, ge=7, le=365)):
    payload = build_dashboard(db, days=days)
    payload["viewer"] = {"id": user.id, "name": user.full_name, "role": user.role}
    return payload


@router.get("/quality")
def get_quality(db: DbSession, _user: UserDep):
    return quality_report(db)
