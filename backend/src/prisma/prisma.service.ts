import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PGlite } from '@electric-sql/pglite';
import * as bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, PgliteDatabase } from 'drizzle-orm/pglite';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import * as schema from './schema';
import { BOOTSTRAP_SQL } from './schema';
import { PAKTEL_REFERENCE_SHEET_BUNDLES } from '../yesim/yesim.catalog-seed';

export type AppDatabase = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);
  private pool?: Pool;
  private pglite?: PGlite;
  public db!: AppDatabase;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const dbUrl = (this.config.get<string>('DATABASE_URL') ?? '').trim();
    const isTest = this.config.get<string>('NODE_ENV') === 'test';

    if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
      this.log.log('Connecting to PostgreSQL via pg.Pool...');
      this.pool = new Pool({ connectionString: dbUrl });
      this.db = drizzlePg(this.pool, { schema });
      await this.pool.query(BOOTSTRAP_SQL);
    } else {
      const useMemory = isTest || dbUrl === 'memory' || dbUrl === ':memory:';
      if (useMemory) {
        this.log.log('Starting embedded PostgreSQL (PGlite in-memory)...');
        this.pglite = new PGlite();
      } else {
        const dataDir = dbUrl.startsWith('pglite://')
          ? dbUrl.slice('pglite://'.length)
          : path.resolve(process.cwd(), 'data', 'pglite');
        fs.mkdirSync(path.dirname(dataDir), { recursive: true });
        this.log.log(`Starting embedded PostgreSQL (PGlite persistent at ${dataDir})...`);
        this.pglite = new PGlite(dataDir);
      }
      await this.pglite.waitReady;
      this.db = drizzlePglite(this.pglite, { schema });
      await this.pglite.exec(BOOTSTRAP_SQL);
    }

    await this.ensureBootstrapData();
  }

  private async ensureBootstrapData(): Promise<void> {
    const existingSettings = await (this.db as PgliteDatabase<typeof schema>)
      .select()
      .from(schema.storeSettings)
      .where(eq(schema.storeSettings.id, 'default'));

    if (existingSettings.length === 0) {
      const yesimToken = (this.config.get<string>('YESIM_API_TOKEN') ?? '').trim() || null;
      const dpayKey = (this.config.get<string>('DPAY_API_KEY') ?? '').trim() || null;
      const dpaySecret = (this.config.get<string>('DPAY_WEBHOOK_SECRET') ?? '').trim() || null;
      const dpayOutlet = (this.config.get<string>('DPAY_OUTLET') ?? '').trim() || null;

      await (this.db as PgliteDatabase<typeof schema>).insert(schema.storeSettings).values({
        id: 'default',
        storeName: this.config.get<string>('STORE_NAME') ?? 'Pak-Tel',
        tagline:
          this.config.get<string>('STORE_TAGLINE') ??
          "Pakistan's Cheapest Data eSIM Provider",
        announcementBanner:
          this.config.get<string>('STORE_ANNOUNCEMENT') ??
          "Welcome to Pak-tel.com 📱 PTA Blocked Phone? Need mobile data? 🌐 Contact us and stay connected! 🚀 📲 Pak-tel | Pakistan's Cheapest Data eSIM Provider 🇵🇰📶",
        whatsappContact: this.config.get<string>('WHATSAPP_CONTACT') ?? '923259717066',
        supportEmail: this.config.get<string>('SUPPORT_EMAIL') ?? 'support@pak-tel.com',
        eurToPkrRate: Number(this.config.get<string>('EUR_TO_PKR_RATE') ?? '303.8602'),
        coverageEmbedUrl:
          this.config.get<string>('COVERAGE_EMBED_URL') ?? 'https://coverage.yesim.biz/embed',
        yesimBaseUrl:
          this.config.get<string>('YESIM_BASE_URL') ?? 'https://partners-api.yesim.biz',
        yesimApiToken: yesimToken,
        yesimMockMode:
          this.config.get<string>('YESIM_MOCK_MODE') === 'true' || !yesimToken,
        dpayBaseUrl:
          this.config.get<string>('DPAY_BASE_URL') ?? 'https://api.dpay.com.pk/v1',
        dpayApiKey: dpayKey,
        dpayWebhookSecret: dpaySecret ?? 'whsec_paktel_sandbox_secret_2026',
        dpayOutlet,
        dpayMockMode:
          this.config.get<string>('DPAY_MOCK_MODE') === 'true' || !dpayKey,
      });
    }

    const admins = await (this.db as PgliteDatabase<typeof schema>)
      .select()
      .from(schema.users)
      .where(eq(schema.users.role, 'ADMIN'));

    if (admins.length === 0) {
      const adminEmail = (
        this.config.get<string>('ADMIN_EMAIL') ?? 'admin@pak-tel.com'
      ).toLowerCase();
      const adminPassword =
        this.config.get<string>('ADMIN_PASSWORD') ?? 'PakTelAdmin2026!';
      const passwordHash = await bcrypt.hash(adminPassword, 10);

      const existingByEmail = await (this.db as PgliteDatabase<typeof schema>)
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, adminEmail));

      if (existingByEmail.length > 0) {
        await (this.db as PgliteDatabase<typeof schema>)
          .update(schema.users)
          .set({ role: 'ADMIN', updatedAt: new Date() })
          .where(eq(schema.users.id, existingByEmail[0].id));
      } else {
        await (this.db as PgliteDatabase<typeof schema>).insert(schema.users).values({
          id: uuidv4(),
          email: adminEmail,
          name: 'Pak-Tel Admin',
          role: 'ADMIN',
          passwordHash,
          emailVerifiedAt: new Date(),
          locale: 'en',
        });
      }
      if (!this.config.get<string>('ADMIN_PASSWORD')) {
        this.log.warn(
          `Bootstrap admin created (${adminEmail}) with default setup password. Set ADMIN_PASSWORD in .env for production.`,
        );
      }
    }

    // Optional initial catalog seed on fresh DB when SEED_REFERENCE_BUNDLES=true
    if (this.config.get<string>('SEED_REFERENCE_BUNDLES') === 'true') {
      const existingBundles = await (this.db as PgliteDatabase<typeof schema>)
        .select()
        .from(schema.bundles);
      if (existingBundles.length === 0) {
        for (const tpl of PAKTEL_REFERENCE_SHEET_BUNDLES) {
          const slug = tpl.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          await (this.db as PgliteDatabase<typeof schema>).insert(schema.bundles).values({
            id: uuidv4(),
            slug,
            name: tpl.name,
            yesimPlanId: tpl.yesimPlanId,
            pricePkr: tpl.pricePkr,
            actualPricePkr: tpl.actualPricePkr,
            discountPct: tpl.discountPct,
            priceDifferencePkr: tpl.priceDifferencePkr,
            dataLabel: tpl.dataLabel,
            dataGb: tpl.dataGb,
            isUnlimited: tpl.isUnlimited,
            validityDays: tpl.validityDays,
            isReloadable: tpl.isReloadable,
            isMostPopular: tpl.isMostPopular,
            costPkr: tpl.costPkr,
            costEur: tpl.costEur,
            eurToPkr: tpl.eurToPkr,
            commissionPkr: tpl.commissionPkr,
            contact: tpl.contact,
            message: tpl.message || null,
            countryCode: 'PK',
            countryName: 'Pakistan',
            coverageType: '5G/4G/LTE',
            operators: 'Jazz (Mobilink) Pakistan',
            planType: 'Data only',
            hotspotAllowed: true,
            activationType: 'Instant',
            sortOrder: tpl.sortOrder,
            isActive: true,
          });
        }
        this.log.log(
          `Seeded ${PAKTEL_REFERENCE_SHEET_BUNDLES.length} Pak-Tel reference bundles into empty catalog.`,
        );
      }
    }
  }

  async ping(): Promise<void> {
    await (this.db as PgliteDatabase<typeof schema>).execute(sql`SELECT 1`);
  }

  async getSettings() {
    const rows = await (this.db as PgliteDatabase<typeof schema>)
      .select()
      .from(schema.storeSettings)
      .where(eq(schema.storeSettings.id, 'default'));
    return rows[0];
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
    if (this.pglite) {
      await this.pglite.close();
    }
  }
}
