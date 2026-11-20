import { ConfigService } from '@nestjs/config';
import { DpayService } from './dpay.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DpayService', () => {
  const mockSettings = {
    dpayBaseUrl: 'https://api.dpay.com.pk/v1',
    dpayApiKey: null,
    dpayWebhookSecret: 'whsec_unit_test_secret_2026',
    dpayMockMode: true,
  };

  let service: DpayService;

  beforeEach(() => {
    const config = new ConfigService({ FRONTEND_URL: 'https://pak-tel.com' });
    const prisma = {
      getSettings: jest.fn().mockResolvedValue(mockSettings),
    } as unknown as PrismaService;
    service = new DpayService(config, prisma);
  });

  it('converts whole PKR rupees to integer paisa divisible by 100', () => {
    expect(service.rupeesToPaisa(220)).toBe(22000);
    expect(service.rupeesToPaisa(2499)).toBe(249900);
    expect(() => service.rupeesToPaisa(0)).toThrow();
    expect(() => service.rupeesToPaisa(-50)).toThrow();
  });

  it('rejects non-whole-rupee paisa amounts in createPaymentSession', async () => {
    await expect(
      service.createPaymentSession({
        idempotencyKey: 'test:1',
        amountPaisa: 249950, // 2499.50 PKR — forbidden by DPay whole-rupee rule
        reference: 'PKT-TEST-1',
        description: 'Invalid fractional rupee',
        successUrl: 'https://pak-tel.com/ok',
        cancelUrl: 'https://pak-tel.com/cancel',
      }),
    ).rejects.toThrow(/divisible by 100/);
  });

  it('verifies valid DPay-Signature HMAC-SHA256 and rejects tampered or replayed payloads', async () => {
    const payloadObj = {
      id: 'evt_test_001',
      type: 'payment.succeeded',
      created_at: new Date().toISOString(),
      data: {
        session_id: 'ps_123',
        reference: 'PKT-20261120-ABC123',
        amount: 249900,
        payable_amount: 249900,
        amount_paid: 249900,
        currency: 'PKR',
      },
    };
    const rawBody = JSON.stringify(payloadObj);
    const sig = service.signWebhookPayload(rawBody, mockSettings.dpayWebhookSecret);

    const ok = await service.verifyWebhookSignature(Buffer.from(rawBody, 'utf8'), sig);
    expect(ok.valid).toBe(true);
    expect(ok.payload?.id).toBe('evt_test_001');

    // Tampered body must fail constant-time HMAC check
    const tamperedBody = rawBody.replace('249900', '100');
    const tampered = await service.verifyWebhookSignature(tamperedBody, sig);
    expect(tampered.valid).toBe(false);
    expect(tampered.reason).toMatch(/HMAC mismatch/);

    // Expired timestamp (> 300s old) must fail replay check
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const staleSig = service.signWebhookPayload(
      rawBody,
      mockSettings.dpayWebhookSecret,
      oldTimestamp,
    );
    const replay = await service.verifyWebhookSignature(rawBody, staleSig);
    expect(replay.valid).toBe(false);
    expect(replay.reason).toMatch(/replay window/);
  });
});
