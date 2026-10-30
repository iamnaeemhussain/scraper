"""CSV / Excel import and compliance-gated export."""
from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone
from typing import Any, Iterable

from openpyxl import Workbook, load_workbook
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..adapters.base import ALL_LEAD_FIELDS, PROHIBITED_FIELDS
from ..models import DataSource, ImportBatch, ImportRowError, Lead, User
from . import queries
from .ingest import ingest_record
from .normalization import freshness_label, missing_fields
from .suppression import suppression_reason

MAX_UPLOAD_BYTES = 12 * 1024 * 1024
MAX_ROWS = 20_000

COLUMN_ALIASES: dict[str, str] = {
    "business_name": "business_name", "business": "business_name", "company": "business_name",
    "company_name": "business_name", "organization": "business_name", "organisation": "business_name",
    "account": "business_name", "name": "business_name",
    "contact_name": "contact_name", "contact": "contact_name", "contact_person": "contact_name",
    "first_name": "contact_name", "full_name": "contact_name",
    "contact_title": "contact_title", "title": "contact_title", "job_title": "contact_title",
    "position": "contact_title",
    "phone": "phone", "phone_number": "phone", "telephone": "phone", "tel": "phone",
    "business_phone": "phone", "mobile": "phone", "work_phone": "phone",
    "email": "email", "e_mail": "email", "email_address": "email", "business_email": "email",
    "address_line1": "address_line1", "address": "address_line1", "street": "address_line1",
    "street_address": "address_line1", "address1": "address_line1",
    "address_line2": "address_line2", "address2": "address_line2", "suite": "address_line2",
    "city": "city", "town": "city",
    "state": "state", "province": "state", "region": "state", "state_code": "state",
    "zip_code": "zip_code", "zip": "zip_code", "postal_code": "zip_code", "postcode": "zip_code",
    "country": "country",
    "industry": "industry", "category": "industry", "sector": "industry", "vertical": "industry",
    "website": "website", "url": "website", "web": "website", "domain": "website",
    "source_url": "source_url", "source": "source_url", "listing_url": "source_url",
    "consent_status": "consent_status", "consent": "consent_status", "permission": "consent_status",
    "notes": "notes",
}

# Fields a spreadsheet may carry that are not extraction targets.
IMPORT_EXTRA_FIELDS = {"notes"}

EXPORT_COLUMNS = [
    ("lead_ref", "Record ID"),
    ("business_name", "Business name"),
    ("contact_name", "Contact name"),
    ("contact_title", "Contact title"),
    ("phone", "Business phone"),
    ("email", "Business email"),
    ("address_line1", "Address"),
    ("address_line2", "Address line 2"),
    ("city", "City"),
    ("state", "State"),
    ("zip_code", "ZIP"),
    ("country", "Country"),
    ("industry", "Industry"),
    ("website", "Website"),
    ("source_name", "Source"),
    ("source_url", "Original source URL"),
    ("source_attribution", "Attribution"),
    ("collected_at", "Collected at"),
    ("last_verified_at", "Last verified at"),
    ("phone_verification_status", "Phone status"),
    ("email_verification_status", "Email status"),
    ("licensing_status", "Licensing status"),
    ("consent_status", "Consent"),
    ("lead_status", "Lead status"),
    ("assigned_agent_name", "Assigned agent"),
    ("quality_score", "Quality score"),
    ("notes", "Notes"),
]

PROHIBITED_HEADER_TOKENS = {
    "ssn", "social_security", "date_of_birth", "dob", "birthdate", "age", "race", "ethnicity",
    "religion", "sexual_orientation", "gender_identity", "health", "medical", "diagnosis",
    "credit_score", "salary", "income", "bank_account", "passport", "driver_license",
    "home_address", "personal_cell", "personal_email", "biometric", "criminal_record",
}


def normalize_header(header: str) -> str:
    key = re.sub(r"[^a-z0-9]+", "_", str(header).strip().lower()).strip("_")
    return key


