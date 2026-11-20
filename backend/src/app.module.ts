import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { EsimModule } from './esim/esim.module';
import { HealthController } from './health/health.controller';
import { MailerModule } from './mailer/mailer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { AppLoggerModule } from './shared/logger.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { YesimModule } from './yesim/yesim.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggerModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    PrismaModule,
    QueueModule,
    MailerModule,
    NotificationsModule,
    YesimModule,
    PaymentsModule,
    WebhooksModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    OrdersModule,
    EsimModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
