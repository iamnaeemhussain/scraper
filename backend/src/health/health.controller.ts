import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../queue/queue.module';

interface ComponentStatus {
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', service: 'paktel-esim-api', time: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    const [db, cacheStatus] = await Promise.all([this.checkDb(), this.checkCache()]);
    const ok = db.ok && cacheStatus.ok;
    return {
      status: ok ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      checks: { db, cache: cacheStatus },
    };
  }

  @Get()
  check() {
    return this.ready();
  }

  private async checkDb(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      await this.prisma.ping();
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  private async checkCache(): Promise<ComponentStatus> {
    const start = Date.now();
    try {
      const pong = await this.cache.ping();
      return { ok: pong === 'PONG', detail: pong, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }
}
