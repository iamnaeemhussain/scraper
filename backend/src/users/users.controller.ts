import { Body, Controller, Delete, Get, HttpCode, Patch, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { eq } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthedUser } from '../auth/jwt.strategy';
import { TokensService } from '../auth/tokens.service';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(8)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

@Controller('me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  @Get()
  async me(@CurrentUser() user: AuthedUser) {
    return user;
  }

  @Patch()
  async update(@CurrentUser() user: AuthedUser, @Body() dto: UpdateProfileDto) {
    const [updated] = await this.db
      .update(schema.users)
      .set({
        locale: dto.locale ?? user.locale,
        name: dto.name !== undefined ? dto.name : user.name,
        phone: dto.phone !== undefined ? dto.phone : user.phone,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id))
      .returning();

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      locale: updated.locale,
    };
  }

  @Delete()
  @HttpCode(204)
  async deleteAccount(@CurrentUser() user: AuthedUser) {
    await this.db
      .update(schema.users)
      .set({
        deletedAt: new Date(),
        email: `deleted-${user.id}@deleted.local`,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));
    await this.tokens.revokeAllForUser(user.id);
  }
}