def map_columns(headers: list[str]) -> tuple[dict[str, str], list[str], list[str]]:
    """Return (mapping raw_header -> field, unmapped headers, prohibited headers)."""
    mapping: dict[str, str] = {}
    unmapped: list[str] = []
    prohibited: list[str] = []
    used_fields: set[str] = set()
    for header in headers:
        normalized = normalize_header(header)
        if any(token in normalized for token in PROHIBITED_HEADER_TOKENS):
            prohibited.append(header)
            continue
        field = COLUMN_ALIASES.get(normalized)
        if field and (field in ALL_LEAD_FIELDS or field in IMPORT_EXTRA_FIELDS) and field not in used_fields:
            mapping[header] = field
            used_fields.add(field)
        elif (normalized in ALL_LEAD_FIELDS or normalized in IMPORT_EXTRA_FIELDS) and normalized not in used_fields:
            mapping[header] = normalized
            used_fields.add(normalized)
        else:
            unmapped.append(header)
    return mapping, [h for h in unmapped if isinstance(h, str)], prohibited


def read_tabular(content: bytes, filename: str) -> tuple[list[str], list[dict[str, Any]]]:
    """Parse CSV or XLSX into (headers, rows-as-dicts). Raises ValueError on bad input."""
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("File is larger than the 12 MB upload limit.")
    lower = filename.lower()
    if lower.endswith((".xlsx", ".xlsm")):
        try:
            workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"Could not read Excel file: {exc}") from exc
        sheet = workbook.active
        rows_iter = sheet.iter_rows(values_only=True)
        try:
            headers = [str(cell).strip() if cell is not None else "" for cell in next(rows_iter)]
        except StopIteration:
            raise ValueError("The spreadsheet is empty.") from None
        rows: list[dict[str, Any]] = []
        for values in rows_iter:
            if values is None or all(v is None or str(v).strip() == "" for v in values):
                continue
            rows.append({headers[i]: values[i] if i < len(values) else None for i in range(len(headers))})
            if len(rows) > MAX_ROWS:
                raise ValueError(f"File has more than {MAX_ROWS:,} rows. Split it into smaller imports.")
        workbook.close()
        return headers, rows

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError as exc:
            raise ValueError("File must be UTF-8 or Latin-1 encoded CSV.") from exc
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [h.strip() for h in (reader.fieldnames or []) if h]
    if not headers:
        raise ValueError("The CSV has no header row.")
    rows = []
    for row in reader:
        if not any((v or "").strip() for v in row.values() if isinstance(v, str)):
            continue
        rows.append({(k or "").strip(): v for k, v in row.items()})
        if len(rows) > MAX_ROWS:
            raise ValueError(f"File has more than {MAX_ROWS:,} rows. Split it into smaller imports.")
    return headers, rows


def preview_import(content: bytes, filename: str, sample_size: int = 5) -> dict[str, Any]:
    headers, rows = read_tabular(content, filename)
    mapping, unmapped, prohibited = map_columns(headers)
    if not mapping:
        raise ValueError(
            "No recognised lead columns were found. Download the template and try again."
        )
    preview = []
    for row in rows[:sample_size]:
        preview.append({mapping.get(k, k): row.get(k) for k in headers if k in mapping})
    return {
        "filename": filename,
        "rows": len(rows),
        "headers": headers,
        "mapping": mapping,
        "unmapped_headers": unmapped,
        "prohibited_headers": prohibited,
        "can_import": bool(mapping) and not prohibited,
        "preview": preview,
        "fields_detected": sorted(set(mapping.values())),
    }


