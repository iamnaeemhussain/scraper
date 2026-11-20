import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MailerModule } from '../mailer/mailer.module';
import { AdminGuard } from './admin.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { TokensService } from './tokens.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), MailerModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    JwtStrategy,
    AdminGuard,
    OptionalJwtAuthGuard,
  ],
  exports: [
    AuthService,
    TokensService,
    AdminGuard,
    OptionalJwtAuthGuard,
  ],
})
export class AuthModule {}
