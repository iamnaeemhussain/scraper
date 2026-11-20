import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { EsimService } from './esim.service';

@Controller('esims')
export class EsimController {
  constructor(private readonly esims: EsimService) {}

  // Public self-service portal lookup (replaces my.pak-tel.com)
  @Get('lookup/:iccid')
  lookupByIccid(@Param('iccid') iccid: string) {
    return this.esims.lookupByIccid(iccid);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  listMine(@Req() req: { user: { sub: string } }) {
    return this.esims.listMyEsims(req.user.sub);
  }

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  getOne(
    @Param('id') id: string,
    @Req() req: { user: { sub: string; role?: string } },
  ) {
    return this.esims.getEsimById(id, req.user, false);
  }

  @Post(':id/refresh')
  @UseGuards(AuthGuard('jwt'))
  refresh(
    @Param('id') id: string,
    @Req() req: { user: { sub: string; role?: string } },
  ) {
    return this.esims.getEsimById(id, req.user, true);
  }
}
