# Compliance

LeadBridge collects **business contact information for B2B outreach** from sources you are
permitted to use. This document explains what the software enforces, what it refuses to do, and
the workflow a compliance owner should follow before switching on a live source.

> This is engineering documentation, not legal advice. Telemarketing, e-mail marketing, privacy
> and data-protection rules differ by country (TCPA/FTC in the US, GDPR/PECR in the UK/EU, CASL in
> Canada, the Spam Act in Australia…). Have your own counsel or DPO review your sources, consent
> wording and retention before you dial or send.

---

## 1. The line we do not cross

**Allowed:** business contact details that are published for the purpose of business contact, or
that a business gave you directly, or that you licensed.

| Source type | Example | Basis |
| --- | --- | --- |
| Authorized business directory | A trade association listing businesses | Directory terms permit collection |
| Company website | "Contact us" page of a business | Public business contact information |
| Licensed database | A paid B2B data provider | Written licence |
| Permission-based partner API | Your CRM's partner integration | Contract + partner terms |
| Your own export | CSV from your old CRM | First-party relationship |
| First-party web form | "Get a quote" form on your site | The business contacted you |

**Never:**

- People-search sites, skip-tracing services, or bulk personal profiles.
- Home addresses, personal mobile numbers, dates of birth, ages, SSN/national IDs.
- Race, ethnicity, religion, sexual orientation, health, biometric or criminal-record data.
- Anything obtained by defeating a CAPTCHA, login, paywall, rate limit or anti-bot measure.

These are blocked in code, not just in this document:

- `PROHIBITED_FIELDS` (`backend/app/adapters/base.py`) — the source editor and API reject these
  field names, and imports block columns whose headers look like them (`SSN`, `date of birth`,
  `ethnicity`, …).
- `assert_live_allowed()` (`backend/app/adapters/net.py`) — every live request must pass the global
  domain allowlist, the source's own allowed domains, and `robots.txt`.
- No adapter module contains CAPTCHA or login-bypass logic; adding one is a policy violation, not
  a feature request.

---

## 2. Verification: never claim more than you know

A phone number printed on a website tells you it is *published*, not that it is *reachable* or that
the business still owns it.

| Status | Meaning | How it is set |
| --- | --- | --- |
| `unverified` | No number/address yet, or nothing checked | Default when a record has no phone |
| `format_valid` | Parses to a valid E.164 number for its region | Automatic on ingest/edit |
| `verified_owner` | A human or a licensed provider confirmed it | Only via `POST /api/leads/{id}/verify` with evidence, or a provider status marked verified |
| `disconnected`, `invalid` | Bad number or not in service | Provider evidence or manual verification |
| `bounced` (email) | Delivery failed | Provider evidence or manual verification |

`derive_phone_status()` in `backend/app/services/normalization.py` is deliberately pessimistic: a
scraped value can never return `verified_owner`. Verification requires **evidence text** (minimum
3 characters, e.g. "called the shop 14 Oct, owner answered"), which is stored in the audit trail
with the actor and timestamp, and the UI displays that evidence next to the badge.

The dashboard's *Verified business contacts* card counts only records with recorded evidence —
which is why it is much smaller than *Total*. That gap is the honest picture.

---

## 3. Consent

Consent values: `granted`, `pending`, `unknown`, `denied`, `withdrawn`.

| Where | Behaviour |
| --- | --- |
| Public lead form | Submission is **rejected** without the consent checkbox; the consent text version and timestamp are stored |
| Import | `Consent Status` column is honoured; the source's default applies when it is absent |
| Scraping | Uses the source's `consent_default` — usually `unknown`, never invented as `granted` |
| Org policy | `export_require_consent=true` blocks every record that is not `granted` |
| Opt-out | Do Not Contact sets consent to `denied` and writes suppression entries |

`denied` and `withdrawn` are always excluded from exports, regardless of policy settings.

---

## 4. Suppression list

The suppression list is the record of "never contact again". Entry kinds: `email`, `phone`,
`domain`, `business_name`.

Checked at three points:

1. **Ingest** — a matching record is stored as `do_not_contact` with consent `denied` and a note
   explaining the hit (it is visible for audit, never exported, never assignable).
