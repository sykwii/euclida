const DEVELOPMENT_ORIGINS = [
  'http://localhost:4200',
  'http://localhost:8844',
  'http://127.0.0.1:8844',
];

export function configuredCorsOrigins(
  environment = process.env.NODE_ENV || 'development',
  value = process.env.CORS_ORIGINS,
): string[] {
  const origins = (
    value || (environment === 'production' ? '' : DEVELOPMENT_ORIGINS.join(','))
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (environment === 'production' && origins.length === 0) {
    throw new Error('CORS_ORIGINS must be configured in production');
  }

  if (origins.includes('*')) {
    throw new Error('Wildcard CORS origin is not allowed');
  }

  return origins;
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  return !origin || allowedOrigins.includes(origin);
}
