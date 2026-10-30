"""Agent & user management (role-based)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import case, func, or_, select

from ..deps import DbSession, PrincipalDep, UserDep
from ..models import Lead, LeadAudit, User
from ..schemas import UserCreate, UserUpdate
from ..security import hash_password, password_problems, require_permission, write_audit

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _agent_payload(db, agent: User) -> dict:
    since = datetime.now(timezone.utc) - timedelta(days=1)
    rows = db.execute(
        select(
            func.count(Lead.id),
            func.sum(case((Lead.lead_status == "contacted", 1), else_=0)),
            func.sum(case((Lead.lead_status == "interested", 1), else_=0)),
            func.sum(case((Lead.lead_status == "converted", 1), else_=0)),
            func.sum(case((Lead.lead_status == "follow_up", 1), else_=0)),
            func.sum(case((Lead.lead_status == "do_not_contact", 1), else_=0)),
            func.sum(case((Lead.lead_status == "assigned", 1), else_=0)),
            func.sum(case((Lead.created_at >= since, 1), else_=0)),
        ).where(Lead.assigned_agent_id == agent.id, Lead.is_duplicate.is_(False))
    ).one()
    payload = agent.to_dict()
    assigned = int(rows[0] or 0)
    converted = int(rows[3] or 0)
    payload["stats"] = {
        "assigned": assigned,
        "contacted": int(rows[1] or 0),
        "interested": int(rows[2] or 0),
        "converted": converted,
        "follow_up": int(rows[4] or 0),
        "dnc": int(rows[5] or 0),
        "pending": int(rows[6] or 0),
        "added_today": int(rows[7] or 0),
        "conversion_rate": round(converted / assigned * 100, 1) if assigned else 0.0,
        "quota_remaining": max(0, (agent.daily_quota or 0) - int(rows[7] or 0)),
    }
    return payload


@router.get("")
def list_agents(db: DbSession, principal: PrincipalDep):
    stmt = select(User).where(User.role.in_(["agent", "manager", "admin"]))
    if principal.kind == "user" and principal.user and principal.user.role == "agent":
        stmt = stmt.where(User.is_active.is_(True))
    users = db.scalars(stmt.order_by(User.role, User.full_name)).all()
    items = [_agent_payload(db, user) for user in users]
    return {
        "items": items,
        "total": len(items),
        "totals": {
            "assigned": sum(item["stats"]["assigned"] for item in items),
            "converted": sum(item["stats"]["converted"] for item in items),
            "active": sum(1 for item in items if item["is_active"]),
        },
    }


@router.get("/{agent_id}")
def get_agent(agent_id: int, db: DbSession, principal: PrincipalDep):
    agent = db.get(User, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if principal.kind == "user" and principal.user and principal.user.role == "agent" and agent.id != principal.user.id:
        raise HTTPException(status_code=403, detail="You can only view your own profile.")
    payload = _agent_payload(db, agent)
    recent = db.scalars(
        select(Lead).where(Lead.assigned_agent_id == agent.id).order_by(Lead.updated_at.desc()).limit(15)
    ).all()
    payload["recent_leads"] = [lead.to_dict() for lead in recent]
    payload["recent_activity"] = [
        entry.to_dict() for entry in db.scalars(
            select(LeadAudit).where(LeadAudit.user_id == agent.id).order_by(LeadAudit.id.desc()).limit(20)
        ).all()
    ]
    return payload


@router.post("", status_code=201)
def create_agent(payload: UserCreate, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "users:manage")
    email = payload.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="A user with that email already exists.")
    problems = password_problems(payload.password)
    if problems:
        raise HTTPException(status_code=400, detail=" ".join(problems))
    agent = User(
        email=email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        hashed_password=hash_password(payload.password),
        team=payload.team,
        phone=payload.phone,
        daily_quota=payload.daily_quota,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    write_audit(db, action="user.created", user=user, request=request, entity_type="user",
                entity_id=agent.id, detail={"email": email, "role": payload.role})
    return _agent_payload(db, agent)


@router.patch("/{agent_id}")
def update_agent(agent_id: int, payload: UserUpdate, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "users:manage")
    agent = db.get(User, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if agent.id == user.id and data.get("role") and data["role"] != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role.")
    if agent.id == user.id and data.get("is_active") is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    if "password" in data and data["password"]:
        problems = password_problems(data["password"])
        if problems:
            raise HTTPException(status_code=400, detail=" ".join(problems))
        agent.hashed_password = hash_password(data["password"])
    for field in ("full_name", "role", "is_active", "team", "phone", "daily_quota"):
        if field in data and data[field] is not None:
            setattr(agent, field, data[field])
    db.commit()
    write_audit(db, action="user.updated", user=user, request=request, entity_type="user",
                entity_id=agent.id, detail={"fields": list(data.keys())})
    return _agent_payload(db, agent)


@router.post("/{agent_id}/deactivate")
def deactivate_agent(agent_id: int, request: Request, db: DbSession, user: UserDep,
                     reassign_to: int | None = None):
    require_permission(user, "users:manage")
    agent = db.get(User, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="User not found")
    if agent.id == user.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    agent.is_active = False
    moved = 0
    if reassign_to:
        target = db.get(User, reassign_to)
        if not target or not target.is_active:
            raise HTTPException(status_code=400, detail="Reassignment target is invalid")
        leads = db.scalars(select(Lead).where(Lead.assigned_agent_id == agent.id)).all()
        for lead in leads:
            lead.assigned_agent_id = target.id
            db.add(LeadAudit(lead_id=lead.id, user_id=user.id, actor_name=user.full_name,
                             action="reassigned", field="assigned_agent_id",
                             old_value=agent.full_name, new_value=target.full_name))
            moved += 1
    else:
        db.query(Lead).filter(Lead.assigned_agent_id == agent.id).update(
            {"assigned_agent_id": None}, synchronize_session=False
        )
    db.commit()
    write_audit(db, action="user.deactivated", user=user, request=request, entity_type="user",
                entity_id=agent.id, detail={"reassigned_to": reassign_to, "leads_moved": moved})
    return {"ok": True, "reassigned": moved}


@router.post("/{agent_id}/activate")
def activate_agent(agent_id: int, request: Request, db: DbSession, user: UserDep):
    require_permission(user, "users:manage")
    agent = db.get(User, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="User not found")
    agent.is_active = True
    db.commit()
    write_audit(db, action="user.activated", user=user, request=request, entity_type="user",
                entity_id=agent.id)
    return {"ok": True}
