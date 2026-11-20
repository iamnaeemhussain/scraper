import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { YesimService } from '../yesim/yesim.service';

export interface PublicBundleDto {
  id: string;
  name: string;
  slug: string;
  pricePkr: number;
  actualPricePkr: number | null;
  discountPct: number | null;
  priceDifferencePkr: number | null;
  currency: 'PKR';
  dataLabel: string;
  dataGb: number | null;
  isUnlimited: boolean;
  validityDays: number;
  isReloadable: boolean;
  isMostPopular: boolean;
  countryCode: string;
  countryName: string;
  coverageType: string;
  planType: string;
  hotspotAllowed: boolean;
  activationType: string;
  operators: string | null;
  yesimPlanId: string;
  contact: string | null;
  message: string | null;
  sortOrder: number;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly yesim: YesimService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  toPublicBundle(b: schema.BundleRow): PublicBundleDto {
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      pricePkr: b.pricePkr,
      actualPricePkr: b.actualPricePkr,
      discountPct: b.discountPct,
      priceDifferencePkr: b.priceDifferencePkr,
      currency: 'PKR',
      dataLabel: b.dataLabel,
      dataGb: b.dataGb,
      isUnlimited: b.isUnlimited,
      validityDays: b.validityDays,
      isReloadable: b.isReloadable,
      isMostPopular: b.isMostPopular,
      countryCode: b.countryCode,
      countryName: b.countryName,
      coverageType: b.coverageType,
      planType: b.planType,
      hotspotAllowed: b.hotspotAllowed,
      activationType: b.activationType,
      operators: b.operators,
      yesimPlanId: b.yesimPlanId,
      contact: b.contact,
      message: b.message,
      sortOrder: b.sortOrder,
    };
  }

  async getStoreConfig() {
    const s = await this.prisma.getSettings();
    return {
      storeName: s?.storeName ?? 'Pak-Tel',
      tagline: s?.tagline ?? "Pakistan's Cheapest Data eSIM Provider",
      announcementTicker:
        s?.announcementBanner ??
        "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
      whatsappNumber: s?.whatsappContact ?? '923259717066',
      supportEmail: s?.supportEmail ?? 'support@pak-tel.com',
      coverageEmbedUrl: s?.coverageEmbedUrl ?? 'https://coverage.yesim.biz/embed',
      currency: 'PKR' as const,
      paymentGateway: 'DPay',
      esimProvider: 'Yesim',
    };
  }

  async listPublicBundles(query?: {
    country?: string;
    category?: string;
    sort?: string;
    reloadable?: string;
    q?: string;
  }): Promise<PublicBundleDto[]> {
    const conditions = [eq(schema.bundles.isActive, true)];
    if (query?.country) {
      conditions.push(eq(schema.bundles.countryCode, query.country.toUpperCase()));
    }
    if (query?.reloadable === 'true') {
      conditions.push(eq(schema.bundles.isReloadable, true));
    }

    const rows = await this.db
      .select()
      .from(schema.bundles)
      .where(and(...conditions))
      .orderBy(asc(schema.bundles.sortOrder), asc(schema.bundles.pricePkr));

    let filtered = rows;

    if (query?.q) {
      const q = query.q.trim().toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.dataLabel.toLowerCase().includes(q) ||
          b.countryName.toLowerCase().includes(q),
      );
    }

    if (query?.category && query.category !== 'all') {
      switch (query.category) {
        case 'under1':
          filtered = filtered.filter((b) => !b.isUnlimited && (b.dataGb ?? 0) < 1);
          break;
        case '1to5':
          filtered = filtered.filter(
            (b) => !b.isUnlimited && (b.dataGb ?? 0) >= 1 && (b.dataGb ?? 0) <= 5,
          );
          break;
        case '5to10':
          filtered = filtered.filter(
            (b) => !b.isUnlimited && (b.dataGb ?? 0) > 5 && (b.dataGb ?? 0) <= 10,
          );
          break;
        case '10plus':
          filtered = filtered.filter(
            (b) => b.isUnlimited || (b.dataGb ?? 0) > 10,
          );
          break;
        case 'unlimited':
          filtered = filtered.filter((b) => b.isUnlimited);
          break;
      }
    }

    if (query?.sort === 'price_asc') {
      filtered = [...filtered].sort((a, b) => a.pricePkr - b.pricePkr);
    } else if (query?.sort === 'price_desc') {
      filtered = [...filtered].sort((a, b) => b.pricePkr - a.pricePkr);
    } else if (query?.sort === 'data_desc') {
      filtered = [...filtered].sort((a, b) => {
        const da = a.isUnlimited ? 999999 : (a.dataGb ?? 0);
        const dbVal = b.isUnlimited ? 999999 : (b.dataGb ?? 0);
        return dbVal - da;
      });
    } else {
      // recommended: sortOrder asc, then isMostPopular desc, then price asc
      filtered = [...filtered].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        if (a.isMostPopular !== b.isMostPopular) return a.isMostPopular ? -1 : 1;
        return a.pricePkr - b.pricePkr;
      });
    }

    return filtered.map((r) => this.toPublicBundle(r));
  }

  async getPublicBundleById(id: string): Promise<PublicBundleDto> {
    const rows = await this.db
      .select()
      .from(schema.bundles)
      .where(and(eq(schema.bundles.id, id), eq(schema.bundles.isActive, true)));
    const row = rows[0];
    if (!row) throw new NotFoundException('Bundle not found');
    return this.toPublicBundle(row);
  }

  // Mobile-client compatibility adapters (/api/regions & /api/packages)
  async listRegionsForMobile() {
    const bundles = await this.listPublicBundles();
    const map = new Map<
      string,
      { id: string; code: string; name: string; type: 'country' | 'regional'; minPricePkr: number }
    >();
    for (const b of bundles) {
      const existing = map.get(b.countryCode);
      if (!existing || b.pricePkr < existing.minPricePkr) {
        map.set(b.countryCode, {
          id: b.countryCode,
          code: b.countryCode,
          name: b.countryName,
          type: b.countryCode.length === 2 ? 'country' : 'regional',
          minPricePkr: b.pricePkr,
        });
      }
    }
    if (map.size === 0) {
      map.set('PK', {
        id: 'PK',
        code: 'PK',
        name: 'Pakistan',
        type: 'country',
        minPricePkr: 0,
      });
    }
    return Array.from(map.values());
  }

  async listPackagesForMobile(region?: string, q?: string) {
    const bundles = await this.listPublicBundles({ country: region, q });
    return bundles.map((b) => ({
      id: b.id,
      provider: 'yesim',
      providerCode: b.yesimPlanId,
      name: b.name,
      regionCode: b.countryCode,
      regionName: b.countryName,
      dataBytes: b.isUnlimited ? '-1' : String(Math.round((b.dataGb ?? 0) * 1024 * 1024 * 1024)),
      dataLabel: b.dataLabel,
      isUnlimited: b.isUnlimited,
      validityDays: b.validityDays,
      priceCents: b.pricePkr * 100, // paisa
      pricePkr: b.pricePkr,
      actualPricePkr: b.actualPricePkr,
      discountPct: b.discountPct,
      isMostPopular: b.isMostPopular,
      isReloadable: b.isReloadable,
      currency: 'PKR',
    }));
  }

  async getDevices() {
    return this.yesim.getSupportedDevices();
  }

  async getOperators(country?: string) {
    return this.yesim.getAllowedOperators(country ? { country } : undefined);
  }
}
