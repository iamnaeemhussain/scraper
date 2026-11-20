import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { v4 as uuidv4 } from 'uuid';
import { MailerService } from '../mailer/mailer.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';
import { TokensService } from './tokens.service';

const BCRYPT_ROUNDS = 10;
const EMAIL_VERIFY_TTL_HOURS = 48;
const PASSWORD_RESET_TTL_HOURS = 2;

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly mailer: MailerService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  async register(params: {
    email: string;
    password: string;
    name?: string;
    phone?: string;
    locale?: string;
  }) {
    const lower = params.email.toLowerCase().trim();
    const existing = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, lower));
    if (existing.length > 0) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(params.password, BCRYPT_ROUNDS);
    const id = uuidv4();
    const [user] = await this.db
      .insert(schema.users)
      .values({
        id,
        email: lower,
        name: params.name?.trim() || null,
        phone: params.phone?.trim() || null,
        passwordHash,
        role: 'USER',
        locale: params.locale ?? 'en',
      })
      .returning();

    // Link any previous guest orders / eSIMs placed with this email
    await this.db
      .update(schema.orders)
      .set({ userId: id })
      .where(eq(schema.orders.customerEmail, lower));
    await this.db
      .update(schema.esims)
      .set({ userId: id })
      .where(eq(schema.esims.customerEmail, lower));

    await this.sendVerificationEmail(user.id, user.email);

    return this.tokens.issuePair(user);
  }

  async login(email: string, password: string) {
    const lower = email.toLowerCase().trim();
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, lower));
    const user = rows[0];
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.tokens.issuePair(user);
  }

  async refresh(refreshToken: string) {
    try {
      return await this.tokens.rotate(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.tokens.revokeAllForUser(userId);
  }

  async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const raw = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(raw);
    await this.db.insert(schema.emailVerificationTokens).values({
      id: uuidv4(),
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_HOURS * 3600 * 1000),
    });
    await this.mailer.sendVerifyEmail(email, raw);
  }

  async verifyEmail(token: string): Promise<void> {
    const tokenHash = hashToken(token);
    const rows = await this.db
      .select()
      .from(schema.emailVerificationTokens)
      .where(eq(schema.emailVerificationTokens.tokenHash, tokenHash));
    const row = rows[0];
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    await this.db
      .update(schema.emailVerificationTokens)
      .set({ consumedAt: new Date() })
      .where(eq(schema.emailVerificationTokens.id, row.id));
    await this.db
      .update(schema.users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.users.id, row.userId));
  }

  async forgotPassword(email: string): Promise<void> {
    const lower = email.toLowerCase().trim();
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, lower));
    const user = rows[0];
    if (!user || user.deletedAt) return;

    const raw = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashToken(raw);
    await this.db.insert(schema.passwordResetTokens).values({
      id: uuidv4(),
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_HOURS * 3600 * 1000),
    });
    await this.mailer.sendPasswordReset(user.email, raw);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(token);
    const rows = await this.db
      .select()
      .from(schema.passwordResetTokens)
      .where(eq(schema.passwordResetTokens.tokenHash, tokenHash));
    const row = rows[0];
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.db
      .update(schema.passwordResetTokens)
      .set({ consumedAt: new Date() })
      .where(eq(schema.passwordResetTokens.id, row.id));
    await this.db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, row.userId));
    await this.tokens.revokeAllForUser(row.userId);
  }
}
