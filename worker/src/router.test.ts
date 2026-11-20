import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { hmacSha256Hex } from './crypto-auth';
import { RuntimeSecretsEnv } from './integrations';
import { createNodeSqliteExecutor } from './node-sqlite-driver';
import { PakTelApiEngine } from './router';

describe('Pak-Tel Cloudflare Worker API Engine (Yesim + DPay + Mailjet + Secret Admin Route)', () => {
  let engine: PakTelApiEngine;
  let closeDb: () => void;
  let mailjetCalls: Array<{ url: string; headers: Record<string, any>; body: any }> = [];

  const testEnv: RuntimeSecretsEnv = {
    ADMIN_SECRET_PATH: `route_${Math.random().toString(36).slice(2)}`,
    ADMIN_EMAIL: 'ops-test@example.test',
    ADMIN_PASSWORD: `pw_${Math.random().toString(36).slice(2)}`,
    JWT_SECRET: `jwt_${Math.random().toString(36).slice(2)}_test_key`,
    DPAY_MOCK: 'true',
    DPAY_WEBHOOK_SECRET: `dpay_wh_${Math.random().toString(36).slice(2)}`,
    YESIM_MOCK: 'true',
    MAILJET_API_KEY: 'mj_test_pub',
    MAILJET_API_SECRET: 'mj_test_priv',
    MAILJET_FROM_EMAIL: 'esim@pak-tel.com',
    MAILJET_FROM_NAME: 'Pak-Tel eSIM',
    MAILJET_WEBHOOK_SECRET: `mj_wh_${Math.random().toString(36).slice(2)}`,
  };

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const { executor, close } = createNodeSqliteExecutor(':memory:');
    closeDb = close;
    engine = new PakTelApiEngine(executor);
    mailjetCalls = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://api.mailjet.com/v3.1/send') {
        const parsedBody = JSON.parse(String(init?.body || '{}'));
        mailjetCalls.push({
          url,
          headers: (init?.headers as Record<string, any>) || {},
          body: parsedBody,
        });
        return new Response(
          JSON.stringify({
            Messages: [
              {
                Status: 'success',
                To: [
                  {
                    Email: parsedBody.Messages?.[0]?.To?.[0]?.Email,
                    MessageUUID: '1ab23cd4-e567-8901-2345-6789f0gh1i2j',
                    MessageID: 19421777835146490,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input as any, init);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    closeDb();
  });

  it('seeds all 11 Pak-Tel plans and blocks public user registration/login routes', async () => {
    const resBundles = await engine.handle(
      new Request('https://pak-tel.com/api/bundles'),
      testEnv,
    );
    assert.equal(resBundles.status, 200);
    const bundles = (await resBundles.json()) as any[];
    assert.equal(bundles.length, 11);
    assert.equal(bundles[0].pricePkr, 7099);
    assert.equal(bundles[0].originalPricePkr, 14999);

    const resRegister = await engine.handle(
      new Request('https://pak-tel.com/api/auth/register', { method: 'POST' }),
      testEnv,
    );
    assert.equal(resRegister.status, 404);
  });

  it('hides Admin Panel behind runtime ADMIN_SECRET_PATH (404 on wrong slug, 200 on exact slug)', async () => {
    const wrongGate = await engine.handle(
      new Request('https://pak-tel.com/api/admin/gate', {
        headers: { 'X-Admin-Secret-Path': 'admin' },
      }),
      testEnv,
    );
    assert.equal(wrongGate.status, 404);

    const rightGate = await engine.handle(
      new Request('https://pak-tel.com/api/admin/gate', {
        headers: { 'X-Admin-Secret-Path': testEnv.ADMIN_SECRET_PATH! },
      }),
      testEnv,
    );
    assert.equal(rightGate.status, 200);
    assert.deepEqual(await rightGate.json(), {
      authorizedRoute: true,
      credentialsConfigured: true,
    });

    const loginRes = await engine.handle(
      new Request('https://pak-tel.com/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret-Path': testEnv.ADMIN_SECRET_PATH!,
        },
        body: JSON.stringify({
          email: testEnv.ADMIN_EMAIL,
          password: testEnv.ADMIN_PASSWORD,
        }),
      }),
      testEnv,
    );
    assert.equal(loginRes.status, 200);
    const { accessToken } = (await loginRes.json()) as any;
    assert.equal(typeof accessToken, 'string');

    const createPlanRes = await engine.handle(
      new Request('https://pak-tel.com/api/admin/bundles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret-Path': testEnv.ADMIN_SECRET_PATH!,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          yesimPackageCode: 'TR_10GB_30D',
          name: 'Turkey 10 GB 30 Days',
          countryCode: 'TR',
          countryName: 'Turkey',
          dataMb: 10240,
          dataDisplay: '10 GB',
          validityDays: 30,
          pricePkr: 2999,
          originalPricePkr: 4999,
          reloadable: true,
          sortOrder: 12,
        }),
      }),
      testEnv,
    );
    assert.equal(createPlanRes.status, 201);
  });

  it('delivers eSIM QR code via Mailjet v3.1 once DPay payment.succeeded fires and processes Mailjet webhooks', async () => {
    const bundlesRes = await engine.handle(
      new Request('https://pak-tel.com/api/bundles'),
      testEnv,
    );
    const bundles = (await bundlesRes.json()) as any[];
    const targetPlan = bundles[1]; // 15 GB 30 Days (PKR 2,499)

    // 1. Guest creates order (no user account)
    const createOrderRes = await engine.handle(
      new Request('https://pak-tel.com/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bundleId: targetPlan.id,
          email: 'customer@pak-tel.test',
          customerName: 'Zainab',
        }),
      }),
      testEnv,
    );
    assert.equal(createOrderRes.status, 201);
    const orderCreated = (await createOrderRes.json()) as any;
    assert.equal(orderCreated.amountPkr, 2499);

    // 2. DPay sends signed payment.succeeded webhook
    const webhookBody = JSON.stringify({
      id: 'evt_dpay_001',
      type: 'payment.succeeded',
      data: {
        merchant_order_id: orderCreated.orderId,
        transaction_id: 'tx_pk_999',
        amount: 2499,
        currency: 'PKR',
      },
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await hmacSha256Hex(testEnv.DPAY_WEBHOOK_SECRET!, `${ts}.${webhookBody}`);

    const whRes = await engine.handle(
      new Request('https://pak-tel.com/api/webhooks/dpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DPay-Signature': `t=${ts},v1=${sig}`,
        },
        body: webhookBody,
      }),
      testEnv,
    );
    assert.equal(whRes.status, 200);
    const whData = (await whRes.json()) as any;
    assert.equal(whData.status, 'PROVISIONED');
    assert.equal(whData.mailjet, 'SENT');

    // 3. Verify Mailjet Send API v3.1 payload had inline PNG QR code & CustomID
    assert.equal(mailjetCalls.length, 1);
    const sentMsg = mailjetCalls[0].body.Messages[0];
    assert.equal(sentMsg.To[0].Email, 'customer@pak-tel.test');
    assert.equal(sentMsg.CustomID, orderCreated.orderId);
    assert.equal(sentMsg.InlinedAttachments.length, 1);
    assert.equal(sentMsg.InlinedAttachments[0].ContentType, 'image/png');
    assert.equal(sentMsg.InlinedAttachments[0].ContentID, 'esim-qr');
    assert.equal(sentMsg.InlinedAttachments[0].Base64Content.startsWith('iVBORw0KGgo'), true);

    // 4. Verify Mailjet Event Webhook (sent + open events array) updates order emailDeliveryStatus
    const mjAuth = `Basic ${btoa(`mailjet:${testEnv.MAILJET_WEBHOOK_SECRET}`)}`;
    const mjWhRes = await engine.handle(
      new Request('https://pak-tel.com/api/webhooks/mailjet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: mjAuth,
        },
        body: JSON.stringify([
          {
            event: 'sent',
            time: Math.floor(Date.now() / 1000),
            MessageID: 19421777835146490,
            CustomID: orderCreated.orderId,
            email: 'customer@pak-tel.test',
          },
          {
            event: 'open',
            time: Math.floor(Date.now() / 1000) + 2,
            MessageID: 19421777835146490,
            CustomID: orderCreated.orderId,
            email: 'customer@pak-tel.test',
          },
        ]),
      }),
      testEnv,
    );
    assert.equal(mjWhRes.status, 200);

    // 5. Verify Order Detail & ICCID Self-Service Lookup + Top-Up
    const detailRes = await engine.handle(
      new Request(
        `https://pak-tel.com/api/orders/${orderCreated.orderId}?accessToken=${orderCreated.accessToken}`,
      ),
      testEnv,
    );
    assert.equal(detailRes.status, 200);
    const detail = (await detailRes.json()) as any;
    assert.equal(detail.status, 'PROVISIONED');
    assert.equal(detail.emailDeliveryStatus, 'OPENED');
    assert.match(detail.esim.iccid, /^899201/);

    const lookupRes = await engine.handle(
      new Request(`https://pak-tel.com/api/esims/lookup/${detail.esim.iccid}`),
      testEnv,
    );
    assert.equal(lookupRes.status, 200);
    const lookup = (await lookupRes.json()) as any;
    assert.equal(lookup.esim.iccid, detail.esim.iccid);
    assert.equal(lookup.compatibleReloadBundles.length > 0, true);

    // 6. Perform traditional ICCID Top-Up -> DPay payment.succeeded -> Mailjet confirmation
    const topupRes = await engine.handle(
      new Request('https://pak-tel.com/api/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          iccid: detail.esim.iccid,
          bundleId: targetPlan.id,
          email: 'customer@pak-tel.test',
        }),
      }),
      testEnv,
    );
    assert.equal(topupRes.status, 201);
    const topupCreated = (await topupRes.json()) as any;

    const topupWhBody = JSON.stringify({
      id: 'evt_dpay_002',
      type: 'payment.succeeded',
      data: {
        merchant_order_id: topupCreated.orderId,
        transaction_id: 'tx_pk_1000',
      },
    });
    const sig2 = await hmacSha256Hex(testEnv.DPAY_WEBHOOK_SECRET!, `${ts}.${topupWhBody}`);
    const topupWhRes = await engine.handle(
      new Request('https://pak-tel.com/api/webhooks/dpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'DPay-Signature': `t=${ts},v1=${sig2}`,
        },
        body: topupWhBody,
      }),
      testEnv,
    );
    assert.equal(topupWhRes.status, 200);
    assert.equal(mailjetCalls.length, 2);
    assert.equal(mailjetCalls[1].body.Messages[0].Subject.includes('Top-Up Confirmed'), true);
  });
});
