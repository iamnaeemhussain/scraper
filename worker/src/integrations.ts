import { hmacSha256Hex } from './crypto-auth';
import { generateQrPngBase64 } from './qr-png';

export interface RuntimeSecretsEnv {
  ADMIN_SECRET_PATH?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;

  YESIM_API_BASE_URL?: string;
  YESIM_API_TOKEN?: string;
  YESIM_WEBHOOK_SECRET?: string;
  YESIM_MOCK?: string;

  DPAY_API_BASE_URL?: string;
  DPAY_MERCHANT_ID?: string;
  DPAY_API_KEY?: string;
  DPAY_API_SECRET?: string;
  DPAY_WEBHOOK_SECRET?: string;
  DPAY_MOCK?: string;

  MAILJET_API_BASE_URL?: string;
  MAILJET_API_KEY?: string;
  MAILJET_API_SECRET?: string;
  MAILJET_FROM_EMAIL?: string;
  MAILJET_FROM_NAME?: string;
  MAILJET_WEBHOOK_SECRET?: string;

  APP_PUBLIC_URL?: string;
  WHATSAPP_NUMBER?: string;
}

export interface YesimOrderProvisionResult {
  yesimOrderId: string;
  iccid: string;
  smdpAddress: string;
  activationCode: string;
  lpa: string;
  qrCodeUrl: string | null;
  status: string;
  rawPayload: Record<string, unknown>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function deterministicDigits(seed: string, length: number): string {
  let out = '';
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  while (out.length < length) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out += String(Math.abs(h) % 10);
  }
  return out.slice(0, length);
}

