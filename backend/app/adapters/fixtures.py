"""Bundled demo dataset.

Every record here is synthetic: businesses, people, phone numbers and e-mail
addresses are generated from word lists and do not describe real entities.
The demo dataset lets a new install exercise the full pipeline (collection,
validation, de-duplication, dashboards) without touching a live website.

Switch a source to `live` mode (and allow-list its domain) for real collection.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any

PREFIXES = [
    "Sunrise", "Apex", "Northside", "Blue Ridge", "Cedar", "Ironclad", "Golden Gate",
    "Harbor", "Summit", "Willow", "Copper", "Silverline", "Pioneer", "Oakwood",
    "Granite", "Meadowlark", "Riverbend", "Brightwater", "Stonebridge", "Lakeside",
    "Falcon", "Crescent", "Maple", "Pinecrest", "Redstone", "Clearview", "Evergreen",
    "Cobalt", "Trailhead", "Union Square", "Bayview", "Highland",
]
CORE = [
    ("Dental Studio", "Healthcare"), ("Family Dental", "Healthcare"), ("Physical Therapy", "Healthcare"),
    ("Auto Repair", "Automotive"), ("Tire & Brake", "Automotive"), ("Collision Center", "Automotive"),
    ("Plumbing", "Construction"), ("Roofing", "Construction"), ("Electric", "Construction"),
    ("HVAC Services", "Construction"), ("Kitchen & Bath", "Construction"), ("Landscaping", "Services"),
    ("Accounting", "Professional Services"), ("Tax Advisors", "Professional Services"),
    ("Law Office", "Legal"), ("Insurance Group", "Insurance"), ("Realty", "Real Estate"),
    ("Property Management", "Real Estate"), ("Bakery", "Restaurants"), ("Coffee Roasters", "Restaurants"),
    ("Pizza Kitchen", "Restaurants"), ("Catering", "Restaurants"), ("Fitness Studio", "Fitness"),
    ("Yoga Collective", "Fitness"), ("Pet Clinic", "Veterinary"), ("Animal Hospital", "Veterinary"),
    ("Cleaners", "Services"), ("Dry Cleaning", "Services"), ("Print Shop", "Marketing"),
    ("Marketing Agency", "Marketing"), ("Web Studio", "Technology"), ("IT Support", "Technology"),
    ("Logistics", "Logistics"), ("Freight Lines", "Logistics"), ("Hardware Supply", "Retail"),
    ("Flooring", "Retail"), ("Furniture", "Retail"), ("Garden Center", "Retail"),
    ("Optometry", "Healthcare"), ("Chiropractic", "Healthcare"), ("Pharmacy", "Healthcare"),
    ("Childcare Center", "Education"), ("Tutoring", "Education"), ("Driving School", "Education"),
    ("Staffing Partners", "Professional Services"), ("Bookkeeping", "Professional Services"),
    ("Security Services", "Services"), ("Solar Energy", "Energy"), ("Electricians Guild", "Construction"),
]
SUFFIXES = ["LLC", "Inc.", "Co.", "Group", "& Sons", "Partners", "Solutions", "Services", "Holdings"]
CONTACT_FIRST = [
    "Dana", "Miguel", "Priya", "Jordan", "Alicia", "Marcus", "Elena", "Sam", "Nadia",
    "Trevor", "Rosa", "Hector", "Leah", "Owen", "Fatima", "Grace", "Victor", "Maya",
    "Colin", "Iris", "Devon", "Tessa", "Omar", "Rachel",
]
CONTACT_LAST = [
    "Whitfield", "Ortiz", "Raman", "Lee", "Brooks", "Hale", "Novak", "Fischer", "Bishop",
    "Delgado", "Kaur", "Marsh", "Okafor", "Silva", "Trent", "Vance", "Kim", "Duarte",
]
CONTACT_TITLES = [
    "Owner", "Office Manager", "Practice Manager", "Operations Manager", "General Manager",
    "Marketing Coordinator", "Front Desk Supervisor", "Business Development",
]
CITIES = [
    ("Austin", "TX", "512", 787), ("Dallas", "TX", "214", 752), ("Houston", "TX", "713", 770),
    ("San Antonio", "TX", "210", 782), ("Phoenix", "AZ", "602", 850), ("Tucson", "AZ", "520", 857),
    ("Denver", "CO", "303", 802), ("Boulder", "CO", "720", 803), ("Portland", "OR", "503", 972),
    ("Seattle", "WA", "206", 981), ("Spokane", "WA", "509", 992), ("Sacramento", "CA", "916", 958),
    ("San Diego", "CA", "619", 921), ("Fresno", "CA", "559", 936), ("Las Vegas", "NV", "702", 891),
    ("Salt Lake City", "UT", "801", 841), ("Boise", "ID", "208", 837), ("Albuquerque", "NM", "505", 871),
    ("Oklahoma City", "OK", "405", 731), ("Kansas City", "MO", "816", 641), ("Omaha", "NE", "402", 681),
    ("Minneapolis", "MN", "612", 554), ("Milwaukee", "WI", "414", 532), ("Chicago", "IL", "312", 606),
    ("Indianapolis", "IN", "317", 462), ("Columbus", "OH", "614", 432), ("Cincinnati", "OH", "513", 452),
    ("Nashville", "TN", "615", 372), ("Memphis", "TN", "901", 381), ("Atlanta", "GA", "404", 303),
    ("Charlotte", "NC", "704", 282), ("Raleigh", "NC", "919", 276), ("Richmond", "VA", "804", 232),
    ("Philadelphia", "PA", "215", 191), ("Pittsburgh", "PA", "412", 152), ("Newark", "NJ", "973", 710),
    ("Boston", "MA", "617", "021"), ("Providence", "RI", "401", "029"), ("Hartford", "CT", "860", "061"),
    ("Buffalo", "NY", "716", 142), ("Tampa", "FL", "813", 336), ("Orlando", "FL", "407", 328),
    ("Miami", "FL", "305", 331), ("New Orleans", "LA", "504", 701), ("Birmingham", "AL", "205", 352),
]
STREETS = [
    "Main St", "Oak Ave", "Maple Dr", "Cedar Ln", "Industrial Blvd", "Commerce Way",
    "Lakeview Dr", "Park Ave", "Union St", "Market St", "Broadway", "River Rd",
    "Airport Blvd", "Sunset Ave", "Highland Dr", "Bridge St",
]

TOTAL_RECORDS = 2400


def _build_dataset() -> list[dict[str, Any]]:
    rng = random.Random(20240217)
    seen: set[str] = set()
    records: list[dict[str, Any]] = []
    index = 0
    attempts = 0
    while len(records) < TOTAL_RECORDS and attempts < TOTAL_RECORDS * 25:
        attempts += 1
        prefix = PREFIXES[index % len(PREFIXES)]
        core, industry = CORE[(index * 7 + attempts) % len(CORE)]
        suffix = SUFFIXES[(index * 3 + attempts) % len(SUFFIXES)]
        name = f"{prefix} {core} {suffix}"
        if name in seen:
            index += 1
            continue
        seen.add(name)
        city, state, area_code, zip_prefix = CITIES[(index * 5 + attempts) % len(CITIES)]
        street_number = 100 + (index * 37) % 8900
        street = STREETS[(index * 11 + attempts) % len(STREETS)]
        suite = "" if index % 3 else f" Ste {100 + index % 400}"
        exchange = 200 + (index * 13) % 800
        line = 1000 + (index * 31) % 9000
        domain = (
            f"{prefix.lower().replace(' ', '')}{core.split()[0].lower()}{index % 97}.com"
        )
        first = CONTACT_FIRST[(index * 17) % len(CONTACT_FIRST)]
        last = CONTACT_LAST[(index * 23) % len(CONTACT_LAST)]
        title = CONTACT_TITLES[(index * 29) % len(CONTACT_TITLES)]
        local = f"{first.lower()}.{last.lower()}"
        if index % 4 == 0:
            local = rng.choice(["info", "office", "sales", "contact"])

        phone = f"({area_code}) {exchange}-{line}"
        email = f"{local}@{domain}"
        record: dict[str, Any] = {
            "business_name": name,
            "contact_name": f"{first} {last}",
            "contact_title": title,
            "phone": phone,
            "email": email,
            "address_line1": f"{street_number} {street}{suite}",
            "city": city,
            "state": state,
            "zip_code": f"{zip_prefix}{100 + (index * 7) % 899:03d}",
            "country": "US",
            "industry": industry,
            "website": f"https://{domain}",
            "source_url": f"https://demo-directory.example.com/business/{index + 1}",
            "consent_status": "unknown",
        }
        # Deterministic data-quality noise so validators and reporting are exercised.
        if index % 41 == 0:
            record["phone"] = "000-000-0000"
        if index % 57 == 0:
            record["email"] = "info@"
        if index % 67 == 0:
            record["business_name"] = ""
            record["phone"], record["email"] = "", ""
        records.append(record)
        index += 1
    return records


DATASET: list[dict[str, Any]] = _build_dataset()


def demo_records(source_key: str, run_index: int, count: int, *, offset: int | None = None) -> list[dict[str, Any]]:
    """Return a deterministic window of the demo dataset for a source run.

    Sources get different sliding windows so two sources can legitimately surface
    the same business (which is exactly what duplicate detection is for).
    """
    key_hash = sum(ord(c) for c in source_key)
    base = (key_hash * 13 + (run_index - 1) * max(count, 1)) % max(len(DATASET) - count, 1)
    if offset is not None:
        base = offset
    window = DATASET[base : base + count]
    if len(window) < count:  # wrap around
        window = window + DATASET[: count - len(window)]
    stamp = datetime.now(timezone.utc).isoformat()
    return [{**record, "collected_at": stamp} for record in window]


def seeded_sample(count: int = 120) -> list[dict[str, Any]]:
    """A smaller slice used to pre-populate a fresh install."""
    return demo_records("seed", 1, count)
