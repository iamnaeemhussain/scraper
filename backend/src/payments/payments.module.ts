import { Global, Module } from '@nestjs/common';
import { DpayService } from './dpay.service';

@Global()
@Module({
  providers: [DpayService],
  exports: [DpayService],
})
export class PaymentsModule {}
