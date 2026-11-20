import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import type { Request } from 'express';
import { DpayService } from '../payments/dpay.service';
import type { DpayWebhookPayload } from '../payments/dpay.types';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { ProvisioningService } from './provisioning.service';

@Controller('webhooks')
export class DpayWebhookController {
  private readonly log = new Logger(DpayWebhookController.name);

  constructor(
    private readonly dpay: DpayService,
    private readonly prisma: PrismaService,
    private readonly provisioning: ProvisioningService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  @Post('dpay')
  @HttpCode(200)
  async handleDpayWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('dpay-signature') signature?: string,
    @Headers('dpay-event-id') headerEventId?: string,
  ) {
    const rawBody: Buffer | string =
      req.rawBody ??
      (Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
          ? req.body
          : JSON.stringify(req.body ?? {}));

    const verification = await this.dpay.verifyWebhookSignature(rawBody, signature);
    if (!verification.valid || !verification.payload) {
      this.log.warn(`Rejected DPay webhook: ${verification.reason}`);
      throw new BadRequestException(verification.reason || 'Invalid DPay-Signature');
    }

    const payload = verification.payload;
    const externalId = headerEventId || payload.id;
    if (!externalId) {
      throw new BadRequestException('Missing DPay event ID');
    }

    // Deduplicate by (source='dpay', externalId)
    const existing = await this.db
      .select()
      .from(schema.webhookEvents)
      .where(
        and(
          eq(schema.webhookEvents.source, 'dpay'),
          eq(schema.webhookEvents.externalId, externalId),
        ),
      );
    if (existing[0]) {
      return { received: true, duplicate: true };
    }

    const inserted = await this.db
      .insert(schema.webhookEvents)
      .values({
        source: 'dpay',
        externalId,
        eventType: payload.type,
        payloadJson: payload as unknown as Record<string, unknown>,
      })
      .returning();
    const webhookLogId = inserted[0].id;

    try {
      await this.processEvent(payload);
      await this.db
        .update(schema.webhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(schema.webhookEvents.id, webhookLogId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.db
        .update(schema.webhookEvents)
        .set({ error: msg })
        .where(eq(schema.webhookEvents.id, webhookLogId));
      throw err;
    }

    return { received: true };
  }

  async processEvent(payload: DpayWebhookPayload): Promise<void> {
    if (payload.type === 'test.ping') {
      return;
    }

    const sessionId = payload.data?.session_id;
    const reference = payload.data?.reference;

    // Resolve matching Order or TopUp
    let order: schema.OrderRow | undefined;
    if (sessionId) {
      const rows = await this.db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.dpaySessionId, sessionId));
      order = rows[0];
    }
    if (!order && reference) {
      const rows = await this.db
        .select()
        .from(schema.orders)
        .where(eq(schema.orders.orderNumber, reference));
      order = rows[0];
    }

    let topUp: schema.TopUpRow | undefined;
    if (!order && sessionId) {
      const rows = await this.db
        .select()
        .from(schema.topUps)
        .where(eq(schema.topUps.dpaySessionId, sessionId));
      topUp = rows[0];
    }
    if (!order && !topUp && reference) {
      const rows = await this.db
        .select()
        .from(schema.topUps)
        .where(eq(schema.topUps.reference, reference));
      topUp = rows[0];
    }

    switch (payload.type) {
      case 'payment.succeeded': {
        if (order) {
          await this.provisioning.fulfillOrder(order.id, payload.data);
        } else if (topUp) {
          await this.provisioning.fulfillTopUp(topUp.id, payload.data);
        }
        break;
      }

      case 'payment.failed': {
        if (order && order.status === 'PENDING_PAYMENT') {
          await this.db
            .update(schema.orders)
            .set({
              status: 'FAILED',
              lastError: payload.data?.failure_reason ?? 'DPay payment failed',
              updatedAt: new Date(),
            })
            .where(eq(schema.orders.id, order.id));
        } else if (topUp && topUp.status === 'PENDING_PAYMENT') {
          await this.db
            .update(schema.topUps)
            .set({
              status: 'FAILED',
              lastError: payload.data?.failure_reason ?? 'DPay payment failed',
              updatedAt: new Date(),
            })
            .where(eq(schema.topUps.id, topUp.id));
        }
        break;
      }

      case 'payment.expired': {
        if (order && order.status === 'PENDING_PAYMENT') {
          await this.db
            .update(schema.orders)
            .set({ status: 'EXPIRED', updatedAt: new Date() })
            .where(eq(schema.orders.id, order.id));
        } else if (topUp && topUp.status === 'PENDING_PAYMENT') {
          await this.db
            .update(schema.topUps)
            .set({ status: 'EXPIRED', updatedAt: new Date() })
            .where(eq(schema.topUps.id, topUp.id));
        }
        break;
      }

      case 'payment.ambiguous': {
        if (order && order.status === 'PENDING_PAYMENT') {
          await this.db
            .update(schema.orders)
            .set({
              status: 'AMBIGUOUS',
              lastError: 'DPay reported ambiguous settlement — manual review required',
              updatedAt: new Date(),
            })
            .where(eq(schema.orders.id, order.id));
        }
        break;
      }

      case 'payment.refunded': {
        if (order) {
          await this.db
            .update(schema.orders)
            .set({ status: 'REFUNDED', updatedAt: new Date() })
            .where(eq(schema.orders.id, order.id));
        }
        break;
      }

      case 'payment.disputed': {
        if (order) {
          await this.db
            .update(schema.orders)
            .set({ status: 'DISPUTED', updatedAt: new Date() })
            .where(eq(schema.orders.id, order.id));
        }
        break;
      }
    }
  }
}
