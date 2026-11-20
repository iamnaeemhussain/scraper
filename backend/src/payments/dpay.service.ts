import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type {
  DpayCreateSessionInput,
  DpayPaymentSession,
  DpayWebhookPayload,
} from './dpay.types';

const DEFAULT_MOCK_WEBHOOK_SECRET = 'whsec_paktel_sandbox_secret_2026';

@Injectable()
export class DpayService {
  private readonly log = new Logger(DpayService.name);
  private readonly http: AxiosInstance;
  private readonly mockSessions = new Map<string, DpayPaymentSession>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.http = axios.create({
      timeout: 20_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Mandatory named User-Agent per DPay docs (prevents Cloudflare 403)
        'User-Agent': 'PakTelStore/1.0 (+https://pak-tel.com)',
      },
    });
  }

  async getRuntimeConfig(): Promise<{
    baseUrl: string;
    apiKey: string | null;
    webhookSecret: string;
    mockMode: boolean;
    frontendBaseUrl: string;
  }> {
    const settings = await this.prisma.getSettings();
    const baseUrl = (
      settings?.dpayBaseUrl ||
      this.config.get<string>('DPAY_BASE_URL') ||
      'https://api.dpay.com.pk/v1'
    ).replace(/\/+$/, '');
    const apiKey =
      (settings?.dpayApiKey ?? this.config.get<string>('DPAY_API_KEY') ?? '').trim() ||
      null;
    const webhookSecret =
      (
        settings?.dpayWebhookSecret ??
        this.config.get<string>('DPAY_WEBHOOK_SECRET') ??
        ''
      ).trim() || DEFAULT_MOCK_WEBHOOK_SECRET;
    const mockMode = Boolean(settings?.dpayMockMode) || !apiKey;
    const frontendBaseUrl = (
      this.config.get<string>('FRONTEND_URL') || ''
    ).replace(/\/+$/, '');

    return { baseUrl, apiKey, webhookSecret, mockMode, frontendBaseUrl };
  }

  /**
   * DPay requires integer paisa representing whole PKR rupees (amount % 100 === 0, >= 100).
   */
  rupeesToPaisa(pricePkr: number): number {
    const wholeRupees = Math.round(Number(pricePkr));
    if (!Number.isFinite(wholeRupees) || wholeRupees < 1) {
      throw new BadRequestException('DPay amount must be at least PKR 1 (100 paisa)');
    }
    const paisa = wholeRupees * 100;
    if (paisa % 100 !== 0) {
      throw new BadRequestException('DPay amount must represent whole PKR rupees');
    }
    return paisa;
  }

  private wrapError(endpoint: string, err: unknown): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg =
        data?.error?.message ||
        data?.message ||
        (typeof data === 'string' ? data : err.message);
      this.log.error(`DPay ${endpoint} failed (${status ?? 'ERR'}): ${msg}`);
      if (status && status >= 400 && status < 500) {
        throw new BadRequestException(`DPay error: ${msg}`);
      }
      throw new BadGatewayException(`DPay upstream error on ${endpoint}: ${msg}`);
    }
    throw err;
  }

  async createPaymentSession(
    input: DpayCreateSessionInput,
    originHint?: string,
  ): Promise<DpayPaymentSession> {
    if (!Number.isInteger(input.amountPaisa) || input.amountPaisa < 100 || input.amountPaisa % 100 !== 0) {
      throw new BadRequestException(
        'DPay amountPaisa must be an integer >= 100 and divisible by 100 (whole rupees)',
      );
    }

    const { baseUrl, apiKey, mockMode, frontendBaseUrl } = await this.getRuntimeConfig();

    if (mockMode) {
      const sessionId = `ps_sandbox_${crypto.randomBytes(8).toString('hex')}`;
      const expiresSec = input.expiresInSeconds ?? 1800;
      const expiresAt = new Date(Date.now() + expiresSec * 1000).toISOString();
      const baseOrigin = originHint || frontendBaseUrl || '';
      const checkoutPath = `/checkout/dpay/${sessionId}`;
      const checkoutUrl = baseOrigin ? `${baseOrigin.replace(/\/+$/, '')}${checkoutPath}` : checkoutPath;

      const session: DpayPaymentSession = {
        id: sessionId,
        amount: input.amountPaisa,
        payable_amount: input.amountPaisa,
        amount_paid: 0,
        currency: 'PKR',
        status: 'open',
        checkout_url: checkoutUrl,
        reference: input.reference,
        description: input.description,
        customer_email: input.customerEmail ?? null,
        customer_phone: input.customerPhone ?? null,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
        metadata: input.metadata,
        mock: true,
      };
      this.mockSessions.set(sessionId, session);
      return session;
    }

    try {
      const res = await this.http.post<DpayPaymentSession>(
        `${baseUrl}/payment_sessions`,
        {
          amount: input.amountPaisa,
          currency: 'PKR',
          reference: input.reference,
          description: input.description,
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
          ...(input.customerPhone ? { customer_phone: input.customerPhone } : {}),
          expires_in_seconds: input.expiresInSeconds ?? 1800,
          ...(input.rounding ? { rounding: input.rounding } : {}),
          ...(input.metadata ? { metadata: input.metadata } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Idempotency-Key': input.idempotencyKey,
          },
        },
      );
      return res.data;
    } catch (err) {
      this.wrapError('/payment_sessions', err);
    }
  }

  async getPaymentSession(sessionId: string): Promise<DpayPaymentSession> {
    if (this.mockSessions.has(sessionId)) {
      return this.mockSessions.get(sessionId)!;
    }
    const { baseUrl, apiKey, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      throw new BadRequestException(`Sandbox DPay session ${sessionId} not found`);
    }
    try {
      const res = await this.http.get<DpayPaymentSession>(
        `${baseUrl}/payment_sessions/${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return res.data;
    } catch (err) {
      this.wrapError(`/payment_sessions/${sessionId}`, err);
    }
  }

  async verifyPaymentSession(
    sessionId: string,
    externalPaymentRef: string,
  ): Promise<DpayPaymentSession> {
    if (this.mockSessions.has(sessionId)) {
      const s = this.mockSessions.get(sessionId)!;
      s.status = 'succeeded';
      s.amount_paid = s.payable_amount;
      s.external_payment_ref = externalPaymentRef;
      return s;
    }
    const { baseUrl, apiKey, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      throw new BadRequestException(`Sandbox DPay session ${sessionId} not found`);
    }
    try {
      const res = await this.http.post<DpayPaymentSession>(
        `${baseUrl}/payment_sessions/${encodeURIComponent(sessionId)}/verify`,
        { external_payment_ref: externalPaymentRef },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return res.data;
    } catch (err) {
      this.wrapError(`/payment_sessions/${sessionId}/verify`, err);
    }
  }

  async cancelPaymentSession(sessionId: string): Promise<DpayPaymentSession> {
    if (this.mockSessions.has(sessionId)) {
      const s = this.mockSessions.get(sessionId)!;
      s.status = 'canceled';
      return s;
    }
    const { baseUrl, apiKey, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      throw new BadRequestException(`Sandbox DPay session ${sessionId} not found`);
    }
    try {
      const res = await this.http.post<DpayPaymentSession>(
        `${baseUrl}/payment_sessions/${encodeURIComponent(sessionId)}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return res.data;
    } catch (err) {
      this.wrapError(`/payment_sessions/${sessionId}/cancel`, err);
    }
  }

  async refundPaymentSession(
    sessionId: string,
    reason?: string,
  ): Promise<DpayPaymentSession> {
    if (this.mockSessions.has(sessionId)) {
      const s = this.mockSessions.get(sessionId)!;
      s.status = 'canceled';
      return s;
    }
    const { baseUrl, apiKey, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      throw new BadRequestException(`Sandbox DPay session ${sessionId} not found`);
    }
    try {
      const res = await this.http.post<DpayPaymentSession>(
        `${baseUrl}/payment_sessions/${encodeURIComponent(sessionId)}/refund`,
        reason ? { reason } : {},
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return res.data;
    } catch (err) {
      this.wrapError(`/payment_sessions/${sessionId}/refund`, err);
    }
  }

  async registerWebhookEndpoint(params: {
    url: string;
    events?: string[];
  }): Promise<{ id: string; secret?: string; url: string; events: string[]; mock: boolean }> {
    const events = params.events ?? [
      'payment.succeeded',
      'payment.failed',
      'payment.expired',
      'payment.ambiguous',
      'payment.refunded',
      'payment.disputed',
    ];
    const { baseUrl, apiKey, webhookSecret, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      return {
        id: `we_sandbox_${crypto.randomBytes(6).toString('hex')}`,
        secret: webhookSecret,
        url: params.url,
        events,
        mock: true,
      };
    }
    try {
      const res = await this.http.post(
        `${baseUrl}/webhook_endpoints`,
        { url: params.url, events },
        { headers: { Authorization: `Bearer ${apiKey}` } },
      );
      return { ...res.data, mock: false };
    } catch (err) {
      this.wrapError('/webhook_endpoints', err);
    }
  }

  async getHealthAndMerchant(): Promise<{
    healthy: boolean;
    mockMode: boolean;
    merchant?: unknown;
  }> {
    const { baseUrl, apiKey, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      return {
        healthy: true,
        mockMode: true,
        merchant: {
          name: 'Pak-Tel Sandbox Merchant',
          currency: 'PKR',
          settlement: 'Raast / IBFT Instant',
        },
      };
    }
    try {
      const [healthRes, meRes] = await Promise.all([
        this.http.get(`${baseUrl}/health`),
        this.http.get(`${baseUrl}/me`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        }),
      ]);
      return {
        healthy: healthRes.status === 200,
        mockMode: false,
        merchant: meRes.data,
      };
    } catch {
      return { healthy: false, mockMode: false };
    }
  }

  updateMockSession(
    sessionId: string,
    patch: Partial<DpayPaymentSession>,
  ): DpayPaymentSession | null {
    const existing = this.mockSessions.get(sessionId);
    if (!existing) return null;
    const updated = { ...existing, ...patch };
    this.mockSessions.set(sessionId, updated);
    return updated;
  }

  /**
   * Computes `DPay-Signature` header (`t=<unix>,v1=<hmac_sha256>`) for tests & sandbox simulation.
   */
  signWebhookPayload(rawBody: string, secret: string, timestampSec?: number): string {
    const t = timestampSec ?? Math.floor(Date.now() / 1000);
    const v1 = crypto
      .createHmac('sha256', secret)
      .update(`${t}.${rawBody}`)
      .digest('hex');
    return `t=${t},v1=${v1}`;
  }

  /**
   * Verifies `DPay-Signature: t=<unix>,v1=<hex>` against raw request body using constant-time HMAC-SHA256
   * and a 5-minute replay tolerance window (`|now - t| <= 300`).
   */
  async verifyWebhookSignature(
    rawBody: string | Buffer,
    signatureHeader?: string,
    maxAgeSeconds = 300,
  ): Promise<{ valid: boolean; reason?: string; payload?: DpayWebhookPayload }> {
    if (!signatureHeader) {
      return { valid: false, reason: 'Missing DPay-Signature header' };
    }
    const parts = Object.fromEntries(
      signatureHeader.split(',').map((segment) => {
        const idx = segment.indexOf('=');
        return idx > 0
          ? [segment.slice(0, idx).trim(), segment.slice(idx + 1).trim()]
          : [segment.trim(), ''];
      }),
    );

    const tStr = parts.t;
    const v1 = parts.v1;
    if (!tStr || !v1) {
      return { valid: false, reason: 'Malformed DPay-Signature header' };
    }

    const timestamp = Number(tStr);
    if (!Number.isFinite(timestamp)) {
      return { valid: false, reason: 'Invalid timestamp in DPay-Signature' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > maxAgeSeconds) {
      return { valid: false, reason: 'DPay-Signature timestamp outside 5-minute replay window' };
    }

    const { webhookSecret } = await this.getRuntimeConfig();
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const expectedHex = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${bodyStr}`)
      .digest('hex');

    let sigBuf: Buffer;
    let expectedBuf: Buffer;
    try {
      sigBuf = Buffer.from(v1, 'hex');
      expectedBuf = Buffer.from(expectedHex, 'hex');
    } catch {
      return { valid: false, reason: 'Invalid hex digest in DPay-Signature' };
    }

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return { valid: false, reason: 'DPay-Signature HMAC mismatch' };
    }

    try {
      const payload = JSON.parse(bodyStr) as DpayWebhookPayload;
      return { valid: true, payload };
    } catch {
      return { valid: false, reason: 'Invalid JSON body in DPay webhook' };
    }
  }
}
