import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DpaySandboxController } from './dpay-sandbox.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminController, DpaySandboxController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
