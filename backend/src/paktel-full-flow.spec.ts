import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './app.module';
import { configureApp } from './main';
import { DpayService } from './payments/dpay.service';

describe('Pak-Tel Full E2E Integration (Admin Manual Bundles + DPay + Yesim + ICCID Portal)', () => {
  let app: NestExpressApplication;
  let dpayService: DpayService;
  let adminToken: string;
  let createdBundleId: string;
  let provisionedIccid: string;
  let provisionedEsimId: string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'memory';
    process.env.JWT_ACCESS_SECRET = 'test_jwt_access_secret_paktel_2026_secure';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_paktel_2026_secure';
    process.env.ADMIN_EMAIL = 'admin@pak-tel.com';
    process.env.ADMIN_PASSWORD = 'PakTelAdmin2026!';
    process.env.DPAY_WEBHOOK_SECRET = 'whsec_e2e_secret_paktel_2026';
    process.env.DPAY_MOCK_MODE = 'true';
    process.env.YESIM_MOCK_MODE = 'true';
    process.env.ENABLE_SWAGGER = 'false';

    const modRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = modRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureApp(app);
    await app.init();

    dpayService = app.get(DpayService);
  }, 45_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. Health & public store-config endpoints respond cleanly', async () => {
    const health = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(health.body.status).toBe('ok');

    const cfg = await request(app.getHttpServer()).get('/api/store-config').expect(200);
    expect(cfg.body.storeName).toBe('Pak-Tel');
    expect(cfg.body.currency).toBe('PKR');
    expect(cfg.body.paymentGateway).toBe('DPay');
    expect(cfg.body.esimProvider).toBe('Yesim');

    const devices = await request(app.getHttpServer())
      .get('/api/compatibility/devices')
      .expect(200);
    expect(Array.isArray(devices.body)).toBe(true);
    expect(devices.body.length).toBeGreaterThan(0);
  });

  it('2. Enforces RBAC: regular customers get 403 on /api/admin/* while Admin logs in with ADMIN role', async () => {
    const custReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'regular@customer.pk',
        password: 'CustomerPass123!',
        name: 'Bilal Ahmed',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/admin/bundles')
      .set('Authorization', `Bearer ${custReg.body.accessToken}`)
      .expect(403);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@pak-tel.com',
        password: 'PakTelAdmin2026!',
      })
      .expect(200);

    expect(adminLogin.body.user.role).toBe('ADMIN');
    adminToken = adminLogin.body.accessToken;
  });

  it('3. Admin manually creates, edits, FX-recalculates, and imports Pak-Tel Sheet bundles; public API strips margins', async () => {
    // Initially empty manual catalog
    const initialPublic = await request(app.getHttpServer()).get('/api/bundles').expect(200);
    expect(initialPublic.body).toHaveLength(0);

    // Manually create "15 GB 30 Days" matching Google Sheet row 6
    const created = await request(app.getHttpServer())
      .post('/api/admin/bundles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: '15 GB 30 Days',
        pricePkr: 2499,
        actualPricePkr: 4999,
        dataLabel: '15 GB',
        dataGb: 15,
        isUnlimited: false,
        validityDays: 30,
        isReloadable: true,
        isMostPopular: true,
        costEur: 6.42,
        eurToPkr: 303.8602,
        yesimPlanId: 'e299479f253a1a82968fd070df904313',
        contact: '3259717066',
        sortOrder: 1,
      })
      .expect(201);

    createdBundleId = created.body.id;
    expect(created.body.discountPct).toBe(50);
    expect(created.body.priceDifferencePkr).toBe(2500);
    expect(created.body.costPkr).toBeCloseTo(1950.78, 1);
    expect(created.body.commissionPkr).toBeCloseTo(548.22, 1);

    // Public catalog shows the bundle WITHOUT internal wholesale cost/commission fields
    const pubList = await request(app.getHttpServer()).get('/api/bundles').expect(200);
    expect(pubList.body).toHaveLength(1);
    expect(pubList.body[0].name).toBe('15 GB 30 Days');
    expect(pubList.body[0].pricePkr).toBe(2499);
    expect(pubList.body[0].costPkr).toBeUndefined();
    expect(pubList.body[0].costEur).toBeUndefined();
    expect(pubList.body[0].commissionPkr).toBeUndefined();

    // Recalculate FX rate -> updates costPkr & commissionPkr
    await request(app.getHttpServer())
      .post('/api/admin/bundles/recalculate-fx')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ eurToPkr: 300 })
      .expect(201);

    const adminBundlesAfterFx = await request(app.getHttpServer())
      .get('/api/admin/bundles')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminBundlesAfterFx.body[0].costPkr).toBeCloseTo(1926, 0);
    expect(adminBundlesAfterFx.body[0].commissionPkr).toBeCloseTo(573, 0);

    // Import remaining 10 reference plans from Pak-Tel Google Sheet
    const imported = await request(app.getHttpServer())
      .post('/api/admin/bundles/import-reference-sheet')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(imported.body.created).toBe(10);
    expect(imported.body.skipped).toBe(1);

    const allPublic = await request(app.getHttpServer()).get('/api/bundles').expect(200);
    expect(allPublic.body).toHaveLength(11);
  });

  it('4. Guest Checkout + DPay HMAC-SHA256 Webhook Verification + Idempotent Yesim Provisioning', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/api/orders')
      .send({
        bundleId: createdBundleId,
        quantity: 1,
        customerEmail: 'guestbuyer@pak-tel.com',
        customerPhone: '03259717066',
      })
      .expect(201);

    expect(orderRes.body.status).toBe('PENDING_PAYMENT');
    expect(orderRes.body.amountPkr).toBe(2499);
    expect(orderRes.body.amountPaisa).toBe(249900);
    expect(orderRes.body.currency).toBe('PKR');
    expect(orderRes.body.dpaySessionId).toMatch(/^ps_sandbox_/);

    const orderId = orderRes.body.id;
    const guestToken = orderRes.body.guestAccessToken;

    // Unpaid polling must NOT fulfill
    const unpaidCheck = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}?token=${guestToken}`)
      .expect(200);
    expect(unpaidCheck.body.status).toBe('PENDING_PAYMENT');
    expect(unpaidCheck.body.esims).toHaveLength(0);

    // Forged DPay webhook signature must be rejected with 400
    const webhookBody = JSON.stringify({
      id: 'evt_e2e_order_paid_1',
      type: 'payment.succeeded',
      created_at: new Date().toISOString(),
      data: {
        session_id: orderRes.body.dpaySessionId,
        reference: orderRes.body.orderNumber,
        status: 'succeeded',
        amount: 249900,
        payable_amount: 249900,
        amount_paid: 249900,
        currency: 'PKR',
        payer_account_number: '0325-9717066',
      },
    });

    await request(app.getHttpServer())
      .post('/api/webhooks/dpay')
      .set('Content-Type', 'application/json')
      .set('DPay-Signature', 't=1700000000,v1=deadbeef')
      .set('DPay-Event-Id', 'evt_e2e_order_paid_1')
      .send(webhookBody)
      .expect(400);

    // Valid HMAC-SHA256 DPay-Signature fulfills & provisions Yesim eSIM
    const cfg = await dpayService.getRuntimeConfig();
    const validSig = dpayService.signWebhookPayload(webhookBody, cfg.webhookSecret);

    const whOk = await request(app.getHttpServer())
      .post('/api/webhooks/dpay')
      .set('Content-Type', 'application/json')
      .set('DPay-Signature', validSig)
      .set('DPay-Event-Id', 'evt_e2e_order_paid_1')
      .send(webhookBody)
      .expect(200);
    expect(whOk.body.received).toBe(true);

    // Duplicate webhook replay with same DPay-Event-Id is safely ignored
    const whDup = await request(app.getHttpServer())
      .post('/api/webhooks/dpay')
      .set('Content-Type', 'application/json')
      .set('DPay-Signature', validSig)
      .set('DPay-Event-Id', 'evt_e2e_order_paid_1')
      .send(webhookBody)
      .expect(200);
    expect(whDup.body.duplicate).toBe(true);

    // Order is now PROVISIONED with exactly 1 eSIM, QR PNG, LPA, and iOS tap link
    const provisionedOrder = await request(app.getHttpServer())
      .get(`/api/orders/${orderId}?token=${guestToken}`)
      .expect(200);

    expect(provisionedOrder.body.status).toBe('PROVISIONED');
    expect(provisionedOrder.body.esims).toHaveLength(1);
    const esim = provisionedOrder.body.esims[0];
    expect(esim.iccid).toMatch(/^8948650000\d{9}$/);
    expect(esim.activationCode).toMatch(/^LPA:1\$smdp\.io\$/);
    expect(esim.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(esim.iosTapLink).toContain('https://esimsetup.apple.com/');

    provisionedIccid = esim.iccid;
    provisionedEsimId = esim.id;
  });

  it('5. Self-Service ICCID Portal Lookup + DPay Sandbox Reload Top-Up accumulates MB on same Plan ID', async () => {
    const lookupBefore = await request(app.getHttpServer())
      .get(`/api/esims/lookup/${provisionedIccid}`)
      .expect(200);

    expect(lookupBefore.body.iccid).toBe(provisionedIccid);
    expect(lookupBefore.body.dataLeftMb).toBe(15 * 1024);
    expect(lookupBefore.body.reloadableBundles.length).toBeGreaterThan(0);

    // Initiate Top-Up with the same 15 GB bundle
    const topupRes = await request(app.getHttpServer())
      .post('/api/topups')
      .send({
        iccid: provisionedIccid,
        bundleId: createdBundleId,
      })
      .expect(201);

    expect(topupRes.body.status).toBe('PENDING_PAYMENT');
    expect(topupRes.body.amountPaisa).toBe(249900);

    // Complete via DPay Sandbox Checkout Simulator (exercises real signed webhook pipeline)
    await request(app.getHttpServer())
      .post(`/api/dpay-sandbox/sessions/${topupRes.body.dpaySessionId}/complete`)
      .send({
        outcome: 'succeeded',
        payerAccountNumber: '0325-9717066 (RAAST)',
      })
      .expect(201);

    const lookupAfter = await request(app.getHttpServer())
      .get(`/api/esims/lookup/${provisionedIccid}`)
      .expect(200);

    // Same plan_id accumulates 15 GB + 15 GB = 30 GB (30,720 MB) per Yesim Partner rules!
    expect(lookupAfter.body.dataLeftMb).toBe(30 * 1024);
    expect(lookupAfter.body.topUpHistory).toHaveLength(1);
    expect(lookupAfter.body.topUpHistory[0].status).toBe('COMPLETED');
  });

  it('6. Yesim PackageUsage webhook, Guest-to-Account claiming, Bulk Voucher issuance & eSIM Replacement', async () => {
    // Yesim webhook reports 20 GB remaining (in bytes)
    const twentyGbBytes = 20 * 1024 * 1024 * 1024;
    await request(app.getHttpServer())
      .post('/api/webhooks/yesim')
      .send({
        event_type: 'PackageUsage',
        event_timestamp: new Date().toISOString(),
        data: {
          iccid: provisionedIccid,
          unitsAfter: twentyGbBytes,
          thresholdPercentage: 33,
        },
      })
      .expect(200);

    const afterUsage = await request(app.getHttpServer())
      .get(`/api/esims/lookup/${provisionedIccid}`)
      .expect(200);
    expect(afterUsage.body.dataLeftMb).toBe(20 * 1024);
    expect(afterUsage.body.dataUsedMb).toBe(10 * 1024);

    // Guest buyer registers account -> automatically claims guest order & eSIM!
    const claimedReg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'guestbuyer@pak-tel.com',
        password: 'ClaimedUserPass123!',
      })
      .expect(201);

    const myEsims = await request(app.getHttpServer())
      .get('/api/esims')
      .set('Authorization', `Bearer ${claimedReg.body.accessToken}`)
      .expect(200);
    expect(myEsims.body.some((e: { iccid: string }) => e.iccid === provisionedIccid)).toBe(true);

    // Admin issues 2 Bulk Voucher eSIMs via Yesim /issue_esim
    const bulkRes = await request(app.getHttpServer())
      .post('/api/admin/yesim/issue-bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        planId: 'c9b922d6a687dc41955220eb30283c6e',
        count: 2,
        voucher: true,
      })
      .expect(201);
    expect(bulkRes.body.issuedCount).toBe(2);
    expect(bulkRes.body.esims[0].isVoucher).toBe(true);
    expect(bulkRes.body.esims[0].voucherCode).toBeTruthy();

    // Admin replaces eSIM via Yesim /change_esim -> transfers remaining 20 GB to new ICCID
    const replaced = await request(app.getHttpServer())
      .post(`/api/admin/esims/${provisionedEsimId}/replace`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(replaced.body.iccid).not.toBe(provisionedIccid);
    expect(replaced.body.dataLeftMb).toBe(20 * 1024);
    expect(replaced.body.replacementCount).toBe(1);
  });
});
