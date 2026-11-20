# Pak-Tel Digital Data eSIM Store & Self-Service Top-Up Platform

Full-stack **Cloudflare Workers + Static Assets + SQLite Durable Object** platform built with the **Pak-Tel (`pak-tel.com` & `my.pak-tel.com`)** visual identity, traditional no-account PKR checkout, automated **Mailjet** eSIM QR email delivery on `payment.succeeded`, and a runtime-secret-gated Admin Console.

---

## Core Architecture

- **Cloudflare Workers Full-Stack (`wrangler.jsonc` + `worker/src/`)**:
  - Automatically runs `vite build` (`web/dist`) during `npx wrangler deploy`.
  - Serves the React + Tailwind SPA via Cloudflare Workers Static Assets (`not_found_handling: "single-page-application"`).
  - Routes `/api/*` (`run_worker_first: ["/api/*"]`) to the Worker & `PakTelStoreDO` SQLite Durable Object (zero external database IDs required).
- **Traditional Purchase & Top-Up Flow (No User Accounts)**:
  - Customers purchase plans on `/` or check balance & reload existing eSIMs by 18–22 digit ICCID on `/my-esim` using only their delivery email address.
- **Automated Mailjet eSIM Delivery (`payment.succeeded`)**:
  - Once DPay sends a verified `payment.succeeded` webhook (`POST /api/webhooks/dpay`), the Worker provisions the eSIM (or applies the ICCID top-up) via **Yesim Partner API** and immediately calls **Mailjet Send API v3.1 (`POST https://api.mailjet.com/v3.1/send`)** with an inline QR PNG (`cid:esim-qr`), iPhone One-Tap Install link, ICCID, and LPA activation details.
  - Tracks real-time Mailjet delivery events (`sent`, `open`, `click`, `bounce`, `blocked`, `spam`, `unsub`) via **`POST /api/webhooks/mailjet`** per [Mailjet Event Webhooks](https://dev.mailjet.com/docs/email-api/webhooks/webhooks-overview).
- **Zero Exposed Secrets & Private Admin Route**:
  - No API keys, credentials, or admin URLs exist in source code.
  - Admin Console is hidden behind a runtime secret slug (`ADMIN_SECRET_PATH`). Visiting `/admin` or any non-matching URL returns `404`.

---

## Cloudflare Deployment & Runtime Variables / Secrets

1. In **Cloudflare Dashboard → Workers & Pages → your Worker → Settings → Build**:
   - **Root directory:** `/`
   - **Deploy command:** `npx wrangler deploy`
2. In **Settings → Variables and Secrets**, add the following runtime secrets/variables:

| Name | Type | Description |
|---|---|---|
| `ADMIN_SECRET_PATH` | Secret | Private URL path for your Admin Panel (e.g. `my-private-slug` → `https://your-domain.com/my-private-slug`) |
| `ADMIN_EMAIL` | Secret | Admin login email / username |
| `ADMIN_PASSWORD` | Secret | Admin login password |
| `JWT_SECRET` | Secret | Random signing secret (32+ chars) for Admin session tokens |
| `YESIM_API_BASE_URL` | Variable | `https://partners-api.yesim.biz` |
| `YESIM_API_TOKEN` | Secret | Yesim Partner API token |
| `YESIM_WEBHOOK_SECRET` | Secret | Yesim webhook HMAC secret |
| `DPAY_API_BASE_URL` | Variable | `https://api.dpay.com.pk/v1` |
| `DPAY_MERCHANT_ID` | Secret | DPay Merchant ID |
| `DPAY_API_KEY` | Secret | DPay API Key |
| `DPAY_API_SECRET` | Secret | DPay API Secret |
| `DPAY_WEBHOOK_SECRET` | Secret | DPay webhook HMAC-SHA256 secret (`DPay-Signature`) |
| `MAILJET_API_KEY` | Secret | Mailjet API Public Key |
| `MAILJET_API_SECRET` | Secret | Mailjet API Secret Key |
| `MAILJET_FROM_EMAIL` | Variable | Verified sender email in Mailjet |
| `MAILJET_FROM_NAME` | Variable | Sender name (e.g. `Pak-Tel eSIM`) |
| `MAILJET_WEBHOOK_SECRET` | Secret | Optional Basic-Auth password or `?token=` secret for Mailjet Event Webhooks |
| `WHATSAPP_NUMBER` | Variable | Support WhatsApp number (e.g. `923259717066`) |

---

## Webhook Endpoints

Configure these callback URLs in your provider dashboards:

- **DPay (`payment.succeeded` / `payment.failed`):** `https://<your-domain>/api/webhooks/dpay`
- **Mailjet Event Tracking (`sent`, `open`, `click`, `bounce`, `blocked`, `spam`, `unsub`):**
  `https://mailjet:<MAILJET_WEBHOOK_SECRET>@<your-domain>/api/webhooks/mailjet`
- **Yesim Usage Updates:** `https://<your-domain>/api/webhooks/yesim`
