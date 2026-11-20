import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateOrderDto } from './dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  private resolveOrigin(req: Request): string {
    const origin = req.headers.origin;
    if (origin && typeof origin === 'string') return origin;
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
    return host ? `${proto}://${host}` : '';
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @Body() dto: CreateOrderDto,
    @Req() req: Request & { user?: { sub: string; email: string; role?: string } | null },
  ) {
    return this.orders.createOrder(dto, req.user, this.resolveOrigin(req));
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  listMine(@Req() req: { user: { sub: string } }) {
    return this.orders.listMyOrders(req.user.sub);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  getOne(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Req() req: { user?: { sub: string; email: string; role?: string } | null },
  ) {
    return this.orders.getOrderDetail(id, req.user, token);
  }
}
