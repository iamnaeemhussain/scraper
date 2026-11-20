import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { DpayService } from '../payments/dpay.service';
import type { DpayWebhookPayload } from '../payments/dpay.types';
import { DpayWebhookController } from '../webhooks/dpay-webhook.controller';

@Controller('dpay-sandbox')
export class DpaySandboxController {
  constructor(
    private readonly dpay: DpayService,
    private readonly webhookController: DpayWebhookController,
  ) {}

  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const cfg = await this.dpay.getRuntimeConfig();
    if (!cfg.mockMode) {
      throw new ForbiddenException('DPay sandbox checkout is disabled in live mode');
    }
    return this.dpay.getPaymentSession(sessionId);
  }

  @Post('sessions/:sessionId/complete')
  async completeSandboxPayment(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      outcome: 'succeeded' | 'failed' | 'canceled';
      payerAccountNumber?: string;
    },
  ) {
    const cfg = await this.dpay.getRuntimeConfig();
    if (!cfg.mockMode) {
      throw new ForbiddenException('DPay sandbox checkout is disabled in live mode');
    }

    const session = await this.dpay.getPaymentSession(sessionId);
    if (!session) {
      throw new BadRequestException('Sandbox session not found');
    }

    if (body.outcome === 'canceled') {
      await this.dpay.cancelPaymentSession(sessionId);
      return {
        status: 'canceled',
        redirectUrl: session.cancel_url || '/',
      };
    }

    const eventType =
      body.outcome === 'succeeded' ? 'payment.succeeded' : 'payment.failed';
    const eventId = `evt_sandbox_${crypto.randomBytes(8).toString('hex')}`;
    const payerAccount = body.payerAccountNumber || '0325-9717066 (Raast Instant)';

    if (body.outcome === 'succeeded') {
      this.dpay.updateMockSession(sessionId, {
        status: 'succeeded',
        amount_paid: session.payable_amount,
        payer_account_number: payerAccount,
        external_payment_ref: `RAAST-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      });
    } else {
      this.dpay.updateMockSession(sessionId, {
        status: 'failed',
      });
    }

    const webhookPayload: DpayWebhookPayload = {
      id: eventId,
      type: eventType,
      created_at: new Date().toISOString(),
      data: {
        session_id: session.id,
        reference: session.reference,
        status: body.outcome === 'succeeded' ? 'succeeded' : 'failed',
        amount: session.amount,
        payable_amount: session.payable_amount,
        amount_paid: body.outcome === 'succeeded' ? session.payable_amount : 0,
        currency: 'PKR',
        payer_account_number: payerAccount,
        paid_at: new Date().toISOString(),
        failure_reason:
          body.outcome === 'failed'
            ? 'Customer declined payment in DPay Sandbox'
            : undefined,
        metadata: session.metadata,
      },
    };

    const rawBodyStr = JSON.stringify(webhookPayload);
    const signature = this.dpay.signWebhookPayload(rawBodyStr, cfg.webhookSecret);

    // Exercise the exact HMAC-SHA256 verification + deduplication + provisioning pipeline!
    const syntheticReq = {
      rawBody: Buffer.from(rawBodyStr, 'utf8'),
      body: webhookPayload,
    } as unknown as Request & { rawBody: Buffer };

    await this.webhookController.handleDpayWebhook(
      syntheticReq,
      signature,
      eventId,
    );

    return {
      status: body.outcome,
      eventId,
      redirectUrl:
        body.outcome === 'succeeded'
          ? session.success_url || '/'
          : session.cancel_url || '/',
    };
  }
}
