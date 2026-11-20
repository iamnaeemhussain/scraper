# Pak-Tel Data eSIM Platform

Full-stack eSIM storefront, self-service ICCID balance/reload portal, Admin Console, and Flutter mobile client built on [`recepasan/openesim-application`](https://github.com/recepasan/openesim-application) to replace **`pak-tel.com`** and **`my.pak-tel.com`**.

## Key Architecture & Integrations

1. **Manual Admin Bundle Catalog (`/admin`)**
   - Bundles are created, priced, ordered, toggled, and deleted manually from the Admin Panel (no external Google Sheet dependency at runtime).
   - Supports every field from the Pak-Tel pricing sheet: `Plan Name`, `Price (PKR)`, `Actual Price`, `Discount %`, `Price Difference`, `GBs` (`dataLabel` / `dataGb` / `Unlimited Data`), `Days`, `Reloadable`, `Most Popular`, `Cost (EUR & PKR)`, `Commission (PKR)`, `EUR to PKR`, `Yesim Plan ID`, `Contact`, and `Message`.
   - Includes a live **Browse Yesim Plans** picker, 1-click **EUR → PKR** margin recalculator, and an optional 1-click **Load 11 Pak-Tel Reference Plans** importer.
   - Public catalog endpoints (`/api/bundles`) automatically strip internal wholesale cost and commission fields.

2. **Yesim Partner API (`https://partners-api.yesim.biz`)**
   - Full support for all 15 Partner API endpoints (`/new_user`, `/new_esim`, `/plans`, `/add_plan_iccid`, `/cancel_plan`, `/sim_info`, `/bulk_sim_info`, `/user`, `/orders`, `/change_esim`, `/set_notification_url`, `/supported_devices`, `/issue_esim`, `/allowed_operators`, `/balance`).
   - Generates scannable PNG QR codes directly from Yesim's `LPA:1$...` activation strings alongside iOS 17.4+ universal one-tap installation links (`esimsetup.apple.com`).
   - Handles incoming Yesim webhooks (`EsimStatus`, `PackageUsage`, `EsimExpirationWarning`, `EsimExpired`) at `POST /api/webhooks/yesim`.

3. **DPay Pakistan Payment Gateway (`https://api.dpay.com.pk/v1`)**
   - Whole-rupee PKR paisa validation (`amount % 100 === 0 && amount >= 100`), mandatory named `User-Agent`, and `Idempotency-Key` protection on `POST /v1/payment_sessions`.
   - Raw-body `DPay-Signature` (`t=<unix>,v1=<hex>`) HMAC-SHA256 constant-time verification with 5-minute replay protection and `DPay-Event-Id` deduplication at `POST /api/webhooks/dpay`.
   - Built-in DPay Sandbox Checkout simulator (`/checkout/dpay/:sessionId`) when `DPAY_MOCK_MODE=true`.

4. **Self-Service ICCID Portal (`/my-esim`)**
   - Replaces `my.pak-tel.com`: customers enter their 19–20 digit ICCID to inspect live remaining/used data, QR code, LPA string, iPhone 1-tap install link, and purchase instant DPay reloads (`/add_plan_iccid`).

## Quick Start (Local Development)

```bash
# 1. Backend API (NestJS + PostgreSQL / embedded PGlite)
cd backend
npm install
npm run start:dev

# 2. Web Storefront & Admin Panel (React + Vite + Tailwind)
cd ../web
npm install
npm run dev
```

Default bootstrap Admin login (when `ADMIN_EMAIL` / `ADMIN_PASSWORD` are unset):
- **Email:** `admin@pak-tel.com`
- **Password:** `PakTelAdmin2026!`

## Running Tests

```bash
cd backend && npm test
cd ../web && npm test
```
