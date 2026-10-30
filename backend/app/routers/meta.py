"""Bootstrap metadata for the UI: adapter catalogue, picklists, engine status."""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from ..adapters.net import engine_info
from ..adapters.registry import catalog, field_options
from ..config import settings
from ..deps import DbSession, UserDep
from ..models import (
    CONSENT_STATUSES,
    EMAIL_STATUSES,
    LEAD_STATUSES,
    LICENSING_STATUSES,
    PHONE_STATUSES,
    ROLES,
    Lead,
)
from ..security import PERMISSIONS
from ..services import org_settings

router = APIRouter(prefix="/api/meta", tags=["meta"])

LEAD_STATUS_LABELS = {
    "new": "New",
    "assigned": "Assigned",
    "contacted": "Contacted",
    "interested": "Interested",
    "not_interested": "Not interested",
    "follow_up": "Follow-up",
    "converted": "Converted",
    "do_not_contact": "Do Not Contact",
}
CONSENT_LABELS = {
    "granted": "Granted (explicit)",
    "pending": "Pending",
    "unknown": "Unknown",
    "denied": "Denied",
    "withdrawn": "Withdrawn",
}
PHONE_LABELS = {
    "unverified": "Unverified",
    "format_valid": "Format valid (not called)",
    "verified_owner": "Verified with owner / provider",
    "invalid": "Invalid",
    "disconnected": "Disconnected",
}
EMAIL_LABELS = {
    "unverified": "Unverified",
    "syntax_valid": "Syntax valid",
    "mx_valid": "MX verified",
    "verified_owner": "Verified with provider",
    "invalid": "Invalid",
    "bounced": "Bounced",
}


@router.get("/bootstrap")
def bootstrap(db: DbSession, user: UserDep):
    industries = [row[0] for row in db.execute(
        select(Lead.industry).where(Lead.industry.is_not(None)).group_by(Lead.industry).order_by(Lead.industry)
    ).all()]
    states = [row[0] for row in db.execute(
        select(Lead.state).where(Lead.state.is_not(None)).group_by(Lead.state).order_by(Lead.state)
    ).all()]
    cities = [row[0] for row in db.execute(
        select(Lead.city, func.count(Lead.id)).where(Lead.city.is_not(None))
        .group_by(Lead.city).order_by(func.count(Lead.id).desc()).limit(60)
    ).all()]
    return {
        "app": {
            "name": settings.app_name,
            "environment": settings.environment,
            "demo_mode": settings.demo_mode_enabled,
            "org": org_settings.get_all(db),
        },
        "user": {
            **user.to_dict(),
            "permissions": {k: v for k, v in PERMISSIONS.get(user.role, {}).items() if v},
        },
        "adapters": catalog(),
        "fields": field_options(),
        "statuses": {
            "lead": [{"value": s, "label": LEAD_STATUS_LABELS[s]} for s in LEAD_STATUSES],
            "consent": [{"value": s, "label": CONSENT_LABELS[s]} for s in CONSENT_STATUSES],
            "phone": [{"value": s, "label": PHONE_LABELS[s]} for s in PHONE_STATUSES],
            "email": [{"value": s, "label": EMAIL_LABELS[s]} for s in EMAIL_STATUSES],
            "licensing": list(LICENSING_STATUSES),
            "roles": list(ROLES),
        },
        "filters": {"industries": industries, "states": states, "cities": cities},
        "engine": engine_info(),
        "limits": {
            "rate_limit_per_minute": settings.rate_limit_per_minute,
            "max_records_per_run": 5000,
        },
    }


@router.get("/engine")
def engine_status():
    return engine_info()
