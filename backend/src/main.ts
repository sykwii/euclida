import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const corsOrigins = config
    .get<string>(
      'CORS_ORIGINS',
      'http://localhost:4200,http://localhost:8844,http://127.0.0.1:8844,http://194.146.231.21:8844',
    )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

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
