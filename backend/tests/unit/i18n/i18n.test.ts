import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import {
  SUPPORTED_LOCALES,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  isRtl,
  t,
  i18nOnRequest,
  localeForError,
  localizeErrorMessage,
} from '../../../src/lib/i18n';

const localesDir = path.resolve(__dirname, '../../../src/locales');

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
  );
}

describe('backend i18n', () => {
  it('supports 10+ languages and every catalog has all English keys', () => {
    expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(10);
    const en = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8')));
    for (const code of SUPPORTED_LOCALES) {
      const keys = flatten(JSON.parse(fs.readFileSync(path.join(localesDir, `${code}.json`), 'utf8')));
      expect(keys.sort(), code).toEqual([...en].sort());
    }
  });

  it.each([
    ['pt-BR', 'pt'],
    ['zh_CN', 'zh'],
    ['AR-sa', 'ar'],
    ['iw-IL', 'he'],
    ['de-AT', 'de'],
    ['xx', null],
    ['', null],
  ])('normalizes %s -> %s', (tag, expected) => {
    expect(normalizeLocale(tag)).toBe(expected);
  });

  it('parses Accept-Language by quality', () => {
    expect(parseAcceptLanguage('fr;q=0.5, de-CH, *;q=0.1, es;q=0')).toEqual(['de-CH', 'fr']);
  });

  it('resolves explicit > user > Accept-Language > default', () => {
    expect(resolveLocale({ explicit: 'ja', user: 'fr', acceptLanguage: 'de' })).toBe('ja');
    expect(resolveLocale({ user: 'fr', acceptLanguage: 'de' })).toBe('fr');
    expect(resolveLocale({ acceptLanguage: 'xx, he-IL;q=0.8, de;q=0.4' })).toBe('he');
    expect(resolveLocale({})).toBe('en');
  });

  it('marks Arabic and Hebrew as RTL only', () => {
    expect(SUPPORTED_LOCALES.filter(isRtl)).toEqual(['ar', 'he']);
  });

  it('translates with interpolation and falls back to English then key', () => {
    expect(t('es', 'errors.notFound')).toBe('Recurso no encontrado');
    expect(t('en', 'email.passwordReset.text', { url: 'http://x', hours: 1 })).toContain('http://x');
    expect(t('de', 'nope.missing')).toBe('nope.missing');
  });

  it('localizes generic errors but preserves specific messages', () => {
    expect(localizeErrorMessage('fr', { statusCode: 401, message: 'Invalid or expired token' })).toBe('Authentification requise');
    expect(localizeErrorMessage('fr', { statusCode: 409, message: 'Email already exists' })).toBe('Email already exists');
    expect(localizeErrorMessage('de', { statusCode: 400, message: 'x', messageKey: 'errors.forbidden' })).toBe(t('de', 'errors.forbidden'));
  });

  it('API responses follow Accept-Language, ?lang= and saved user preference', async () => {
    const app = Fastify();
    app.addHook('onRequest', i18nOnRequest);
    app.get('/boom', async (req) => {
      (req as unknown as { user: unknown }).user = { userId: 'u1', tenantSlug: 'acme' };
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    });
    app.setErrorHandler(async (err, req, reply) => {
      const locale = await localeForError(req, async () => (req.headers['x-saved'] as string) ?? null);
      reply.status(401).send({ message: localizeErrorMessage(locale, { statusCode: 401, message: err.message }) });
    });

    const r1 = await app.inject({ url: '/boom', headers: { 'accept-language': 'ar-SA,ar;q=0.9' } });
    expect(r1.json().message).toBe('المصادقة مطلوبة');
    expect(r1.headers['content-language']).toBe('ar');

    const r2 = await app.inject({ url: '/boom?lang=ja', headers: { 'accept-language': 'ar' } });
    expect(r2.json().message).toBe('認証が必要です');

    const r3 = await app.inject({ url: '/boom', headers: { 'accept-language': 'ar', 'x-saved': 'pt' } });
    expect(r3.json().message).toBe('Autenticação necessária');

    const r4 = await app.inject({ url: '/boom' });
    expect(r4.json().message).toBe('Authentication required');
    await app.close();
  });
});
