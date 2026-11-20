import { describe, it, expect } from 'vitest';
import { localizeErrorMessage, normalizeLocale, resolveLocale, t } from '../i18n';
import { NotFoundError } from '../../utils/errors';

describe('lib/i18n', () => {
  it('maps regional tags and falls back to English', () => {
    expect(normalizeLocale('es-MX')).toBe('es');
    expect(resolveLocale({ acceptLanguage: 'ko, fr-CA;q=0.8' })).toBe('fr');
    expect(resolveLocale({ acceptLanguage: 'ko' })).toBe('en');
  });
  it('translates and interpolates', () => {
    expect(t('de', 'errors.forbidden')).toBe('Sie haben keine Berechtigung für diese Aktion');
    expect(t('ja', 'email.verifyEmail.text', { url: 'U', hours: 24 })).toContain('24');
  });
});

describe('not-found localization', () => {
  it('translates NotFoundError with and without id', () => {
    const e = new NotFoundError('Issue', 'abc');
    expect(localizeErrorMessage('es', e)).toBe("No se encontró Issue con id 'abc'");
    expect(localizeErrorMessage('en', e)).toBe(e.message);
    expect(localizeErrorMessage('de', new NotFoundError('Issue'))).toBe('Issue nicht gefunden');
  });
});

describe('static message catalog', () => {
  it('translates well-known service messages by their English text', () => {
    expect(localizeErrorMessage('de', { statusCode: 400, message: 'No file uploaded' })).toBe('Keine Datei hochgeladen');
    expect(localizeErrorMessage('ja', { statusCode: 403, message: 'You can only cancel your own swap requests' })).toBe('自分の交代リクエストのみキャンセルできます');
    expect(localizeErrorMessage('de', { statusCode: 400, message: 'Something unmapped' })).toBe('Something unmapped');
  });
});

describe('technical message catalog', () => {
  it('translates SSO and import messages', () => {
    expect(localizeErrorMessage('fr', { statusCode: 400, message: 'Token exchange failed' })).toBe('Échec de l\'échange de jetons');
    expect(localizeErrorMessage('zh', { statusCode: 400, message: 'Use POST for SAML callback' })).toBe('SAML 回调请使用 POST');
  });
});
