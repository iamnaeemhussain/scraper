"""Organisation-level settings persisted in the database (with safe defaults)."""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ..config import settings as app_settings
from ..models import Setting
from ..security import write_audit

DEFAULTS: dict[str, Any] = {
    "org_name": "LeadBridge",
    "export_require_consent": False,
    "export_exclude_invalid": True,
    "allow_agent_export": True,
    "collection_enabled": True,
    "daily_collection_limit": 5000,
    "data_retention_days": app_settings.data_retention_days,
    "audit_retention_days": app_settings.audit_retention_days,
    "notes": "",
}


def get_all(db: Session) -> dict[str, Any]:
    stored = {row.key: row.value.get("value") if isinstance(row.value, dict) else row.value
              for row in db.query(Setting).all()}
    merged = {**DEFAULTS, **{k: v for k, v in stored.items() if v is not None}}
    return merged


def get(db: Session, key: str, default: Any = None) -> Any:
    values = get_all(db)
    return values.get(key, DEFAULTS.get(key, default))


def update(db: Session, values: dict[str, Any], *, user=None, request=None) -> dict[str, Any]:
    changed: dict[str, Any] = {}
    for key, value in values.items():
        if value is None:
            continue
        row = db.get(Setting, key)
        if row:
            row.value = {"value": value}
        else:
            db.add(Setting(key=key, value={"value": value}))
        changed[key] = value
    db.commit()
    if changed:
        write_audit(db, action="settings.updated", user=user, request=request,
                    entity_type="settings", entity_id="org", detail=changed)
    return get_all(db)
