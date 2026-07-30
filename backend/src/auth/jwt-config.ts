import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

const DEVELOPMENT_SECRET = 'euclida-local-dev-secret';
const MINIMUM_PRODUCTION_SECRET_LENGTH = 32;

export function buildJwtModuleOptions(config: ConfigService): JwtModuleOptions {
  const environment = config.get<string>('NODE_ENV', 'development');
  const configuredSecret = config.get<string>('JWT_SECRET')?.trim();

  if (
    environment === 'production' &&
    (!configuredSecret ||
      configuredSecret === DEVELOPMENT_SECRET ||
      configuredSecret.length < MINIMUM_PRODUCTION_SECRET_LENGTH)
  ) {
    throw new Error(
      `JWT_SECRET must be configured with at least ${MINIMUM_PRODUCTION_SECRET_LENGTH} characters in production`,
    );
  }

  const issuer = config.get<string>('JWT_ISSUER', 'euclida-core');
  const audience = config.get<string>('JWT_AUDIENCE', 'euclida-clients');

  return {
    secret: configuredSecret || DEVELOPMENT_SECRET,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: config.get<string>('JWT_EXPIRES_IN', '12h') as never,
      issuer,
      audience,
    },
    verifyOptions: {
      algorithms: ['HS256'],
      issuer,
      audience,
    },
  };
}
