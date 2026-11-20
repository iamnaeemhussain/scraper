import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import { eq, inArray } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { CacheService } from '../queue/queue.module';
import {
  FALLBACK_ALLOWED_OPERATORS,
  FALLBACK_SUPPORTED_DEVICES,
  FALLBACK_YESIM_PLANS,
} from './yesim.catalog-seed';
import type {
  YesimAllowedOperator,
  YesimBalance,
  YesimDeviceCategory,
  YesimOrderRecord,
  YesimPlan,
  YesimSimInfo,
  YesimUserDetail,
  YesimUserResponse,
} from './yesim.types';

@Injectable()
export class YesimService {
  private readonly log = new Logger(YesimService.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {
    this.http = axios.create({
      timeout: 25_000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'PakTelStore/1.0 (+https://pak-tel.com)',
      },
    });
  }

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  async getRuntimeConfig(): Promise<{
    baseUrl: string;
    token: string | null;
    mockMode: boolean;
  }> {
    const settings = await this.prisma.getSettings();
    const baseUrl = (
      settings?.yesimBaseUrl ||
      this.config.get<string>('YESIM_BASE_URL') ||
      'https://partners-api.yesim.biz'
    ).replace(/\/+$/, '');
    const token =
      (settings?.yesimApiToken ?? this.config.get<string>('YESIM_API_TOKEN') ?? '').trim() ||
      null;
    const mockMode = Boolean(settings?.yesimMockMode) || !token;
    return { baseUrl, token, mockMode };
  }

