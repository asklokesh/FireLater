export const locales = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'zh', 'ru', 'ar', 'he'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'en';
export const rtlLocales: readonly AppLocale[] = ['ar', 'he'];
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** Native language names for the language switcher. */
export const localeNames: Record<AppLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  ja: '日本語',
  zh: '简体中文',
  ru: 'Русский',
  ar: 'العربية',
  he: 'עברית',
};

/** Base language of a BCP-47 tag ("pt-BR" -> "pt", "iw" -> "he"), or null when unsupported. */
export function baseLocale(tag: string | null | undefined): AppLocale | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  const mapped = base === 'iw' ? 'he' : base;
  return (locales as readonly string[]).includes(mapped) ? (mapped as AppLocale) : null;
}

/** Canonical full tag (keeps the region for Intl formatting, e.g. "de-CH"), or null if unsupported. */
export function canonicalLocale(tag: string | null | undefined): string | null {
  const base = baseLocale(tag);
  if (!base || !tag) return null;
  try {
    const [canonical] = Intl.getCanonicalLocales(tag.trim().replace(/_/g, '-'));
    return baseLocale(canonical) === base ? canonical : base;
  } catch {
    return base;
  }
}

export function isRtlLocale(tag: string | null | undefined): boolean {
  const base = baseLocale(tag);
  return base !== null && rtlLocales.includes(base);
}

/** Pick the locale: saved cookie, then Accept-Language (by q-value), then English. */
export function resolveLocale(cookie?: string | null, acceptLanguage?: string | null): string {
  const fromCookie = canonicalLocale(cookie);
  if (fromCookie) return fromCookie;
  const tags = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim(), q: q ? Number.parseFloat(q.trim().slice(2)) : 1, index };
    })
    .filter((e) => e.tag && e.tag !== '*' && e.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of tags) {
    const c = canonicalLocale(tag);
    if (c) return c;
  }
  return defaultLocale;
}
