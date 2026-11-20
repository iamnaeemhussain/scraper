import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
    role: string;
  };
}

export const DEFAULT_DEV_JWT_SECRET = 'paktel-dev-jwt-access-secret-change-in-prod-2026';

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  getAccessSecret(): string {
    const configured = (this.config.get<string>('JWT_ACCESS_SECRET') ?? '').trim();
    if (configured) return configured;
    return DEFAULT_DEV_JWT_SECRET;
  }

  private parseTtl(ttl: string, defaultSec: number): number {
    const m = /^(\d+)([smhd])?$/.exec(ttl);
    if (!m) return defaultSec;
    const n = Number(m[1]);
    switch (m[2]) {
      case 's':
        return n;
      case 'm':
        return n * 60;
      case 'h':
        return n * 3600;
      case 'd':
        return n * 86400;
      default:
        return n;
    }
  }

  async issuePair(user: {
    id: string;
    email: string;
    name?: string | null;
    phone?: string | null;
    role?: string;
  }): Promise<TokenPair> {
    const accessTtl = this.parseTtl(this.config.get<string>('JWT_ACCESS_TTL') ?? '8h', 28800);
    const refreshTtl = this.parseTtl(
      this.config.get<string>('JWT_REFRESH_TTL') ?? '30d',
      2_592_000,
    );

    const role = user.role ?? 'USER';
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role } satisfies JwtPayload,
      {
        secret: this.getAccessSecret(),
        expiresIn: accessTtl,
      },
    );

    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await this.db.insert(schema.refreshTokens).values({
      id: uuidv4(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtl,
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        phone: user.phone ?? null,
        role,
      },
    };
  }

  async rotate(refreshToken: string): Promise<TokenPair> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHash));
    const row = rows[0];

    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw new Error('Invalid refresh token');
    }

    const userRows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, row.userId));
    const user = userRows[0];
    if (!user || user.deletedAt) {
      throw new Error('User not active');
    }

    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(schema.refreshTokens.id, row.id));

    return this.issuePair(user);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(schema.refreshTokens.userId, userId), isNull(schema.refreshTokens.revokedAt)),
      );
  }
}
