'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_COOKIE, baseLocale, defaultLocale, localeNames, locales } from '@/i18n/config';
import { api, getAccessToken } from '@/lib/api';
import { useOptionalIntl, useT } from '@/i18n/useT';

function hasToken(): boolean {
  try {
    return !!getAccessToken();
  } catch {
    return false;
  }
}

/** Persist the chosen language in a cookie and, when signed in, on the user's profile. */
export async function saveLocalePreference(locale: string): Promise<void> {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  if (hasToken()) {
    try {
      await api.put('/v1/users/me/locale', { locale });
    } catch {
      // The cookie still applies; the server preference is retried on the next change.
    }
  }
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const t = useT('common');
  const intl = useOptionalIntl();
  const current = baseLocale(intl?.locale) ?? defaultLocale;

  // After sign-in, adopt the language saved on the user's profile (it follows them across browsers).
  useEffect(() => {
    if (!hasToken()) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/v1/users/me/locale');
        const saved = baseLocale(data?.locale);
        if (!cancelled && saved && saved !== current) {
          document.cookie = `${LOCALE_COOKIE}=${saved}; path=/; max-age=31536000; samesite=lax`;
          router.refresh();
        }
      } catch {
        // keep the current language
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = async (value: string) => {
    await saveLocalePreference(value);
    router.refresh();
  };

  return (
    <select
      aria-label={t('language')}
      value={current}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? 'rounded-lg border border-border bg-surface px-2 py-1 text-sm text-foreground'}
    >
      {locales.map((code) => (
        <option key={code} value={code}>
          {localeNames[code]}
        </option>
      ))}
    </select>
  );
}
