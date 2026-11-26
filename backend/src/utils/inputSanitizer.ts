/**
 * Recursive request-input sanitizer used by the validation middleware.
 *
 * Strategy (see docs/VALIDATION.md):
 *  - control characters / NUL bytes are removed from every string
 *  - HTML is processed with a linear-time tag scanner (no backtracking regexes):
 *      * script/style blocks are removed; other dangerous elements
 *        (iframe, object, embed, link, meta, base) lose their tag
 *      * inline event-handler attributes (on*) and attributes whose value is a
 *        javascript:/vbscript:/data:text/html URL (after entity decoding) are removed
 *      * plain-text fields (title, name, email, ...) have every tag removed
 *  - prose is left alone: "Set online = true", "a < b" and "use javascript: URLs" are unchanged
 *  - secrets (passwords, tokens, ...) are never modified
 *  - prototype-pollution keys are dropped
 * SQL injection is prevented by parameterised queries, not by string mangling.
 */

export const MAX_DEPTH = 32;
const MAX_TAG_LENGTH = 4096;
const MAX_PASSES = 4;

const SECRET_KEY = /pass(word|phrase)?|secret|token|credential|api[_-]?key|private[_-]?key|signature|hash|certificate/i;
const RAW_KEY = /^(script|expression|condition|sql|jql|regex|pattern)$/i;
const PLAIN_KEY = /^(title|name|\w*_?name|\w*Name|subject|email|\w*Email|slug|tenant|\w*Slug|search|q|label|key|username|phone|status|priority)$/i;
const URL_KEY = /(url|href|link|endpoint|webhook)/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const BLOCK_ELEMENTS = new Set(['script', 'style']);
const DROP_ELEMENTS = new Set(['iframe', 'object', 'embed', 'link', 'meta', 'base', 'frame', 'frameset', 'applet']);

export class InputTooDeepError extends Error {
  constructor() {
    super(`Input is nested deeper than ${MAX_DEPTH} levels`);
    this.name = 'InputTooDeepError';
  }
}

