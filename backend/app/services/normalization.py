"""Data cleaning & validation.

Everything here is deterministic and side-effect free so it can be unit tested and
re-used by adapters, the CSV importer and the API.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import date, datetime, timezone

try:  # optional, much better international parsing when available
    import phonenumbers

    _HAS_PHONENUMBERS = True
except Exception:  # pragma: no cover - optional dependency
    _HAS_PHONENUMBERS = False

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
URL_RE = re.compile(r"^(https?://)?([\w\-]+\.)+[A-Za-z]{2,}(:\d+)?(/.*)?$")
ZIP_RE = re.compile(r"^\d{5}(-\d{4})?$")

US_STATES = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR", "CALIFORNIA": "CA",
    "COLORADO": "CO", "CONNECTICUT": "CT", "DELAWARE": "DE", "DISTRICT OF COLUMBIA": "DC",
    "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI", "IDAHO": "ID", "ILLINOIS": "IL",
    "INDIANA": "IN", "IOWA": "IA", "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA",
    "MAINE": "ME", "MARYLAND": "MD", "MASSACHUSETTS": "MA", "MICHIGAN": "MI", "MINNESOTA": "MN",
    "MISSISSIPPI": "MS", "MISSOURI": "MO", "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
    "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", "OHIO": "OH", "OKLAHOMA": "OK", "OREGON": "OR",
    "PENNSYLVANIA": "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT", "VIRGINIA": "VA",
    "WASHINGTON": "WA", "WEST VIRGINIA": "WV", "WISCONSIN": "WI", "WYOMING": "WY",
    "PUERTO RICO": "PR", "GUAM": "GU", "VIRGIN ISLANDS": "VI",
}
STATE_CODES = set(US_STATES.values())

ADDRESS_ABBREVIATIONS = {
    "street": "St", "st.": "St", "avenue": "Ave", "av.": "Ave", "boulevard": "Blvd",
    "road": "Rd", "drive": "Dr", "lane": "Ln", "court": "Ct", "place": "Pl",
    "parkway": "Pkwy", "highway": "Hwy", "suite": "Ste", "ste.": "Ste", "apartment": "Apt",
    "building": "Bldg", "floor": "Fl", "north": "N", "south": "S", "east": "E", "west": "W",
    "northeast": "NE", "northwest": "NW", "southeast": "SE", "southwest": "SW",
    "route": "Rte", "center": "Ctr", "square": "Sq",
}

BUSINESS_SUFFIXES = (
    "llc", "l.l.c.", "inc", "inc.", "incorporated", "corp", "corp.", "corporation",
    "co", "co.", "company", "ltd", "ltd.", "limited", "plc", "gmbh", "sa", "s.a.",
    "pty", "pty.", "group", "holdings", "the",
)


def _clean(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    return re.sub(r"\s+", " ", text).strip()


def title_case(value: object) -> str | None:
    text = _clean(value)
    if not text:
        return None
    text = text.title()
    # fix common artifacts
    text = re.sub(r"\bNc\b", "NC", text)
    text = re.sub(r"\bSt\b\.?", "St", text)
    return text


# --------------------------------------------------------------------------- #
# Phone numbers
# --------------------------------------------------------------------------- #
def normalize_phone(raw: object, default_region: str = "US") -> dict:
    """Format a phone number without ever asserting that it is reachable.

    Returns a dict with: display, e164, extension, valid (format-level only).
    """
    result = {"display": None, "e164": None, "extension": None, "valid": False, "reason": None}
    text = _clean(raw)
    if not text:
        result["reason"] = "empty"
        return result

    extension = None
    ext_match = re.search(r"(?:ext\.?|x|extension)\s*(\d{2,6})", text, re.IGNORECASE)
    if ext_match:
        extension = ext_match.group(1)
        text = text[: ext_match.start()]
    result["extension"] = extension

    if _HAS_PHONENUMBERS:
        try:
            parsed = phonenumbers.parse(text, default_region)
            if phonenumbers.is_possible_number(parsed):
                # Only a *valid* number gets an E.164 value: a number that cannot be
                # dialled must never enter the database looking well-formed.
                if phonenumbers.is_valid_number(parsed):
                    result["e164"] = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
                    result["display"] = phonenumbers.format_number(
                        parsed, phonenumbers.PhoneNumberFormat.NATIONAL
                    )
                    result["valid"] = True
                else:
                    result["reason"] = "not_a_valid_number_for_region"
                return result
        except Exception:
            pass  # fall through to the lightweight parser

    digits = re.sub(r"\D", "", text)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        if digits[0] in "01" or digits[3] in "01":
            result["reason"] = "invalid_nanp_pattern"
            return result
        result["e164"] = f"+1{digits}"
        result["display"] = f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
        result["valid"] = True
        return result
    if text.startswith("+") and 8 <= len(digits) <= 15:
        result["e164"] = f"+{digits}"
        result["display"] = f"+{digits}"
        result["valid"] = True
        return result
    result["reason"] = "unparseable"
    return result


def phone_digits(raw: object) -> str:
    """Digits only, in a canonical form so the same line always fingerprints equally.

    `+1 (512) 555-0100`, `1-512-555-0100` and `5125550100` must all reduce to
    `5125550100` — otherwise the dedupe key would miss obvious duplicates.
    """
    digits = re.sub(r"\D", "", _clean(raw))
    if len(digits) == 11 and digits.startswith("1"):
        return digits[1:]
    return digits


# --------------------------------------------------------------------------- #
# Email
# --------------------------------------------------------------------------- #
FREEMAIL_DOMAINS = {
    "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com", "icloud.com",
    "live.com", "msn.com", "protonmail.com", "mail.com", "yandex.com",
}

ROLE_EMAIL_PREFIXES = {
    "info", "sales", "contact", "support", "admin", "office", "hello", "team",
    "billing", "accounts", "service", "help", "marketing", "enquiries",
}


def normalize_email(raw: object) -> dict:
    text = _clean(raw).lower()
    result = {"email": None, "valid": False, "reason": None, "is_role": False, "domain": None}
    if not text:
        result["reason"] = "empty"
        return result
    text = text.replace("mailto:", "").strip(" .,;<>()[]")
    if text.count("@") != 1:
        result["reason"] = "invalid_syntax"
        return result
    local, _, domain = text.partition("@")
    if not EMAIL_RE.match(text) or ".." in text or len(text) > 254 or local.startswith("."):
        result["reason"] = "invalid_syntax"
        return result
    if domain in {"example.com", "example.org", "domain.com", "email.com"}:
        result["reason"] = "placeholder_domain"
        return result
    result.update(
        email=text,
        valid=True,
        domain=domain,
        is_role=local in ROLE_EMAIL_PREFIXES,
    )
    return result


# --------------------------------------------------------------------------- #
# Address / location
# --------------------------------------------------------------------------- #
def normalize_address_line(raw: object) -> str | None:
    text = _clean(raw)
    if not text:
        return None
    text = re.sub(r"\s*#\s*", " #", text)
    text = re.sub(r"\b[" + re.escape(".,") + r"]+", lambda m: m.group(0), text)
    parts = text.split()
    out: list[str] = []
    for part in parts:
        key = part.lower().strip(",.")
        out.append(ADDRESS_ABBREVIATIONS.get(key, part))
    text = " ".join(out)
    text = re.sub(r"\b([A-Za-z])\1*\b\.", lambda m: m.group(0).upper(), text)
    # Title-case everything except suite/unit markers
    text = " ".join(
        w if re.fullmatch(r"#?\d+[A-Za-z]?", w) or w in {"NE", "NW", "SE", "SW", "N", "S", "E", "W",
                                                        "PO", "St", "Ave", "Blvd", "Rd", "Dr", "Ln",
                                                        "Ct", "Pl", "Pkwy", "Hwy", "Ste", "Apt",
                                                        "Bldg", "Fl", "Rte", "Ctr", "Sq"}
        else w.capitalize()
        for w in text.split()
    )
    return re.sub(r"\s+", " ", text).strip(" ,") or None


def normalize_city(raw: object) -> str | None:
    text = _clean(raw)
    if not text:
        return None
    return " ".join(part.capitalize() if part.isalpha() else part for part in text.split())


def normalize_state(raw: object) -> str | None:
    text = _clean(raw).upper().replace(".", "")
    if not text:
        return None
    if text in STATE_CODES:
        return text
    return US_STATES.get(text)


def normalize_zip(raw: object) -> str | None:
    text = _clean(raw)
    if not text:
        return None
    match = re.search(r"(\d{5})(?:[-\s]?(\d{4}))?", text)
    if not match:
        return None
    return match.group(1) + (f"-{match.group(2)}" if match.group(2) else "")


def normalize_country(raw: object) -> str | None:
    text = _clean(raw)
    if not text:
        return None
    upper = text.upper()
    mapping = {
        "US": "US", "USA": "US", "UNITED STATES": "US", "UNITED STATES OF AMERICA": "US",
        "CA": "CA", "CANADA": "CA", "UK": "GB", "GB": "GB", "UNITED KINGDOM": "GB",
        "PK": "PK", "PAKISTAN": "PK", "AU": "AU", "AUSTRALIA": "AU", "IN": "IN", "INDIA": "IN",
        "AE": "AE", "UAE": "AE", "UNITED ARAB EMIRATES": "AE", "DE": "DE", "GERMANY": "DE",
    }
    return mapping.get(upper, text[:80].title())


def normalize_website(raw: object) -> str | None:
    text = _clean(raw).lower()
    if not text:
        return None
    text = text.replace("mailto:", "").strip()
    if not URL_RE.match(text):
        return None
    if not text.startswith(("http://", "https://")):
        text = f"https://{text}"
    return text.rstrip("/")


def normalize_business_name(raw: object) -> str | None:
    text = _clean(raw)
    if not text:
        return None
    text = re.sub(r"[\u2018\u2019\u201c\u201d]", "'", text)
    text = re.sub(r"\s*[-|–|]\s*(home|official site|website).*$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip(" -|,.")
    return title_case(text)


def normalize_person_name(raw: object) -> str | None:
    text = _clean(raw)
    if not text or len(text) < 2:
        return None
    if text.lower() in {"n/a", "na", "none", "null", "-", "unknown", "owner"}:
        return None
    return title_case(text)


def name_key(business_name: object) -> str:
    """Key used for duplicate detection: name without legal suffixes/punctuation."""
    text = _clean(business_name).lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    words = [w for w in text.split() if w not in BUSINESS_SUFFIXES]
    return " ".join(words) or text


def dedupe_key(
    business_name: object,
    phone_e164: object = None,
    email: object = None,
    zip_code: object = None,
) -> str:
    """Deterministic fingerprint. Phone/email win because they identify a business best."""
    phone_digits_value = phone_digits(phone_e164 or "")
    email_value = _clean(email).lower()
    nkey = name_key(business_name)
    if phone_digits_value:
        basis = f"phone:{phone_digits_value}"
    elif email_value:
        basis = f"email:{email_value}"
    elif nkey and zip_code:
        basis = f"name_zip:{nkey}:{_clean(zip_code)[:5]}"
    else:
        basis = f"name:{nkey}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()[:40]


# --------------------------------------------------------------------------- #
# Verification & quality
# --------------------------------------------------------------------------- #
def derive_phone_status(
    e164: str | None,
    valid_format: bool,
    evidence: str | None = None,
    provided: bool = True,
) -> str:
    """Phone evidence NEVER means verified.

    A number found on a website is at most `format_valid`; only an explicit
    provider/human confirmation (evidence == "owner_confirmed") may mark it
    `verified_owner`. A number that was supplied but cannot be parsed is `invalid`.
    """
    if evidence == "owner_confirmed" and e164:
        return "verified_owner"
    if evidence == "provider_invalid":
        return "invalid"
    if not e164:
        return "invalid" if (provided or evidence) else "unverified"
    return "format_valid" if valid_format else "unverified"


def derive_email_status(
    email: str | None,
    valid: bool,
    evidence: str | None = None,
    provided: bool = True,
) -> str:
    if evidence == "owner_confirmed" and email:
        return "verified_owner"
    if evidence == "bounced":
        return "bounced"
    if not email:
        return "invalid" if provided else "unverified"
    if not valid:
        return "invalid"
    if evidence == "mx_verified":
        return "mx_valid"
    return "syntax_valid"


def quality_score(lead: dict) -> int:
    """0-100 completeness/confidence score used for sorting and reporting."""
    score = 0
    if lead.get("business_name"):
        score += 20
    if lead.get("phone_e164"):
        score += 22
    if lead.get("email"):
        score += 16
    if lead.get("city") and lead.get("state"):
        score += 12
    if lead.get("zip_code"):
        score += 6
    if lead.get("industry"):
        score += 6
    if lead.get("website"):
        score += 6
    if lead.get("contact_name"):
        score += 5
    if lead.get("source_url"):
        score += 3
    status = lead.get("phone_verification_status")
    if status == "verified_owner":
        score += 4
    if lead.get("consent_status") == "granted":
        score += 4
    return min(score, 100)


def missing_fields(lead: dict) -> list[str]:
    tracked = [
        "business_name", "phone_e164", "email", "address_line1", "city",
        "state", "zip_code", "industry", "website",
    ]
    return [f for f in tracked if not lead.get(f)]


def data_age_days(collected_at: datetime | None) -> int | None:
    if not collected_at:
        return None
    now = datetime.now(timezone.utc)
    if collected_at.tzinfo is None:
        collected_at = collected_at.replace(tzinfo=timezone.utc)
    return max(0, (now - collected_at).days)


def freshness_label(collected_at: datetime | None) -> str:
    age = data_age_days(collected_at)
    if age is None:
        return "unknown"
    if age <= 30:
        return "fresh"
    if age <= 90:
        return "aging"
    if age <= 180:
        return "stale"
    return "expired"


def parse_date(value: object) -> date | None:
    text = _clean(value)
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None
