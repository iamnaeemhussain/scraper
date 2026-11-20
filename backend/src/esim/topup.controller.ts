import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateTopUpInput, TopUpService } from './topup.service';

@Controller('topups')
export class TopUpController {
  constructor(private readonly topups: TopUpService) {}

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
    @Body() dto: CreateTopUpInput,
    @Req() req: Request & { user?: { sub: string; email: string } | null },
  ) {
    return this.topups.createTopUp(dto, req.user, this.resolveOrigin(req));
  }

  // Backward-compatible route alias for mobile client: POST /api/esims/:id/topup
  @Post('/esim/:id')
  @UseGuards(OptionalJwtAuthGuard)
  createForEsim(
    @Param('id') id: string,
    @Body() dto: CreateTopUpInput,
    @Req() req: Request & { user?: { sub: string; email: string } | null },
  ) {
    return this.topups.createTopUp({ ...dto, esimId: id }, req.user, this.resolveOrigin(req));
  }

  @Get(':id')
  getStatus(@Param('id') id: string) {
    return this.topups.getTopUpStatus(id);
  }
}
