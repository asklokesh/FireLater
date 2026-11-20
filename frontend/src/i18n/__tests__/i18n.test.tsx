import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { baseLocale, canonicalLocale, isRtlLocale, locales, resolveLocale, rtlLocales } from '../config';
import { useT } from '../useT';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatRelativeTime, formatTime } from '@/lib/format';
import ar from '../../../messages/ar.json';
import de from '../../../messages/de.json';

const messagesDir = path.resolve(__dirname, '../../../messages');

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

function Probe() {
  const t = useT('auth.login');
  return <p>{t('signIn')}</p>;
}

describe('frontend i18n config', () => {
  it('ships 10+ languages whose catalogs have the same keys as English', () => {
    expect(locales.length).toBeGreaterThanOrEqual(10);
    const en = flatten(JSON.parse(fs.readFileSync(path.join(messagesDir, 'en.json'), 'utf8'))).sort();
    for (const code of locales) {
      const keys = flatten(JSON.parse(fs.readFileSync(path.join(messagesDir, `${code}.json`), 'utf8'))).sort();
      expect(keys, code).toEqual(en);
    }
  });

  it('detects RTL languages only for Arabic and Hebrew (with regions)', () => {
    expect([...rtlLocales]).toEqual(['ar', 'he']);
    expect(isRtlLocale('ar-EG')).toBe(true);
    expect(isRtlLocale('he')).toBe(true);
    expect(isRtlLocale('iw')).toBe(true);
    expect(isRtlLocale('fr-CA')).toBe(false);
    expect(isRtlLocale(undefined)).toBe(false);
  });

  it.each([
    ['pt-BR', 'pt'],
    ['zh_CN', 'zh'],
    ['de-CH', 'de'],
    ['xx', null],
  ])('baseLocale(%s) = %s', (tag, expected) => {
    expect(baseLocale(tag)).toBe(expected);
  });

  it('keeps the region for formatting and resolves cookie > Accept-Language > default', () => {
    expect(canonicalLocale('en_gb')).toBe('en-GB');
    expect(resolveLocale('es-MX', 'fr')).toBe('es-MX');
    expect(resolveLocale(undefined, 'xx;q=1, ja-JP;q=0.9, de;q=0.5')).toBe('ja-JP');
    expect(resolveLocale('bogus', null)).toBe('en');
  });
});

describe('formatting by language/region', () => {
  const d = new Date(Date.UTC(2026, 2, 4, 15, 30));
  it('formats dates differently per locale', () => {
    expect(formatDate(d, 'en-US', { dateStyle: 'short' }, 'UTC')).toBe('3/4/26');
    expect(formatDate(d, 'en-GB', { dateStyle: 'short' }, 'UTC')).toBe('04/03/2026');
    expect(formatDate(d, 'de-DE', { dateStyle: 'short' }, 'UTC')).toBe('04.03.26');
    expect(formatDate(d, 'ja-JP', { dateStyle: 'short' }, 'UTC')).toBe('2026/03/04');
  });
  it('formats time with 12h/24h conventions', () => {
    expect(formatTime(d, 'en-US', {}, 'UTC')).toMatch(/3:30\s?PM/);
    expect(formatTime(d, 'de-DE', {}, 'UTC')).toBe('15:30');
    expect(formatDateTime(d, 'fr-FR', {}, 'UTC')).toContain('2026');
  });
  it('formats numbers and currency per region', () => {
    expect(formatNumber(1234567.89, 'en-US')).toBe('1,234,567.89');
    expect(formatNumber(1234567.89, 'de-DE')).toBe('1.234.567,89');
    expect(formatCurrency(1234.5, 'EUR', 'de-DE').replace(/\s/g, ' ')).toBe('1.234,50 €');
    expect(formatCurrency(1234.5, 'USD', 'en-US')).toBe('$1,234.50');
    expect(formatCurrency(1234.5, 'JPY', 'ja-JP')).toContain('1,235');
    expect(formatNumber(12, 'ar-EG')).not.toBe('12');
  });
  it('formats relative time and tolerates invalid input', () => {
    expect(formatRelativeTime(new Date(1000), 'en', new Date(1000 + 3 * 86400000))).toBe('3 days ago');
    expect(formatRelativeTime(new Date(1000), 'es', new Date(1000 + 3 * 86400000))).toBe('hace 3 días');
    expect(formatDate('not-a-date', 'en')).toBe('');
  });
});

describe('useT', () => {
  it('falls back to English without a provider', () => {
    render(<Probe />);
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });
  it.each([
    ['de', de, 'Anmelden'],
    ['ar', ar, 'تسجيل الدخول'],
  ])('uses provider messages for %s', (locale, messages, expected) => {
    render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <Probe />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(expected)).toBeInTheDocument();
  });
});
