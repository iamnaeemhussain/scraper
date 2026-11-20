import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import * as fs from 'fs';
import { Logger as PinoLogger } from 'nestjs-pino';
import * as path from 'path';
import { AppModule } from './app.module';

export function configureApp(app: NestExpressApplication) {
  // Capture exact raw body bytes before JSON parsing for DPay HMAC-SHA256 verification
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = Buffer.from(buf);
      },
    }),
  );

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: false,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  if (process.env.ENABLE_SWAGGER !== 'false') {
    const docCfg = new DocumentBuilder()
      .setTitle('Pak-Tel eSIM API')
      .setDescription(
        'Pak-Tel eSIM Store API — Manual Admin Bundle Catalog, Yesim Partner API Provisioning, and DPay PKR Checkout.',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const doc = SwaggerModule.createDocument(app, docCfg);
    SwaggerModule.setup('docs', app, doc, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Serve built React storefront from ../web/dist when present
  const webDist = path.resolve(__dirname, '..', '..', 'web', 'dist');
  const indexHtml = path.join(webDist, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.useStaticAssets(webDist);
    const httpAdapter = app.getHttpAdapter();
    const expressApp = httpAdapter.getInstance() as express.Application;
    expressApp.get('*', (req, res, next) => {
      if (
        req.path.startsWith('/api') ||
        req.path.startsWith('/docs')
      ) {
        return next();
      }
      return res.sendFile(indexHtml);
    });
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });

  app.useLogger(app.get(PinoLogger));
  app.enableShutdownHooks();

  configureApp(app);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  const log = app.get(PinoLogger);
  log.log({ port }, `[paktel-backend] listening on 0.0.0.0:${port}`);
}

if (require.main === module) {
  bootstrap();
}