def run_import(
    db: Session,
    *,
    content: bytes,
    filename: str,
    user: User,
    source: DataSource | None,
    attestation: str,
    consent_override: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    headers, rows = read_tabular(content, filename)
    mapping, unmapped, prohibited = map_columns(headers)
    if prohibited:
        raise ValueError(
            "This file contains prohibited personal/sensitive columns ("
            + ", ".join(prohibited)
            + "). The platform only accepts business contact data."
        )
    if not mapping:
        raise ValueError("No recognised lead columns were found. Download the template and try again.")

    batch = ImportBatch(
        filename=filename,
        source_id=source.id if source else None,
        rows_total=len(rows),
        status="preview" if dry_run else "processing",
        mapping=mapping,
        attestation=attestation[:240],
        created_by=user.id,
        created_by_name=user.full_name,
    )
    if not dry_run:
        db.add(batch)
        db.flush()

    imported = duplicates = invalid = 0
    errors: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=2):
        raw = {field: row.get(header) for header, field in mapping.items() if row.get(header) not in (None, "")}
        notes = row.get("Notes") or row.get("notes")
        if notes:
            raw.setdefault("notes", notes)
        if not raw:
            invalid += 1
            errors.append({"row_number": index, "message": "Row is empty after mapping.", "raw": {}})
            continue
        result = ingest_record(
            db, raw, source=source, user=user, actor_label=user.full_name,
            import_batch_id=batch.id if not dry_run else None,
            consent_override=consent_override, commit=not dry_run,
        )
        if result.status == "created":
            imported += 1
        elif result.status == "duplicate":
            duplicates += 1
        else:
            invalid += 1
            if len(errors) < 500:
                errors.append({
                    "row_number": index,
                    "message": "; ".join(result.errors),
                    "raw": {k: str(v)[:120] for k, v in raw.items()},
                })
        if not dry_run and index % 50 == 0:
            batch.imported, batch.duplicates, batch.invalid = imported, duplicates, invalid
            db.commit()

    if dry_run:
        # Nothing from a dry run may reach the database — not even a pending insert
        # that a later audit write could flush.
        db.rollback()

    if not dry_run:
        batch.imported, batch.duplicates, batch.invalid = imported, duplicates, invalid
        batch.status = "completed"
        for error in errors[:500]:
            db.add(ImportRowError(batch_id=batch.id, row_number=error["row_number"],
                                  message=error["message"][:400], raw=error["raw"]))
        db.commit()

    return {
        "batch_id": batch.id if not dry_run else None,
        "filename": filename,
        "rows_total": len(rows),
        "imported": imported,
        "duplicates": duplicates,
        "invalid": invalid,
        "errors": errors[:100],
        "error_count": len(errors),
        "mapping": mapping,
        "unmapped_headers": unmapped,
        "dry_run": dry_run,
    }


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #
def export_block_reason(db: Session, lead: Lead, *, require_consent: bool) -> str | None:
    """Hard stop reasons: nothing on this list may appear on a calling list."""
    if lead.lead_status == "do_not_contact":
        return "Lead status is Do Not Contact"
    if lead.consent_status in {"denied", "withdrawn"}:
        return f"Contact permission {lead.consent_status}"
    if require_consent and lead.consent_status != "granted":
        return "Organisation policy requires explicit consent"
    if not lead.phone_e164 and not lead.email:
        return "No usable contact channel"
    reason = suppression_reason(db, email=lead.email, phone=lead.phone_e164 or lead.phone,
                                business_name=lead.business_name, website=lead.website)
    if reason:
        return reason
    return None


def select_export_leads(db: Session, filters: dict[str, Any], *, require_consent: bool,
                        exclude_invalid: bool = True) -> tuple[list[Lead], list[dict[str, Any]]]:
    stmt = queries.sorted_leads(queries.apply_filters(select(Lead), filters), "created_at", "desc")
    leads = db.scalars(stmt.limit(50_000)).all()
    allowed: list[Lead] = []
    blocked: list[dict[str, Any]] = []
    for lead in leads:
        reason = export_block_reason(db, lead, require_consent=require_consent)
        if reason:
            blocked.append({"lead_ref": lead.lead_ref, "business_name": lead.business_name, "reason": reason})
            continue
        if exclude_invalid and (lead.phone_verification_status in {"invalid", "disconnected"}
                                or lead.email_verification_status in {"invalid", "bounced"}):
            blocked.append({"lead_ref": lead.lead_ref, "business_name": lead.business_name,
                            "reason": "Marked invalid by verification"})
            continue
        allowed.append(lead)
    return allowed, blocked


