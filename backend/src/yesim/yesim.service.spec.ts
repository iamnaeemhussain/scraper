import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../queue/queue.module';
import { parseLpaParts } from '../webhooks/provisioning.service';
import { YesimService } from './yesim.service';

describe('YesimService & LPA Helpers', () => {
  let service: YesimService;

  beforeEach(() => {
    const config = new ConfigService({});
    const prisma = {
      getSettings: jest.fn().mockResolvedValue({
        yesimBaseUrl: 'https://partners-api.yesim.biz',
        yesimApiToken: null,
        yesimMockMode: true,
      }),
      db: {
        select: () => ({
          from: () => ({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
      },
    } as unknown as PrismaService;
    const cache = new CacheService(new ConfigService({ NODE_ENV: 'test' }));
    service = new YesimService(config, prisma, cache);
  });

  it('generates a scannable PNG data URL from a Yesim LPA string', async () => {
    const lpa = 'LPA:1$smdp.io$K2-26L4KR-15PM4L7';
    const dataUrl = await service.generateQrDataUrl(lpa);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(200);
  });

  it('constructs iOS 17.4+ universal eSIM provisioning links and parses LPA parts', () => {
    const lpa = 'LPA:1$rsp.truphone.com$JQ-2093DF-7I229P7';
    const tap = service.buildIosTapLink(lpa);
    expect(tap).toBe(
      `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`,
    );

    const parsed = parseLpaParts(lpa);
    expect(parsed.smdpAddress).toBe('rsp.truphone.com');
    expect(parsed.matchingId).toBe('JQ-2093DF-7I229P7');
  });
});