2. **Export** — any match is blocked, and the reason is reported.
3. **Assignment** — DNC leads cannot be assigned to agents.

Adding an entry: Settings → Suppression list (single) or by marking a lead Do Not Contact
(automatic). Removing an entry is a deliberate, audited decision — do it only when the request was
made in error or the person asked to be contacted again.

---

## 5. Exports: the gate

`POST /api/exports` applies filters first, then removes every record that is:

1. Do Not Contact (`lead_status = do_not_contact`);
2. consent `denied` or `withdrawn`;
3. on the suppression list (phone, e-mail, domain or business name);
4. `invalid`/`disconnected`/`bounced` when `export_exclude_invalid` is on (default);
5. lacking any contact channel;
6. `pending`/`unknown` consent when `export_require_consent` is on.

The preview (`POST /api/exports/preview`) returns counts **and the exact reasons** before you
download, and every export is logged with the actor, filters, purpose, row count and blocked count
(`export_history` + audit log). If everything is blocked the API returns `409` instead of an empty
file, so nobody mistakes an empty export for a policy bug.

Recommended: require a `purpose` on every export ("October service renewal campaign — existing
customers") — it lands in the audit log.

---

## 6. Attribution and provenance

Every record stores:

- `source_id` / `source_name` and the `source_attribution` string configured on the source;
- `source_url` — the page or API endpoint the record came from;
- `collected_at` (and `collected_date`), `last_verified_at`;
- `licensing_status` — `licensed`, `public_website`, `user_provided`, `unconfirmed`;
- `consent_source` — e.g. "Web form consent v2024-01: I agree to be contacted…".

The **Reports → Source performance & attribution** and **Compliance register** CSVs let you answer
"where did this record come from, when, under what basis, and when was it last verified?" without
touching the database.

---

## 7. Retention and deletion

| Setting | Default | Meaning |
| --- | --- | --- |
| `data_retention_days` | 365 | Leads older than this are purgeable (converted/interested/DNC kept) |
| `audit_retention_days` | 730 | Audit rows older than this are purgeable |

Deletion requests (GDPR/CCPA-style erasure, or an opt-out you want gone from your database):

1. Open the lead → **Delete** (admin only). By default the phone/e-mail are written to the
   suppression list first, so the record cannot silently return with the next collection.
2. The action is logged in the organisation audit trail (business name + reason, no contact data).
3. If you need to erase more, run the retention purge, or a targeted SQL statement — take a backup
   first and record *why* you deleted data.

Keep the audit log long enough to demonstrate compliance: it is the evidence that a request was
honoured.

---

## 8. Operating checklist for a new source

- [ ] Written basis: licence, written permission, or a public site whose terms allow collection.
      Save it somewhere your team can find (the source's *compliance notes* field is a start).
- [ ] Host added to `ALLOWED_LIVE_DOMAINS` **and** the source's allowed domains — nothing wider.
- [ ] `robots.txt` checked (the *Test* dialog shows the result).
- [ ] Rate limit and delay set so the site is not burdened (defaults: 10–60/min, 0.25–3 s).
- [ ] Permitted fields reviewed — business contact fields only.
- [ ] `consent_default` chosen honestly (`unknown` unless the source is first-party).
- [ ] Attribution text accurate (it is printed in the CRM and in exports).
- [ ] Run in **demo** mode first, read the records, then switch to live.
- [ ] Export policy reviewed: should this source's leads be exportable at all?
- [ ] DPO/compliance owner sign-off recorded.

## 9. When something goes wrong

| Situation | Do this |
| --- | --- |
| You collected from a site that forbids it | Disable the source, delete the affected leads (suppressing first), write an incident note in the audit log via Settings → notes |
| Someone asks not to be contacted | Mark Do Not Contact (automatic suppression) within the statutory window |
| A data subject asks what you hold | Use the lead drawer / compliance register CSV for that contact, and the audit timeline |
| A leak is suspected | Rotate `SECRET_KEY` and API keys, review the audit log, restore from a pre-incident backup if data was altered |
| A partner withdraws permission | Disable the source; keep the records or purge them per the agreement — document which |

Everything above is visible in the app: **Reports** for evidence, **Settings → Audit log** for who
did what, **Suppression list** for opt-outs.
