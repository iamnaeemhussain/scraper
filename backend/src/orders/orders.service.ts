import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { desc, eq, or } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { DpayService } from '../payments/dpay.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { ProvisioningService } from '../webhooks/provisioning.service';
import { CreateOrderDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dpay: DpayService,
    private readonly provisioning: ProvisioningService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  private generateOrderNumber(): string {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `PKT-${ymd}-${rand}`;
  }

  async createOrder(
    dto: CreateOrderDto,
    authUser?: { sub: string; email: string; role?: string } | null,
    originHint?: string,
  ) {
    const normalizedItems: { bundleId: string; quantity: number }[] = [];
    if (dto.items && dto.items.length > 0) {
      for (const it of dto.items) {
        const id = it.bundleId || it.packageId;
        if (!id) throw new BadRequestException('Each order item requires bundleId');
        normalizedItems.push({ bundleId: id, quantity: it.quantity ?? 1 });
      }
    } else if (dto.bundleId) {
      normalizedItems.push({
        bundleId: dto.bundleId,
        quantity: dto.quantity ?? 1,
      });
    } else {
      throw new BadRequestException('Provide bundleId or items[]');
    }

    const customerEmail = (dto.customerEmail || authUser?.email || '').trim().toLowerCase();
    if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      throw new BadRequestException('A valid customerEmail is required for eSIM QR delivery');
    }

    // Load bundles and calculate total
    let totalPkr = 0;
    const resolvedItems: {
      bundle: schema.BundleRow;
      quantity: number;
      unitPricePkr: number;
    }[] = [];

    for (const reqItem of normalizedItems) {
      const bRows = await this.db
        .select()
        .from(schema.bundles)
        .where(eq(schema.bundles.id, reqItem.bundleId));
      const bundle = bRows[0];
      if (!bundle || !bundle.isActive) {
        throw new NotFoundException(`Bundle ${reqItem.bundleId} is unavailable`);
      }
      const unitPricePkr = Math.round(bundle.pricePkr);
      totalPkr += unitPricePkr * reqItem.quantity;
      resolvedItems.push({
        bundle,
        quantity: reqItem.quantity,
        unitPricePkr,
      });
    }

    const amountPaisa = this.dpay.rupeesToPaisa(totalPkr);
    const orderNumber = this.generateOrderNumber();
    const guestAccessToken = crypto.randomBytes(16).toString('hex');

    const insertedOrders = await this.db
      .insert(schema.orders)
      .values({
        orderNumber,
        userId: authUser?.sub ?? null,
        customerEmail,
        customerPhone: dto.customerPhone?.trim() || null,
        guestAccessToken,
        status: 'PENDING_PAYMENT',
        amountPkr: totalPkr,
        amountPaisa,
        currency: 'PKR',
      })
      .returning();
    const order = insertedOrders[0];

    for (const ri of resolvedItems) {
      await this.db.insert(schema.orderItems).values({
        orderId: order.id,
        bundleId: ri.bundle.id,
        bundleName: ri.bundle.name,
        yesimPlanId: ri.bundle.yesimPlanId,
        dataLabel: ri.bundle.dataLabel,
        validityDays: ri.bundle.validityDays,
        quantity: ri.quantity,
        unitPricePkr: ri.unitPricePkr,
        unitPricePaisa: ri.unitPricePkr * 100,
      });
    }

    const baseOrigin = (originHint || '').replace(/\/+$/, '');
    const successUrl =
      dto.successUrl ||
      `${baseOrigin || 'https://pak-tel.com'}/order/${order.id}?token=${guestAccessToken}`;
    const cancelUrl =
      dto.cancelUrl ||
      `${baseOrigin || 'https://pak-tel.com'}/?canceled_order=${order.orderNumber}`;

    const summaryNames = resolvedItems
      .map((r) => (r.quantity > 1 ? `${r.quantity}x ${r.bundle.name}` : r.bundle.name))
      .join(', ');

    const session = await this.dpay.createPaymentSession(
      {
        idempotencyKey: `order:${order.id}`,
        amountPaisa,
        reference: order.orderNumber,
        description: `Pak-Tel eSIM: ${summaryNames}`,
        successUrl,
        cancelUrl,
        customerEmail,
        customerPhone: dto.customerPhone?.trim() || undefined,
        expiresInSeconds: 1800,
        metadata: {
          order_id: order.id,
          order_number: order.orderNumber,
          kind: 'esim_order',
        },
      },
      baseOrigin,
    );

    await this.db
      .update(schema.orders)
      .set({
        dpaySessionId: session.id,
        dpayCheckoutUrl: session.checkout_url,
        payableAmountPaisa: session.payable_amount ?? amountPaisa,
        expiresAt: session.expires_at ? new Date(session.expires_at) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, order.id));

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: 'PENDING_PAYMENT',
      customerEmail,
      amountPkr: totalPkr,
      amountPaisa,
      payableAmountPaisa: session.payable_amount ?? amountPaisa,
      currency: 'PKR',
      dpaySessionId: session.id,
      checkoutUrl: session.checkout_url,
      guestAccessToken,
      expiresAt: session.expires_at,
    };
  }

  async listMyOrders(userId: string) {
    const orders = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.userId, userId))
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

  async getOrderDetail(
    idOrOrderNumber: string,
    authUser?: { sub: string; email: string; role?: string } | null,
    guestToken?: string,
  ) {
    const rows = await this.db
      .select()
      .from(schema.orders)
      .where(
        or(
          eq(schema.orders.id, idOrOrderNumber),
          eq(schema.orders.orderNumber, idOrOrderNumber),
        ),
      );
    let order = rows[0];
    if (!order) throw new NotFoundException('Order not found');

    const isAdmin = authUser?.role === 'ADMIN';
    const isOwner = Boolean(authUser?.sub && order.userId === authUser.sub);
    const hasValidToken = Boolean(guestToken && guestToken === order.guestAccessToken);

    if (!isAdmin && !isOwner && !hasValidToken) {
      throw new ForbiddenException('Access denied to this order');
    }

    // Server-to-server DPay verification check (never trusts browser URL params!)
    if (order.status === 'PENDING_PAYMENT' && order.dpaySessionId) {
      try {
        const session = await this.dpay.getPaymentSession(order.dpaySessionId);
        if (session.status === 'succeeded') {
          await this.provisioning.fulfillOrder(order.id, {
            session_id: session.id,
            reference: session.reference,
            amount_paid: session.amount_paid ?? session.payable_amount,
          });
          const refreshed = await this.db
            .select()
            .from(schema.orders)
            .where(eq(schema.orders.id, order.id));
          if (refreshed[0]) order = refreshed[0];
        }
      } catch {
        // Ignore transient upstream read errors
      }
    }

    const [items, esims] = await Promise.all([
      this.db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id)),
      this.db.select().from(schema.esims).where(eq(schema.esims.orderId, order.id)),
    ]);

    return {
      ...order,
      items,
      esims,
    };
  }
}
