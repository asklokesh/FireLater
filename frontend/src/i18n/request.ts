import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, baseLocale, defaultLocale, resolveLocale } from './config';

// Cookie-based locale selection (no URL prefix) so existing routes keep working.
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerStore.get('accept-language'));
  const messages = (await import(`../../messages/${baseLocale(locale) ?? defaultLocale}.json`)).default;
  return { locale, messages };
});
