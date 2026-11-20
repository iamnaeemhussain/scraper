# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Instead, report privately via GitHub's
[Security Advisories](../../security/advisories/new) (preferred) or email the
maintainer. Include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected component (backend / mobile / infra).

You'll get an acknowledgement within a few days. Please give a reasonable
window to ship a fix before any public disclosure.

## Scope

In scope:

- the NestJS backend (`backend/`)
- the Flutter app (`mobile/`)
- deployment config (`docker-compose.prod.yml`, `Caddyfile.example`)

Out of scope:

- third-party providers (eSIM Access, esimcard.com, Stripe) — report to them
- issues that require a rooted/jailbroken device or physical access

## Handling secrets

This repository ships **no real credentials**. All keys live in an untracked
`.env` (see `.env.example`). If you ever find a committed secret, treat it as
compromised: rotate it immediately and open a private report.

Notable boundaries already enforced in code:

- `RT-AccessCode` (eSIM Access key) and the esimcard token live only in
  backend env — never sent to the mobile client.
- Stripe webhooks are HMAC-verified; the eSIM Access webhook endpoint is
  IP-allowlisted and fail-closed in production.
- Order idempotency is keyed on a server-generated `transactionId`;
  duplicate webhooks are deduped via a unique `notifyId`.
