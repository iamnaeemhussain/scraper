import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { eq, or } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { DpayService } from '../payments/dpay.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { ProvisioningService } from '../webhooks/provisioning.service';

export interface CreateTopUpInput {
  iccid?: string;
  esimId?: string;
  bundleId?: string;
  packageId?: string;
  customerEmail?: string;
  customerPhone?: string;
  successUrl?: string;
  cancelUrl?: string;
}

@Injectable()
export class TopUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dpay: DpayService,
    private readonly provisioning: ProvisioningService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  private generateReference(): string {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
    return `TOPUP-${ymd}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async createTopUp(
    dto: CreateTopUpInput,
    authUser?: { sub: string; email: string } | null,
    originHint?: string,
  ) {
    const bundleId = dto.bundleId || dto.packageId;
    if (!bundleId) {
      throw new BadRequestException('bundleId is required for top-up');
    }

    let esim: schema.EsimRow | undefined;
    if (dto.iccid) {
      const cleanIccid = dto.iccid.replace(/\s+/g, '').trim();
      const rows = await this.db
        .select()
        .from(schema.esims)
        .where(eq(schema.esims.iccid, cleanIccid));
      esim = rows[0];
    } else if (dto.esimId) {
      const rows = await this.db
        .select()
        .from(schema.esims)
        .where(eq(schema.esims.id, dto.esimId));
      esim = rows[0];
    }

    if (!esim) {
      throw new NotFoundException('Target eSIM not found');
    }
    if (esim.isDeleted) {
      throw new BadRequestException(
        'This eSIM has been replaced/deleted and cannot be reloaded',
      );
    }

    const bRows = await this.db
      .select()
      .from(schema.bundles)
      .where(eq(schema.bundles.id, bundleId));
    const bundle = bRows[0];
    if (!bundle || !bundle.isActive) {
      throw new NotFoundException('Selected reload bundle is unavailable');
    }
    if (!bundle.isReloadable) {
      throw new BadRequestException('Selected bundle does not support reload');
    }

    const amountPkr = Math.round(bundle.pricePkr);
    const amountPaisa = this.dpay.rupeesToPaisa(amountPkr);
    const reference = this.generateReference();
    const email = (
      dto.customerEmail ||
      authUser?.email ||
      esim.customerEmail ||
      ''
    )
      .trim()
      .toLowerCase();

    const inserted = await this.db
      .insert(schema.topUps)
      .values({
        reference,
        esimId: esim.id,
        iccid: esim.iccid,
        bundleId: bundle.id,
        bundleName: bundle.name,
        userId: authUser?.sub ?? esim.userId ?? null,
        customerEmail: email || null,
        amountPkr,
        amountPaisa,
        currency: 'PKR',
        status: 'PENDING_PAYMENT',
      })
      .returning();
    const topUp = inserted[0];

    const baseOrigin = (originHint || '').replace(/\/+$/, '');
    const successUrl =
      dto.successUrl ||
      `${baseOrigin || 'https://pak-tel.com'}/my-esim?iccid=${esim.iccid}&topup=${topUp.id}`;
    const cancelUrl =
      dto.cancelUrl ||
      `${baseOrigin || 'https://pak-tel.com'}/my-esim?iccid=${esim.iccid}`;

    const session = await this.dpay.createPaymentSession(
      {
        idempotencyKey: `topup:${topUp.id}`,
        amountPaisa,
        reference,
        description: `Pak-Tel Reload (${bundle.name}) for ICCID ${esim.iccid}`,
        successUrl,
        cancelUrl,
        customerEmail: email || undefined,
        customerPhone: dto.customerPhone || esim.customerPhone || undefined,
        expiresInSeconds: 1800,
        metadata: {
          topup_id: topUp.id,
          iccid: esim.iccid,
          kind: 'esim_topup',
        },
      },
      baseOrigin,
    );

    await this.db
      .update(schema.topUps)
      .set({
        dpaySessionId: session.id,
        dpayCheckoutUrl: session.checkout_url,
        payableAmountPaisa: session.payable_amount ?? amountPaisa,
        updatedAt: new Date(),
      })
      .where(eq(schema.topUps.id, topUp.id));

    return {
      id: topUp.id,
      reference,
      iccid: esim.iccid,
      bundleName: bundle.name,
      status: 'PENDING_PAYMENT',
      amountPkr,
      amountPaisa,
      payableAmountPaisa: session.payable_amount ?? amountPaisa,
      currency: 'PKR',
      dpaySessionId: session.id,
      checkoutUrl: session.checkout_url,
      expiresAt: session.expires_at,
    };
  }

  async getTopUpStatus(idOrRef: string) {
    const rows = await this.db
      .select()
      .from(schema.topUps)
      .where(
        or(
          eq(schema.topUps.id, idOrRef),
          eq(schema.topUps.reference, idOrRef),
        ),
      );
    let topUp = rows[0];
    if (!topUp) throw new NotFoundException('Top-up not found');

    if (topUp.status === 'PENDING_PAYMENT' && topUp.dpaySessionId) {
      try {
        const session = await this.dpay.getPaymentSession(topUp.dpaySessionId);
        if (session.status === 'succeeded') {
          await this.provisioning.fulfillTopUp(topUp.id, {
            session_id: session.id,
            reference: session.reference,
            amount_paid: session.amount_paid ?? session.payable_amount,
          });
          const refreshed = await this.db
            .select()
            .from(schema.topUps)
            .where(eq(schema.topUps.id, topUp.id));
          if (refreshed[0]) topUp = refreshed[0];
        }
      } catch {
        // Ignore transient upstream read errors
      }
    }

    return topUp;
  }
}
