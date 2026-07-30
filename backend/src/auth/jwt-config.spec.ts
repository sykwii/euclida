import { ConfigService } from '@nestjs/config';
import { buildJwtModuleOptions } from './jwt-config';

describe('buildJwtModuleOptions', () => {
  it('rejects a missing production secret', () => {
    const config = new ConfigService({ NODE_ENV: 'production' });

    expect(() => buildJwtModuleOptions(config)).toThrow(
      'JWT_SECRET must be configured',
    );
  });

  it('rejects the development secret and short production secrets', () => {
    for (const secret of ['euclida-local-dev-secret', 'short-secret']) {
      const config = new ConfigService({
        NODE_ENV: 'production',
        JWT_SECRET: secret,
      });
      expect(() => buildJwtModuleOptions(config)).toThrow();
    }
  });

  it('constrains signing and verification to the configured JWT contract', () => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      JWT_SECRET: 'a-secure-production-secret-with-32-chars',
    });

    const options = buildJwtModuleOptions(config);

    expect(options.signOptions).toMatchObject({
      algorithm: 'HS256',
      issuer: 'euclida-core',
      audience: 'euclida-clients',
    });
    expect(options.verifyOptions).toMatchObject({
      algorithms: ['HS256'],
      issuer: 'euclida-core',
      audience: 'euclida-clients',
    });
  });
});
