import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { MailerService } from '../mailer/mailer.service';
import { FcmService } from '../notifications/fcm.service';
import type { DpayWebhookPayload } from '../payments/dpay.types';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { CacheService } from '../queue/queue.module';
import { YesimService } from '../yesim/yesim.service';

export function parseLpaParts(lpa: string): {
  smdpAddress: string | null;
  matchingId: string | null;
} {
  // Standard LPA string format: LPA:1$<smdpAddress>$<matchingId>
  if (lpa && lpa.startsWith('LPA:1$')) {
    const parts = lpa.split('$');
    return {
      smdpAddress: parts[1] || null,
      matchingId: parts[2] || null,
    };
  }
  return { smdpAddress: null, matchingId: null };
}

@Injectable()
export class ProvisioningService {
  private readonly log = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly yesim: YesimService,
    private readonly cache: CacheService,
    private readonly mailer: MailerService,
    private readonly fcm: FcmService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  async fulfillOrder(
    orderId: string,
    paymentData?: DpayWebhookPayload['data'],
  ): Promise<{ status: string; esimsProvisioned: number }> {
    const lockKey = `fulfill:order:${orderId}`;
    const acquired = await this.cache.acquireLock(lockKey, 90);
    if (!acquired) {
      return { status: 'LOCKED_IN_PROGRESS', esimsProvisioned: 0 };
    }

    try {
      const orderRows = await this.db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.id, orderId));
      const order = orderRows[0];
      if (!order) {
        this.log.warn(`fulfillOrder: order ${orderId} not found`);
        return { status: 'NOT_FOUND', esimsProvisioned: 0 };
      }

      if (order.status === 'PROVISIONED') {
        return { status: 'ALREADY_PROVISIONED', esimsProvisioned: 0 };
      }

