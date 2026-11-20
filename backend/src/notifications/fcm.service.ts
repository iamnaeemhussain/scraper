import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, inArray } from 'drizzle-orm';
import { PgliteDatabase } from 'drizzle-orm/pglite';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import * as schema from '../prisma/schema';

@Injectable()
export class FcmService implements OnModuleInit {
  private readonly log = new Logger(FcmService.name);
  private app: admin.app.App | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get db(): PgliteDatabase<typeof schema> {
    return this.prisma.db as PgliteDatabase<typeof schema>;
  }

  onModuleInit(): void {
    const inline = this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
    const filePath = this.config.get<string>('FCM_SERVICE_ACCOUNT_PATH');

    let creds: admin.ServiceAccount | null = null;
    if (inline) {
      try {
        creds = JSON.parse(inline);
      } catch {
        this.log.error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
      }
    } else if (filePath && fs.existsSync(filePath)) {
      try {
        creds = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        this.log.error(`Could not read ${filePath}`);
      }
    }

    if (!creds) {
      return;
    }
    try {
      this.app = admin.initializeApp(
        { credential: admin.credential.cert(creds) },
        `paktel-fcm-${Date.now()}`,
      );
    } catch {
      // ignore duplicate init in tests
    }
  }

  async registerDevice(userId: string, fcmToken: string, platform: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.fcmToken, fcmToken));

    if (existing.length > 0) {
      await this.db
        .update(schema.devices)
        .set({ userId, platform, updatedAt: new Date() })
        .where(eq(schema.devices.fcmToken, fcmToken));
    } else {
      await this.db.insert(schema.devices).values({
        id: uuidv4(),
        userId,
        fcmToken,
        platform,
      });
    }
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string> = {},
  ): Promise<void> {
    const rows = await this.db
      .select()
      .from(schema.devices)
      .where(eq(schema.devices.userId, userId));
    if (rows.length === 0) return;

    if (!this.app) {
      this.log.debug(`[PUSH] userId=${userId} title="${title}" body="${body}"`);
      return;
    }

    const messaging = this.app.messaging();
    const tokens = rows.map((d) => d.fcmToken);
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });

    const stale: string[] = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-argument' ||
          code === 'messaging/invalid-registration-token'
        ) {
          stale.push(tokens[i]);
        }
      }
    });
    if (stale.length) {
      await this.db.delete(schema.devices).where(inArray(schema.devices.fcmToken, stale));
    }
  }
}
