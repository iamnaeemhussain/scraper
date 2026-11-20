import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { EsimController } from './esim.controller';
import { EsimService } from './esim.service';
import { TopUpController } from './topup.controller';
import { TopUpService } from './topup.service';

@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [EsimController, TopUpController],
  providers: [EsimService, TopUpService],
  exports: [EsimService, TopUpService],
})
export class EsimModule {}
