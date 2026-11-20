import { COMPATIBLE_DEVICES, PAKTEL_SEED_BUNDLES } from './catalog-seed';
import {
  constantTimeEqual,
  hmacSha256Hex,
  signAdminJwt,
  verifyAdminJwt,
  verifyAdminSecretPath,
  verifyDpayWebhookSignature,
  verifyMailjetWebhookAuth,
} from './crypto-auth';
import {
  createDpayCheckoutSession,
  RuntimeSecretsEnv,
  sendMailjetEsimEmail,
  yesimCreateOrder,
  yesimFetchBalance,
  yesimFetchCatalog,
  yesimFetchUsage,
  yesimTopupEsim,
} from './integrations';
import { generateQrPngDataUrl } from './qr-png';

export interface SqlCursorLike {
  toArray(): Record<string, any>[];
  one(): Record<string, any> | null;
}

export interface SqlExecutor {
  exec(query: string, ...bindings: any[]): SqlCursorLike;
}

const EPHEMERAL_FALLBACK_JWT_KEY = crypto.randomUUID() + crypto.randomUUID();

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function mapBundleRow(r: Record<string, any>) {
  const pricePkr = Number(r.price_pkr ?? 0);
  const originalPricePkr = Number(r.original_price_pkr ?? 0);
  const discountPercent =
    originalPricePkr > pricePkr
      ? Math.round(((originalPricePkr - pricePkr) / originalPricePkr) * 100)
      : 0;
  return {
    id: String(r.id),
    yesimPackageCode: String(r.yesim_package_code),
    name: String(r.name),
    countryCode: String(r.country_code),
    countryName: String(r.country_name),
    region: String(r.region || 'South Asia'),
    dataMb: Number(r.data_mb),
    dataDisplay: String(r.data_display),
    validityDays: Number(r.validity_days),
    coverage: String(r.coverage || '5G/4G/LTE'),
    planType: String(r.plan_type || 'Data only'),
    hotspotSupported: Boolean(r.hotspot_supported),
    activationType: String(r.activation_type || 'Instant'),
    reloadable: Boolean(r.reloadable),
    unlimited: Boolean(r.unlimited),
    pricePkr,
    originalPricePkr: originalPricePkr > 0 ? originalPricePkr : null,
    discountPercent,
    costUsdCents: Number(r.cost_usd_cents ?? 0),
    marginPercent:
      r.margin_percent !== null && r.margin_percent !== undefined
        ? Number(r.margin_percent)
        : null,
    badge: r.badge ? String(r.badge) : null,
    sortOrder: Number(r.sort_order ?? 100),
    enabled: Boolean(r.enabled),
    notes: r.notes ? String(r.notes) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapEsimRow(r: Record<string, any>) {
  const lpa = r.lpa ? String(r.lpa) : null;
  const totalBytes = Number(r.total_bytes ?? 0);
  const remainingBytes = Number(r.remaining_bytes ?? 0);
  const usedBytes = Math.max(0, totalBytes - remainingBytes);
  return {
    id: String(r.id),
    orderId: String(r.order_id),
    yesimOrderId: r.yesim_order_id ? String(r.yesim_order_id) : null,
    iccid: String(r.iccid),
    smdpAddress: r.smdp_address ? String(r.smdp_address) : null,
    activationCode: r.activation_code ? String(r.activation_code) : null,
    lpa,
    qrCodeUrl: r.qr_code_url ? String(r.qr_code_url) : null,
    qrDataUrl: lpa ? generateQrPngDataUrl(lpa, 6) : null,
    appleUniversalLink: lpa
      ? `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`
      : null,
    status: String(r.status || 'ALLOCATED'),
    totalBytes: String(totalBytes),
    remainingBytes: String(remainingBytes),
    usedBytes: String(usedBytes),
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    activatedAt: r.activated_at ? String(r.activated_at) : null,
    lastSyncedAt: r.last_synced_at ? String(r.last_synced_at) : null,
    createdAt: String(r.created_at),
  };
}

export const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS bundles (
    id TEXT PRIMARY KEY,
    yesim_package_code TEXT NOT NULL,
    name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'South Asia',
    data_mb INTEGER NOT NULL,
    data_display TEXT NOT NULL,
    validity_days INTEGER NOT NULL,
    coverage TEXT NOT NULL DEFAULT '5G/4G/LTE',
    plan_type TEXT NOT NULL DEFAULT 'Data only',
    hotspot_supported INTEGER NOT NULL DEFAULT 1,
    activation_type TEXT NOT NULL DEFAULT 'Instant',
    reloadable INTEGER NOT NULL DEFAULT 1,
    unlimited INTEGER NOT NULL DEFAULT 0,
    price_pkr INTEGER NOT NULL,
    original_price_pkr INTEGER NOT NULL DEFAULT 0,
    cost_usd_cents INTEGER NOT NULL DEFAULT 0,
    margin_percent REAL,
    badge TEXT,
    sort_order INTEGER NOT NULL DEFAULT 100,
    enabled INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_email TEXT NOT NULL,
    customer_name TEXT,
    customer_phone TEXT,
    bundle_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'NEW_ESIM',
    target_iccid TEXT,
    amount_pkr INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR',
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_provider TEXT NOT NULL DEFAULT 'DPAY',
    dpay_session_id TEXT,
    dpay_transaction_id TEXT,
    dpay_checkout_url TEXT,
    access_token TEXT NOT NULL,
    failure_reason TEXT,
    email_delivery_status TEXT NOT NULL DEFAULT 'PENDING',
    mailjet_message_id TEXT,
    mailjet_message_guid TEXT,
    email_sent_at TEXT,
    email_last_event_at TEXT,
    email_error TEXT,
    origin_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS esims (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    yesim_order_id TEXT,
    iccid TEXT NOT NULL UNIQUE,
    smdp_address TEXT,
    activation_code TEXT,
    lpa TEXT,
    qr_code_url TEXT,
    status TEXT NOT NULL DEFAULT 'ALLOCATED',
    total_bytes INTEGER NOT NULL DEFAULT 0,
    remaining_bytes INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    activated_at TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topups (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE,
    esim_id TEXT,
    iccid TEXT NOT NULL,
    bundle_id TEXT NOT NULL,
    amount_pkr INTEGER NOT NULL,
    yesim_topup_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    failure_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    processed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

export class PakTelApiEngine {
  private initialized = false;

  constructor(private readonly sql: SqlExecutor) {}

  public ensureSchema() {
    if (this.initialized) return;
    this.sql.exec(SCHEMA_DDL);

    const countRow = this.sql.exec(`SELECT COUNT(*) AS cnt FROM bundles`).one();
    if (Number(countRow?.cnt ?? 0) === 0) {
      const now = new Date().toISOString();
      for (const b of PAKTEL_SEED_BUNDLES) {
        this.sql.exec(
          `INSERT INTO bundles (
            id, yesim_package_code, name, country_code, country_name, region,
            data_mb, data_display, validity_days, coverage, plan_type,
            hotspot_supported, activation_type, reloadable, unlimited,
            price_pkr, original_price_pkr, cost_usd_cents, badge, sort_order,
            enabled, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          crypto.randomUUID(),
          b.yesimPackageCode,
          b.name,
          b.countryCode,
          b.countryName,
          b.region,
          b.dataMb,
          b.dataDisplay,
          b.validityDays,
          b.coverage,
          b.planType,
          b.hotspotSupported ? 1 : 0,
          b.activationType,
          b.reloadable ? 1 : 0,
          b.unlimited ? 1 : 0,
          b.pricePkr,
          b.originalPricePkr,
          b.costUsdCents,
          b.badge,
          b.sortOrder,
          now,
          now,
        );
      }
    }

    const settingsCount = this.sql
      .exec(`SELECT COUNT(*) AS cnt FROM settings WHERE key = 'pricing'`)
      .one();
    if (Number(settingsCount?.cnt ?? 0) === 0) {
      this.sql.exec(
        `INSERT INTO settings (key, value_json, updated_at) VALUES ('pricing', ?, ?)`,
        JSON.stringify({
          fxRateUsdToPkr: 278.5,
          defaultMarginPercent: 30,
          storeNotice:
            "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
        }),
        new Date().toISOString(),
      );
    }

    this.initialized = true;
  }

  private getJwtSecret(env: RuntimeSecretsEnv): string {
    const configured = String(env.JWT_SECRET || '').trim();
    return configured.length >= 8 ? configured : EPHEMERAL_FALLBACK_JWT_KEY;
  }

  private getPricingSettings(): {
    fxRateUsdToPkr: number;
    defaultMarginPercent: number;
    storeNotice: string;
  } {
    const rows = this.sql
      .exec(`SELECT value_json FROM settings WHERE key = 'pricing' LIMIT 1`)
      .toArray();
    if (!rows.length) {
      return {
        fxRateUsdToPkr: 278.5,
        defaultMarginPercent: 30,
        storeNotice:
          "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
      };
    }
    try {
      return JSON.parse(String(rows[0].value_json));
    } catch {
      return { fxRateUsdToPkr: 278.5, defaultMarginPercent: 30, storeNotice: '' };
    }
  }

  public async fulfillPaidOrder(
    env: RuntimeSecretsEnv,
    orderId: string,
    dpayTxId: string | null,
    reqOrigin: string,
  ) {
    const sql = this.sql;
    const orderRows = sql.exec(`SELECT * FROM orders WHERE id = ? LIMIT 1`, orderId).toArray();
    if (!orderRows.length) throw new Error(`Order ${orderId} not found`);
    const order = orderRows[0];

    if (order.status === 'PROVISIONED') {
      return { alreadyProvisioned: true, orderId };
    }

    const bundleRows = sql
      .exec(`SELECT * FROM bundles WHERE id = ? LIMIT 1`, String(order.bundle_id))
      .toArray();
    if (!bundleRows.length) throw new Error(`Bundle ${order.bundle_id} not found`);
    const bundle = mapBundleRow(bundleRows[0]);

    const now = new Date().toISOString();
    sql.exec(
      `UPDATE orders SET status = 'PAID', dpay_transaction_id = COALESCE(?, dpay_transaction_id), updated_at = ? WHERE id = ?`,
      dpayTxId,
      now,
      orderId,
    );

    const originToUse = String(order.origin_url || reqOrigin);

    try {
      if (String(order.kind) === 'TOPUP') {
        const targetIccid = String(order.target_iccid || '');
        const topupRows = sql
          .exec(`SELECT * FROM topups WHERE order_id = ? LIMIT 1`, orderId)
          .toArray();
        const topupId = topupRows.length ? String(topupRows[0].id) : orderId;

        const yesimRes = await yesimTopupEsim(
          env,
          targetIccid,
          bundle.yesimPackageCode,
          topupId,
        );

        const esimRows = sql
          .exec(`SELECT * FROM esims WHERE iccid = ? LIMIT 1`, targetIccid)
          .toArray();
        let lpa: string | null = null;
        let smdpAddress: string | null = null;
        let activationCode: string | null = null;

        if (esimRows.length) {
          const ex = esimRows[0];
          const addBytes = bundle.dataMb * 1024 * 1024;
          const newTotal = Number(ex.total_bytes || 0) + addBytes;
          const newRem = Number(ex.remaining_bytes || 0) + addBytes;
          const baseExp =
            ex.expires_at && new Date(String(ex.expires_at)).getTime() > Date.now()
              ? new Date(String(ex.expires_at)).getTime()
              : Date.now();
          const newExpiresAt = new Date(
            baseExp + bundle.validityDays * 86400 * 1000,
          ).toISOString();

          sql.exec(
            `UPDATE esims SET total_bytes = ?, remaining_bytes = ?, expires_at = ?, status = 'IN_USE', last_synced_at = ?, updated_at = ? WHERE id = ?`,
            newTotal,
            newRem,
            newExpiresAt,
            now,
            now,
            String(ex.id),
          );
          lpa = ex.lpa ? String(ex.lpa) : null;
          smdpAddress = ex.smdp_address ? String(ex.smdp_address) : null;
          activationCode = ex.activation_code ? String(ex.activation_code) : null;
        }

        if (topupRows.length) {
          sql.exec(
            `UPDATE topups SET yesim_topup_id = ?, status = 'COMPLETED', failure_reason = NULL, updated_at = ? WHERE id = ?`,
            yesimRes.yesimTopupId,
            now,
            topupId,
          );
        }

        sql.exec(
          `UPDATE orders SET status = 'PROVISIONED', failure_reason = NULL, updated_at = ? WHERE id = ?`,
          now,
          orderId,
        );

        const mailRes = await sendMailjetEsimEmail(env, originToUse, {
          orderId,
          accessToken: String(order.access_token),
          kind: 'TOPUP',
          toEmail: String(order.customer_email),
          toName: order.customer_name ? String(order.customer_name) : null,
          planName: bundle.name,
          dataDisplay: bundle.dataDisplay,
          validityDays: bundle.validityDays,
          amountPkr: Number(order.amount_pkr),
          iccid: targetIccid,
          lpa,
          smdpAddress,
          activationCode,
        });

        sql.exec(
          `UPDATE orders SET email_delivery_status = ?, mailjet_message_id = ?, mailjet_message_guid = ?, email_sent_at = ?, email_error = ?, updated_at = ? WHERE id = ?`,
          mailRes.status,
          mailRes.messageId || null,
          mailRes.messageGuid || null,
          mailRes.sent ? new Date().toISOString() : null,
          mailRes.error || null,
          new Date().toISOString(),
          orderId,
        );

        return { ok: true, status: 'PROVISIONED', mailjet: mailRes.status };
      } else {
        const provisioned = await yesimCreateOrder(env, bundle.yesimPackageCode, orderId);
        const totalBytes = bundle.dataMb * 1024 * 1024;
        const expiresAt = new Date(
          Date.now() + bundle.validityDays * 86400 * 1000,
        ).toISOString();
        const esimId = crypto.randomUUID();

        sql.exec(
          `INSERT INTO esims (
            id, order_id, yesim_order_id, iccid, smdp_address, activation_code,
            lpa, qr_code_url, status, total_bytes, remaining_bytes, expires_at,
            activated_at, last_synced_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          esimId,
          orderId,
          provisioned.yesimOrderId,
          provisioned.iccid,
          provisioned.smdpAddress,
          provisioned.activationCode,
          provisioned.lpa,
          provisioned.qrCodeUrl,
          provisioned.status,
          totalBytes,
          totalBytes,
          expiresAt,
          now,
          now,
          now,
          now,
        );

        sql.exec(
          `UPDATE orders SET status = 'PROVISIONED', failure_reason = NULL, updated_at = ? WHERE id = ?`,
          now,
          orderId,
        );

        const mailRes = await sendMailjetEsimEmail(env, originToUse, {
          orderId,
          accessToken: String(order.access_token),
          kind: 'NEW_ESIM',
          toEmail: String(order.customer_email),
          toName: order.customer_name ? String(order.customer_name) : null,
          planName: bundle.name,
          dataDisplay: bundle.dataDisplay,
          validityDays: bundle.validityDays,
          amountPkr: Number(order.amount_pkr),
          iccid: provisioned.iccid,
          lpa: provisioned.lpa,
          smdpAddress: provisioned.smdpAddress,
          activationCode: provisioned.activationCode,
        });

        sql.exec(
          `UPDATE orders SET email_delivery_status = ?, mailjet_message_id = ?, mailjet_message_guid = ?, email_sent_at = ?, email_error = ?, updated_at = ? WHERE id = ?`,
          mailRes.status,
          mailRes.messageId || null,
          mailRes.messageGuid || null,
          mailRes.sent ? new Date().toISOString() : null,
          mailRes.error || null,
          new Date().toISOString(),
          orderId,
        );

        return {
          ok: true,
          status: 'PROVISIONED',
          iccid: provisioned.iccid,
          mailjet: mailRes.status,
        };
      }
    } catch (err: any) {
      const reason = err?.message || 'Provisioning failed';
      sql.exec(
        `UPDATE orders SET failure_reason = ?, updated_at = ? WHERE id = ?`,
        reason,
        new Date().toISOString(),
        orderId,
      );
      if (String(order.kind) === 'TOPUP') {
        sql.exec(
          `UPDATE topups SET status = 'FAILED', failure_reason = ?, updated_at = ? WHERE order_id = ?`,
          reason,
          new Date().toISOString(),
          orderId,
        );
      }
      throw err;
    }
  }

  public async handle(request: Request, env: RuntimeSecretsEnv): Promise<Response> {
    this.ensureSchema();
    const sql = this.sql;
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();
    const origin = url.origin;

    try {
      if ((path === '/api/health' || path === '/api/health/ready') && method === 'GET') {
        return jsonResponse({ status: 'ok' });
      }

      if (path === '/api/store-config' && method === 'GET') {
        const pricing = this.getPricingSettings();
        const whatsapp = String(env.WHATSAPP_NUMBER || '923259717066').replace(/[^\d]/g, '');
        return jsonResponse({
          storeName: 'Pak-Tel eSIM',
          currency: 'PKR',
          paymentProvider: 'DPAY',
          supportWhatsapp: whatsapp,
          storeNotice: pricing.storeNotice,
          compatibilityBrands: 10,
          dpaySandboxEnabled: env.DPAY_MOCK === 'true' && !env.DPAY_API_KEY,
        });
      }

      if (path === '/api/bundles' && method === 'GET') {
        const search = (url.searchParams.get('search') || '').trim().toLowerCase();
        const country = (url.searchParams.get('country') || '').trim().toUpperCase();
        const reloadOnly = url.searchParams.get('reloadOnly') === 'true';

        let rows = sql
          .exec(`SELECT * FROM bundles WHERE enabled = 1 ORDER BY sort_order ASC, price_pkr ASC`)
          .toArray()
          .map(mapBundleRow);

        if (country) {
          rows = rows.filter((b) => b.countryCode.toUpperCase() === country);
        }
        if (reloadOnly) {
          rows = rows.filter((b) => b.reloadable);
        }
        if (search) {
          rows = rows.filter(
            (b) =>
              b.name.toLowerCase().includes(search) ||
              b.countryName.toLowerCase().includes(search) ||
              b.countryCode.toLowerCase().includes(search) ||
              b.dataDisplay.toLowerCase().includes(search),
          );
        }
        return jsonResponse(rows);
      }

      const bundleDetailMatch = path.match(/^\/api\/bundles\/([^/]+)$/);
      if (bundleDetailMatch && method === 'GET') {
        const rows = sql
          .exec(
            `SELECT * FROM bundles WHERE id = ? AND enabled = 1 LIMIT 1`,
            bundleDetailMatch[1],
          )
          .toArray();
        if (!rows.length) return jsonResponse({ message: 'Bundle not found' }, 404);
        return jsonResponse(mapBundleRow(rows[0]));
      }

      if (path === '/api/compatibility/devices' && method === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase();
        const brand = (url.searchParams.get('brand') || '').trim().toLowerCase();
        let list = COMPATIBLE_DEVICES;
        if (brand) {
          list = list.filter((d) => d.brand.toLowerCase() === brand);
        }
        if (q) {
          list = list.filter(
            (d) =>
              d.brand.toLowerCase().includes(q) ||
              d.model.toLowerCase().includes(q) ||
              d.notes.toLowerCase().includes(q),
          );
        }
        return jsonResponse({
          supported: list.length > 0,
          count: list.length,
          devices: list,
        });
      }

      if (path === '/api/orders' && method === 'POST') {
        const body = (await request.json()) as Record<string, any>;
        const bundleId = String(body?.bundleId || '').trim();
        const email = String(body?.email || '').trim().toLowerCase();
        const customerName = body?.customerName ? String(body.customerName).trim() : null;
        const customerPhone = body?.customerPhone ? String(body.customerPhone).trim() : null;

        if (!bundleId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return jsonResponse(
            { message: 'Valid bundleId and customer email address are required.' },
            400,
          );
        }

        const bundleRows = sql
          .exec(`SELECT * FROM bundles WHERE id = ? AND enabled = 1 LIMIT 1`, bundleId)
          .toArray();
        if (!bundleRows.length) {
          return jsonResponse({ message: 'Selected plan is unavailable.' }, 404);
        }
        const bundle = mapBundleRow(bundleRows[0]);

        const orderId = crypto.randomUUID();
        const accessToken =
          crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const now = new Date().toISOString();

        const checkout = await createDpayCheckoutSession(env, origin, {
          orderId,
          amountPkr: bundle.pricePkr,
          customerEmail: email,
          customerName,
          customerPhone,
          description: `Pak-Tel eSIM — ${bundle.name} (${bundle.dataDisplay})`,
          accessToken,
          metadata: {
            kind: 'NEW_ESIM',
            bundleId: bundle.id,
            yesimPackageCode: bundle.yesimPackageCode,
          },
        });

        sql.exec(
          `INSERT INTO orders (
            id, customer_email, customer_name, customer_phone, bundle_id, kind,
            amount_pkr, currency, status, payment_provider, dpay_session_id,
            dpay_checkout_url, access_token, email_delivery_status, origin_url,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'NEW_ESIM', ?, 'PKR', 'PENDING', 'DPAY', ?, ?, ?, 'PENDING', ?, ?, ?)`,
          orderId,
          email,
          customerName,
          customerPhone,
          bundle.id,
          bundle.pricePkr,
          checkout.sessionId,
          checkout.checkoutUrl,
          accessToken,
          origin,
          now,
          now,
        );

        return jsonResponse(
          {
            orderId,
            status: 'PENDING',
            amountPkr: bundle.pricePkr,
            currency: 'PKR',
            paymentProvider: 'DPAY',
            paymentSessionId: checkout.sessionId,
            checkoutUrl: checkout.checkoutUrl,
            accessToken,
          },
          201,
        );
      }

      const orderDetailMatch = path.match(/^\/api\/orders\/([^/]+)$/);
      if (orderDetailMatch && method === 'GET') {
        const orderId = orderDetailMatch[1];
        const accessToken =
          url.searchParams.get('accessToken') ||
          request.headers.get('X-Order-Access-Token') ||
          '';

        const orderRows = sql
          .exec(`SELECT * FROM orders WHERE id = ? LIMIT 1`, orderId)
          .toArray();
        if (!orderRows.length) return jsonResponse({ message: 'Order not found' }, 404);
        const o = orderRows[0];

        const tokenMatches =
          accessToken && (await constantTimeEqual(accessToken, String(o.access_token)));
        if (!tokenMatches) {
          return jsonResponse({ message: 'Order access token required' }, 403);
        }

        const bundleRows = sql
          .exec(`SELECT * FROM bundles WHERE id = ? LIMIT 1`, String(o.bundle_id))
          .toArray();
        const esimRows =
          o.kind === 'TOPUP' && o.target_iccid
            ? sql
                .exec(`SELECT * FROM esims WHERE iccid = ? LIMIT 1`, String(o.target_iccid))
                .toArray()
            : sql.exec(`SELECT * FROM esims WHERE order_id = ? LIMIT 1`, orderId).toArray();

        return jsonResponse({
          id: String(o.id),
          kind: String(o.kind),
          status: String(o.status),
          customerEmail: String(o.customer_email),
          customerName: o.customer_name ? String(o.customer_name) : null,
          customerPhone: o.customer_phone ? String(o.customer_phone) : null,
          amountPkr: Number(o.amount_pkr),
          currency: String(o.currency),
          targetIccid: o.target_iccid ? String(o.target_iccid) : null,
          checkoutUrl: o.dpay_checkout_url ? String(o.dpay_checkout_url) : null,
          failureReason: o.failure_reason ? String(o.failure_reason) : null,
          emailDeliveryStatus: String(o.email_delivery_status || 'PENDING'),
          emailSentAt: o.email_sent_at ? String(o.email_sent_at) : null,
          createdAt: String(o.created_at),
          bundle: bundleRows.length ? mapBundleRow(bundleRows[0]) : null,
          esim: esimRows.length ? mapEsimRow(esimRows[0]) : null,
        });
      }

      const iccidLookupMatch = path.match(/^\/api\/esims\/lookup\/([^/]+)$/);
      if (iccidLookupMatch && method === 'GET') {
        const cleanIccid = decodeURIComponent(iccidLookupMatch[1]).replace(/\s+/g, '');
        if (!/^\d{18,22}$/.test(cleanIccid)) {
          return jsonResponse(
            { message: 'ICCID must be an 18 to 22 digit numeric identifier.' },
            400,
          );
        }

        const live = await yesimFetchUsage(env, cleanIccid);
        let esimRows = sql
          .exec(`SELECT * FROM esims WHERE iccid = ? LIMIT 1`, cleanIccid)
          .toArray();

        if (!esimRows.length && !live) {
          return jsonResponse(
            {
              message:
                'No active Pak-Tel eSIM found for this ICCID. Double-check the 19–20 digits in Settings → Mobile Data.',
            },
            404,
          );
        }

        if (esimRows.length && live) {
          const ex = esimRows[0];
          const now = new Date().toISOString();
          sql.exec(
            `UPDATE esims SET
              status = COALESCE(?, status),
              total_bytes = COALESCE(?, total_bytes),
              remaining_bytes = COALESCE(?, remaining_bytes),
              expires_at = COALESCE(?, expires_at),
              last_synced_at = ?,
              updated_at = ?
            WHERE id = ?`,
            live.status ?? null,
            live.totalBytes ?? null,
            live.remainingBytes ?? null,
            live.expiresAt ?? null,
            now,
            now,
            String(ex.id),
          );
          esimRows = sql
            .exec(`SELECT * FROM esims WHERE iccid = ? LIMIT 1`, cleanIccid)
            .toArray();
        }

        const esim = esimRows.length
          ? mapEsimRow(esimRows[0])
          : {
              id: cleanIccid,
              orderId: '',
              iccid: cleanIccid,
              status: live?.status || 'ACTIVE',
              totalBytes: String(live?.totalBytes ?? 0),
              remainingBytes: String(live?.remainingBytes ?? 0),
              usedBytes: String(
                Math.max(0, (live?.totalBytes ?? 0) - (live?.remainingBytes ?? 0)),
              ),
              expiresAt: live?.expiresAt || null,
              activatedAt: null,
              lpa: null,
              smdpAddress: null,
              activationCode: null,
              qrDataUrl: null,
              appleUniversalLink: null,
            };

        let currentBundle = null;
        if (esimRows.length) {
          const orderRows = sql
            .exec(
              `SELECT bundle_id FROM orders WHERE id = ? LIMIT 1`,
              String(esimRows[0].order_id),
            )
            .toArray();
          if (orderRows.length) {
            const bRows = sql
              .exec(`SELECT * FROM bundles WHERE id = ? LIMIT 1`, String(orderRows[0].bundle_id))
              .toArray();
            if (bRows.length) currentBundle = mapBundleRow(bRows[0]);
          }
        }

        const reloadBundles = sql
          .exec(
            `SELECT * FROM bundles WHERE enabled = 1 AND reloadable = 1 ORDER BY sort_order ASC, price_pkr ASC`,
          )
          .toArray()
          .map(mapBundleRow);

        const historyRows = sql
          .exec(
            `SELECT t.id, t.amount_pkr, t.status, t.created_at, b.name AS plan_name, b.data_display
             FROM topups t
             LEFT JOIN bundles b ON b.id = t.bundle_id
             WHERE t.iccid = ?
             ORDER BY t.created_at DESC
             LIMIT 20`,
            cleanIccid,
          )
          .toArray()
          .map((h) => ({
            id: String(h.id),
            amountPkr: Number(h.amount_pkr),
            status: String(h.status),
            planName: h.plan_name ? String(h.plan_name) : 'Data Reload',
            dataDisplay: h.data_display ? String(h.data_display) : '',
            createdAt: String(h.created_at),
          }));

        return jsonResponse({
          esim,
          currentBundle,
          compatibleReloadBundles: reloadBundles,
          history: historyRows,
        });
      }

      if (path === '/api/topups' && method === 'POST') {
        const body = (await request.json()) as Record<string, any>;
        const cleanIccid = String(body?.iccid || '').replace(/\s+/g, '');
        const bundleId = String(body?.bundleId || '').trim();
        const email = String(body?.email || '').trim().toLowerCase();
        const customerPhone = body?.customerPhone ? String(body.customerPhone).trim() : null;

        if (!/^\d{18,22}$/.test(cleanIccid)) {
          return jsonResponse({ message: 'Valid 18–22 digit ICCID is required.' }, 400);
        }
        if (!bundleId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return jsonResponse(
            { message: 'Valid reload plan and email address are required.' },
            400,
          );
        }

        const bundleRows = sql
          .exec(
            `SELECT * FROM bundles WHERE id = ? AND enabled = 1 AND reloadable = 1 LIMIT 1`,
            bundleId,
          )
          .toArray();
        if (!bundleRows.length) {
          return jsonResponse({ message: 'Reload plan not found or not reloadable.' }, 404);
        }
        const bundle = mapBundleRow(bundleRows[0]);

        const esimRows = sql
          .exec(`SELECT id FROM esims WHERE iccid = ? LIMIT 1`, cleanIccid)
          .toArray();
        const esimId = esimRows.length ? String(esimRows[0].id) : null;

        const orderId = crypto.randomUUID();
        const topupId = crypto.randomUUID();
        const accessToken =
          crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const now = new Date().toISOString();

        const checkout = await createDpayCheckoutSession(env, origin, {
          orderId,
          amountPkr: bundle.pricePkr,
          customerEmail: email,
          customerPhone,
          description: `Pak-Tel eSIM Top-Up (${cleanIccid.slice(-6)}) — ${bundle.name}`,
          accessToken,
          metadata: {
            kind: 'TOPUP',
            iccid: cleanIccid,
            topupId,
            bundleId: bundle.id,
          },
        });

        sql.exec(
          `INSERT INTO orders (
            id, customer_email, customer_phone, bundle_id, kind, target_iccid,
            amount_pkr, currency, status, payment_provider, dpay_session_id,
            dpay_checkout_url, access_token, email_delivery_status, origin_url,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'TOPUP', ?, ?, 'PKR', 'PENDING', 'DPAY', ?, ?, ?, 'PENDING', ?, ?, ?)`,
          orderId,
          email,
          customerPhone,
          bundle.id,
          cleanIccid,
          bundle.pricePkr,
          checkout.sessionId,
          checkout.checkoutUrl,
          accessToken,
          origin,
          now,
          now,
        );

        sql.exec(
          `INSERT INTO topups (
            id, order_id, esim_id, iccid, bundle_id, amount_pkr, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
          topupId,
          orderId,
          esimId,
          cleanIccid,
          bundle.id,
          bundle.pricePkr,
          now,
          now,
        );

        return jsonResponse(
          {
            topupId,
            orderId,
            status: 'PENDING',
            amountPkr: bundle.pricePkr,
            currency: 'PKR',
            paymentSessionId: checkout.sessionId,
            checkoutUrl: checkout.checkoutUrl,
            accessToken,
          },
          201,
        );
      }

      if (path === '/api/webhooks/dpay' && method === 'POST') {
        const rawBody = await request.text();
        const sigHeader =
          request.headers.get('DPay-Signature') || request.headers.get('X-DPay-Signature');

        const verify = await verifyDpayWebhookSignature(
          rawBody,
          sigHeader,
          env.DPAY_WEBHOOK_SECRET,
        );
        if (!verify.ok) {
          return jsonResponse({ message: verify.error || 'Unauthorized webhook' }, 401);
        }

        const payload = JSON.parse(rawBody) as Record<string, any>;
        const eventId = String(payload.id || payload.event_id || crypto.randomUUID());
        const eventType = String(payload.type || payload.event || '');
        const data = payload.data || payload;
        const orderId = String(data.merchant_order_id || data.order_id || '');
        const txId = data.transaction_id ? String(data.transaction_id) : null;

        const existingEvt = sql
          .exec(`SELECT id FROM webhook_events WHERE event_id = ? LIMIT 1`, eventId)
          .toArray();
        if (existingEvt.length) {
          return jsonResponse({ received: true, deduplicated: true });
        }

        sql.exec(
          `INSERT INTO webhook_events (id, provider, event_id, event_type, payload_json, processed_at)
           VALUES (?, 'DPAY', ?, ?, ?, ?)`,
          crypto.randomUUID(),
          eventId,
          eventType,
          rawBody,
          new Date().toISOString(),
        );

        if (eventType === 'payment.succeeded' && orderId) {
          const result = await this.fulfillPaidOrder(env, orderId, txId, origin);
          return jsonResponse({ received: true, ...result });
        }

        if ((eventType === 'payment.failed' || eventType === 'payment.cancelled') && orderId) {
          const reason = String(data.failure_reason || eventType);
          const now = new Date().toISOString();
          sql.exec(
            `UPDATE orders SET status = 'FAILED', failure_reason = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'`,
            reason,
            now,
            orderId,
          );
          sql.exec(
            `UPDATE topups SET status = 'FAILED', failure_reason = ?, updated_at = ? WHERE order_id = ? AND status = 'PENDING'`,
            reason,
            now,
            orderId,
          );
        }

        return jsonResponse({ received: true });
      }

      if (path === '/api/webhooks/yesim' && method === 'POST') {
        const rawBody = await request.text();
        const secret = String(env.YESIM_WEBHOOK_SECRET || '').trim();
        if (secret) {
          const sig =
            request.headers.get('X-Yesim-Signature') ||
            request.headers.get('Yesim-Signature') ||
            '';
          const expected = await hmacSha256Hex(secret, rawBody);
          const valid = sig && (await constantTimeEqual(sig.toLowerCase(), expected.toLowerCase()));
          if (!valid) {
            return jsonResponse({ message: 'Invalid Yesim webhook signature' }, 401);
          }
        }

        const payload = JSON.parse(rawBody) as Record<string, any>;
        const eventId = String(payload.id || payload.event_id || `yesim_${crypto.randomUUID()}`);
        const eventType = String(payload.event || payload.type || 'esim.updated');
        const data = payload.data || payload;
        const iccid = String(data.iccid || '');

        const dup = sql
          .exec(`SELECT id FROM webhook_events WHERE event_id = ? LIMIT 1`, eventId)
          .toArray();
        if (!dup.length) {
          sql.exec(
            `INSERT INTO webhook_events (id, provider, event_id, event_type, payload_json, processed_at)
             VALUES (?, 'YESIM', ?, ?, ?, ?)`,
            crypto.randomUUID(),
            eventId,
            eventType,
            rawBody,
            new Date().toISOString(),
          );
        }

        if (iccid) {
          const now = new Date().toISOString();
          sql.exec(
            `UPDATE esims SET
              status = COALESCE(?, status),
              remaining_bytes = COALESCE(?, remaining_bytes),
              total_bytes = COALESCE(?, total_bytes),
              expires_at = COALESCE(?, expires_at),
              last_synced_at = ?,
              updated_at = ?
            WHERE iccid = ?`,
            data.status ? String(data.status).toUpperCase() : null,
            typeof data.remaining_bytes === 'number' ? data.remaining_bytes : null,
            typeof data.total_bytes === 'number' ? data.total_bytes : null,
            data.expires_at ? String(data.expires_at) : null,
            now,
            now,
            iccid,
          );
        }

        return jsonResponse({ received: true });
      }

      if (path === '/api/webhooks/mailjet' && method === 'POST') {
        const authed = await verifyMailjetWebhookAuth(
          request.headers.get('Authorization'),
          url.searchParams.get('token'),
          env.MAILJET_WEBHOOK_SECRET,
        );
        if (!authed) {
          return jsonResponse({ message: 'Unauthorized Mailjet webhook' }, 401);
        }

        const rawBody = await request.text();
        if (!rawBody.trim()) {
          return jsonResponse({ received: true, processed: 0 }, 200);
        }

        const parsed = JSON.parse(rawBody);
        const events: Record<string, any>[] = Array.isArray(parsed) ? parsed : [parsed];
        let processed = 0;

        for (const ev of events) {
          if (!ev || typeof ev !== 'object') continue;
          const evType = String(ev.event || 'unknown').toLowerCase();
          const msgId = ev.MessageID
            ? String(ev.MessageID)
            : ev.mj_message_id
              ? String(ev.mj_message_id)
              : '';
          const evTime = ev.time ? Number(ev.time) : Math.floor(Date.now() / 1000);
          const uniqueEventKey = `mj_${evType}_${msgId || crypto.randomUUID()}_${evTime}`;

          const exists = sql
            .exec(`SELECT id FROM webhook_events WHERE event_id = ? LIMIT 1`, uniqueEventKey)
            .toArray();
          if (!exists.length) {
            sql.exec(
              `INSERT INTO webhook_events (id, provider, event_id, event_type, payload_json, processed_at)
               VALUES (?, 'MAILJET', ?, ?, ?, ?)`,
              crypto.randomUUID(),
              uniqueEventKey,
              evType,
              JSON.stringify(ev),
              new Date().toISOString(),
            );
          }

          let orderId = ev.CustomID ? String(ev.CustomID) : '';
          if (!orderId && ev.Payload) {
            try {
              const pObj = typeof ev.Payload === 'string' ? JSON.parse(ev.Payload) : ev.Payload;
              if (pObj?.orderId) orderId = String(pObj.orderId);
            } catch {
              // ignore
            }
          }

          if (orderId) {
            let mappedStatus: string | null = null;
            let emailErr: string | null = null;
            if (evType === 'sent') mappedStatus = 'DELIVERED';
            else if (evType === 'open') mappedStatus = 'OPENED';
            else if (evType === 'click') mappedStatus = 'CLICKED';
            else if (evType === 'bounce') {
              mappedStatus = 'BOUNCED';
              emailErr = String(ev.comment || ev.error || 'Email bounced');
            } else if (evType === 'blocked') {
              mappedStatus = 'BLOCKED';
              emailErr = String(ev.error || 'Email blocked');
            } else if (evType === 'spam') {
              mappedStatus = 'SPAM';
            } else if (evType === 'unsub') {
              mappedStatus = 'UNSUBSCRIBED';
            }

            if (mappedStatus) {
              const iso = new Date(evTime * 1000).toISOString();
              sql.exec(
                `UPDATE orders SET
                  email_delivery_status = ?,
                  mailjet_message_id = COALESCE(?, mailjet_message_id),
                  mailjet_message_guid = COALESCE(?, mailjet_message_guid),
                  email_last_event_at = ?,
                  email_error = COALESCE(?, email_error),
                  updated_at = ?
                WHERE id = ?`,
                mappedStatus,
                msgId || null,
                ev.Message_GUID ? String(ev.Message_GUID) : null,
                iso,
                emailErr,
                new Date().toISOString(),
                orderId,
              );
            }
          }
          processed++;
        }

        return jsonResponse({ received: true, processed }, 200);
      }

      const sandboxGetMatch = path.match(/^\/api\/dpay-sandbox\/sessions\/([^/]+)$/);
      if (sandboxGetMatch && method === 'GET') {
        if (env.DPAY_MOCK !== 'true') {
          return jsonResponse({ message: 'Not Found' }, 404);
        }
        const sessionId = sandboxGetMatch[1];
        const rows = sql
          .exec(`SELECT * FROM orders WHERE dpay_session_id = ? LIMIT 1`, sessionId)
          .toArray();
        if (!rows.length) return jsonResponse({ message: 'Session not found' }, 404);
        const o = rows[0];
        const bRows = sql
          .exec(`SELECT * FROM bundles WHERE id = ? LIMIT 1`, String(o.bundle_id))
          .toArray();
        return jsonResponse({
          sessionId,
          orderId: String(o.id),
          amountPkr: Number(o.amount_pkr),
          currency: 'PKR',
          customerEmail: String(o.customer_email),
          status: String(o.status),
          accessToken: String(o.access_token),
          bundleName: bRows.length ? String(bRows[0].name) : 'Pak-Tel eSIM Plan',
        });
      }

      const sandboxCompleteMatch = path.match(
        /^\/api\/dpay-sandbox\/sessions\/([^/]+)\/complete$/,
      );
      if (sandboxCompleteMatch && method === 'POST') {
        if (env.DPAY_MOCK !== 'true') {
          return jsonResponse({ message: 'Not Found' }, 404);
        }
        const sessionId = sandboxCompleteMatch[1];
        const body = (await request.json()) as Record<string, any>;
        const outcome = body?.outcome === 'failed' ? 'failed' : 'succeeded';
        const rows = sql
          .exec(`SELECT * FROM orders WHERE dpay_session_id = ? LIMIT 1`, sessionId)
          .toArray();
        if (!rows.length) return jsonResponse({ message: 'Session not found' }, 404);
        const o = rows[0];
        const orderId = String(o.id);

        if (outcome === 'succeeded') {
          await this.fulfillPaidOrder(
            env,
            orderId,
            `dpay_tx_${crypto.randomUUID().slice(0, 10)}`,
            origin,
          );
        } else {
          const now = new Date().toISOString();
          sql.exec(
            `UPDATE orders SET status = 'FAILED', failure_reason = 'Cancelled or declined in DPay checkout', updated_at = ? WHERE id = ?`,
            now,
            orderId,
          );
        }
        return jsonResponse({
          ok: true,
          orderId,
          returnUrl: `/order/${orderId}?accessToken=${encodeURIComponent(String(o.access_token))}`,
        });
      }

      if (path.startsWith('/api/admin')) {
        const candidateSecretPath =
          request.headers.get('X-Admin-Secret-Path') || url.searchParams.get('path') || '';
        const routeAllowed = await verifyAdminSecretPath(
          candidateSecretPath,
          env.ADMIN_SECRET_PATH,
        );
        if (!routeAllowed) {
          return jsonResponse({ message: 'Not Found' }, 404);
        }

        if (path === '/api/admin/gate' && method === 'GET') {
          const hasCreds = Boolean(
            String(env.ADMIN_EMAIL || '').trim() && String(env.ADMIN_PASSWORD || '').trim(),
          );
          return jsonResponse({
            authorizedRoute: true,
            credentialsConfigured: hasCreds,
          });
        }

        if (path === '/api/admin/auth/login' && method === 'POST') {
          const configuredEmail = String(env.ADMIN_EMAIL || '').trim();
          const configuredPassword = String(env.ADMIN_PASSWORD || '').trim();
          if (!configuredEmail || !configuredPassword) {
            return jsonResponse(
              {
                message:
                  'ADMIN_EMAIL and ADMIN_PASSWORD must be configured in Cloudflare Runtime Variables & Secrets.',
              },
              503,
            );
          }

          const body = (await request.json()) as Record<string, any>;
          const inputEmail = String(body?.email || '').trim();
          const inputPassword = String(body?.password || '');

          const [emailOk, passOk] = await Promise.all([
            constantTimeEqual(inputEmail.toLowerCase(), configuredEmail.toLowerCase()),
            constantTimeEqual(inputPassword, configuredPassword),
          ]);

          if (!emailOk || !passOk) {
            return jsonResponse({ message: 'Invalid admin credentials' }, 401);
          }

          const accessToken = await signAdminJwt(
            { sub: 'admin', email: configuredEmail, role: 'ADMIN' },
            this.getJwtSecret(env),
          );
          return jsonResponse({
            accessToken,
            admin: { email: configuredEmail, role: 'ADMIN' },
          });
        }

        const authHeader = request.headers.get('Authorization') || '';
        const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        const adminClaims = bearer
          ? await verifyAdminJwt(bearer, this.getJwtSecret(env))
          : null;
        if (!adminClaims) {
          return jsonResponse({ message: 'Unauthorized admin session' }, 401);
        }

        if (path === '/api/admin/dashboard' && method === 'GET') {
          const revRow = sql
            .exec(
              `SELECT COALESCE(SUM(amount_pkr), 0) AS rev, COUNT(*) AS paid_cnt
               FROM orders WHERE status IN ('PAID', 'PROVISIONED')`,
            )
            .one();
          const totalOrdersRow = sql.exec(`SELECT COUNT(*) AS cnt FROM orders`).one();
          const esimsRow = sql.exec(`SELECT COUNT(*) AS cnt FROM esims`).one();
          const activeBundlesRow = sql
            .exec(`SELECT COUNT(*) AS cnt FROM bundles WHERE enabled = 1`)
            .one();
          const emailsSentRow = sql
            .exec(
              `SELECT COUNT(*) AS cnt FROM orders WHERE email_delivery_status IN ('SENT','DELIVERED','OPENED','CLICKED')`,
            )
            .one();

          return jsonResponse({
            revenuePkr: Number(revRow?.rev ?? 0),
            paidOrdersCount: Number(revRow?.paid_cnt ?? 0),
            totalOrdersCount: Number(totalOrdersRow?.cnt ?? 0),
            activeEsimsCount: Number(esimsRow?.cnt ?? 0),
            activeBundlesCount: Number(activeBundlesRow?.cnt ?? 0),
            emailsDeliveredCount: Number(emailsSentRow?.cnt ?? 0),
            runtimeIntegrations: {
              yesimConfigured: Boolean(String(env.YESIM_API_TOKEN || '').trim()),
              dpayConfigured: Boolean(
                String(env.DPAY_API_KEY || '').trim() &&
                  String(env.DPAY_API_SECRET || '').trim(),
              ),
              dpayWebhookSecretConfigured: Boolean(
                String(env.DPAY_WEBHOOK_SECRET || '').trim(),
              ),
              mailjetConfigured: Boolean(
                String(env.MAILJET_API_KEY || '').trim() &&
                  String(env.MAILJET_API_SECRET || '').trim() &&
                  String(env.MAILJET_FROM_EMAIL || '').trim(),
              ),
              mailjetWebhookSecretConfigured: Boolean(
                String(env.MAILJET_WEBHOOK_SECRET || '').trim(),
              ),
              jwtSecretConfigured: Boolean(String(env.JWT_SECRET || '').trim()),
            },
          });
        }

        if (path === '/api/admin/bundles' && method === 'GET') {
          const rows = sql
            .exec(`SELECT * FROM bundles ORDER BY sort_order ASC, created_at ASC`)
            .toArray()
            .map(mapBundleRow);
          return jsonResponse(rows);
        }

        if (path === '/api/admin/bundles' && method === 'POST') {
          const b = (await request.json()) as Record<string, any>;
          const id = crypto.randomUUID();
          const now = new Date().toISOString();
          sql.exec(
            `INSERT INTO bundles (
              id, yesim_package_code, name, country_code, country_name, region,
              data_mb, data_display, validity_days, coverage, plan_type,
              hotspot_supported, activation_type, reloadable, unlimited,
              price_pkr, original_price_pkr, cost_usd_cents, margin_percent,
              badge, sort_order, enabled, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            String(b.yesimPackageCode || '').trim(),
            String(b.name || '').trim(),
            String(b.countryCode || 'PK').trim().toUpperCase(),
            String(b.countryName || 'Pakistan').trim(),
            String(b.region || 'South Asia').trim(),
            Number(b.dataMb || 1024),
            String(b.dataDisplay || '1 GB').trim(),
            Number(b.validityDays || 7),
            String(b.coverage || '5G/4G/LTE').trim(),
            String(b.planType || 'Data only').trim(),
            b.hotspotSupported === false ? 0 : 1,
            String(b.activationType || 'Instant').trim(),
            b.reloadable === false ? 0 : 1,
            b.unlimited ? 1 : 0,
            Math.round(Number(b.pricePkr || 0)),
            Math.round(Number(b.originalPricePkr || 0)),
            Math.round(Number(b.costUsdCents || 0)),
            b.marginPercent !== undefined && b.marginPercent !== null
              ? Number(b.marginPercent)
              : null,
            b.badge ? String(b.badge).trim() : null,
            Number(b.sortOrder ?? 100),
            b.enabled === false ? 0 : 1,
            b.notes ? String(b.notes) : null,
            now,
            now,
          );
          const created = sql.exec(`SELECT * FROM bundles WHERE id = ?`, id).one();
          return jsonResponse(mapBundleRow(created!), 201);
        }

        const adminBundleMatch = path.match(/^\/api\/admin\/bundles\/([^/]+)$/);
        if (
          adminBundleMatch &&
          adminBundleMatch[1] !== 'recalculate-fx' &&
          adminBundleMatch[1] !== 'import-reference-sheet'
        ) {
          const bundleId = adminBundleMatch[1];
          if (method === 'PATCH') {
            const existing = sql
              .exec(`SELECT * FROM bundles WHERE id = ? LIMIT 1`, bundleId)
              .toArray();
            if (!existing.length) return jsonResponse({ message: 'Bundle not found' }, 404);
            const cur = mapBundleRow(existing[0]);
            const b = (await request.json()) as Record<string, any>;
            const now = new Date().toISOString();

            sql.exec(
              `UPDATE bundles SET
                yesim_package_code = ?,
                name = ?,
                country_code = ?,
                country_name = ?,
                region = ?,
                data_mb = ?,
                data_display = ?,
                validity_days = ?,
                coverage = ?,
                plan_type = ?,
                hotspot_supported = ?,
                activation_type = ?,
                reloadable = ?,
                unlimited = ?,
                price_pkr = ?,
                original_price_pkr = ?,
                cost_usd_cents = ?,
                margin_percent = ?,
                badge = ?,
                sort_order = ?,
                enabled = ?,
                notes = ?,
                updated_at = ?
              WHERE id = ?`,
              b.yesimPackageCode !== undefined
                ? String(b.yesimPackageCode).trim()
                : cur.yesimPackageCode,
              b.name !== undefined ? String(b.name).trim() : cur.name,
              b.countryCode !== undefined ? String(b.countryCode).toUpperCase() : cur.countryCode,
              b.countryName !== undefined ? String(b.countryName).trim() : cur.countryName,
              b.region !== undefined ? String(b.region).trim() : cur.region,
              b.dataMb !== undefined ? Number(b.dataMb) : cur.dataMb,
              b.dataDisplay !== undefined ? String(b.dataDisplay).trim() : cur.dataDisplay,
              b.validityDays !== undefined ? Number(b.validityDays) : cur.validityDays,
              b.coverage !== undefined ? String(b.coverage).trim() : cur.coverage,
              b.planType !== undefined ? String(b.planType).trim() : cur.planType,
              b.hotspotSupported !== undefined
                ? b.hotspotSupported
                  ? 1
                  : 0
                : cur.hotspotSupported
                  ? 1
                  : 0,
              b.activationType !== undefined
                ? String(b.activationType).trim()
                : cur.activationType,
              b.reloadable !== undefined
                ? b.reloadable
                  ? 1
                  : 0
                : cur.reloadable
                  ? 1
                  : 0,
              b.unlimited !== undefined ? (b.unlimited ? 1 : 0) : cur.unlimited ? 1 : 0,
              b.pricePkr !== undefined ? Math.round(Number(b.pricePkr)) : cur.pricePkr,
              b.originalPricePkr !== undefined
                ? Math.round(Number(b.originalPricePkr || 0))
                : cur.originalPricePkr || 0,
              b.costUsdCents !== undefined ? Math.round(Number(b.costUsdCents)) : cur.costUsdCents,
              b.marginPercent !== undefined ? b.marginPercent : cur.marginPercent,
              b.badge !== undefined ? (b.badge ? String(b.badge) : null) : cur.badge,
              b.sortOrder !== undefined ? Number(b.sortOrder) : cur.sortOrder,
              b.enabled !== undefined ? (b.enabled ? 1 : 0) : cur.enabled ? 1 : 0,
              b.notes !== undefined ? (b.notes ? String(b.notes) : null) : cur.notes,
              now,
              bundleId,
            );
            const updated = sql.exec(`SELECT * FROM bundles WHERE id = ?`, bundleId).one();
            return jsonResponse(mapBundleRow(updated!));
          }

          if (method === 'DELETE') {
            sql.exec(`DELETE FROM bundles WHERE id = ?`, bundleId);
            return jsonResponse({ deleted: true, id: bundleId });
          }
        }

        if (path === '/api/admin/bundles/import-reference-sheet' && method === 'POST') {
          const now = new Date().toISOString();
          let imported = 0;
          for (const b of PAKTEL_SEED_BUNDLES) {
            const exists = sql
              .exec(
                `SELECT id FROM bundles WHERE yesim_package_code = ? LIMIT 1`,
                b.yesimPackageCode,
              )
              .toArray();
            if (!exists.length) {
              sql.exec(
                `INSERT INTO bundles (
                  id, yesim_package_code, name, country_code, country_name, region,
                  data_mb, data_display, validity_days, coverage, plan_type,
                  hotspot_supported, activation_type, reloadable, unlimited,
                  price_pkr, original_price_pkr, cost_usd_cents, badge, sort_order,
                  enabled, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
                crypto.randomUUID(),
                b.yesimPackageCode,
                b.name,
                b.countryCode,
                b.countryName,
                b.region,
                b.dataMb,
                b.dataDisplay,
                b.validityDays,
                b.coverage,
                b.planType,
                b.hotspotSupported ? 1 : 0,
                b.activationType,
                b.reloadable ? 1 : 0,
                b.unlimited ? 1 : 0,
                b.pricePkr,
                b.originalPricePkr,
                b.costUsdCents,
                b.badge,
                b.sortOrder,
                now,
                now,
              );
              imported++;
            }
          }
          return jsonResponse({ imported, totalReferencePlans: PAKTEL_SEED_BUNDLES.length });
        }

        if (path === '/api/admin/bundles/recalculate-fx' && method === 'POST') {
          const body = (await request.json()) as Record<string, any>;
          const pricing = this.getPricingSettings();
          const fx = Number(body?.fxRateUsdToPkr || pricing.fxRateUsdToPkr || 278.5);
          const margin = Number(body?.marginPercent ?? pricing.defaultMarginPercent ?? 30);

          const rows = sql.exec(`SELECT * FROM bundles WHERE cost_usd_cents > 0`).toArray();
          const now = new Date().toISOString();
          let updatedCount = 0;
          for (const r of rows) {
            const usd = Number(r.cost_usd_cents) / 100;
            const newPkr = Math.max(50, Math.round(usd * fx * (1 + margin / 100)));
            sql.exec(
              `UPDATE bundles SET price_pkr = ?, margin_percent = ?, updated_at = ? WHERE id = ?`,
              newPkr,
              margin,
              now,
              String(r.id),
            );
            updatedCount++;
          }
          return jsonResponse({ updatedCount, fxRateUsdToPkr: fx, marginPercent: margin });
        }

        if (path === '/api/admin/orders' && method === 'GET') {
          const rows = sql
            .exec(
              `SELECT o.*, b.name AS bundle_name, b.data_display, e.iccid AS esim_iccid
               FROM orders o
               LEFT JOIN bundles b ON b.id = o.bundle_id
               LEFT JOIN esims e ON e.order_id = o.id
               ORDER BY o.created_at DESC
               LIMIT 200`,
            )
            .toArray()
            .map((o) => ({
              id: String(o.id),
              kind: String(o.kind),
              customerEmail: String(o.customer_email),
              customerName: o.customer_name ? String(o.customer_name) : null,
              customerPhone: o.customer_phone ? String(o.customer_phone) : null,
              bundleId: String(o.bundle_id),
              bundleName: o.bundle_name ? String(o.bundle_name) : 'Plan',
              dataDisplay: o.data_display ? String(o.data_display) : '',
              amountPkr: Number(o.amount_pkr),
              status: String(o.status),
              iccid: o.esim_iccid
                ? String(o.esim_iccid)
                : o.target_iccid
                  ? String(o.target_iccid)
                  : null,
              emailDeliveryStatus: String(o.email_delivery_status || 'PENDING'),
              mailjetMessageId: o.mailjet_message_id ? String(o.mailjet_message_id) : null,
              emailSentAt: o.email_sent_at ? String(o.email_sent_at) : null,
              emailLastEventAt: o.email_last_event_at ? String(o.email_last_event_at) : null,
              emailError: o.email_error ? String(o.email_error) : null,
              failureReason: o.failure_reason ? String(o.failure_reason) : null,
              accessToken: String(o.access_token),
              createdAt: String(o.created_at),
            }));
          return jsonResponse(rows);
        }

        const retryMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/retry-provision$/);
        if (retryMatch && method === 'POST') {
          const res = await this.fulfillPaidOrder(env, retryMatch[1], null, origin);
          return jsonResponse(res);
        }

        const resendEmailMatch = path.match(/^\/api\/admin\/orders\/([^/]+)\/resend-email$/);
        if (resendEmailMatch && method === 'POST') {
          const orderId = resendEmailMatch[1];
          const oRows = sql.exec(`SELECT * FROM orders WHERE id = ? LIMIT 1`, orderId).toArray();
          if (!oRows.length) return jsonResponse({ message: 'Order not found' }, 404);
          const o = oRows[0];
          const bRows = sql
            .exec(`SELECT * FROM bundles WHERE id = ? LIMIT 1`, String(o.bundle_id))
            .toArray();
          const bundle = bRows.length ? mapBundleRow(bRows[0]) : null;
          const eRows =
            o.kind === 'TOPUP' && o.target_iccid
              ? sql
                  .exec(`SELECT * FROM esims WHERE iccid = ? LIMIT 1`, String(o.target_iccid))
                  .toArray()
              : sql.exec(`SELECT * FROM esims WHERE order_id = ? LIMIT 1`, orderId).toArray();
          const esim = eRows.length ? eRows[0] : null;
          const iccid = esim
            ? String(esim.iccid)
            : o.target_iccid
              ? String(o.target_iccid)
              : '';
          if (!iccid || !bundle) {
            return jsonResponse(
              { message: 'Order does not have a provisioned eSIM yet.' },
              400,
            );
          }

          const mailRes = await sendMailjetEsimEmail(env, String(o.origin_url || origin), {
            orderId,
            accessToken: String(o.access_token),
            kind: String(o.kind) === 'TOPUP' ? 'TOPUP' : 'NEW_ESIM',
            toEmail: String(o.customer_email),
            toName: o.customer_name ? String(o.customer_name) : null,
            planName: bundle.name,
            dataDisplay: bundle.dataDisplay,
            validityDays: bundle.validityDays,
            amountPkr: Number(o.amount_pkr),
            iccid,
            lpa: esim?.lpa ? String(esim.lpa) : null,
            smdpAddress: esim?.smdp_address ? String(esim.smdp_address) : null,
            activationCode: esim?.activation_code ? String(esim.activation_code) : null,
          });

          sql.exec(
            `UPDATE orders SET email_delivery_status = ?, mailjet_message_id = COALESCE(?, mailjet_message_id), mailjet_message_guid = COALESCE(?, mailjet_message_guid), email_sent_at = COALESCE(?, email_sent_at), email_error = ?, updated_at = ? WHERE id = ?`,
            mailRes.status,
            mailRes.messageId || null,
            mailRes.messageGuid || null,
            mailRes.sent ? new Date().toISOString() : null,
            mailRes.error || null,
            new Date().toISOString(),
            orderId,
          );
          return jsonResponse(mailRes);
        }

        if (path === '/api/admin/esims' && method === 'GET') {
          const rows = sql
            .exec(`SELECT * FROM esims ORDER BY created_at DESC LIMIT 200`)
            .toArray()
            .map(mapEsimRow);
          return jsonResponse(rows);
        }

        const syncEsimMatch = path.match(/^\/api\/admin\/esims\/([^/]+)\/sync$/);
        if (syncEsimMatch && method === 'POST') {
          const eRows = sql
            .exec(`SELECT * FROM esims WHERE id = ? LIMIT 1`, syncEsimMatch[1])
            .toArray();
          if (!eRows.length) return jsonResponse({ message: 'eSIM not found' }, 404);
          const ex = eRows[0];
          const live = await yesimFetchUsage(env, String(ex.iccid));
          if (live) {
            const now = new Date().toISOString();
            sql.exec(
              `UPDATE esims SET
                status = COALESCE(?, status),
                total_bytes = COALESCE(?, total_bytes),
                remaining_bytes = COALESCE(?, remaining_bytes),
                expires_at = COALESCE(?, expires_at),
                last_synced_at = ?,
                updated_at = ?
              WHERE id = ?`,
              live.status ?? null,
              live.totalBytes ?? null,
              live.remainingBytes ?? null,
              live.expiresAt ?? null,
              now,
              now,
              String(ex.id),
            );
          }
          const updated = sql
            .exec(`SELECT * FROM esims WHERE id = ? LIMIT 1`, String(ex.id))
            .one();
          return jsonResponse(mapEsimRow(updated!));
        }

        if (path === '/api/admin/yesim/catalog' && method === 'GET') {
          return jsonResponse(await yesimFetchCatalog(env));
        }

        if (path === '/api/admin/yesim/balance' && method === 'GET') {
          return jsonResponse(await yesimFetchBalance(env));
        }

        if (path === '/api/admin/settings' && method === 'GET') {
          return jsonResponse(this.getPricingSettings());
        }

        if (path === '/api/admin/settings' && method === 'PATCH') {
          const body = (await request.json()) as Record<string, any>;
          const current = this.getPricingSettings();
          const next = {
            fxRateUsdToPkr:
              body.fxRateUsdToPkr !== undefined
                ? Number(body.fxRateUsdToPkr)
                : current.fxRateUsdToPkr,
            defaultMarginPercent:
              body.defaultMarginPercent !== undefined
                ? Number(body.defaultMarginPercent)
                : current.defaultMarginPercent,
            storeNotice:
              body.storeNotice !== undefined ? String(body.storeNotice) : current.storeNotice,
          };
          sql.exec(
            `INSERT INTO settings (key, value_json, updated_at)
             VALUES ('pricing', ?, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
            JSON.stringify(next),
            new Date().toISOString(),
          );
          return jsonResponse(next);
        }

        if (path === '/api/admin/webhooks' && method === 'GET') {
          const rows = sql
            .exec(`SELECT * FROM webhook_events ORDER BY processed_at DESC LIMIT 100`)
            .toArray()
            .map((w) => ({
              id: String(w.id),
              provider: String(w.provider),
              eventId: String(w.event_id),
              eventType: String(w.event_type),
              processedAt: String(w.processed_at),
            }));
          return jsonResponse(rows);
        }

        return jsonResponse({ message: 'Not Found' }, 404);
      }

      return jsonResponse({ message: 'API endpoint not found' }, 404);
    } catch (err: any) {
      return jsonResponse({ message: err?.message || 'Internal server error' }, 500);
    }
  }
}
