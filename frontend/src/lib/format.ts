import { defaultLocale } from '@/i18n/config';

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Locale- and region-aware date, e.g. en-US "3/4/2026", en-GB "04/03/2026", de-DE "4.3.2026". */
export function formatDate(value: DateInput, locale: string = defaultLocale, options: Intl.DateTimeFormatOptions = {}, timeZone?: string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return safe(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone, ...options }).format(d), d.toISOString());
}

export function formatTime(value: DateInput, locale: string = defaultLocale, options: Intl.DateTimeFormatOptions = {}, timeZone?: string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return safe(() => new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone, ...options }).format(d), d.toISOString());
}

export function formatDateTime(value: DateInput, locale: string = defaultLocale, options: Intl.DateTimeFormatOptions = {}, timeZone?: string): string {
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '';
  return safe(
    () => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone, ...options }).format(d),
    d.toISOString()
  );
}

export function formatNumber(value: number, locale: string = defaultLocale, options: Intl.NumberFormatOptions = {}): string {
  return safe(() => new Intl.NumberFormat(locale, options).format(value), String(value));
}

export function formatCurrency(value: number, currency: string, locale: string = defaultLocale, options: Intl.NumberFormatOptions = {}): string {
  return safe(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency, ...options }).format(value),
    `${value} ${currency}`
  );
}

/** "3 days ago" / "in 2 hours" in the given locale. */
export function formatRelativeTime(value: DateInput, locale: string = defaultLocale, now: DateInput = Date.now()): string {
  const diffSeconds = Math.round((toDate(value).getTime() - toDate(now).getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds) return rtf.format(Math.round(diffSeconds / seconds), unit);
  }
  return rtf.format(diffSeconds, 'second');
}
