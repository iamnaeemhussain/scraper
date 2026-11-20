import { Global, Module } from '@nestjs/common';
import { YesimService } from './yesim.service';

@Global()
@Module({
  providers: [YesimService],
  exports: [YesimService],
})
export class YesimModule {}
