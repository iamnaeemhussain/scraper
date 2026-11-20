import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DevicesController } from './devices.controller';
import { FcmService } from './fcm.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [DevicesController],
  providers: [FcmService],
  exports: [FcmService],
})
export class NotificationsModule {}
