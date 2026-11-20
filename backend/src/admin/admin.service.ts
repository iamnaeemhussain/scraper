import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { asc, desc, eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { DpayService } from '../payments/dpay.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { parseLpaParts, ProvisioningService } from '../webhooks/provisioning.service';
import { PAKTEL_REFERENCE_SHEET_BUNDLES } from '../yesim/yesim.catalog-seed';
import { YesimService } from '../yesim/yesim.service';
import { UpdateStoreSettingsDto, UpsertBundleDto } from './admin.dto';

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yesim: YesimService,
    private readonly dpay: DpayService,
    private readonly provisioning: ProvisioningService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  private computeDerivedBundleFields(
    dto: Partial<UpsertBundleDto>,
    defaultEurToPkr: number,
  ) {
    const pricePkr = Math.round(Number(dto.pricePkr ?? 0));
    const actualPricePkr =
      dto.actualPricePkr != null && Number(dto.actualPricePkr) > 0
        ? Math.round(Number(dto.actualPricePkr))
        : null;

    const priceDifferencePkr =
      dto.priceDifferencePkr !== undefined && dto.priceDifferencePkr !== null
        ? Math.round(Number(dto.priceDifferencePkr))
        : actualPricePkr != null && actualPricePkr > pricePkr
          ? actualPricePkr - pricePkr
          : 0;

    const discountPct =
      dto.discountPct !== undefined && dto.discountPct !== null
        ? Math.round(Number(dto.discountPct))
        : actualPricePkr != null && actualPricePkr > pricePkr
          ? Math.round(((actualPricePkr - pricePkr) / actualPricePkr) * 100)
          : 0;

    const eurToPkr =
      dto.eurToPkr != null && Number(dto.eurToPkr) > 0
        ? Number(dto.eurToPkr)
        : defaultEurToPkr;

    const costEur =
      dto.costEur != null && Number(dto.costEur) >= 0 ? Number(dto.costEur) : null;

    const costPkr =
      dto.costPkr != null && Number(dto.costPkr) >= 0
        ? Math.round(Number(dto.costPkr) * 100) / 100
        : costEur != null
          ? Math.round(costEur * eurToPkr * 100) / 100
          : null;

    const commissionPkr =
      dto.commissionPkr != null
        ? Math.round(Number(dto.commissionPkr) * 100) / 100
        : costPkr != null
          ? Math.round((pricePkr - costPkr) * 100) / 100
          : null;

    const isUnlimited =
      dto.isUnlimited ?? /unlim/i.test(dto.dataLabel || '');

    let dataGb: number | null =
      dto.dataGb !== undefined ? dto.dataGb : null;
    if (!isUnlimited && dataGb == null && dto.dataLabel) {
      const m = dto.dataLabel.match(/(\d+(?:\.\d+)?)/);
      if (m) dataGb = Number(m[1]);
    }
    if (isUnlimited) dataGb = null;

    return {
      pricePkr,
      actualPricePkr,
      priceDifferencePkr,
      discountPct,
      eurToPkr,
      costEur,
      costPkr,
      commissionPkr,
      isUnlimited,
      dataGb,
    };
  }

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    const clean = slugify(base) || `plan-${crypto.randomBytes(3).toString('hex')}`;
    let candidate = clean;
    let suffix = 1;
    while (true) {
      const existing = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.slug, candidate));
      if (!existing[0] || existing[0].id === excludeId) {
        return candidate;
      }
      suffix++;
      candidate = `${clean}-${suffix}`;
    }
  }

  // ===== Bundles CRUD (Manual Management) =====
  async listAllBundles() {
    return this.db
      .select()
      .from(schema.bundles)
      .orderBy(asc(schema.bundles.sortOrder), asc(schema.bundles.pricePkr));
  }

  async createBundle(dto: UpsertBundleDto) {
    if (!dto.name?.trim()) throw new BadRequestException('Plan Name is required');
    if (!dto.yesimPlanId?.trim()) throw new BadRequestException('Yesim Plan ID is required');

    const settings = await this.prisma.getSettings();
    const defaultFx = settings?.eurToPkrRate ?? 303.8602;
    const derived = this.computeDerivedBundleFields(dto, defaultFx);
    const slug = await this.ensureUniqueSlug(dto.slug || dto.name);

    const inserted = await this.db
      .insert(schema.bundles)
      .values({
        name: dto.name.trim(),
        slug,
        pricePkr: derived.pricePkr,
        actualPricePkr: derived.actualPricePkr,
        discountPct: derived.discountPct,
        priceDifferencePkr: derived.priceDifferencePkr,
        costPkr: derived.costPkr,
        costEur: derived.costEur,
        commissionPkr: derived.commissionPkr,
        eurToPkr: derived.eurToPkr,
        dataLabel: dto.dataLabel.trim(),
        dataGb: derived.dataGb,
        isUnlimited: derived.isUnlimited,
        validityDays: dto.validityDays,
        isReloadable: dto.isReloadable ?? true,
        isMostPopular: dto.isMostPopular ?? false,
        countryCode: (dto.countryCode || 'PK').toUpperCase(),
        countryName: dto.countryName || 'Pakistan',
        coverageType: dto.coverageType || '5G/4G/LTE',
        planType: dto.planType || 'Data only',
        hotspotAllowed: dto.hotspotAllowed ?? true,
        activationType: dto.activationType || 'Instant',
        operators: dto.operators ?? 'Jazz 4G / Local LTE',
        yesimPlanId: dto.yesimPlanId.trim(),
        contact: dto.contact ?? settings?.whatsappContact ?? '3259717066',
        message: dto.message ?? null,
        sortOrder: dto.sortOrder ?? 100,
        isActive: dto.isActive ?? true,
      })
      .returning();

    return inserted[0];
  }

  async updateBundle(id: string, dto: Partial<UpsertBundleDto>) {
    const rows = await this.db
      .select()
      .from(schema.bundles)
      .where(eq(schema.bundles.id, id));
    const current = rows[0];
    if (!current) throw new NotFoundException('Bundle not found');

    const settings = await this.prisma.getSettings();
    const merged: UpsertBundleDto = {
      name: dto.name ?? current.name,
      slug: dto.slug ?? current.slug,
      pricePkr: dto.pricePkr ?? current.pricePkr,
      actualPricePkr:
        dto.actualPricePkr !== undefined ? dto.actualPricePkr : current.actualPricePkr,
      discountPct: dto.discountPct,
      priceDifferencePkr: dto.priceDifferencePkr,
      costPkr: dto.costPkr !== undefined ? dto.costPkr : current.costPkr,
      costEur: dto.costEur !== undefined ? dto.costEur : current.costEur,
      commissionPkr: dto.commissionPkr,
      eurToPkr: dto.eurToPkr !== undefined ? dto.eurToPkr : current.eurToPkr,
      dataLabel: dto.dataLabel ?? current.dataLabel,
      dataGb: dto.dataGb !== undefined ? dto.dataGb : current.dataGb,
      isUnlimited: dto.isUnlimited ?? current.isUnlimited,
      validityDays: dto.validityDays ?? current.validityDays,
      isReloadable: dto.isReloadable ?? current.isReloadable,
      isMostPopular: dto.isMostPopular ?? current.isMostPopular,
      countryCode: dto.countryCode ?? current.countryCode,
      countryName: dto.countryName ?? current.countryName,
      coverageType: dto.coverageType ?? current.coverageType,
      planType: dto.planType ?? current.planType,
      hotspotAllowed: dto.hotspotAllowed ?? current.hotspotAllowed,
      activationType: dto.activationType ?? current.activationType,
      operators: dto.operators !== undefined ? dto.operators : current.operators,
      yesimPlanId: dto.yesimPlanId ?? current.yesimPlanId,
      contact: dto.contact !== undefined ? dto.contact : current.contact,
      message: dto.message !== undefined ? dto.message : current.message,
      sortOrder: dto.sortOrder ?? current.sortOrder,
      isActive: dto.isActive ?? current.isActive,
    };

    const derived = this.computeDerivedBundleFields(
      merged,
      settings?.eurToPkrRate ?? 303.8602,
    );
    const slug = dto.slug
      ? await this.ensureUniqueSlug(dto.slug, id)
      : current.slug;

    const updated = await this.db
      .update(schema.bundles)
      .set({
        name: merged.name.trim(),
        slug,
        pricePkr: derived.pricePkr,
        actualPricePkr: derived.actualPricePkr,
        discountPct: derived.discountPct,
        priceDifferencePkr: derived.priceDifferencePkr,
        costPkr: derived.costPkr,
        costEur: derived.costEur,
        commissionPkr: derived.commissionPkr,
        eurToPkr: derived.eurToPkr,
        dataLabel: merged.dataLabel.trim(),
        dataGb: derived.dataGb,
        isUnlimited: derived.isUnlimited,
        validityDays: merged.validityDays,
        isReloadable: merged.isReloadable,
        isMostPopular: merged.isMostPopular,
        countryCode: (merged.countryCode || 'PK').toUpperCase(),
        countryName: merged.countryName || 'Pakistan',
        coverageType: merged.coverageType || '5G/4G/LTE',
        planType: merged.planType || 'Data only',
        hotspotAllowed: merged.hotspotAllowed,
        activationType: merged.activationType || 'Instant',
        operators: merged.operators,
        yesimPlanId: merged.yesimPlanId.trim(),
        contact: merged.contact,
        message: merged.message,
        sortOrder: merged.sortOrder,
        isActive: merged.isActive,
        updatedAt: new Date(),
      })
      .where(eq(schema.bundles.id, id))
      .returning();

    return updated[0];
  }

  async deleteBundle(id: string) {
    const rows = await this.db
      .select()
      .from(schema.bundles)
      .where(eq(schema.bundles.id, id));
    if (!rows[0]) throw new NotFoundException('Bundle not found');
    await this.db.delete(schema.bundles).where(eq(schema.bundles.id, id));
    return { deleted: true, id };
  }

  async recalculateFx(eurToPkr: number) {
    if (!Number.isFinite(eurToPkr) || eurToPkr <= 0) {
      throw new BadRequestException('Provide a positive EUR to PKR rate');
    }
    await this.db
      .update(schema.storeSettings)
      .set({ eurToPkrRate: eurToPkr, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, 'default'));

    const all = await this.db.select().from(schema.bundles);
    let updatedCount = 0;
    for (const b of all) {
      const costPkr =
        b.costEur != null
          ? Math.round(b.costEur * eurToPkr * 100) / 100
          : b.costPkr;
      const commissionPkr =
        costPkr != null
          ? Math.round((b.pricePkr - costPkr) * 100) / 100
          : b.commissionPkr;
      await this.db
        .update(schema.bundles)
        .set({
          eurToPkr,
          costPkr,
          commissionPkr,
          updatedAt: new Date(),
        })
        .where(eq(schema.bundles.id, b.id));
      updatedCount++;
    }
    return { eurToPkr, updatedBundles: updatedCount };
  }

  async importReferenceSheetBundles() {
    let created = 0;
    let skipped = 0;
    for (const tpl of PAKTEL_REFERENCE_SHEET_BUNDLES) {
      const existing = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.yesimPlanId, tpl.yesimPlanId));
      if (existing[0]) {
        skipped++;
        continue;
      }
      await this.createBundle({
        name: tpl.name,
        pricePkr: tpl.pricePkr,
        actualPricePkr: tpl.actualPricePkr,
        discountPct: tpl.discountPct,
        priceDifferencePkr: tpl.priceDifferencePkr,
        costPkr: tpl.costPkr,
        costEur: tpl.costEur,
        commissionPkr: tpl.commissionPkr,
        eurToPkr: tpl.eurToPkr,
        dataLabel: tpl.dataLabel,
        dataGb: tpl.dataGb,
        isUnlimited: tpl.isUnlimited,
        validityDays: tpl.validityDays,
        isReloadable: tpl.isReloadable,
        isMostPopular: tpl.isMostPopular,
        countryCode: 'PK',
        countryName: 'Pakistan',
        coverageType: '5G/4G/LTE',
        planType: 'Data only',
        hotspotAllowed: true,
        activationType: 'Instant',
        operators: 'Jazz (Mobilink) Pakistan',
        yesimPlanId: tpl.yesimPlanId,
        contact: tpl.contact,
        message: tpl.message || null,
        sortOrder: tpl.sortOrder,
        isActive: true,
      });
      created++;
    }
    return { created, skipped, totalTemplates: PAKTEL_REFERENCE_SHEET_BUNDLES.length };
  }

  // ===== Dashboard & Analytics =====
  async getDashboard() {
    const [bundles, orders, esims, topUps, yesimBalance, dpayStatus] =
      await Promise.all([
        this.db.select().from(schema.bundles),
        this.db.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)),
        this.db.select().from(schema.esims).orderBy(desc(schema.esims.createdAt)),
        this.db.select().from(schema.topUps).orderBy(desc(schema.topUps.createdAt)),
        this.yesim.getBalance().catch(() => ({ balance: 0, currency: 'EUR', mock: true })),
        this.dpay.getHealthAndMerchant(),
      ]);

    const paidOrders = orders.filter((o) => o.status === 'PROVISIONED');
    const completedTopUps = topUps.filter((t) => t.status === 'COMPLETED');

    const orderRevenuePkr = paidOrders.reduce((acc, o) => acc + o.amountPkr, 0);
    const topUpRevenuePkr = completedTopUps.reduce((acc, t) => acc + t.amountPkr, 0);
    const totalRevenuePkr = orderRevenuePkr + topUpRevenuePkr;

    // Estimate commission from bundle margins on provisioned items
    const bundleMap = new Map(bundles.map((b) => [b.id, b]));
    let estimatedCommissionPkr = 0;
    const allItems = await this.db.select().from(schema.orderItems);
    const paidOrderIds = new Set(paidOrders.map((o) => o.id));
    for (const it of allItems) {
      if (paidOrderIds.has(it.orderId) && it.bundleId) {
        const b = bundleMap.get(it.bundleId);
        if (b?.commissionPkr != null) {
          estimatedCommissionPkr += b.commissionPkr * it.quantity;
        }
      }
    }
    for (const t of completedTopUps) {
      const b = bundleMap.get(t.bundleId);
      if (b?.commissionPkr != null) {
        estimatedCommissionPkr += b.commissionPkr;
      }
    }

    return {
      metrics: {
        totalRevenuePkr,
        orderRevenuePkr,
        topUpRevenuePkr,
        estimatedCommissionPkr: Math.round(estimatedCommissionPkr),
        totalBundles: bundles.length,
        activeBundles: bundles.filter((b) => b.isActive).length,
        totalOrders: orders.length,
        provisionedOrders: paidOrders.length,
        pendingOrders: orders.filter((o) => o.status === 'PENDING_PAYMENT').length,
        failedOrders: orders.filter((o) => o.status === 'FAILED' || o.status === 'AMBIGUOUS')
          .length,
        totalEsims: esims.length,
        activeEsims: esims.filter((e) => !e.isDeleted && Boolean(e.activePlanId)).length,
        completedTopUps: completedTopUps.length,
      },
      yesim: yesimBalance,
      dpay: dpayStatus,
      recentOrders: orders.slice(0, 8),
      recentEsims: esims.slice(0, 8),
    };
  }

  // ===== Orders Management =====
  async listOrders(status?: string) {
    const orders = status
      ? await this.db
          .select()
          .from(schema.orders)
          .where(eq(schema.orders.status, status))
          .orderBy(desc(schema.orders.createdAt))
      : await this.db
          .select()
          .from(schema.orders)
          .orderBy(desc(schema.orders.createdAt));

    const results = [];
    for (const o of orders) {
      const [items, esims] = await Promise.all([
        this.db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, o.id)),
        this.db.select().from(schema.esims).where(eq(schema.esims.orderId, o.id)),
      ]);
      results.push({ ...o, items, esims });
    }
    return results;
  }

  async retryOrderProvisioning(orderId: string) {
    return this.provisioning.fulfillOrder(orderId);
  }

  async verifyOrderDpay(orderId: string, externalPaymentRef: string) {
    const rows = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    const order = rows[0];
    if (!order || !order.dpaySessionId) {
      throw new BadRequestException('Order has no DPay session');
    }
    const verified = await this.dpay.verifyPaymentSession(
      order.dpaySessionId,
      externalPaymentRef,
    );
    if (verified.status === 'succeeded') {
      await this.provisioning.fulfillOrder(order.id, {
        session_id: verified.id,
        reference: verified.reference,
        amount_paid: verified.amount_paid ?? verified.payable_amount,
      });
    }
    return verified;
  }

  async cancelOrderDpay(orderId: string) {
    const rows = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    const order = rows[0];
    if (!order || !order.dpaySessionId) {
      throw new BadRequestException('Order has no DPay session');
    }
    const canceled = await this.dpay.cancelPaymentSession(order.dpaySessionId);
    await this.db
      .update(schema.orders)
      .set({ status: 'CANCELED', updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));
    return canceled;
  }

  async refundOrderDpay(orderId: string, reason?: string) {
    const rows = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId));
    const order = rows[0];
    if (!order || !order.dpaySessionId) {
      throw new BadRequestException('Order has no DPay session');
    }
    const res = await this.dpay.refundPaymentSession(order.dpaySessionId, reason);
    await this.db
      .update(schema.orders)
      .set({ status: 'REFUNDED', updatedAt: new Date() })
      .where(eq(schema.orders.id, order.id));
    return res;
  }

  // ===== eSIM Lifecycle & Yesim Actions =====
  async listEsims(search?: string) {
    const all = await this.db
      .select()
      .from(schema.esims)
      .orderBy(desc(schema.esims.createdAt));
    if (!search?.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter(
      (e) =>
        e.iccid.toLowerCase().includes(q) ||
        (e.customerEmail || '').toLowerCase().includes(q) ||
        (e.voucherCode || '').toLowerCase().includes(q),
    );
  }

  async syncEsim(id: string) {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.id, id));
    if (!rows[0]) throw new NotFoundException('eSIM not found');
    return this.provisioning.syncEsimFromYesim(rows[0].iccid);
  }

  async addPlanToEsim(id: string, planId: string) {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.id, id));
    const esim = rows[0];
    if (!esim) throw new NotFoundException('eSIM not found');
    await this.yesim.addPlanToIccid({
      iccid: esim.iccid,
      planId,
      paymentId: `ADMIN-${Date.now()}`,
    });
    return this.provisioning.syncEsimFromYesim(esim.iccid);
  }

  async cancelEsimPlan(id: string) {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.id, id));
    const esim = rows[0];
    if (!esim) throw new NotFoundException('eSIM not found');
    await this.yesim.cancelPlan(esim.iccid);
    return this.provisioning.syncEsimFromYesim(esim.iccid);
  }

  async replaceEsim(id: string) {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.id, id));
    const oldEsim = rows[0];
    if (!oldEsim) throw new NotFoundException('eSIM not found');
    if (oldEsim.replacementCount >= 3) {
      throw new BadRequestException('Maximum of 3 replacements allowed per Yesim policy');
    }

    const newSim = await this.yesim.changeEsim(oldEsim.iccid);
    const qrDataUrl = await this.yesim.generateQrDataUrl(newSim.qrcode);
    const iosTapLink = this.yesim.buildIosTapLink(newSim.qrcode, newSim.ios_tap_link);
    const { smdpAddress, matchingId } = parseLpaParts(newSim.qrcode);

    await this.db
      .update(schema.esims)
      .set({
        isDeleted: true,
        statusQr: 'Deleted',
        updatedAt: new Date(),
      })
      .where(eq(schema.esims.id, oldEsim.id));

    const inserted = await this.db
      .insert(schema.esims)
      .values({
        userId: oldEsim.userId,
        customerEmail: oldEsim.customerEmail,
        customerPhone: oldEsim.customerPhone,
        orderId: oldEsim.orderId,
        orderItemId: oldEsim.orderItemId,
        bundleId: oldEsim.bundleId,
        yesimEsimId: String(newSim.id ?? ''),
        yesimUserId: newSim.user_id ?? oldEsim.yesimUserId,
        iccid: newSim.iccid,
        imsi: newSim.imsi ?? null,
        msisdn: newSim.msisdn ?? null,
        activationCode: newSim.qrcode,
        smdpAddress,
        matchingId,
        qrCodeDataUrl: qrDataUrl,
        iosTapLink,
        statusQr: newSim.status_qr || 'Released',
        activePlanId: newSim.active_plan_id ?? oldEsim.activePlanId,
        isDeleted: false,
        replacementCount: oldEsim.replacementCount + 1,
        replacedFromId: oldEsim.id,
        dataLeftMb: newSim.data_left_mb ?? oldEsim.dataLeftMb,
        dataPackageMb: newSim.data_package_mb ?? oldEsim.dataPackageMb,
        dataUsedMb: newSim.data_used_mb ?? 0,
        isUnlimited: oldEsim.isUnlimited,
        planActivatedAt: oldEsim.planActivatedAt,
        planExpiredAt: oldEsim.planExpiredAt,
      })
      .returning();

    return inserted[0];
  }

  async issueBulkEsims(params: {
    planId: string;
    count: number;
    voucher?: boolean;
  }) {
    if (params.count < 1 || params.count > 50) {
      throw new BadRequestException('Bulk count must be between 1 and 50');
    }
    const res = await this.yesim.issueBulkEsims({
      planId: params.planId,
      count: params.count,
      voucher: params.voucher ? 1 : 0,
      paymentId: `BULK-${Date.now()}`,
    });

    const bRows = await this.db
      .select()
      .from(schema.bundles)
      .where(eq(schema.bundles.yesimPlanId, params.planId));
    const matchedBundle = bRows[0];

    const saved = [];
    for (const sim of res.esims || []) {
      const qrDataUrl = await this.yesim.generateQrDataUrl(sim.qrcode);
      const iosTapLink = this.yesim.buildIosTapLink(sim.qrcode, sim.ios_tap_link);
      const { smdpAddress, matchingId } = parseLpaParts(sim.qrcode);
      const rows = await this.db
        .insert(schema.esims)
        .values({
          bundleId: matchedBundle?.id ?? null,
          yesimEsimId: String(sim.id ?? ''),
          yesimUserId: sim.user_id ?? null,
          iccid: sim.iccid,
          imsi: sim.imsi ?? null,
          msisdn: sim.msisdn ?? null,
          activationCode: sim.qrcode,
          smdpAddress,
          matchingId,
          qrCodeDataUrl: qrDataUrl,
          iosTapLink,
          statusQr: sim.status_qr || 'Released',
          activePlanId: sim.active_plan_id ?? params.planId,
          dataLeftMb: sim.data_left_mb ?? null,
          dataPackageMb: sim.data_package_mb ?? null,
          dataUsedMb: Number(sim.data_used_mb ?? 0),
          isUnlimited: matchedBundle?.isUnlimited ?? false,
          isVoucher: Boolean(sim.is_voucher || params.voucher),
          voucherCode: sim.voucher_code ?? null,
          voucherStatus: sim.voucher_status ?? (params.voucher ? 'Available' : null),
        })
        .returning();
      saved.push(rows[0]);
    }
    return { issuedCount: saved.length, esims: saved };
  }

  // ===== Settings & Webhooks =====
  private maskSecret(secret?: string | null): string | null {
    if (!secret) return null;
    if (secret.length <= 8) return '••••••••';
    return `${secret.slice(0, 6)}••••••${secret.slice(-4)}`;
  }

  async getSettingsMasked() {
    const s = await this.prisma.getSettings();
    if (!s) return null;
    return {
      ...s,
      announcementTicker: s.announcementBanner,
      whatsappNumber: s.whatsappContact,
      defaultEurToPkr: s.eurToPkrRate,
      yesimApiToken: this.maskSecret(s.yesimApiToken),
      hasYesimToken: Boolean(s.yesimApiToken),
      dpayApiKey: this.maskSecret(s.dpayApiKey),
      hasDpayApiKey: Boolean(s.dpayApiKey),
      dpayWebhookSecret: this.maskSecret(s.dpayWebhookSecret),
      hasDpayWebhookSecret: Boolean(s.dpayWebhookSecret),
    };
  }

  async updateSettings(dto: UpdateStoreSettingsDto) {
    const current = await this.prisma.getSettings();
    const patch: Partial<typeof schema.storeSettings.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (dto.storeName !== undefined) patch.storeName = dto.storeName;
    if (dto.tagline !== undefined) patch.tagline = dto.tagline;
    if (dto.announcementTicker !== undefined)
      patch.announcementBanner = dto.announcementTicker;
    if (dto.whatsappNumber !== undefined) patch.whatsappContact = dto.whatsappNumber;
    if (dto.supportEmail !== undefined) patch.supportEmail = dto.supportEmail;
    if (dto.defaultEurToPkr !== undefined) patch.eurToPkrRate = dto.defaultEurToPkr;
    if (dto.coverageEmbedUrl !== undefined) patch.coverageEmbedUrl = dto.coverageEmbedUrl;
    if (dto.yesimBaseUrl !== undefined) patch.yesimBaseUrl = dto.yesimBaseUrl;
    if (dto.yesimMockMode !== undefined) patch.yesimMockMode = dto.yesimMockMode;
    if (dto.dpayBaseUrl !== undefined) patch.dpayBaseUrl = dto.dpayBaseUrl;
    if (dto.dpayMockMode !== undefined) patch.dpayMockMode = dto.dpayMockMode;

    // Only overwrite secrets if a new non-masked value is supplied
    if (dto.yesimApiToken !== undefined && !dto.yesimApiToken.includes('••••')) {
      patch.yesimApiToken = dto.yesimApiToken.trim() || null;
    }
    if (dto.dpayApiKey !== undefined && !dto.dpayApiKey.includes('••••')) {
      patch.dpayApiKey = dto.dpayApiKey.trim() || null;
    }
    if (dto.dpayWebhookSecret !== undefined && !dto.dpayWebhookSecret.includes('••••')) {
      patch.dpayWebhookSecret = dto.dpayWebhookSecret.trim() || null;
    }

    if (!current) {
      await this.db.insert(schema.storeSettings).values({ id: 'default', ...patch });
    } else {
      await this.db
        .update(schema.storeSettings)
        .set(patch)
        .where(eq(schema.storeSettings.id, 'default'));
    }

    return this.getSettingsMasked();
  }

  async registerDpayWebhook(url: string) {
    const res = await this.dpay.registerWebhookEndpoint({ url });
    if (res.secret) {
      await this.db
        .update(schema.storeSettings)
        .set({ dpayWebhookSecret: res.secret, updatedAt: new Date() })
        .where(eq(schema.storeSettings.id, 'default'));
    }
    return {
      id: res.id,
      url: res.url,
      events: res.events,
      mock: res.mock,
      secretSaved: Boolean(res.secret),
    };
  }

  async registerYesimWebhook(url: string) {
    const res = await this.yesim.setNotificationUrl(url);
    await this.db
      .update(schema.storeSettings)
      .set({ yesimWebhookUrl: url, updatedAt: new Date() })
      .where(eq(schema.storeSettings.id, 'default'));
    return res;
  }

  async listWebhookEvents() {
    return this.db
      .select()
      .from(schema.webhookEvents)
      .orderBy(desc(schema.webhookEvents.receivedAt))
      .limit(100);
  }
}
