import fs from 'node:fs';
import path from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ja', 'zh', 'ru', 'ar', 'he'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const RTL_LOCALES: readonly Locale[] = ['ar', 'he'];

type Messages = { [key: string]: string | Messages };

function localesDir(): string {
  // src/lib -> src/locales (tsx, vitest); dist/lib falls back to src/locales since tsc does not copy JSON.
  const candidates = [path.resolve(__dirname, '../locales'), path.resolve(__dirname, '../../src/locales')];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}

const dir = localesDir() + path.sep;
const catalogs = new Map<Locale, Messages>();

function catalog(locale: Locale): Messages {
  let c = catalogs.get(locale);
  if (!c) {
    c = JSON.parse(fs.readFileSync(`${dir}${locale}.json`, 'utf8')) as Messages;
    catalogs.set(locale, c);
  }
  return c;
}

function lookup(messages: Messages, key: string): string | undefined {
  let cur: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = cur[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Map a BCP-47 tag ("pt-BR", "zh_CN", "AR-sa") to a supported base language, or null. */
export function normalizeLocale(tag: string | undefined | null): Locale | null {
  if (!tag) return null;
  const base = tag.trim().toLowerCase().replace(/_/g, '-').split('-')[0];
  const mapped = base === 'iw' ? 'he' : base; // legacy Hebrew code
  return isSupportedLocale(mapped) ? mapped : null;
}

/** Parse an Accept-Language header into tags sorted by quality (highest first). */
export function parseAcceptLanguage(header: string | undefined | null): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter((e) => e.tag && e.tag !== '*' && e.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((e) => e.tag);
}

export function resolveLocale(opts: { explicit?: string | null; user?: string | null; acceptLanguage?: string | null }): Locale {
  const fromExplicit = normalizeLocale(opts.explicit);
  if (fromExplicit) return fromExplicit;
  const fromUser = normalizeLocale(opts.user);
  if (fromUser) return fromUser;
  for (const tag of parseAcceptLanguage(opts.acceptLanguage)) {
    const l = normalizeLocale(tag);
    if (l) return l;
  }
  return DEFAULT_LOCALE;
}

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** Translate a dotted key; falls back to English, then to the key itself. {name} placeholders are interpolated. */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const raw = lookup(catalog(locale), key) ?? lookup(catalog(DEFAULT_LOCALE), key) ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Fastify onRequest hook: resolve request.locale from ?lang=, then Accept-Language. */
export async function i18nOnRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = request.query as Record<string, unknown> | undefined;
  const explicit = typeof query?.lang === 'string' ? query.lang : undefined;
  const accept = request.headers['accept-language'];
  request.locale = resolveLocale({
    explicit,
    acceptLanguage: Array.isArray(accept) ? accept.join(',') : accept,
  });
  reply.header('Content-Language', request.locale);
}

/**
 * Locale for an error response. An explicit ?lang= wins; otherwise the signed-in user's saved
 * preference (looked up lazily, only when an error is produced), then Accept-Language.
 */
export async function localeForError(
  request: FastifyRequest,
  loadUserLocale?: (tenantSlug: string, userId: string) => Promise<string | null>
): Promise<Locale> {
  const query = request.query as Record<string, unknown> | undefined;
  const explicit = typeof query?.lang === 'string' ? normalizeLocale(query.lang) : null;
  if (explicit) return explicit;
  const user = (request as FastifyRequest & { user?: { userId?: string; tenantSlug?: string } }).user;
  if (loadUserLocale && user?.userId && user.tenantSlug) {
    try {
      const saved = normalizeLocale(await loadUserLocale(user.tenantSlug, user.userId));
      if (saved) return saved;
    } catch {
      // fall through to Accept-Language
    }
  }
  return request.locale ?? DEFAULT_LOCALE;
}

const STATUS_KEYS: Record<number, string> = {
  401: 'errors.unauthorized',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  429: 'errors.rateLimited',
};

/** Key for a generic HTTP status, or undefined when no generic translation applies. */
export function errorKeyForStatus(status: number): string | undefined {
  return STATUS_KEYS[status];
}

let reverseMsg: Map<string, string> | undefined;
let templateMsg: Array<{ re: RegExp; key: string }> | undefined;

function loadCatalogIndex() {
  reverseMsg = new Map();
  templateMsg = [];
  const msg = ((catalog(DEFAULT_LOCALE).errors as Messages | undefined)?.msg ?? {}) as Messages;
  for (const [id, text] of Object.entries(msg)) {
    if (typeof text !== 'string') continue;
    const key = `errors.msg.${id}`;
    if (/\{\w+\}/.test(text)) {
      // "Cannot update change in status: {status}" -> matches the interpolated message the service emits
      const source = text.split(/(\{\w+\})/).map((part) => (/^\{\w+\}$/.test(part) ? `(?<${part.slice(1, -1)}>.+?)` : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
      templateMsg.push({ re: new RegExp(`^${source}$`, 's'), key });
    } else {
      reverseMsg.set(text, key);
    }
  }
}

/** Translation key (and captured values) of the errors.msg entry whose English text matches the message. */
function catalogMessage(message: string): { key: string; params?: Record<string, string> } | undefined {
  if (!reverseMsg || !templateMsg) loadCatalogIndex();
  const exact = reverseMsg!.get(message);
  if (exact) return { key: exact };
  for (const { re, key } of templateMsg!) {
    const m = re.exec(message);
    if (m) return { key, params: { ...(m.groups ?? {}) } };
  }
  return undefined;
}

/** Well-known English messages emitted by middleware/services, mapped to their translation keys. */
const KNOWN_MESSAGES: Record<string, string> = {
  Unauthorized: 'errors.unauthorized',
  'Invalid or expired token': 'errors.unauthorized',
  Forbidden: 'errors.forbidden',
  'You do not have permission to perform this action': 'errors.forbidden',
  'You do not have the required role': 'errors.forbidden',
  'Invalid email or password': 'errors.invalidCredentials',
  'Invalid or expired verification token': 'errors.invalidVerificationToken',
  'Invalid or expired reset token': 'errors.invalidResetToken',
  'Email is already verified': 'errors.emailAlreadyVerified',
  'Account is not active': 'errors.accountNotActive',
  'Approval has already been processed': 'errors.approvalProcessed',
  'No fields to update': 'errors.noFieldsToUpdate',
  'Search took too long. Add more specific terms or filters.': 'errors.searchTooSlow',
};

/**
 * Localize an error message. Specific, hand-written English messages are preserved unless they are
 * well-known (KNOWN_MESSAGES) or the error carries a messageKey; validation, not-found, rate-limit and
 * internal errors use their generic translations.
 */
export function localizeErrorMessage(
  locale: Locale,
  err: { statusCode: number; message?: string; name?: string; messageKey?: string; messageParams?: Record<string, string | number>; resource?: string; identifier?: string },
  kind?: 'validation' | 'internal'
): string {
  if (err.messageKey) return t(locale, err.messageKey, err.messageParams);
  if (kind === 'validation') return t(locale, 'errors.validationFailed');
  if (kind === 'internal') return t(locale, 'errors.internal');
  if (err.name === 'NotFoundError' && err.resource) {
    return err.identifier
      ? t(locale, 'errors.notFoundWithId', { resource: err.resource, id: err.identifier })
      : t(locale, 'errors.notFoundResource', { resource: err.resource });
  }
  if (err.message && KNOWN_MESSAGES[err.message]) return t(locale, KNOWN_MESSAGES[err.message]);
  const found = err.message ? catalogMessage(err.message) : undefined;
  if (found) return t(locale, found.key, found.params);
  if (err.name === 'NotFoundError' || err.statusCode === 429) {
    const key = errorKeyForStatus(err.statusCode);
    if (key) return t(locale, key);
  }
  return err.message ?? t(locale, 'errors.internal');
}
