import { Global, Injectable, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';

@Injectable()
export class CacheService implements OnApplicationShutdown {
  private readonly log = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly mem = new Map<string, { value: string; expiresAt: number | null }>();

  constructor(private readonly config: ConfigService) {
    const url = (this.config.get<string>('REDIS_URL') ?? '').trim();
    const isTest = this.config.get<string>('NODE_ENV') === 'test';
    if (!isTest && (url.startsWith('redis://') || url.startsWith('rediss://'))) {
      const client = new IORedis(url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      client.on('error', (err) => {
        this.log.warn(`Redis unavailable (${err.message}); falling back to in-memory cache.`);
        this.redis = null;
      });
      client
        .connect()
        .then(() => {
          this.redis = client;
          this.log.log('Connected to Redis cache.');
        })
        .catch(() => {
          this.redis = null;
        });
    } else {
      this.log.log('Using in-memory TTL cache.');
    }
  }

  async ping(): Promise<string> {
    if (this.redis) {
      try {
        return await this.redis.ping();
      } catch {
        // fallback
      }
    }
    return 'PONG';
  }

  async acquireLock(key: string, ttlSeconds = 60): Promise<boolean> {
    const lockKey = `lock:${key}`;
    if (this.redis) {
      try {
        const res = await this.redis.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // fallback
      }
    }
    const existing = this.mem.get(lockKey);
    if (existing && (existing.expiresAt === null || existing.expiresAt > Date.now())) {
      return false;
    }
    this.mem.set(lockKey, {
      value: '1',
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  async releaseLock(key: string): Promise<void> {
    await this.del(`lock:${key}`);
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        return await this.redis.get(key);
      } catch {
        // fallback
      }
    }
    const entry = this.mem.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.mem.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.redis) {
      try {
        if (ttlSeconds) {
          await this.redis.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.redis.set(key, value);
        }
        return;
      } catch {
        // fallback
      }
    }
    this.mem.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // ignore
      }
    }
    this.mem.delete(key);
  }

  async delPrefix(prefix: string): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.keys(`${prefix}*`);
        if (keys.length > 0) await this.redis.del(...keys);
      } catch {
        // ignore
      }
    }
    for (const k of this.mem.keys()) {
      if (k.startsWith(prefix)) this.mem.delete(k);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        // ignore
      }
    }
  }
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class QueueModule {}
