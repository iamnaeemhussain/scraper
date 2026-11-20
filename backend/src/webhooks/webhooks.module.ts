import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { DpayWebhookController } from './dpay-webhook.controller';
import { ProvisioningService } from './provisioning.service';
import { YesimWebhookController } from './yesim-webhook.controller';

@Global()
@Module({
  imports: [NotificationsModule],
  controllers: [DpayWebhookController, YesimWebhookController],
  providers: [ProvisioningService, DpayWebhookController],
  exports: [ProvisioningService, DpayWebhookController],
})
export class WebhooksModule {}