export function resolvePublicOrigin(env: RuntimeSecretsEnv, fallbackOrigin: string): string {
  const configured = String(env.APP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  return fallbackOrigin.replace(/\/+$/, '');
}

export async function yesimCreateOrder(
  env: RuntimeSecretsEnv,
  packageCode: string,
  externalOrderId: string,
): Promise<YesimOrderProvisionResult> {
  const token = String(env.YESIM_API_TOKEN || '').trim();
  const baseUrl = String(env.YESIM_API_BASE_URL || 'https://partners-api.yesim.biz')
    .trim()
    .replace(/\/+$/, '');

  if (!token) {
    if (env.YESIM_MOCK === 'true') {
      const suffix = deterministicDigits(externalOrderId, 13);
      const iccid = `899201${suffix}`;
      const smdpAddress = 'rsp.yesim.biz';
      const activationCode = `PAKTEL-${externalOrderId.slice(0, 8).toUpperCase()}`;
      const lpa = `LPA:1$${smdpAddress}$${activationCode}`;
      return {
        yesimOrderId: `ysm_mock_${externalOrderId.slice(0, 10)}`,
        iccid,
        smdpAddress,
        activationCode,
        lpa,
        qrCodeUrl: null,
        status: 'IN_USE',
        rawPayload: { simulated: true, packageCode, externalOrderId },
      };
    }
    throw new Error('YESIM_API_TOKEN is not configured in runtime secrets');
  }

  const res = await fetch(`${baseUrl}/v1/orders/new`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-Token': token,
    },
    body: JSON.stringify({
      package_id: packageCode,
      plan_id: packageCode,
      external_id: externalOrderId,
      quantity: 1,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Yesim createOrder HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const raw = (await res.json()) as Record<string, any>;
  const data = raw?.data ?? raw?.order ?? raw;
  const smdpAddress = String(data?.smdp_address || data?.smdpAddress || 'rsp.yesim.biz');
  const activationCode = String(
    data?.activation_code || data?.activationCode || data?.matching_id || '',
  );
  const lpa = String(
    data?.lpa ||
      data?.qrcode ||
      (activationCode ? `LPA:1$${smdpAddress}$${activationCode}` : ''),
  );

  return {
    yesimOrderId: String(data?.id || data?.order_id || externalOrderId),
    iccid: String(data?.iccid || ''),
    smdpAddress,
    activationCode,
    lpa,
    qrCodeUrl: data?.qrcode_url || data?.qr_url || null,
    status: String(data?.status || 'ALLOCATED').toUpperCase(),
    rawPayload: raw,
  };
}

export async function yesimTopupEsim(
  env: RuntimeSecretsEnv,
  iccid: string,
  packageCode: string,
  externalTopupId: string,
): Promise<{ yesimTopupId: string; status: string }> {
  const token = String(env.YESIM_API_TOKEN || '').trim();
  const baseUrl = String(env.YESIM_API_BASE_URL || 'https://partners-api.yesim.biz')
    .trim()
    .replace(/\/+$/, '');

  if (!token) {
    if (env.YESIM_MOCK === 'true') {
      return {
        yesimTopupId: `ysm_topup_${externalTopupId.slice(0, 10)}`,
        status: 'COMPLETED',
      };
    }
    throw new Error('YESIM_API_TOKEN is not configured in runtime secrets');
  }

  const res = await fetch(`${baseUrl}/v1/esims/${encodeURIComponent(iccid)}/topup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-Token': token,
    },
    body: JSON.stringify({
      iccid,
      package_id: packageCode,
      plan_id: packageCode,
      external_id: externalTopupId,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Yesim topup HTTP ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const raw = (await res.json()) as Record<string, any>;
  const data = raw?.data ?? raw;
  return {
    yesimTopupId: String(data?.id || data?.topup_id || externalTopupId),
    status: String(data?.status || 'COMPLETED').toUpperCase(),
  };
}

export async function yesimFetchUsage(
  env: RuntimeSecretsEnv,
  iccid: string,
): Promise<{
  status?: string;
  totalBytes?: number;
  remainingBytes?: number;
  expiresAt?: string | null;
} | null> {
  const token = String(env.YESIM_API_TOKEN || '').trim();
  if (!token) return null;
  const baseUrl = String(env.YESIM_API_BASE_URL || 'https://partners-api.yesim.biz')
    .trim()
    .replace(/\/+$/, '');

  try {
    const res = await fetch(`${baseUrl}/v1/esims/${encodeURIComponent(iccid)}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-API-Token': token,
      },
    });
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, any>;
    const d = raw?.data ?? raw;
    return {
      status: d?.status ? String(d.status).toUpperCase() : undefined,
      totalBytes:
        typeof d?.total_bytes === 'number'
          ? d.total_bytes
          : typeof d?.data_total_mb === 'number'
            ? d.data_total_mb * 1024 * 1024
            : undefined,
      remainingBytes:
        typeof d?.remaining_bytes === 'number'
          ? d.remaining_bytes
          : typeof d?.data_remaining_mb === 'number'
            ? d.data_remaining_mb * 1024 * 1024
            : undefined,
      expiresAt: d?.expires_at || d?.expired_at || undefined,
    };
  } catch {
    return null;
  }
}

export async function yesimFetchCatalog(env: RuntimeSecretsEnv): Promise<any[]> {
  const token = String(env.YESIM_API_TOKEN || '').trim();
  if (!token) return [];
  const baseUrl = String(env.YESIM_API_BASE_URL || 'https://partners-api.yesim.biz')
    .trim()
    .replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/v1/plans`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'X-API-Token': token,
    },
  });
  if (!res.ok) return [];
  const raw = (await res.json()) as any;
  return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : raw?.plans || [];
}

export async function yesimFetchBalance(
  env: RuntimeSecretsEnv,
): Promise<{ configured: boolean; balance: number | null; currency: string }> {
  const token = String(env.YESIM_API_TOKEN || '').trim();
  if (!token) {
    return { configured: false, balance: null, currency: 'EUR' };
  }
  const baseUrl = String(env.YESIM_API_BASE_URL || 'https://partners-api.yesim.biz')
    .trim()
    .replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/v1/balance`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-API-Token': token,
      },
    });
    if (!res.ok) return { configured: true, balance: null, currency: 'EUR' };
    const raw = (await res.json()) as any;
    const d = raw?.data ?? raw;
    return {
      configured: true,
      balance: Number(d?.balance ?? d?.amount ?? 0),
      currency: String(d?.currency || 'EUR'),
    };
  } catch {
    return { configured: true, balance: null, currency: 'EUR' };
  }
}