  async generateQrDataUrl(lpaCode: string): Promise<string> {
    return QRCode.toDataURL(lpaCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320,
      color: { dark: '#071322', light: '#FFFFFF' },
    });
  }

  buildIosTapLink(lpaCode: string, existing?: string | null): string {
    if (existing && existing.startsWith('https://esimsetup.apple.com/')) {
      return existing;
    }
    return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpaCode)}`;
  }

  private randomDigits(len: number): string {
    let out = '';
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i++) {
      out += (bytes[i] % 10).toString();
    }
    return out;
  }

  private randomAlphaNumUpper(len: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) {
      out += chars[bytes[i] % chars.length];
    }
    return out;
  }

  private async resolvePlanMeta(planId?: string | null): Promise<{
    days: number;
    dataMb: number | null;
    isUnlimited: boolean;
  }> {
    if (!planId) return { days: 30, dataMb: null, isUnlimited: false };
    const bundleRows = await this.db
      .select()
      .from(schema.bundles)
      .where(eq(schema.bundles.yesimPlanId, planId));
    if (bundleRows[0]) {
      const b = bundleRows[0];
      return {
        days: b.validityDays,
        dataMb: b.isUnlimited || b.dataGb == null ? null : Math.round(b.dataGb * 1024 * 100) / 100,
        isUnlimited: b.isUnlimited,
      };
    }
    const seed = FALLBACK_YESIM_PLANS.find((p) => p.id === planId || p.old_id === planId);
    if (seed) {
      const isUnlim = /unlim/i.test(seed.data);
      const gb = isUnlim ? null : Number(seed.data);
      return {
        days: Number(seed.days) || 30,
        dataMb: gb && Number.isFinite(gb) ? Math.round(gb * 1024 * 100) / 100 : null,
        isUnlimited: isUnlim,
      };
    }
    return { days: 30, dataMb: 5120, isUnlimited: false };
  }

  private wrapError(endpoint: string, err: unknown): never {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const body = err.response?.data;
      const detail =
        typeof body === 'string'
          ? body
          : Array.isArray(body)
            ? body.join('; ')
            : body?.description || body?.message || err.message;
      this.log.error(`Yesim ${endpoint} failed (${status ?? 'ERR'}): ${detail}`);
      if (status === 400 || status === 404) {
        throw new BadRequestException(`Yesim error: ${detail}`);
      }
      throw new BadGatewayException(`Yesim upstream error on ${endpoint}: ${detail}`);
    }
    throw err;
  }

  // ===== 1. POST /new_user =====
  async createUser(email: string): Promise<YesimUserResponse> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const hashNum =
        (parseInt(crypto.createHash('md5').update(email.toLowerCase()).digest('hex').slice(0, 6), 16) %
          90000) +
        10000;
      return { user_id: String(hashNum), email };
    }
    try {
      const res = await this.http.post<YesimUserResponse>(`${baseUrl}/new_user`, '', {
        params: { email, token },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/new_user', err);
    }
  }

  // ===== 2. GET /new_esim =====
  async createEsim(params: {
    userId?: string;
    planId?: string;
    paymentId?: string;
  }): Promise<YesimSimInfo> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const iccid = `8948650000${this.randomDigits(9)}`;
      const qrcode = `LPA:1$smdp.io$K2-${this.randomAlphaNumUpper(6)}-${this.randomAlphaNumUpper(7)}`;
      const meta = await this.resolvePlanMeta(params.planId);
      const now = new Date();
      const expires = params.planId
        ? new Date(now.getTime() + meta.days * 86_400_000)
        : null;
      const qrImg = await this.generateQrDataUrl(qrcode);

      return {
        id: String(Math.floor(10000 + Math.random() * 89999)),
        iccid,
        user_id: params.userId ?? '20001',
        created_at: now.toISOString().replace('T', ' ').slice(0, 19),
        active_plan_id: params.planId ?? null,
        plan_activated_at: params.planId
          ? now.toISOString().replace('T', ' ').slice(0, 19)
          : null,
        plan_expired_at: expires
          ? expires.toISOString().replace('T', ' ').slice(0, 19)
          : null,
        qrcode,
        status_qr: 'Released',
        imsi: `26001018${this.randomDigits(7)}`,
        msisdn: null,
        is_deleted: '0',
        data_left_mb: meta.isUnlimited ? undefined : (meta.dataMb ?? undefined),
        data_package_mb: meta.isUnlimited ? undefined : (meta.dataMb ?? undefined),
        data_used_mb: 0,
        img: qrImg,
        ios_tap_link: this.buildIosTapLink(qrcode),
        esim_passport: `https://esimpass.cloud/paktel-${this.randomAlphaNumUpper(12)}`,
        is_voucher: false,
      };
    }

    try {
      const res = await this.http.get<YesimSimInfo>(`${baseUrl}/new_esim`, {
        params: {
          token,
          user_id: params.userId ?? '',
          ...(params.planId ? { plan_id: params.planId } : {}),
          ...(params.paymentId ? { payment_id: params.paymentId } : {}),
        },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/new_esim', err);
    }
  }

  // ===== 3. GET /plans =====
  async listPlans(params?: {
    planId?: string;
    filter?: 'country' | 'region';
    forceRefresh?: boolean;
  }): Promise<YesimPlan[]> {
    const cacheKey = `yesim:plans:${params?.planId ?? 'all'}:${params?.filter ?? 'all'}`;
    if (!params?.forceRefresh) {
      const cached = await this.cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      let list = [...FALLBACK_YESIM_PLANS];
      if (params?.planId) {
        list = list.filter((p) => p.id === params.planId || p.old_id === params.planId);
      }
      if (params?.filter) {
        list = list.filter((p) => p.plan_type === params.filter);
      }
      await this.cache.set(cacheKey, JSON.stringify(list), 600);
      return list;
    }

    try {
      const res = await this.http.get<YesimPlan[]>(`${baseUrl}/plans`, {
        params: {
          token,
          ...(params?.planId ? { plan_id: params.planId } : {}),
          ...(params?.filter ? { filter: params.filter } : {}),
        },
      });
      const data = Array.isArray(res.data) ? res.data : [];
      await this.cache.set(cacheKey, JSON.stringify(data), 1800);
      return data;
    } catch (err) {
      this.wrapError('/plans', err);
    }
  }

  // ===== 4. POST /add_plan_iccid =====
  async addPlanToIccid(params: {
    iccid: string;
    planId: string;
    paymentId?: string;
  }): Promise<{ status: string; description: string }> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const rows = await this.db
        .select()
        .from(schema.esims)
        .where(eq(schema.esims.iccid, params.iccid));
      const existing = rows[0];
      if (existing?.isDeleted) {
        throw new BadRequestException('Cannot activate plan on a replaced/deleted eSIM');
      }
      const meta = await this.resolvePlanMeta(params.planId);
      const now = new Date();
      const expires = new Date(now.getTime() + meta.days * 86_400_000);

      if (existing) {
        // Per Yesim docs: same plan_id accumulates data allowance; different plan_id replaces it.
        const samePlan = existing.activePlanId === params.planId && !meta.isUnlimited;
        const newLeftMb = meta.isUnlimited
          ? null
          : samePlan
            ? (existing.dataLeftMb ?? 0) + (meta.dataMb ?? 0)
            : meta.dataMb;
        const newPkgMb = meta.isUnlimited
          ? null
          : samePlan
            ? (existing.dataPackageMb ?? 0) + (meta.dataMb ?? 0)
            : meta.dataMb;

        await this.db
          .update(schema.esims)
          .set({
            activePlanId: params.planId,
            isUnlimited: meta.isUnlimited,
            dataLeftMb: newLeftMb,
            dataPackageMb: newPkgMb,
            dataUsedMb: samePlan ? existing.dataUsedMb : 0,
            planActivatedAt: now,
            planExpiredAt: expires,
            updatedAt: now,
          })
          .where(eq(schema.esims.id, existing.id));
      }
      return { status: 'success', description: 'OK' };
    }

    try {
      const res = await this.http.post<{ status: string; description: string }>(
        `${baseUrl}/add_plan_iccid`,
        '',
        {
          params: {
            iccid: params.iccid,
            plan_id: params.planId,
            ...(params.paymentId ? { payment_id: params.paymentId } : {}),
            token,
          },
        },
      );
      return res.data;
    } catch (err) {
      this.wrapError('/add_plan_iccid', err);
    }
  }

  // ===== 5. POST /cancel_plan =====
  async cancelPlan(iccid: string): Promise<unknown> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const rows = await this.db.select().from(schema.esims).where(eq(schema.esims.iccid, iccid));
      const esim = rows[0];
      if (!esim || !esim.activePlanId) {
        throw new BadRequestException(
          `The eSIM with iccid ${iccid} doesn't have an active plan.`,
        );
      }
      await this.db
        .update(schema.esims)
        .set({
          activePlanId: null,
          planActivatedAt: null,
          planExpiredAt: null,
          dataLeftMb: 0,
          dataPackageMb: 0,
          updatedAt: new Date(),
        })
        .where(eq(schema.esims.id, esim.id));
      return { status: 'success', description: 'Plan cancelled' };
    }

    try {
      const res = await this.http.post(`${baseUrl}/cancel_plan`, '', {
        params: { iccid, token },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/cancel_plan', err);
    }
  }

  // ===== 6. GET /sim_info =====
  async getSimInfo(iccid: string): Promise<YesimSimInfo> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const rows = await this.db.select().from(schema.esims).where(eq(schema.esims.iccid, iccid));
      const esim = rows[0];
      if (!esim) {
        throw new BadRequestException(`eSIM with ICCID ${iccid} not found`);
      }
      return {
        id: esim.yesimEsimId ?? esim.id.slice(0, 6),
        iccid: esim.iccid,
        user_id: esim.yesimUserId ?? null,
        created_at: esim.createdAt.toISOString().replace('T', ' ').slice(0, 19),
        active_plan_id: esim.activePlanId,
        plan_activated_at: esim.planActivatedAt
          ? esim.planActivatedAt.toISOString().replace('T', ' ').slice(0, 19)
          : null,
        plan_expired_at: esim.planExpiredAt
          ? esim.planExpiredAt.toISOString().replace('T', ' ').slice(0, 19)
          : null,
        qrcode: esim.activationCode,
        status_qr: esim.statusQr,
        imsi: esim.imsi,
        msisdn: esim.msisdn,
        is_deleted: esim.isDeleted ? '1' : '0',
        ...(esim.isUnlimited
          ? { data_used_mb: esim.dataUsedMb }
          : {
              data_left_mb: esim.dataLeftMb,
              data_package_mb: esim.dataPackageMb,
              data_used_mb: esim.dataUsedMb,
            }),
        img: esim.qrCodeDataUrl,
        networkinfo: (esim.networkInfo as YesimSimInfo['networkinfo']) ?? {
          time: new Date().toISOString().replace('T', ' ').slice(0, 19),
          lastMcc: 410,
          lastMnc: 1,
          lastRat: '4G - LTE',
        },
        ios_tap_link: esim.iosTapLink ?? this.buildIosTapLink(esim.activationCode),
        esim_passport: esim.esimPassport ?? undefined,
        is_voucher: esim.isVoucher,
        voucher_code: esim.voucherCode ?? undefined,
        voucher_status: esim.voucherStatus ?? undefined,
      };
    }

    try {
      const res = await this.http.get<YesimSimInfo>(`${baseUrl}/sim_info`, {
        params: { iccid, token },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/sim_info', err);
    }
  }

  // ===== 7. POST /bulk_sim_info =====
  async getBulkSimInfo(iccids: string[]): Promise<{ data: YesimSimInfo[] }> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      if (!iccids.length) return { data: [] };
      const rows = await this.db
        .select()
        .from(schema.esims)
        .where(inArray(schema.esims.iccid, iccids));
      const data: YesimSimInfo[] = [];
      for (const r of rows) {
        data.push(await this.getSimInfo(r.iccid));
      }
      return { data };
    }

    try {
      const res = await this.http.post<{ data: YesimSimInfo[] }>(
        `${baseUrl}/bulk_sim_info`,
        { iccids },
        { params: { token } },
      );
      return res.data;
    } catch (err) {
      this.wrapError('/bulk_sim_info', err);
    }
  }

  // ===== 8. GET /user =====
  async getUser(userId: string): Promise<YesimUserDetail> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const rows = await this.db
        .select()
        .from(schema.esims)
        .where(eq(schema.esims.yesimUserId, userId));
      const esims: YesimSimInfo[] = [];
      for (const r of rows) {
        esims.push(await this.getSimInfo(r.iccid));
      }
      return {
        id: userId,
        email: rows[0]?.customerEmail ?? 'user@pak-tel.com',
        created_at: new Date().toISOString(),
        esim_change_count: '0',
        esims,
      };
    }

    try {
      const res = await this.http.get<YesimUserDetail>(`${baseUrl}/user`, {
        params: { user_id: userId, token },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/user', err);
    }
  }

  // ===== 9. GET /orders =====
  async getOrders(search?: string): Promise<YesimOrderRecord[]> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      return [];
    }
    try {
      const res = await this.http.get<YesimOrderRecord[]>(`${baseUrl}/orders`, {
        params: { search: search ?? '', token },
      });
      return Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      this.wrapError('/orders', err);
    }
  }

  // ===== 10. POST /change_esim =====
  async changeEsim(iccid: string): Promise<YesimSimInfo> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const rows = await this.db.select().from(schema.esims).where(eq(schema.esims.iccid, iccid));
      const oldEsim = rows[0];
      if (!oldEsim) throw new BadRequestException(`eSIM ${iccid} not found`);
      if (oldEsim.isDeleted) throw new BadRequestException('eSIM is already deleted/replaced');
      if (oldEsim.replacementCount >= 3) {
        throw new BadRequestException('Maximum of 3 replacements reached for this eSIM');
      }

      const newIccid = `8948650000${this.randomDigits(9)}`;
      const qrcode = `LPA:1$smdp.io$K2-${this.randomAlphaNumUpper(6)}-${this.randomAlphaNumUpper(7)}`;
      const qrImg = await this.generateQrDataUrl(qrcode);
      const now = new Date();

      await this.db
        .update(schema.esims)
        .set({ isDeleted: true, statusQr: 'Deleted', updatedAt: now })
        .where(eq(schema.esims.id, oldEsim.id));

      return {
        id: String(Math.floor(10000 + Math.random() * 89999)),
        iccid: newIccid,
        user_id: oldEsim.yesimUserId,
        created_at: now.toISOString().replace('T', ' ').slice(0, 19),
        active_plan_id: oldEsim.activePlanId,
        plan_activated_at: oldEsim.activePlanId
          ? now.toISOString().replace('T', ' ').slice(0, 19)
          : null,
        plan_expired_at: oldEsim.planExpiredAt
          ? oldEsim.planExpiredAt.toISOString().replace('T', ' ').slice(0, 19)
          : null,
        qrcode,
        status_qr: 'Released',
        imsi: `26001018${this.randomDigits(7)}`,
        msisdn: null,
        is_deleted: '0',
        data_left_mb: oldEsim.dataLeftMb,
        data_package_mb: oldEsim.dataLeftMb,
        data_used_mb: 0,
        img: qrImg,
        ios_tap_link: this.buildIosTapLink(qrcode),
      };
    }

    try {
      const res = await this.http.post<YesimSimInfo>(`${baseUrl}/change_esim`, '', {
        params: { iccid, token },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/change_esim', err);
    }
  }

  // ===== 11. POST /set_notification_url =====
  async setNotificationUrl(url: string): Promise<{ status: string; url: string; mock: boolean }> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      return { status: 'OK', url, mock: true };
    }
    try {
      await this.http.post(`${baseUrl}/set_notification_url`, '', {
        params: { url, token },
      });
      return { status: 'OK', url, mock: false };
    } catch (err) {
      this.wrapError('/set_notification_url', err);
    }
  }

  // ===== 12. GET /supported_devices =====
  async getSupportedDevices(): Promise<YesimDeviceCategory[]> {
    const cacheKey = 'yesim:supported_devices';
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      await this.cache.set(cacheKey, JSON.stringify(FALLBACK_SUPPORTED_DEVICES), 86400);
      return FALLBACK_SUPPORTED_DEVICES;
    }

    try {
      const res = await this.http.get<YesimDeviceCategory[]>(`${baseUrl}/supported_devices`, {
        params: { token },
      });
      const data = Array.isArray(res.data) && res.data.length > 0
        ? res.data
        : FALLBACK_SUPPORTED_DEVICES;
      await this.cache.set(cacheKey, JSON.stringify(data), 86400);
      return data;
    } catch {
      return FALLBACK_SUPPORTED_DEVICES;
    }
  }

  // ===== 13. POST /issue_esim =====
  async issueBulkEsims(params: {
    planId: string;
    count: number;
    voucher?: 0 | 1;
    paymentId?: string;
  }): Promise<{ esims: YesimSimInfo[] }> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      const esims: YesimSimInfo[] = [];
      for (let i = 0; i < params.count; i++) {
        const created = await this.createEsim({
          planId: params.planId,
          paymentId: params.paymentId,
        });
        if (params.voucher === 1) {
          created.is_voucher = true;
          created.voucher_status = 'Available';
          created.voucher_code = this.randomAlphaNumUpper(8);
        }
        esims.push(created);
      }
      return { esims };
    }

    try {
      const res = await this.http.post<{ esims: YesimSimInfo[] }>(`${baseUrl}/issue_esim`, '', {
        params: {
          token,
          plan_id: params.planId,
          count: params.count,
          ...(params.voucher !== undefined ? { voucher: params.voucher } : {}),
          ...(params.paymentId ? { payment_id: params.paymentId } : {}),
        },
      });
      return res.data;
    } catch (err) {
      this.wrapError('/issue_esim', err);
    }
  }

  // ===== 14. GET /allowed_operators =====
  async getAllowedOperators(params?: {
    country?: string;
    tadig?: string;
    locationZone?: string;
  }): Promise<YesimAllowedOperator[]> {
    const cacheKey = `yesim:operators:${params?.country ?? 'all'}:${params?.tadig ?? ''}:${params?.locationZone ?? ''}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      let list = [...FALLBACK_ALLOWED_OPERATORS];
      if (params?.country) {
        const q = params.country.toLowerCase();
        list = list.filter((o) => o.country.toLowerCase().includes(q));
      }
      await this.cache.set(cacheKey, JSON.stringify(list), 86400);
      return list;
    }

    try {
      const res = await this.http.get<YesimAllowedOperator[]>(`${baseUrl}/allowed_operators`, {
        params: {
          token,
          ...(params?.country ? { country: params.country } : {}),
          ...(params?.tadig ? { tadig: params.tadig } : {}),
          ...(params?.locationZone ? { location_zone: params.locationZone } : {}),
        },
      });
      const data = Array.isArray(res.data) ? res.data : FALLBACK_ALLOWED_OPERATORS;
      await this.cache.set(cacheKey, JSON.stringify(data), 43200);
      return data;
    } catch {
      return FALLBACK_ALLOWED_OPERATORS;
    }
  }

  // ===== 15. GET /balance =====
  async getBalance(): Promise<YesimBalance> {
    const { baseUrl, token, mockMode } = await this.getRuntimeConfig();
    if (mockMode) {
      return { balance: 250.0, currency: 'EUR', mock: true };
    }
    try {
      const res = await this.http.get<{ balance: number; currency: string }>(
        `${baseUrl}/balance`,
        { params: { token } },
      );
      return {
        balance: Number(res.data.balance ?? 0),
        currency: res.data.currency ?? 'EUR',
        mock: false,
      };
    } catch (err) {
      this.wrapError('/balance', err);
    }
  }

  // ===== High-level Provisioning Helper =====
  async provisionSingleEsimWithPlan(params: {
    email: string;
    existingYesimUserId?: string | null;
    planId: string;
    paymentId: string;
  }): Promise<{
    yesimUserId: string;
    sim: YesimSimInfo;
    qrDataUrl: string;
    iosTapLink: string;
  }> {
    let yesimUserId = params.existingYesimUserId ?? null;
    if (!yesimUserId) {
      const u = await this.createUser(params.email);
      yesimUserId = u.user_id;
    }

    let sim = await this.createEsim({
      userId: yesimUserId,
      planId: params.planId,
      paymentId: params.paymentId,
    });

    // Some Yesim partner accounts require explicit /add_plan_iccid after /new_esim
    if (!sim.active_plan_id) {
      await this.addPlanToIccid({
        iccid: sim.iccid,
        planId: params.planId,
        paymentId: params.paymentId,
      });
      sim = await this.getSimInfo(sim.iccid);
    }

    const qrDataUrl = await this.generateQrDataUrl(sim.qrcode);
    const iosTapLink = this.buildIosTapLink(sim.qrcode, sim.ios_tap_link);

    return { yesimUserId, sim, qrDataUrl, iosTapLink };
  }
}
