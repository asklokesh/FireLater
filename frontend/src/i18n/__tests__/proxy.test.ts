import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../../proxy';

const req = (headers: Record<string, string> = {}, cookie?: string) => {
  const r = new NextRequest('http://localhost/login', { headers });
  if (cookie) r.cookies.set('NEXT_LOCALE', cookie);
  return r;
};

describe('locale proxy', () => {
  it('negotiates from Accept-Language and sets the cookie on the first visit', () => {
    const res = proxy(req({ 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5' }));
    expect(res.cookies.get('NEXT_LOCALE')?.value).toBe('pt-BR');
  });
  it('falls back to English when nothing is supported', () => {
    const res = proxy(req({ 'accept-language': 'ko-KR' }));
    expect(res.cookies.get('NEXT_LOCALE')?.value).toBe('en');
  });
  it('keeps a valid existing cookie untouched', () => {
    const res = proxy(req({ 'accept-language': 'ja' }, 'de'));
    expect(res.cookies.get('NEXT_LOCALE')).toBeUndefined();
  });
  it('replaces an invalid cookie', () => {
    const res = proxy(req({ 'accept-language': 'ar-EG' }, 'xx'));
    expect(res.cookies.get('NEXT_LOCALE')?.value).toBe('ar-EG');
  });
});
