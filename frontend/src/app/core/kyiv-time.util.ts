export const KYIV_TIME_ZONE = 'Europe/Kyiv';

export function formatKyivDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: KYIV_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatKyivShortDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: KYIV_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function isSameKyivDate(value: string | Date, reference: Date = new Date()): boolean {
  return getKyivDateKey(value) === getKyivDateKey(reference);
}

export function getKyivDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KYIV_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  const day = parts.find((part) => part.type === 'day')?.value || '00';

  return `${year}-${month}-${day}`;
}

export function minutesSince(value: string | Date | null | undefined, now: Date = new Date()): number {
  if (!value) return 0;

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return 0;

  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
}