def build_export_file(leads: Iterable[Lead], fmt: str, *, include_notes: bool = True) -> tuple[bytes, str, str]:
    columns = [(field, label) for field, label in EXPORT_COLUMNS if include_notes or field != "notes"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")

    def row_values(lead: Lead) -> list[str]:
        values: list[str] = []
        for field, _ in columns:
            value = getattr(lead, field, None)
            if field == "assigned_agent_name":
                value = lead.assigned_agent.full_name if lead.assigned_agent else ""
            if field == "collected_at" and value:
                value = value.strftime("%Y-%m-%d %H:%M UTC") if hasattr(value, "strftime") else str(value)
            if field == "last_verified_at" and value:
                value = value.strftime("%Y-%m-%d %H:%M UTC") if hasattr(value, "strftime") else str(value)
            values.append("" if value is None else str(value))
        return values

    if fmt == "xlsx":
        workbook = Workbook()
        sheet = workbook.active
        assert sheet is not None
        sheet.title = "Leads"
        sheet.append([label for _, label in columns])
        for lead in leads:
            sheet.append(row_values(lead))
        sheet.freeze_panes = "A2"
        for index, (_, label) in enumerate(columns, start=1):
            width = max(14, min(38, len(label) + 8))
            sheet.column_dimensions[sheet.cell(row=1, column=index).column_letter].width = width
        buffer = io.BytesIO()
        workbook.save(buffer)
        return buffer.getvalue(), f"leads-{stamp}.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([label for _, label in columns])
    for lead in leads:
        writer.writerow(row_values(lead))
    return buffer.getvalue().encode("utf-8"), f"leads-{stamp}.csv", "text/csv"


def export_preview(db: Session, filters: dict[str, Any], *, require_consent: bool,
                   exclude_invalid: bool) -> dict[str, Any]:
    allowed, blocked = select_export_leads(db, filters, require_consent=require_consent,
                                           exclude_invalid=exclude_invalid)
    reasons: dict[str, int] = {}
    for item in blocked:
        reasons[item["reason"]] = reasons.get(item["reason"], 0) + 1
    return {
        "eligible": len(allowed),
        "blocked": len(blocked),
        "blocked_reasons": [{"reason": r, "count": c} for r, c in sorted(reasons.items(), key=lambda x: -x[1])],
        "sample": [
            {
                "lead_ref": lead.lead_ref,
                "business_name": lead.business_name,
                "phone": lead.phone,
                "email": lead.email,
                "city": lead.city,
                "state": lead.state,
                "consent_status": lead.consent_status,
                "phone_verification_status": lead.phone_verification_status,
                "freshness": freshness_label(lead.collected_at),
                "missing": missing_fields(lead.to_dict()),
            }
            for lead in allowed[:10]
        ],
        "require_consent": require_consent,
        "exclude_invalid": exclude_invalid,
    }


IMPORT_TEMPLATE_HEADERS = [
    "Business Name", "Contact Name", "Contact Title", "Phone", "Email", "Address", "City",
    "State", "ZIP", "Country", "Industry", "Website", "Consent Status", "Notes",
]


def build_import_template(fmt: str = "csv") -> tuple[bytes, str, str]:
    sample = [
        ["Northside Dental Studio", "Dana Whitfield", "Office Manager", "(512) 555-0142",
         "office@northsidedental.example", "1200 Oak Ave", "Austin", "TX", "78701", "US",
         "Healthcare", "https://northsidedental.example", "granted",
         "Uploaded from our own CRM; customer asked to be contacted"],
    ]
    if fmt == "xlsx":
        workbook = Workbook()
        sheet = workbook.active
        assert sheet is not None
        sheet.append(IMPORT_TEMPLATE_HEADERS)
        for row in sample:
            sheet.append(row)
        buffer = io.BytesIO()
        workbook.save(buffer)
        return (buffer.getvalue(), "lead-import-template.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(IMPORT_TEMPLATE_HEADERS)
    for row in sample:
        writer.writerow(row)
    return buffer.getvalue().encode("utf-8"), "lead-import-template.csv", "text/csv"


def import_stats(db: Session) -> dict[str, Any]:
    batches = db.execute(
        select(func.count(ImportBatch.id), func.coalesce(func.sum(ImportBatch.imported), 0),
               func.coalesce(func.sum(ImportBatch.duplicates), 0), func.coalesce(func.sum(ImportBatch.invalid), 0))
    ).one()
    return {
        "batches": int(batches[0] or 0),
        "imported": int(batches[1] or 0),
        "duplicates": int(batches[2] or 0),
        "invalid": int(batches[3] or 0),
    }
