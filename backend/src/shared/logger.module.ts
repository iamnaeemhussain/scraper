import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const isTest = config.get<string>('NODE_ENV') === 'test';
        return {
          pinoHttp: {
            level: isTest
              ? 'silent'
              : (config.get<string>('LOG_LEVEL') ?? (isProd ? 'info' : 'debug')),
            genReqId: (req: IncomingMessage, res) => {
              const existing = req.headers['x-request-id'];
              const id = (Array.isArray(existing) ? existing[0] : existing) ?? randomUUID();
              res.setHeader('x-request-id', id);
              return id;
            },
            customProps: () => ({ service: 'paktel-backend' }),
            serializers: {
              req: (req: { id: string; method: string; url: string; remoteAddress?: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url?.replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]'),
                ip: req.remoteAddress,
              }),
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.headers["dpay-signature"]',
                '*.password',
                '*.passwordHash',
                '*.refreshToken',
                '*.yesimApiToken',
                '*.dpayApiKey',
                '*.dpayWebhookSecret',
                '*.esimPassport',
              ],
              censor: '[REDACTED]',
            },
            transport:
              isProd || isTest
                ? undefined
                : {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      translateTime: 'SYS:HH:MM:ss.l',
                      singleLine: true,
                      ignore: 'pid,hostname,service,req.id',
                      messageFormat: '{req.id} {msg}',
                    },
                  },
          },
        };
      },
    }),
  ],
})
export class AppLoggerModule {}