export async function createDpayCheckoutSession(
  env: RuntimeSecretsEnv,
  origin: string,
  params: {
    orderId: string;
    amountPkr: number;
    customerEmail: string;
    customerName?: string | null;
    customerPhone?: string | null;
    description: string;
    accessToken: string;
    metadata?: Record<string, string>;
  },
): Promise<{ sessionId: string; checkoutUrl: string }> {
  const publicBase = resolvePublicOrigin(env, origin);
  const returnUrl = `${publicBase}/order/${params.orderId}?accessToken=${encodeURIComponent(params.accessToken)}`;
  const cancelUrl = `${publicBase}/?payment=cancelled`;
  const webhookUrl = `${publicBase}/api/webhooks/dpay`;

  const apiKey = String(env.DPAY_API_KEY || '').trim();
  const apiSecret = String(env.DPAY_API_SECRET || '').trim();
  const merchantId = String(env.DPAY_MERCHANT_ID || '').trim();
  const baseUrl = String(env.DPAY_API_BASE_URL || 'https://api.dpay.com.pk/v1')
    .trim()
    .replace(/\/+$/, '');

  if (!apiKey || !apiSecret) {
    if (env.DPAY_MOCK === 'true') {
      const sessionId = `dpay_sess_${params.orderId.replace(/-/g, '').slice(0, 18)}`;
      return {
        sessionId,
        checkoutUrl: `${publicBase}/checkout/dpay/${sessionId}?orderId=${encodeURIComponent(params.orderId)}&accessToken=${encodeURIComponent(params.accessToken)}`,
      };
    }
    throw new Error(
      'DPay payment credentials (DPAY_API_KEY / DPAY_API_SECRET) are not configured in runtime secrets.',
    );
  }

  const payload = {
    merchant_id: merchantId,
    merchant_order_id: params.orderId,
    amount: Math.round(params.amountPkr),
    currency: 'PKR',
    description: params.description,
    customer: {
      email: params.customerEmail,
      name: params.customerName || undefined,
      phone: params.customerPhone || undefined,
    },
    return_url: returnUrl,
    cancel_url: cancelUrl,
    webhook_url: webhookUrl,
    payment_methods: ['easypaisa', 'jazzcash', 'card', 'raast'],
    metadata: params.metadata || {},
  };

  const rawBody = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacSha256Hex(apiSecret, `${ts}.${rawBody}`);

  const res = await fetch(`${baseUrl}/checkout/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-DPay-Merchant-Id': merchantId,
      'X-DPay-Timestamp': ts,
      'X-DPay-Signature': sig,
    },
    body: rawBody,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DPay session creation failed (${res.status}): ${errText.slice(0, 300)}`);
  }

  const raw = (await res.json()) as Record<string, any>;
  const data = raw?.data ?? raw;
  const sessionId = String(data?.session_id || data?.id || params.orderId);
  const checkoutUrl = String(data?.checkout_url || data?.payment_url || '');
  if (!checkoutUrl) {
    throw new Error('DPay response did not include checkout_url');
  }
  return { sessionId, checkoutUrl };
}

export interface MailjetDeliveryResult {
  sent: boolean;
  status: 'SENT' | 'SKIPPED_UNCONFIGURED' | 'FAILED';
  messageId?: string | null;
  messageGuid?: string | null;
  error?: string | null;
}

