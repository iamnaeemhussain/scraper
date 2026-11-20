import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { DEFAULT_DEV_JWT_SECRET, type JwtPayload } from './tokens.service';

export interface AuthedUser {
  id: string;
  sub: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: string;
  emailVerified: boolean;
  locale: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = (config.get<string>('JWT_ACCESS_SECRET') ?? '').trim() || DEFAULT_DEV_JWT_SECRET;
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthedUser> {
    const db = this.prisma.db as PgliteDatabase<typeof schema>;
    const rows = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub));
    const user = rows[0];
    if (!user || user.deletedAt) throw new UnauthorizedException();
    return {
      id: user.id,
      sub: user.id,
      email: user.email,
      name: user.name ?? null,
      phone: user.phone ?? null,
      role: user.role,
      emailVerified: user.emailVerifiedAt !== null,
      locale: user.locale,
    };
  }
}
