import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE, canonicalLocale, resolveLocale } from '@/i18n/config';

/**
 * Locale negotiation for every page request (Next.js 16 "proxy", formerly middleware).
 *
 * URLs carry no language prefix. On a visitor's first request the language is negotiated from
 * Accept-Language and persisted in the NEXT_LOCALE cookie, so server rendering (src/i18n/request.ts),
 * the language switcher and API calls (which send the cookie as Accept-Language) agree from then on.
 * An unsupported or malformed cookie is replaced with the negotiated language.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const current = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!canonicalLocale(current)) {
    const negotiated = resolveLocale(null, request.headers.get('accept-language'));
    response.cookies.set(LOCALE_COOKIE, negotiated, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  }
  return response;
}

export const config = {
  // Skip API routes, Next.js internals and static files
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
