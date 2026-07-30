import { configuredCorsOrigins, isAllowedOrigin } from './cors-policy';

describe('CORS policy', () => {
  it('allows only exact configured browser origins', () => {
    const origins = ['https://staging.example.test'];

    expect(isAllowedOrigin('https://staging.example.test', origins)).toBe(true);
    expect(
      isAllowedOrigin('https://staging.example.test.evil.test', origins),
    ).toBe(false);
    expect(isAllowedOrigin('http://192.168.1.12:8844', origins)).toBe(false);
  });

  it('requires an explicit production allowlist and rejects wildcard', () => {
    expect(() => configuredCorsOrigins('production', '')).toThrow(
      'CORS_ORIGINS',
    );
    expect(() => configuredCorsOrigins('production', '*')).toThrow('Wildcard');
  });
});
