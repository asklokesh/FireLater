'use client';

import { useMemo } from 'react';
import { useLocale, useMessages } from 'next-intl';
import en from '../../messages/en.json';

/**
 * Locale/messages from the next-intl provider, or null when rendered outside NextIntlClientProvider
 * (e.g. isolated component tests). The provider is either always or never present for a given tree,
 * so the hook order is stable between renders.
 */
export function useOptionalIntl(): { locale: string; messages: Record<string, unknown> } | null {
  try {
    /* eslint-disable react-hooks/rules-of-hooks */
    const locale = useLocale();
    const messages = useMessages() as Record<string, unknown>;
    /* eslint-enable react-hooks/rules-of-hooks */
    return { locale, messages };
  } catch {
    return null;
  }
}

type Translator = (key: string, values?: Record<string, string | number>) => string;

function lookup(messages: Record<string, unknown>, path: string): string | undefined {
  let cur: unknown = messages;
  for (const part of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

/**
 * Namespace translator ("auth.login" -> t("title")). Uses the provider's messages and falls back to
 * English for missing keys or when there is no provider.
 */
export function useT(namespace: string): Translator {
  const intl = useOptionalIntl();
  const messages = intl?.messages;
  return useMemo<Translator>(
    () => (key, values) => {
      const path = `${namespace}.${key}`;
      const raw = (messages && lookup(messages, path)) ?? lookup(en, path) ?? path;
      return values ? raw.replace(/\{(\w+)\}/g, (m, n: string) => (n in values ? String(values[n]) : m)) : raw;
    },
    [messages, namespace]
  );
}