export interface SanitizeResult<T> {
  value: T;
  /** Dot-paths of values that were modified (values are never reported). */
  changed: string[];
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ENTITY = /&(?:#x([0-9a-f]{1,6})|#(\d{1,7})|(colon|tab|newline));?/gi;
const DANGEROUS_URL = /^(javascript|vbscript|data:text\/html)/;

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/** True when a (possibly entity-encoded, whitespace-padded) URL uses a script scheme. */
export function isDangerousUrl(raw: string): boolean {
  const decoded = raw
    .replace(ENTITY, (_m, hex, dec, named) => {
      if (named) return named.toLowerCase() === 'colon' ? ':' : '';
      const code = hex ? parseInt(hex, 16) : parseInt(dec, 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    })
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000- \u007F]/g, '')
    .toLowerCase();
  return DANGEROUS_URL.test(decoded);
}

/** Remove dangerous attributes from one tag's text, preserving everything else verbatim. */
function cleanTag(tag: string): string {
  let i = 1; // after '<'
  if (tag[i] === '/') i++;
  while (i < tag.length && !isSpace(tag[i]) && tag[i] !== '/' && tag[i] !== '>') i++;
  const head = tag.slice(0, i);
  let out = head;
  const n = tag.length;
  while (i < n) {
    const sepStart = i;
    while (i < n && (isSpace(tag[i]) || tag[i] === '/' || tag[i] === '"' || tag[i] === "'" || tag[i] === '`')) i++;
    if (i >= n || tag[i] === '>') { out += tag.slice(sepStart); break; }
    const nameStart = i;
    while (i < n && !isSpace(tag[i]) && tag[i] !== '=' && tag[i] !== '/' && tag[i] !== '>' && tag[i] !== '"' && tag[i] !== "'") i++;
    if (i === nameStart) { i++; out += tag.slice(sepStart, i); continue; } // stray char, keep progressing
    const name = tag.slice(nameStart, i).toLowerCase();
    let j = i;
    while (j < n && isSpace(tag[j])) j++;
    let value = '';
    let end = i;
    if (tag[j] === '=') {
      j++;
      while (j < n && isSpace(tag[j])) j++;
      let vs = j;
      if (tag[j] === '"' || tag[j] === "'") {
        const q = tag[j];
        vs = j + 1;
        let close = tag.indexOf(q, vs);
        if (close === -1) close = n;
        value = tag.slice(vs, close);
        end = Math.min(close + 1, n);
      } else {
        while (j < n && !isSpace(tag[j]) && tag[j] !== '>') j++;
        value = tag.slice(vs, j);
        end = j;
      }
    }
    const bad = name.startsWith('on') || name === 'srcdoc' || isDangerousUrl(value);
    if (!bad) out += tag.slice(sepStart, end);
    i = end;
  }
  return out;
}

/** One linear pass over the HTML in `input`. */
function scanHtml(input: string, stripAllTags: boolean): string {
  const lower = input.toLowerCase();
  const n = input.length;
  let out = '';
  let i = 0;
  let nextGt = -2; // cached position of the next '>' (-1 = none left)
  let noCommentEnd = false; // no further '-->' in the input
  const noBlockEnd = new Set<string>(); // block elements with no further closing tag
  while (i < n) {
    const lt = input.indexOf('<', i);
    if (lt === -1) { out += input.slice(i); break; }
    out += input.slice(i, lt);
    const c = input[lt + 1] ?? '';
    if (input.startsWith('<!--', lt)) {
      const close = noCommentEnd ? -1 : input.indexOf('-->', lt + 4);
      if (close === -1) noCommentEnd = true;
      i = close === -1 ? lt + 4 : close + 3;
      continue;
    }
    if (!(isAlpha(c) || c === '/' || c === '!' || c === '?')) { out += '<'; i = lt + 1; continue; }
    if (nextGt !== -1 && nextGt < lt) nextGt = input.indexOf('>', lt);
    const nextLt = input.indexOf('<', lt + 1);
    let end: number;
    let terminated = false;
    if (nextGt !== -1 && nextGt < lt) nextGt = input.indexOf('>', lt);
    if (nextGt !== -1 && (nextLt === -1 || nextGt < nextLt) && nextGt - lt <= MAX_TAG_LENGTH) {
      end = nextGt + 1;
      terminated = true;
    } else {
      end = Math.min(nextLt === -1 ? n : nextLt, lt + MAX_TAG_LENGTH);
    }
    const tag = input.slice(lt, end);
    const m = /^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tag.length > 64 ? tag.slice(0, 64) : tag);
    const name = m ? m[1].toLowerCase() : '';
    const closing = tag[1] === '/';
    if (BLOCK_ELEMENTS.has(name) && !closing && terminated) {
      const close = noBlockEnd.has(name) ? -1 : lower.indexOf(`</${name}`, end);
      if (close === -1) noBlockEnd.add(name);
      if (close !== -1) {
        const closeEnd = lower.indexOf('>', close);
        i = closeEnd === -1 ? n : closeEnd + 1;
        continue;
      }
    }
    const dropped = stripAllTags || BLOCK_ELEMENTS.has(name) || DROP_ELEMENTS.has(name) || !m;
    if (dropped) {
      if (terminated) { i = end; continue; }
      // Unterminated: keep the text after it. A dangerous name is escaped (it could be completed by
      // markup concatenated later); anything else just loses its own "<name" token.
      if (m && !stripAllTags && (BLOCK_ELEMENTS.has(name) || DROP_ELEMENTS.has(name))) {
        out += '&lt;';
        i = lt + 1;
      } else {
        i = lt + 1 + (closing ? 1 : 0) + (m ? m[1].length : 0);
      }
      continue;
    }
    out += closing ? tag : cleanTag(tag);
    i = end;
  }
  return out;
}

/** Sanitize one string according to the field name it was sent under. */
export function sanitizeString(value: string, key = ''): string {
  if (SECRET_KEY.test(key) || RAW_KEY.test(key)) return value;
  let out = value.replace(CONTROL_CHARS, '');
  if (out.includes('<')) {
    const plain = PLAIN_KEY.test(key);
    let prev = out;
    let passes = 0;
    do {
      prev = out;
      out = scanHtml(prev, plain);
      passes++;
    } while (out !== prev && out.includes('<') && passes < MAX_PASSES);
    // payloads that re-form after removal (e.g. "<scr<script>ipt>") keep changing: neutralise
    if (out !== prev || (passes >= MAX_PASSES && scanHtml(out, plain) !== out)) out = out.replace(/</g, '&lt;');
    if (plain) out = out.trim();
  } else if (PLAIN_KEY.test(key)) {
    out = out.trim();
  }
  if (URL_KEY.test(key) && (isDangerousUrl(out) || /^\s*file:/i.test(out))) out = '';
  return out;
}

function walk(value: unknown, key: string, path: string, depth: number, changed: string[]): unknown {
  if (depth > MAX_DEPTH) throw new InputTooDeepError();
  if (typeof value === 'string') {
    const out = sanitizeString(value, key);
    if (out !== value) changed.push(path || '(root)');
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => walk(item, key, `${path}[${i}]`, depth + 1, changed));
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value; // Buffers, streams, Dates, ...
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(k)) {
        changed.push(path ? `${path}.${k}` : k);
        continue;
      }
      out[k] = walk(v, k, path ? `${path}.${k}` : k, depth + 1, changed);
    }
    return out;
  }
  return value;
}

export function sanitizeInput<T>(value: T): SanitizeResult<T> {
  const changed: string[] = [];
  const out = walk(value, '', '', 0, changed) as T;
  return { value: out, changed };
}
