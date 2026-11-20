import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { CatalogService } from '../catalog/catalog.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { ProvisioningService } from '../webhooks/provisioning.service';

@Injectable()
export class EsimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
    private readonly catalog: CatalogService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  async listMyEsims(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.userId, userId))
      .orderBy(desc(schema.esims.createdAt));

    const enriched = [];
    for (const r of rows) {
      let bundleName: string | null = null;
      if (r.bundleId) {
        const bRows = await this.db
          .select()
          .from(schema.bundles)
          .where(eq(schema.bundles.id, r.bundleId));
        bundleName = bRows[0]?.name ?? null;
      }
      enriched.push({ ...r, bundleName });
    }
    return enriched;
  }

  async getEsimById(
    id: string,
    authUser?: { sub: string; role?: string } | null,
    refreshLive = false,
  ) {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.id, id));
    let esim = rows[0];
    if (!esim) throw new NotFoundException('eSIM not found');

    if (authUser?.role !== 'ADMIN' && esim.userId !== authUser?.sub) {
      throw new ForbiddenException('You do not own this eSIM');
    }

    if (refreshLive) {
      const synced = await this.provisioning.syncEsimFromYesim(esim.iccid);
      if (synced) esim = synced;
    }

    let bundle: schema.BundleRow | undefined;
    if (esim.bundleId) {
      const bRows = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.id, esim.bundleId));
      bundle = bRows[0];
    }

    const topUps = await this.db
      .select()
      .from(schema.topUps)
      .where(eq(schema.topUps.esimId, esim.id))
      .orderBy(desc(schema.topUps.createdAt));

    return {
      ...esim,
      bundleName: bundle?.name ?? null,
      countryCode: bundle?.countryCode ?? 'PK',
      countryName: bundle?.countryName ?? 'Pakistan',
      topUps,
    };
  }

  /**
   * Public ICCID Self-Service Lookup (replaces my.pak-tel.com).
   */
  async lookupByIccid(rawIccid: string) {
    const iccid = (rawIccid || '').replace(/\s+/g, '').trim();
    if (!/^\d{15,22}$/.test(iccid)) {
      throw new BadRequestException(
        'Enter a valid 19–20 digit ICCID number (digits only)',
      );
    }

    const synced = await this.provisioning.syncEsimFromYesim(iccid);
    if (!synced) {
      throw new NotFoundException(`No Pak-Tel eSIM found with ICCID ${iccid}`);
    }

    let activeBundle: schema.BundleRow | undefined;
    if (synced.activePlanId) {
      const bRows = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.yesimPlanId, synced.activePlanId));
      activeBundle = bRows[0];
    }
    if (!activeBundle && synced.bundleId) {
      const bRows = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.id, synced.bundleId));
      activeBundle = bRows[0];
    }

    const topUps = await this.db
      .select()
      .from(schema.topUps)
      .where(eq(schema.topUps.iccid, iccid))
      .orderBy(desc(schema.topUps.createdAt));

    const reloadableBundles = await this.catalog.listPublicBundles({
      reloadable: 'true',
      country: activeBundle?.countryCode,
    });

    return {
      id: synced.id,
      iccid: synced.iccid,
      statusQr: synced.statusQr,
      isDeleted: synced.isDeleted,
      activePlanId: synced.activePlanId,
      activePlanName: activeBundle?.name ?? (synced.activePlanId ? 'Active Data Plan' : 'No Active Plan'),
      countryCode: activeBundle?.countryCode ?? 'PK',
      countryName: activeBundle?.countryName ?? 'Pakistan',
      isUnlimited: synced.isUnlimited,
      dataLeftMb: synced.dataLeftMb,
      dataPackageMb: synced.dataPackageMb,
      dataUsedMb: synced.dataUsedMb,
      planActivatedAt: synced.planActivatedAt,
      planExpiredAt: synced.planExpiredAt,
      activationCode: synced.activationCode,
      smdpAddress: synced.smdpAddress,
      matchingId: synced.matchingId,
      qrCodeDataUrl: synced.qrCodeDataUrl,
      iosTapLink: synced.iosTapLink,
      esimPassport: synced.esimPassport,
      networkInfo: synced.networkInfo,
      createdAt: synced.createdAt,
      topUpHistory: topUps.map((t) => ({
        id: t.id,
        reference: t.reference,
        bundleName: t.bundleName,
        amountPkr: t.amountPkr,
        status: t.status,
        completedAt: t.completedAt,
        createdAt: t.createdAt,
      })),
      reloadableBundles,
    };
  }
}
