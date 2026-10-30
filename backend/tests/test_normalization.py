"""Unit tests for the normalisation / dedupe / verification rules.

These are the rules that keep the database honest: formatting is not verification,
and a record's fingerprint decides whether it is a duplicate.
"""
from __future__ import annotations

import pytest

from app.services.normalization import (
    dedupe_key,
    derive_email_status,
    derive_phone_status,
    freshness_label,
    normalize_email,
    normalize_phone,
    normalize_state,
    normalize_zip,
    quality_score,
)


@pytest.mark.parametrize(
    "raw,expected_e164",
    [
        ("(512) 555-0100", "+15125550100"),
        ("512.555.0100", "+15125550100"),
        ("5125550100", "+15125550100"),
        ("+1 512 555 0100", "+15125550100"),
        ("1-512-555-0100", "+15125550100"),
        ("+44 20 7946 0958", "+442079460958"),
    ],
)
def test_phone_formats_are_normalised(raw, expected_e164):
    result = normalize_phone(raw)
    assert result["e164"] == expected_e164
    assert result["display"]


def test_phone_extension_is_split_out():
    result = normalize_phone("(512) 555-0100 ext. 214")
    assert result["e164"] == "+15125550100"
    assert result["extension"] == "214"


@pytest.mark.parametrize("raw", ["", "   ", "not a phone", "12", "000-000-0000", "512-055-0100"])
def test_implausible_phones_are_rejected(raw):
    result = normalize_phone(raw)
    assert result["e164"] is None
    assert result["valid"] is False


def test_website_phone_is_never_marked_verified():
    # A number scraped from a page is at most format_valid.
    assert derive_phone_status("+15125550100", True, evidence=None) == "format_valid"
    assert derive_phone_status("+15125550100", True, evidence="page_found") == "format_valid"
    # Only explicit owner confirmation promotes it.
    assert derive_phone_status("+15125550100", True, evidence="owner_confirmed") == "verified_owner"
    # A supplied but unparseable number is invalid, not "unverified".
    assert derive_phone_status(None, False, provided=True) == "invalid"
    # A record that simply has no phone yet stays unverified.
    assert derive_phone_status(None, False, provided=False) == "unverified"
    assert derive_phone_status("+15125550100", True, evidence="provider_invalid") == "invalid"


def test_email_status_rules():
    assert derive_email_status("a@b.example", True) == "syntax_valid"
    assert derive_email_status("a@b.example", True, evidence="mx_verified") == "mx_valid"
    assert derive_email_status("a@b.example", True, evidence="owner_confirmed") == "verified_owner"
    assert derive_email_status("a@b.example", True, evidence="bounced") == "bounced"
    assert derive_email_status("broken", False) == "invalid"
    assert derive_email_status(None, False, provided=False) == "unverified"


@pytest.mark.parametrize(
    "raw",
    ["owner@greatlakesdental.com", "Sales.Team@Acme.CO.UK", "info+leads@sub.northwind.io"],
)
def test_valid_emails_are_accepted_and_lowercased(raw):
    result = normalize_email(raw)
    assert result["valid"] is True
    assert result["email"] == raw.strip().lower()


@pytest.mark.parametrize(
    "raw",
    ["", "not-an-email", "two@@acme.com", "missing-domain@", "space here@acme.com", "@acme.com", "a@b", "owner@example.com"],
)
def test_invalid_emails_are_rejected(raw):
    assert normalize_email(raw)["valid"] is False


def test_state_and_zip_normalisation():
    assert normalize_state("texas") == "TX"
    assert normalize_state("tx") == "TX"
    assert normalize_state("California") == "CA"
    assert normalize_state("not a state") is None
    assert normalize_zip("7870") is None
    assert normalize_zip("78701") == "78701"
    assert normalize_zip("78701-1234") == "78701-1234"
    assert normalize_zip("abc") is None


def test_dedupe_key_prefers_phone_then_email_then_name():
    phone_key = dedupe_key("Acme Ltd", "+15125550100", "a@acme.com", "78701")
    same_phone = dedupe_key("Acme Limited", "(512) 555-0100", "different@acme.com", "90210")
    assert phone_key == same_phone

    email_key = dedupe_key("Beta Co", None, "Hello@BetaGroup.com", "10001")
    assert email_key == dedupe_key("Beta Company", None, "hello@betagroup.com", "10001")
    assert email_key != dedupe_key("Beta Company", None, "other@betagroup.com", "10001")

    name_key_a = dedupe_key("Gamma Inc.", None, None, "60601")
    assert name_key_a == dedupe_key("gamma inc", None, None, "60601")
    assert name_key_a != dedupe_key("Gamma Incorporated", None, None, "60602")
    assert len(phone_key) == 40


def test_quality_score_and_freshness():
    complete = {
        "business_name": "Acme", "phone_e164": "+15125550100", "email": "a@acme.com",
        "address_line1": "1 Main St", "city": "Austin", "state": "TX", "zip_code": "78701",
        "industry": "Retail", "website": "https://acme.example",
        "phone_verification_status": "verified_owner",
    }
    assert quality_score(complete) > quality_score({"business_name": "Acme"})
    assert 0 <= quality_score({}) <= 100
    assert freshness_label(None) == "unknown"
