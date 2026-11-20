import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsString, MinLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedUser } from '../auth/jwt.strategy';
import { FcmService } from './fcm.service';

class RegisterDeviceDto {
  @IsString() @MinLength(10)
  fcmToken!: string;

  @IsString() @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';
}

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly fcm: FcmService) {}

  @Post()
  @HttpCode(204)
  async register(@CurrentUser() user: AuthedUser, @Body() dto: RegisterDeviceDto) {
    await this.fcm.registerDevice(user.id, dto.fcmToken, dto.platform);
  }
}