/**
 * Sends the provisioned eSIM (QR inline PNG + Apple Universal Link + ICCID + LPA)
 * or Top-Up confirmation via Mailjet Send API v3.1 (`POST https://api.mailjet.com/v3.1/send`)
 * immediately when `payment.succeeded` completes.
 * Attaches `CustomID` & `EventPayload` so Mailjet Event Webhooks (`/api/webhooks/mailjet`)
 * correlate `sent`, `open`, `click`, `bounce`, `blocked`, `spam`, and `unsub` events.
 */
export async function sendMailjetEsimEmail(
  env: RuntimeSecretsEnv,
  origin: string,
  params: {
    orderId: string;
    accessToken: string;
    kind: 'NEW_ESIM' | 'TOPUP';
    toEmail: string;
    toName?: string | null;
    planName: string;
    dataDisplay: string;
    validityDays: number;
    amountPkr: number;
    iccid: string;
    lpa?: string | null;
    smdpAddress?: string | null;
    activationCode?: string | null;
  },
): Promise<MailjetDeliveryResult> {
  const apiKey = String(env.MAILJET_API_KEY || '').trim();
  const apiSecret = String(env.MAILJET_API_SECRET || '').trim();
  const fromEmail = String(env.MAILJET_FROM_EMAIL || '').trim();
  const fromName = String(env.MAILJET_FROM_NAME || 'Pak-Tel eSIM').trim();
  const baseUrl = String(env.MAILJET_API_BASE_URL || 'https://api.mailjet.com')
    .trim()
    .replace(/\/+$/, '');

  if (!apiKey || !apiSecret || !fromEmail) {
    return {
      sent: false,
      status: 'SKIPPED_UNCONFIGURED',
      error: 'MAILJET_API_KEY, MAILJET_API_SECRET, or MAILJET_FROM_EMAIL not set in runtime secrets',
    };
  }

  const publicBase = resolvePublicOrigin(env, origin);
  const orderUrl = `${publicBase}/order/${params.orderId}?accessToken=${encodeURIComponent(params.accessToken)}`;
  const reloadUrl = `${publicBase}/my-esim?iccid=${encodeURIComponent(params.iccid)}`;
  const logoUrl = `${publicBase}/ptlogo.png`;
  const appleInstallUrl = params.lpa
    ? `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(params.lpa)}`
    : null;

  const qrPngBase64 = params.lpa ? generateQrPngBase64(params.lpa, 6, 4) : null;
  const shortRef = params.orderId.slice(0, 8).toUpperCase();
  const greeting = params.toName ? `Hi ${escapeHtml(params.toName)},` : 'Assalam-o-Alaikum,';

  const subject =
    params.kind === 'TOPUP'
      ? `Pak-Tel Top-Up Confirmed — ${params.planName} (ICCID ${params.iccid.slice(-6)})`
      : `Your Pak-Tel eSIM QR Code is Ready — ${params.planName} (#${shortRef})`;

  const textPart =
    params.kind === 'TOPUP'
      ? [
          `Pak-Tel eSIM Top-Up Confirmed (#${shortRef})`,
          ``,
          `Plan Added: ${params.planName} (${params.dataDisplay} / ${params.validityDays} Days)`,
          `Amount Paid: PKR ${params.amountPkr.toLocaleString()}`,
          `eSIM ICCID: ${params.iccid}`,
          ``,
          `Check live balance & expiry anytime: ${reloadUrl}`,
          `View receipt: ${orderUrl}`,
        ].join('\n')
      : [
          `Your Pak-Tel eSIM is Ready! (#${shortRef})`,
          ``,
          `Plan: ${params.planName} (${params.dataDisplay} / ${params.validityDays} Days)`,
          `Amount Paid: PKR ${params.amountPkr.toLocaleString()}`,
          `ICCID: ${params.iccid}`,
          params.smdpAddress ? `SM-DP+ Address: ${params.smdpAddress}` : '',
          params.activationCode ? `Activation Code: ${params.activationCode}` : '',
          params.lpa ? `Manual LPA String: ${params.lpa}` : '',
          appleInstallUrl ? `One-Tap iPhone Install: ${appleInstallUrl}` : '',
          ``,
          `How to install: Open Settings -> Mobile Data / Connections -> Add eSIM -> Scan the attached QR code.`,
          `View QR & Order Receipt: ${orderUrl}`,
          `Check Balance / Reload Anytime: ${reloadUrl}`,
        ]
          .filter(Boolean)
          .join('\n');

  const htmlPart = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f5f6f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#071322;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f1;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:22px;overflow:hidden;border:1px solid rgba(7,19,34,0.12);">
          <tr>
            <td style="background-color:#071322;padding:28px 32px;border-bottom:3px solid #c8ff43;">
              <img src="${escapeHtml(logoUrl)}" alt="Pak-Tel eSIM" height="54" style="display:block;height:54px;width:auto;border:0;" />
              <p style="margin:16px 0 0;font-family:monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#c8ff43;">
                ${params.kind === 'TOPUP' ? 'TOP-UP ACTIVATED • INSTANT RELOAD' : 'ESIM PROVISIONED • READY TO SCAN'}
              </p>
              <h1 style="margin:8px 0 0;font-size:26px;line-height:1.15;color:#ffffff;font-weight:700;">
                ${params.kind === 'TOPUP' ? 'Your Pak-Tel eSIM has been topped up.' : 'Your Pak-Tel eSIM is ready.'}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#10223a;">
                ${greeting} Thank you for choosing <strong>Pak-Tel</strong>. Your payment of <strong>PKR ${params.amountPkr.toLocaleString()}</strong> succeeded and your mobile data plan is active.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f1;border-radius:14px;padding:18px;margin:18px 0;border:1px solid rgba(7,19,34,0.1);">
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#526277;">Order Reference</td>
                  <td align="right" style="padding:5px 0;font-family:monospace;font-size:13px;font-weight:700;color:#071322;">#${escapeHtml(shortRef)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#526277;">Plan</td>
                  <td align="right" style="padding:5px 0;font-size:13px;font-weight:700;color:#071322;">${escapeHtml(params.planName)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#526277;">Data / Validity</td>
                  <td align="right" style="padding:5px 0;font-family:monospace;font-size:13px;font-weight:700;color:#071322;">${escapeHtml(params.dataDisplay)} • ${params.validityDays} Days</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;font-size:13px;color:#526277;">eSIM ICCID</td>
                  <td align="right" style="padding:5px 0;font-family:monospace;font-size:13px;font-weight:700;color:#071322;">${escapeHtml(params.iccid)}</td>
                </tr>
              </table>

              ${
                qrPngBase64
                  ? `<div style="text-align:center;background-color:#071322;border-radius:18px;padding:24px;margin:22px 0;color:#ffffff;">
                      <p style="margin:0 0 12px;font-family:monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#c8ff43;">SCAN IN SETTINGS → MOBILE DATA → ADD ESIM</p>
                      <div style="display:inline-block;background:#ffffff;padding:12px;border-radius:14px;">
                        <img src="cid:esim-qr" alt="Pak-Tel eSIM QR Code" width="210" height="210" style="display:block;width:210px;height:210px;border:0;" />
                      </div>
                      ${
                        appleInstallUrl
                          ? `<div style="margin-top:18px;">
                              <a href="${escapeHtml(appleInstallUrl)}" style="display:inline-block;background-color:#c8ff43;color:#071322;font-weight:700;font-size:14px;text-decoration:none;padding:13px 22px;border-radius:8px;">
                                Install on iPhone (iOS 17.4+) ↗
                              </a>
                            </div>`
                          : ''
                      }
                    </div>`
                  : ''
              }

              ${
                params.lpa
                  ? `<div style="background-color:#f5f6f1;border-radius:14px;padding:16px;margin:18px 0;border:1px solid rgba(7,19,34,0.1);">
                      <p style="margin:0 0 8px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#071322;">Manual Activation Details</p>
                      ${params.smdpAddress ? `<p style="margin:4px 0;font-size:12px;color:#10223a;"><strong>SM-DP+ Address:</strong> <code style="font-family:monospace;">${escapeHtml(params.smdpAddress)}</code></p>` : ''}
                      ${params.activationCode ? `<p style="margin:4px 0;font-size:12px;color:#10223a;"><strong>Activation Code:</strong> <code style="font-family:monospace;">${escapeHtml(params.activationCode)}</code></p>` : ''}
                      <p style="margin:4px 0;font-size:12px;color:#10223a;word-break:break-all;"><strong>LPA String:</strong> <code style="font-family:monospace;">${escapeHtml(params.lpa)}</code></p>
                    </div>`
                  : ''
              }

              <div style="margin-top:24px;text-align:center;">
                <a href="${escapeHtml(reloadUrl)}" style="display:inline-block;background-color:#071322;color:#ffffff;font-weight:700;font-size:13px;text-decoration:none;padding:13px 20px;border-radius:8px;margin:4px;">
                  Check Live Balance &amp; Top Up ↗
                </a>
                <a href="${escapeHtml(orderUrl)}" style="display:inline-block;background-color:#e9ebe4;color:#071322;font-weight:700;font-size:13px;text-decoration:none;padding:13px 20px;border-radius:8px;margin:4px;">
                  Open Web Receipt ↗
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color:#e9ebe4;padding:16px 32px;text-align:center;font-size:12px;color:#526277;">
              Pak-Tel Digital Data eSIM • Keep your physical SIM for calls while Pak-Tel powers your data.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const messageObj: Record<string, any> = {
    From: {
      Email: fromEmail,
      Name: fromName,
    },
    To: [
      {
        Email: params.toEmail,
        Name: params.toName || params.toEmail.split('@')[0],
      },
    ],
    Subject: subject,
    TextPart: textPart,
    HTMLPart: htmlPart,
    CustomCampaign: 'paktel_esim_delivery',
    CustomID: params.orderId,
    EventPayload: JSON.stringify({
      orderId: params.orderId,
      kind: params.kind,
      iccid: params.iccid,
    }),
  };

  if (qrPngBase64) {
    messageObj.InlinedAttachments = [
      {
        ContentType: 'image/png',
        Filename: `paktel-esim-${shortRef}.png`,
        ContentID: 'esim-qr',
        Base64Content: qrPngBase64,
      },
    ];
    messageObj.Attachments = [
      {
        ContentType: 'image/png',
        Filename: `paktel-esim-${shortRef}.png`,
        Base64Content: qrPngBase64,
      },
    ];
  }

  try {
    const basicAuth = btoa(`${apiKey}:${apiSecret}`);
    const res = await fetch(`${baseUrl}/v3.1/send`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Messages: [messageObj] }),
    });

    const rawText = await res.text();
    if (!res.ok) {
      return {
        sent: false,
        status: 'FAILED',
        error: `Mailjet HTTP ${res.status}: ${rawText.slice(0, 300)}`,
      };
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = {};
    }
    const firstMsg = parsed?.Messages?.[0];
    const firstTo = firstMsg?.To?.[0];
    if (firstMsg?.Status && String(firstMsg.Status).toLowerCase() === 'error') {
      return {
        sent: false,
        status: 'FAILED',
        error: JSON.stringify(firstMsg?.Errors || firstMsg).slice(0, 300),
      };
    }

    return {
      sent: true,
      status: 'SENT',
      messageId: firstTo?.MessageID ? String(firstTo.MessageID) : null,
      messageGuid: firstTo?.MessageUUID ? String(firstTo.MessageUUID) : null,
    };
  } catch (err: any) {
    return {
      sent: false,
      status: 'FAILED',
      error: err?.message || 'Mailjet network error',
    };
  }
}
