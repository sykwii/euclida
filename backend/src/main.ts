import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import {
  configuredCorsOrigins,
  isAllowedOrigin,
} from './common/security/cors-policy';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const corsOrigins = configuredCorsOrigins(
    config.get<string>('NODE_ENV', 'development'),
    config.get<string>('CORS_ORIGINS'),
  );

  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: '100kb',
      parameterLimit: 1_000,
    }),
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, corsOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed'), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(
    Number(config.get<string>('PORT', '3000')),
    config.get<string>('HOST', '0.0.0.0'),
  );
}
bootstrap();
