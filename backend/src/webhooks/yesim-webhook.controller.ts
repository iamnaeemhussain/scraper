import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import * as crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { FcmService } from '../notifications/fcm.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';

interface YesimWebhookPayload {
  event_type:
    | 'EsimStatus'
    | 'PackageUsage'
    | 'EsimExpirationWarning'
    | 'EsimExpired'
    | string;
  event_timestamp?: string;
  data?: {
    iccid?: string;
    status?: string;
    packageId?: string;
    unitsAfter?: number; // bytes per Yesim docs
    unitsBefore?: number;
    thresholdPercentage?: number;
    expirationTimestamp?: string;
  };
}

@Controller('webhooks')
export class YesimWebhookController {
  private readonly log = new Logger(YesimWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  @Post('yesim')
  @HttpCode(200)
  async handleYesimWebhook(@Body() body: YesimWebhookPayload) {
    const iccid = body?.data?.iccid ?? '';
    const eventType = body?.event_type ?? 'Unknown';
    const ts = body?.event_timestamp ?? new Date().toISOString();
    const externalId = crypto
      .createHash('sha256')
      .update(`${eventType}:${iccid}:${ts}:${body?.data?.thresholdPercentage ?? ''}:${body?.data?.status ?? ''}`)
      .digest('hex')
      .slice(0, 32);

    const dup = await this.db
      .select()
      .from(schema.webhookEvents)
      .where(
        and(
          eq(schema.webhookEvents.source, 'yesim'),
          eq(schema.webhookEvents.externalId, externalId),
        ),
      );
    if (dup[0]) {
      return { received: true, duplicate: true };
    }

    const inserted = await this.db
      .insert(schema.webhookEvents)
      .values({
        source: 'yesim',
        externalId,
        eventType,
        payloadJson: (body ?? {}) as unknown as Record<string, unknown>,
      })
      .returning();

    if (iccid) {
      const esimRows = await this.db
        .select()
        .from(schema.esims)
        .where(eq(schema.esims.iccid, iccid));
      const esim = esimRows[0];

      if (esim) {
        if (eventType === 'EsimStatus' && body.data?.status) {
          await this.db
            .update(schema.esims)
            .set({
              statusQr: body.data.status,
              isDeleted: body.data.status === 'Deleted' ? true : esim.isDeleted,
              updatedAt: new Date(),
            })
            .where(eq(schema.esims.id, esim.id));
        } else if (eventType === 'PackageUsage') {
          // Yesim reports unitsAfter in bytes
          const leftMb =
            typeof body.data?.unitsAfter === 'number'
              ? Math.round((body.data.unitsAfter / (1024 * 1024)) * 100) / 100
              : esim.dataLeftMb;
          const usedMb =
            esim.dataPackageMb != null && leftMb != null
              ? Math.max(0, Math.round((esim.dataPackageMb - leftMb) * 100) / 100)
              : esim.dataUsedMb;

          await this.db
            .update(schema.esims)
            .set({
              dataLeftMb: leftMb,
              dataUsedMb: usedMb,
              updatedAt: new Date(),
            })
            .where(eq(schema.esims.id, esim.id));

          if (esim.userId && body.data?.thresholdPercentage) {
            await this.fcm.sendToUser(
              esim.userId,
              `Data Usage Alert (${body.data.thresholdPercentage}%)`,
              `Your eSIM (${iccid}) has used ${body.data.thresholdPercentage}% of its data package.`,
              { iccid },
            );
          }
        } else if (eventType === 'EsimExpirationWarning') {
          if (esim.userId) {
            await this.fcm.sendToUser(
              esim.userId,
              'eSIM Expiring Soon',
              `Your Pak-Tel plan on ICCID ${iccid} is approaching expiration. Top up anytime!`,
              { iccid },
            );
          }
        } else if (eventType === 'EsimExpired') {
          await this.db
            .update(schema.esims)
            .set({
              activePlanId: null,
              dataLeftMb: 0,
              updatedAt: new Date(),
            })
            .where(eq(schema.esims.id, esim.id));
        }
      }
    }

    await this.db
      .update(schema.webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(schema.webhookEvents.id, inserted[0].id));

    return { received: true };
  }
}
