"""Public first-party lead form endpoint (tokenised, rate limited, consent-gated)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy import select

from ..config import settings
from ..deps import DbSession
from ..models import DataSource, User
from ..schemas import PublicLeadForm
from ..security import client_ip, limiter
from ..services.ingest import ingest_record

router = APIRouter(prefix="/api/public", tags=["public"])


def _source_by_token(db: DbSession, token: str) -> DataSource:
    for candidate in db.scalars(select(DataSource).where(DataSource.adapter == "lead_form")).all():
        if (candidate.config or {}).get("form_token") == token:
            if not candidate.is_enabled:
                raise HTTPException(status_code=403, detail="This form is currently disabled.")
            return candidate
    raise HTTPException(status_code=404, detail="Unknown form token.")


@router.get("/lead-form/{token}")
def form_schema(token: str, db: DbSession):
    source = _source_by_token(db, token)
    config = source.config or {}
    return {
        "form": "lead_form",
        "business": settings.app_name,
        "fields": [
            {"name": "business_name", "label": "Business name", "required": True, "type": "text"},
            {"name": "contact_name", "label": "Your name", "required": False, "type": "text"},
            {"name": "phone", "label": "Business phone", "required": False, "type": "tel"},
            {"name": "email", "label": "Business email", "required": False, "type": "email"},
            {"name": "city", "label": "City", "required": False, "type": "text"},
            {"name": "state", "label": "State", "required": False, "type": "text"},
            {"name": "message", "label": "How can we help?", "required": False, "type": "textarea"},
        ],
        "consent_text": config.get("consent_text")
        or "I agree to be contacted by phone or email about my enquiry.",
        "source_name": source.name,
    }


@router.post("/lead-form/{token}", status_code=201)
def submit_form(token: str, payload: PublicLeadForm, request: Request, db: DbSession):
    allowed, retry_after = limiter.check(
        f"public-form:{client_ip(request)}", settings.public_form_rate_limit_per_minute
    )
    if not allowed:
        raise HTTPException(status_code=429, detail="Too many submissions. Please try again later.",
                            headers={"Retry-After": str(retry_after)})

    if payload.website:  # honeypot
        return {"ok": True, "message": "Thank you."}

    if not payload.consent_granted:
        raise HTTPException(
            status_code=400,
            detail="Consent is required so we can contact you about your enquiry.",
        )

    source = _source_by_token(db, token)
    config = source.config or {}
    raw = {
        "business_name": payload.business_name,
        "contact_name": payload.contact_name,
        "contact_title": payload.contact_title,
        "phone": payload.phone,
        "email": payload.email,
        "city": payload.city,
        "state": payload.state,
        "zip_code": payload.zip_code,
        "industry": payload.industry,
        "source_url": str(request.url),
        "consent_status": "granted",
        "consent_source": (
            f"Web form consent v{payload.consent_text_version}: "
            f"{config.get('consent_text', 'consent checkbox')}"
        )[:400],
    }
    result = ingest_record(db, raw, source=source, actor_label="public-form", consent_override="granted")
    if result.status == "invalid" or not result.lead:
        raise HTTPException(status_code=400, detail="Please check the details you entered and try again.")
    if payload.message:
        from ..models import LeadAudit

        db.add(LeadAudit(lead_id=result.lead.id, actor_name="public-form", action="note_added",
                         note=f"Visitor message: {payload.message[:1500]}"))
        db.commit()
    return {"ok": True, "message": "Thank you — we will be in touch.", "reference": result.lead.lead_ref}
