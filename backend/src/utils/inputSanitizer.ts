import sanitizeHtml from 'sanitize-html';
import { sanitizeHTML } from './contentSanitization.js';

/**
 * Recursive sanitization of untrusted request input (body, query, params).
 *
 * Policy (see docs/validation.md):
 *  - every string: NUL bytes and control characters (except \t \n \r) are removed
 *  - secret-like keys (password, token, secret, ...) are otherwise left untouched so credentials are never altered
 *  - rich-text keys (content, html, ...) go through the allow-list HTML sanitizer in contentSanitization.ts
 *  - all other strings have HTML tags (and script/style contents) stripped; remaining text is entity-escaped
 *    by sanitize-html, with a bare ampersand restored so "A & B" survives
 *  - "javascript:", "vbscript:" and "data:text/html" URL schemes are neutralised
 *  - prototype-pollution keys (__proto__) are dropped
 *  - nesting deeper than MAX_DEPTH is rejected
 */

export const MAX_DEPTH = 32;

const SECRET_KEY = /pass(word|phrase)?|token|secret|api_?key|credential|signature|private_?key|certificate|authorization/i;
const RICH_TEXT_KEY = /^(content|html|richtext|rich_text|body_html|article_body)$/i;
const FORBIDDEN_KEYS = new Set(['__proto__']);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const DANGEROUS_SCHEME = /\b(javascript|vbscript)\s*:|data\s*:\s*text\/html/gi;

export class InputTooDeepError extends Error {
  constructor() {
    super(`Input nesting exceeds ${MAX_DEPTH} levels`);
    this.name = 'InputTooDeepError';
  }
}

export interface SanitizeReport {
  /** Number of string values or keys that were modified or dropped. */
  changes: number;
  /** Dotted paths of the modified values (capped at 20). */
  paths: string[];
}

export function newReport(): SanitizeReport {
  return { changes: 0, paths: [] };
}

function record(report: SanitizeReport, path: string) {
  report.changes += 1;
  if (report.paths.length < 20) report.paths.push(path);
}

/** Sanitize one string given the key it was found under. */
export function sanitizeString(value: string, key = ''): string {
  let out = value.replace(CONTROL_CHARS, '');
  if (SECRET_KEY.test(key)) return out;

  if (RICH_TEXT_KEY.test(key)) {
    return sanitizeHTML(out);
  }

  if (out.includes('<') || out.includes('&')) {
    const stripped = sanitizeHtml(out, { allowedTags: [], allowedAttributes: {}, disallowedTagsMode: 'discard' });
    out = stripped.replace(/&amp;/g, '&');
  }
  return out.replace(DANGEROUS_SCHEME, '');
}

/** Recursively sanitize any JSON-like value. Returns a new value; the input is not mutated. */
export function sanitizeInput<T>(value: T, report: SanitizeReport = newReport(), key = '', path = '', depth = 0): T {
  if (depth > MAX_DEPTH) throw new InputTooDeepError();

  if (typeof value === 'string') {
    const clean = sanitizeString(value, key);
    if (clean !== value) record(report, path || key || '(root)');
    return clean as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item, i) => sanitizeInput(item, report, key, `${path}[${i}]`, depth + 1)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${k}` : k;
      if (FORBIDDEN_KEYS.has(k)) {
        record(report, childPath);
        continue;
      }
      out[k] = sanitizeInput(v, report, k, childPath, depth + 1);
    }
    return out as T;
  }

  return value;
}
