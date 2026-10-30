"""Lead database: search, filtering, assignment, notes, status, verification."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import delete as sql_delete, func, or_, select, update as sql_update

from ..deps import DbSession, PaginationDep, PrincipalDep, UserDep
from ..models import Lead, LeadAudit, User, aware
from ..schemas import BulkAssign, BulkStatus, LeadUpdate, NoteCreate, VerificationRequest
from ..security import has_permission, require_permission, write_audit
from ..services import queries
from ..services.normalization import (
    freshness_label,
    missing_fields,
    normalize_email,
    normalize_phone,
    quality_score,
)
from ..services.suppression import add_entry, suppression_reason

router = APIRouter(prefix="/api/leads", tags=["leads"])

EDITABLE_FIELDS = {
    "contact_name", "contact_title", "phone", "email", "city", "state", "zip_code",
    "industry", "website", "notes", "lead_status", "assigned_agent_id", "consent_status",
}


def _scrub_duplicates_for_agent(stmt, user: User):
    if has_permission(user, "leads:read_all"):
        return stmt
    return stmt.where(or_(Lead.assigned_agent_id == user.id, Lead.assigned_agent_id.is_(None)))


def _can_edit(user: User, lead: Lead) -> bool:
    if not has_permission(user, "leads:write"):
        return False
    if has_permission(user, "leads:read_all"):
        return True
    return lead.assigned_agent_id in (None, user.id)


def _lead_payload(db, lead: Lead) -> dict[str, Any]:
    payload = lead.to_dict()
    payload["missing_fields"] = missing_fields(payload)
    payload["freshness"] = freshness_label(lead.collected_at)
    collected = aware(lead.collected_at)
    payload["age_days"] = (datetime.now(timezone.utc) - collected).days if collected else None
    payload["suppression"] = suppression_reason(
        db, email=lead.email, phone=lead.phone_e164 or lead.phone,
        business_name=lead.business_name, website=lead.website,
    )
    return payload


def _get_lead_or_404(db, lead_id: int) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.get("")
def list_leads(
    db: DbSession,
    pagination: PaginationDep,
    user: UserDep,
    q: str | None = None,
    business_name: str | None = None,
    phone: str | None = None,
    city: str | None = None,
    state: str | None = None,
    zip: str | None = None,
    industry: str | None = None,
    source_id: int | None = None,
    phone_status: str | None = None,
    email_status: str | None = None,
    consent_status: str | None = None,
    lead_status: str | None = None,
    assigned_agent_id: str | None = None,
    verification: str | None = None,
    freshness: str | None = None,
    include_duplicates: bool = False,
    sort: str = "created_at",
    direction: str = "desc",
):
    filters = {
        "q": q, "business_name": business_name, "phone": phone, "city": city, "state": state,
        "zip": zip, "industry": industry, "source_id": source_id, "phone_status": phone_status,
        "email_status": email_status, "consent_status": consent_status, "lead_status": lead_status,
        "assigned_agent_id": assigned_agent_id, "verification": verification,
        "freshness": freshness, "include_duplicates": include_duplicates,
    }
    filters = {k: v for k, v in filters.items() if v not in (None, "", [])}

    stmt = _scrub_duplicates_for_agent(queries.apply_filters(select(Lead), filters), user)
    count_stmt = _scrub_duplicates_for_agent(queries.apply_filters(select(func.count(Lead.id)), filters), user)
    total = int(db.scalar(count_stmt) or 0)
    stmt = queries.sorted_leads(stmt, sort, direction)
    rows = db.scalars(stmt.offset(pagination.offset).limit(pagination.page_size)).all()

    summary = {
        "verified": int(db.scalar(_scrub_duplicates_for_agent(
            queries.apply_filters(select(func.count(Lead.id)), {**filters, "verification": "verified",
                                                                "include_duplicates": False}), user)) or 0),
        "invalid": int(db.scalar(_scrub_duplicates_for_agent(
            queries.apply_filters(select(func.count(Lead.id)), {**filters, "verification": "invalid",
                                                                "include_duplicates": False}), user)) or 0),
        "dnc": int(db.scalar(_scrub_duplicates_for_agent(
            queries.apply_filters(select(func.count(Lead.id)), {**filters, "lead_status": "do_not_contact",
                                                                "include_duplicates": False}), user)) or 0),
    }

    return {
        "items": [_lead_payload(db, lead) for lead in rows],
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
        "summary": summary,
    }


@router.get("/facets")
def facets(db: DbSession, _user: UserDep):
    industries = [row[0] for row in db.execute(
        select(Lead.industry).where(Lead.industry.is_not(None)).group_by(Lead.industry).order_by(Lead.industry)
    ).all()]
    states = [row[0] for row in db.execute(
        select(Lead.state).where(Lead.state.is_not(None)).group_by(Lead.state).order_by(Lead.state)
    ).all()]
    cities = [row[0] for row in db.execute(
        select(Lead.city).where(Lead.city.is_not(None)).group_by(Lead.city).order_by(Lead.city).limit(100)
    ).all()]
    by_status = {row[0]: int(row[1]) for row in db.execute(
        select(Lead.lead_status, func.count(Lead.id)).where(Lead.is_duplicate.is_(False)).group_by(Lead.lead_status)
    ).all()}
    return {"industries": industries, "states": states, "cities": cities, "by_status": by_status}


@router.get("/{lead_id}")
def get_lead(lead_id: int, db: DbSession, user: UserDep):
    lead = _get_lead_or_404(db, lead_id)
    if not has_permission(user, "leads:read_all") and lead.assigned_agent_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="This lead is assigned to another agent.")
    payload = _lead_payload(db, lead)
    audit = db.scalars(
        select(LeadAudit).where(LeadAudit.lead_id == lead.id).order_by(LeadAudit.id.desc()).limit(100)
    ).all()
    payload["history"] = [entry.to_dict() for entry in audit]
    if lead.duplicate_of_id:
        original = db.get(Lead, lead.duplicate_of_id)
        payload["duplicate_of"] = original.to_dict() if original else None
    payload["duplicates"] = [
        item.to_dict() for item in db.scalars(
            select(Lead).where(Lead.duplicate_of_id == lead.id).order_by(Lead.id.desc()).limit(20)
        ).all()
    ]
    return payload


@router.patch("/{lead_id}")
def update_lead(lead_id: int, payload: LeadUpdate, request: Request, db: DbSession, user: UserDep):
    lead = _get_lead_or_404(db, lead_id)
    if not _can_edit(user, lead):
        raise HTTPException(status_code=403, detail="You cannot edit this lead.")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _lead_payload(db, lead)

    if "assigned_agent_id" in changes:
        require_permission(user, "leads:assign")
        agent_id = changes["assigned_agent_id"]
        if agent_id is not None:
            agent = db.get(User, agent_id)
            if not agent or not agent.is_active:
                raise HTTPException(status_code=400, detail="Assigned agent does not exist or is inactive.")
        if lead.lead_status in {"new"} and agent_id:
            changes.setdefault("lead_status", "assigned")

    if "consent_status" in changes and not has_permission(user, "leads:assign"):
        raise HTTPException(status_code=403, detail="Only managers can change consent status.")

    if changes.get("lead_status") == "do_not_contact":
        add_entry(db, kind="phone" if lead.phone_e164 else "email",
                  value=lead.phone_e164 or lead.email or lead.business_name,
                  reason=f"Marked Do Not Contact on {lead.lead_ref}", user_id=user.id)
        changes.setdefault("consent_status", "denied")

    if "phone" in changes:
        info = normalize_phone(changes["phone"])
        if changes["phone"] and not info["e164"]:
            raise HTTPException(status_code=400, detail="That phone number could not be parsed.")
        changes["phone"] = info["display"] or changes["phone"]
        changes["phone_e164"] = info["e164"]
        changes["phone_verification_status"] = "format_valid" if info["e164"] else "unverified"
        changes["last_verified_at"] = None
    if "email" in changes:
        info = normalize_email(changes["email"])
        if changes["email"] and not info["valid"]:
            raise HTTPException(status_code=400, detail="That e-mail address is not valid.")
        changes["email"] = info["email"]
        changes["email_verification_status"] = "syntax_valid" if info["email"] else "unverified"

    for field, value in changes.items():
        if field not in EDITABLE_FIELDS and field not in {"phone_e164", "phone_verification_status",
                                                          "email_verification_status", "last_verified_at"}:
            continue
        old = getattr(lead, field, None)
        if old != value:
            setattr(lead, field, value)
            db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                             action="field_updated", field=field,
                             old_value=None if old is None else str(old)[:500],
                             new_value=None if value is None else str(value)[:500]))
    lead.quality_score = quality_score(lead.to_dict())
    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    write_audit(db, action="lead.updated", user=user, request=request, entity_type="lead",
                entity_id=lead.id, detail={"fields": list(changes.keys())})
    return _lead_payload(db, lead)


@router.post("/{lead_id}/notes")
def add_note(lead_id: int, payload: NoteCreate, db: DbSession, user: UserDep):
    lead = _get_lead_or_404(db, lead_id)
    if not _can_edit(user, lead):
        raise HTTPException(status_code=403, detail="You cannot annotate this lead.")
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    entry = f"[{stamp} · {user.full_name}] {payload.note.strip()}"
    lead.notes = f"{lead.notes}\n{entry}".strip() if lead.notes else entry
    lead.updated_at = datetime.now(timezone.utc)
    db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                     action="note_added", note=payload.note.strip()[:2000]))
    db.commit()
    return {"ok": True, "notes": lead.notes, "history": [
        item.to_dict() for item in db.scalars(
            select(LeadAudit).where(LeadAudit.lead_id == lead.id).order_by(LeadAudit.id.desc()).limit(100)
        ).all()
    ]}


@router.post("/{lead_id}/verify")
def verify_lead(lead_id: int, payload: VerificationRequest, request: Request, db: DbSession, user: UserDep):
    """Record human/provider verification evidence. Website discovery alone is not verification."""
    require_permission(user, "leads:verify")
    lead = _get_lead_or_404(db, lead_id)
    now = datetime.now(timezone.utc)
    field = "phone_verification_status" if payload.channel == "phone" else "email_verification_status"
    old = getattr(lead, field)
    setattr(lead, field, payload.status)
    lead.last_verified_at = now
    db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                     action="verification_recorded", field=field, old_value=old,
                     new_value=payload.status, note=payload.evidence))
    db.commit()
    write_audit(db, action="lead.verification_recorded", user=user, request=request,
                entity_type="lead", entity_id=lead.id,
                detail={"channel": payload.channel, "status": payload.status})
    return _lead_payload(db, lead)


@router.post("/bulk/assign")
def bulk_assign(payload: BulkAssign, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "leads:assign")
    leads = db.scalars(select(Lead).where(Lead.id.in_(payload.lead_ids))).all()
    if not leads:
        raise HTTPException(status_code=404, detail="No matching leads")

    if payload.strategy == "round_robin":
        agents = db.scalars(
            select(User).where(User.is_active.is_(True), User.role.in_(["agent", "manager"]))
        ).all()
        if not agents:
            raise HTTPException(status_code=400, detail="No active agents available")
        for index, lead in enumerate(leads):
            lead.assigned_agent_id = agents[index % len(agents)].id
            if lead.lead_status == "new":
                lead.lead_status = "assigned"
            db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                             action="assigned", field="assigned_agent_id",
                             old_value=None, new_value=agents[index % len(agents)].full_name))
    else:
        if payload.agent_id is None:
            raise HTTPException(status_code=400, detail="agent_id is required")
        agent = db.get(User, payload.agent_id)
        if not agent or not agent.is_active:
            raise HTTPException(status_code=400, detail="Agent does not exist or is inactive")
        for lead in leads:
            lead.assigned_agent_id = agent.id
            if lead.lead_status == "new":
                lead.lead_status = "assigned"
            db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                             action="assigned", field="assigned_agent_id",
                             old_value=None, new_value=agent.full_name))
    db.commit()
    write_audit(db, action="lead.bulk_assigned", user=user, request=request,
                entity_type="lead", entity_id="bulk",
                detail={"count": len(leads), "strategy": payload.strategy,
                        "agent_id": payload.agent_id})
    return {"ok": True, "assigned": len(leads)}


@router.post("/bulk/status")
def bulk_status(payload: BulkStatus, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "leads:write")
    leads = db.scalars(select(Lead).where(Lead.id.in_(payload.lead_ids))).all()
    updated = 0
    for lead in leads:
        if not _can_edit(user, lead):
            continue
        old = lead.lead_status
        if old == payload.lead_status:
            continue
        lead.lead_status = payload.lead_status
        if payload.lead_status == "do_not_contact":
            if not has_permission(user, "leads:assign"):
                continue
            lead.consent_status = "denied"
            add_entry(db, kind="phone" if lead.phone_e164 else "email",
                      value=lead.phone_e164 or lead.email or lead.business_name,
                      reason=f"Marked Do Not Contact ({lead.lead_ref})", user_id=user.id)
        db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                         action="status_changed", field="lead_status", old_value=old,
                         new_value=payload.lead_status))
        updated += 1
    db.commit()
    write_audit(db, action="lead.bulk_status", user=user, request=request, entity_type="lead",
                entity_id="bulk", detail={"count": updated, "status": payload.lead_status})
    return {"ok": True, "updated": updated}


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, request: Request, db: DbSession, user: UserDep,
                suppress: bool = True, reason: str | None = None):
    require_permission(user, "leads:delete")
    lead = _get_lead_or_404(db, lead_id)
    ref, name = lead.lead_ref, lead.business_name
    if suppress:
        if lead.phone_e164:
            add_entry(db, kind="phone", value=lead.phone_e164,
                      reason=reason or f"Deletion request for {ref}", user_id=user.id)
        if lead.email:
            add_entry(db, kind="email", value=lead.email,
                      reason=reason or f"Deletion request for {ref}", user_id=user.id)
    # Delete the dependent rows explicitly: SQLite enforces the foreign keys and a
    # deletion (erasure) request must not fail halfway through.
    duplicate_ids = [row[0] for row in db.execute(
        select(Lead.id).where(Lead.duplicate_of_id == lead.id)
    ).all()]
    target_ids = [lead.id, *duplicate_ids]
    db.execute(sql_delete(LeadAudit).where(LeadAudit.lead_id.in_(target_ids)))
    if duplicate_ids:
        db.execute(sql_update(Lead).where(Lead.id.in_(duplicate_ids)).values(duplicate_of_id=None))
        db.execute(sql_delete(Lead).where(Lead.id.in_(duplicate_ids)))
    db.delete(lead)
    db.commit()
    write_audit(db, action="lead.deleted", user=user, request=request, entity_type="lead",
                entity_id=lead_id,
                detail={"business_name": name, "suppressed": suppress, "suppression_reason": reason})
    return {"ok": True, "suppressed": suppress}