      const now = new Date();
      await this.db
        .update(schema.orders)
        .set({
          status: 'PROVISIONING',
          paidAt: order.paidAt ?? now,
          amountPaidPaisa:
            paymentData?.amount_paid ?? order.payableAmountPaisa ?? order.amountPaisa,
          payerAccountNumber:
            paymentData?.payer_account_number ?? order.payerAccountNumber,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(schema.orders.id, order.id));

      // Resolve or create Yesim sub-user
      let existingYesimUserId: string | null = null;
      if (order.userId) {
        const uRows = await this.db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, order.userId));
        existingYesimUserId = uRows[0]?.yesimUserId ?? null;
      }

      const items = await this.db
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, order.id));

      let provisionedCount = 0;

      for (const item of items) {
        const existingEsims = await this.db
          .select()
          .from(schema.esims)
          .where(eq(schema.esims.orderItemId, item.id));

        const needed = Math.max(0, item.quantity - existingEsims.length);
        let bundleRow: schema.BundleRow | undefined;
        if (item.bundleId) {
          const bRows = await this.db
            .select()
            .from(schema.bundles)
            .where(eq(schema.bundles.id, item.bundleId));
          bundleRow = bRows[0];
        }

        for (let idx = 0; idx < needed; idx++) {
          const paymentRef =
            item.quantity > 1
              ? `${order.orderNumber}-${idx + 1}`
              : order.orderNumber;

          const result = await this.yesim.provisionSingleEsimWithPlan({
            email: order.customerEmail,
            existingYesimUserId,
            planId: item.yesimPlanId,
            paymentId: paymentRef,
          });

          existingYesimUserId = result.yesimUserId;
          if (order.userId && existingYesimUserId) {
            await this.db
              .update(schema.users)
              .set({ yesimUserId: existingYesimUserId, updatedAt: new Date() })
              .where(eq(schema.users.id, order.userId));
          }

          const { smdpAddress, matchingId } = parseLpaParts(result.sim.qrcode);
          const isUnlimited =
            Boolean(bundleRow?.isUnlimited) ||
            (result.sim.data_left_mb === undefined && result.sim.data_package_mb === undefined);

          await this.db.insert(schema.esims).values({
            userId: order.userId,
            customerEmail: order.customerEmail.toLowerCase(),
            customerPhone: order.customerPhone,
            orderId: order.id,
            orderItemId: item.id,
            bundleId: item.bundleId,
            yesimEsimId: String(result.sim.id ?? ''),
            yesimUserId: result.yesimUserId,
            iccid: result.sim.iccid,
            imsi: result.sim.imsi ?? null,
            msisdn: result.sim.msisdn ?? null,
            activationCode: result.sim.qrcode,
            smdpAddress,
            matchingId,
            qrCodeDataUrl: result.qrDataUrl,
            flagImageUrl:
              result.sim.img && !result.sim.img.startsWith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAU')
                ? result.sim.img
                : null,
            iosTapLink: result.iosTapLink,
            esimPassport: result.sim.esim_passport ?? null,
            statusQr: result.sim.status_qr || 'Released',
            activePlanId: result.sim.active_plan_id ?? item.yesimPlanId,
            isDeleted: result.sim.is_deleted === '1',
            dataLeftMb:
              typeof result.sim.data_left_mb === 'number'
                ? result.sim.data_left_mb
                : isUnlimited
                  ? null
                  : (bundleRow?.dataGb ?? 0) * 1024,
            dataPackageMb:
              typeof result.sim.data_package_mb === 'number'
                ? result.sim.data_package_mb
                : isUnlimited
                  ? null
                  : (bundleRow?.dataGb ?? 0) * 1024,
            dataUsedMb: Number(result.sim.data_used_mb ?? 0),
            isUnlimited,
            planActivatedAt: result.sim.plan_activated_at
              ? new Date(result.sim.plan_activated_at.replace(' ', 'T') + 'Z')
              : new Date(),
            planExpiredAt: result.sim.plan_expired_at
              ? new Date(result.sim.plan_expired_at.replace(' ', 'T') + 'Z')
              : new Date(Date.now() + item.validityDays * 86_400_000),
          });

          provisionedCount++;

          await this.mailer.sendEsimReadyEmail({
            to: order.customerEmail,
            orderNumber: order.orderNumber,
            planName: item.bundleName,
            iccid: result.sim.iccid,
            activationCode: result.sim.qrcode,
            iosTapLink: result.iosTapLink,
          });
        }
      }

      await this.db
        .update(schema.orders)
        .set({
          status: 'PROVISIONED',
          provisionedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, order.id));

      if (order.userId) {
        await this.fcm.sendToUser(
          order.userId,
          'Your Pak-Tel eSIM is Ready!',
          `Order ${order.orderNumber} has been activated. Tap to install your eSIM.`,
          { orderId: order.id, orderNumber: order.orderNumber },
        );
      }

      return { status: 'PROVISIONED', esimsProvisioned: provisionedCount };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Order ${orderId} provisioning failed: ${msg}`);
      await this.db
        .update(schema.orders)
        .set({
          status: 'FAILED',
          lastError: msg,
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, orderId));
      throw err;
    } finally {
      await this.cache.releaseLock(lockKey);
    }
  }

  async fulfillTopUp(
    topUpId: string,
    paymentData?: DpayWebhookPayload['data'],
  ): Promise<{ status: string }> {
    const lockKey = `fulfill:topup:${topUpId}`;
    const acquired = await this.cache.acquireLock(lockKey, 60);
    if (!acquired) return { status: 'LOCKED_IN_PROGRESS' };

    try {
      const topUpRows = await this.db
        .select()
        .from(schema.topUps)
        .where(eq(schema.topUps.id, topUpId));
      const topUp = topUpRows[0];
      if (!topUp) return { status: 'NOT_FOUND' };
      if (topUp.status === 'COMPLETED') return { status: 'ALREADY_COMPLETED' };

      const esimRows = await this.db
        .select()
        .from(schema.esims)
        .where(eq(schema.esims.id, topUp.esimId));
      const esim = esimRows[0];
      if (!esim || esim.isDeleted) {
        throw new Error('Target eSIM not found or has been replaced');
      }

      const bundleRows = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.id, topUp.bundleId));
      const bundle = bundleRows[0];
      if (!bundle) {
        throw new Error('Top-up bundle no longer exists');
      }

      await this.db
        .update(schema.topUps)
        .set({
          status: 'PROVISIONING',
          amountPaidPaisa:
            paymentData?.amount_paid ?? topUp.payableAmountPaisa ?? topUp.amountPaisa,
          updatedAt: new Date(),
        })
        .where(eq(schema.topUps.id, topUp.id));

      await this.yesim.addPlanToIccid({
        iccid: esim.iccid,
        planId: bundle.yesimPlanId,
        paymentId: topUp.reference,
      });

      // Refresh live sim_info and persist updated allowance
      await this.syncEsimFromYesim(esim.iccid);

      await this.db
        .update(schema.topUps)
        .set({
          status: 'COMPLETED',
          completedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.topUps.id, topUp.id));

      const recipient = topUp.customerEmail || esim.customerEmail;
      if (recipient) {
        await this.mailer.sendTopUpCompletedEmail({
          to: recipient,
          iccid: esim.iccid,
          planName: bundle.name,
        });
      }

      if (esim.userId) {
        await this.fcm.sendToUser(
          esim.userId,
          'eSIM Reloaded!',
          `${bundle.name} added to ICCID ${esim.iccid}.`,
          { iccid: esim.iccid },
        );
      }

      return { status: 'COMPLETED' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`TopUp ${topUpId} failed: ${msg}`);
      await this.db
        .update(schema.topUps)
        .set({
          status: 'FAILED',
          lastError: msg,
          updatedAt: new Date(),
        })
        .where(eq(schema.topUps.id, topUpId));
      throw err;
    } finally {
      await this.cache.releaseLock(lockKey);
    }
  }

  async syncEsimFromYesim(iccid: string): Promise<schema.EsimRow | null> {
    const rows = await this.db
      .select()
      .from(schema.esims)
      .where(eq(schema.esims.iccid, iccid));
    const local = rows[0];
    if (!local) return null;

    try {
      const remote = await this.yesim.getSimInfo(iccid);
      const isUnlimited =
        local.isUnlimited ||
        (remote.data_left_mb === undefined && remote.data_package_mb === undefined && Boolean(remote.active_plan_id));

      const updatedRows = await this.db
        .update(schema.esims)
        .set({
          activePlanId: remote.active_plan_id ?? null,
          statusQr: remote.status_qr || local.statusQr,
          isDeleted: remote.is_deleted === '1' || local.isDeleted,
          imsi: remote.imsi ?? local.imsi,
          msisdn: remote.msisdn ?? local.msisdn,
          dataLeftMb:
            typeof remote.data_left_mb === 'number' ? remote.data_left_mb : local.dataLeftMb,
          dataPackageMb:
            typeof remote.data_package_mb === 'number'
              ? remote.data_package_mb
              : local.dataPackageMb,
          dataUsedMb:
            typeof remote.data_used_mb === 'number' ? remote.data_used_mb : local.dataUsedMb,
          isUnlimited,
          planActivatedAt: remote.plan_activated_at
            ? new Date(remote.plan_activated_at.replace(' ', 'T') + 'Z')
            : local.planActivatedAt,
          planExpiredAt: remote.plan_expired_at
            ? new Date(remote.plan_expired_at.replace(' ', 'T') + 'Z')
            : local.planExpiredAt,
          networkInfo: (remote.networkinfo as Record<string, unknown>) ?? local.networkInfo,
          updatedAt: new Date(),
        })
        .where(eq(schema.esims.id, local.id))
        .returning();

      return updatedRows[0] ?? local;
    } catch (err) {
      this.log.warn(`syncEsimFromYesim(${iccid}) skipped: ${(err as Error).message}`);
      return local;
    }
  }
}
