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
const MAX_PASSES = 4;

const SECRET_KEY = /pass(word|phrase)?|secret|token|credential|api[_-]?key|private[_-]?key|signature|hash|certificate/i;
const RAW_KEY = /^(script|expression|condition|sql|jql|regex|pattern)$/i;
const PLAIN_KEY = /^(title|name|\w*_?name|\w*Name|subject|email|\w*Email|slug|tenant|\w*Slug|search|q|label|key|username|phone|status|priority)$/i;
const URL_KEY = /(url|href|link|endpoint|webhook)/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const BLOCK_ELEMENTS = new Set(['script', 'style']);
// Raw-text / RCDATA elements (textarea, title, xmp, noembed, noframes, noscript, plaintext) are dropped too:
// a browser does not tokenize tags inside them, so quotes there hide nothing. Without the opener, the browser
// parses their content the way this scanner does.
const DROP_ELEMENTS = new Set([
  'iframe', 'object', 'embed', 'link', 'meta', 'base', 'frame', 'frameset', 'applet',
  'textarea', 'title', 'xmp', 'noembed', 'noframes', 'noscript', 'plaintext',
]);

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

/**
 * Remove dangerous attributes from one tag's text, preserving everything else verbatim.
 * Walks attributes with the same tokenizer rules as findTagEnd: an attribute name may start with
 * any character (including '"', "'" and '='), a value is quoted only right after '='.
 */
function cleanTag(tag: string): string {
  const n = tag.length;
  let i = 1; // after '<'
  if (tag[i] === '/') i++;
  while (i < n && !isSpace(tag[i]) && tag[i] !== '/' && tag[i] !== '>') i++;
  let out = tag.slice(0, i);
  while (i < n) {
    const sepStart = i;
    while (i < n && (isSpace(tag[i]) || tag[i] === '/')) i++;
    if (i >= n || tag[i] === '>') { out += tag.slice(sepStart); break; }
    const nameStart = i;
    i++; // first name character, whatever it is
    while (i < n && !isSpace(tag[i]) && tag[i] !== '/' && tag[i] !== '>' && tag[i] !== '=') i++;
    // a browser would not run "\"onclick", but drop it too rather than rely on that
    const name = tag.slice(nameStart, i).toLowerCase().replace(/^["'`=<]+/, '');
    let end = i;
    let value = '';
    let j = i;
    while (j < n && isSpace(tag[j])) j++;
    if (tag[j] === '=') {
      j++;
      while (j < n && isSpace(tag[j])) j++;
      if (tag[j] === '"' || tag[j] === "'") {
        let close = tag.indexOf(tag[j], j + 1);
        if (close === -1) close = n;
        value = tag.slice(j + 1, close);
        end = Math.min(close + 1, n);
      } else {
        const vs = j;
        while (j < n && !isSpace(tag[j]) && tag[j] !== '>') j++;
        value = tag.slice(vs, j);
        end = j;
      }
    }
    const bad = name.startsWith('on') || name === 'srcdoc' || isDangerousUrl(value);
    // A '<' kept inside an attribute value is written as &lt;, which a browser decodes to the same value,
    // so no later reader (or raw-text context the value lands in) can see a tag start there.
    if (!bad) out += tag.slice(sepStart, end).replace(/</g, '&lt;');
    i = end;
  }
  return out;
}

/**
 * Index of the '>' that ends the tag opened at `lt`, following the HTML tokenizer: a quoted attribute
 * value (" or ', not backtick) may hold '<' and '>', an unquoted value ends at whitespace or '>', and
 * '<' inside a tag or attribute name is an ordinary character. Returns -1 when the input ends first.
 * `<!...`, `<?...` and `</` + non-letter are bogus comments and end at the first '>'.
 */
function findTagEnd(input: string, lt: number, budget: { left: number }): number {
  const n = input.length;
  let p = lt + 1;
  if (input[p] === '/') p++;
  if (!isAlpha(input[p] ?? '')) return input.indexOf('>', p);
  const start = p;
  try {
    while (p < n && !isSpace(input[p]) && input[p] !== '/' && input[p] !== '>') p++; // tag name ('<' included)
    for (;;) {
      // before attribute name ('/' is the self-closing marker, then reconsumed here)
      while (p < n && (isSpace(input[p]) || input[p] === '/')) p++;
      if (p >= n) return -1;
      if (input[p] === '>') return p;
      // attribute name (a leading '=' belongs to the name)
      p++;
      while (p < n && !isSpace(input[p]) && input[p] !== '/' && input[p] !== '>' && input[p] !== '=') p++;
      // after attribute name
      while (p < n && isSpace(input[p])) p++;
      if (p >= n) return -1;
      if (input[p] !== '=') continue;
      // before attribute value
      p++;
      while (p < n && isSpace(input[p])) p++;
      if (p >= n) return -1;
      const q = input[p];
      if (q === '"' || q === "'") {
        const close = input.indexOf(q, p + 1);
        if (close === -1) { p = n; return -1; }
        p = close + 1;
      } else {
        while (p < n && !isSpace(input[p]) && input[p] !== '>') p++;
      }
    }
  } finally {
    budget.left -= p - start;
  }
}

/** One linear pass over the HTML in `input`. */
function scanHtml(input: string, stripAllTags: boolean): string {
  const lower = input.toLowerCase();
  const n = input.length;
  const lastGt = input.lastIndexOf('>');
  // Work cap for tag-end scans. Benign text uses a small multiple of its length; only crafted input
  // (many tags that each run to the end unterminated) can exhaust it, and then every remaining '<'
  // is escaped, which is safe and keeps the pass linear.
  const budget = { left: 4 * n + 65_536 };
  let out = '';
  let i = 0;
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
    if (budget.left <= 0) { out += input.slice(lt).replace(/</g, '&lt;'); break; }
    const gt = lt > lastGt ? -1 : findTagEnd(input, lt, budget);
    let end: number;
    let terminated = false;
    if (gt !== -1) {
      end = gt + 1;
      terminated = true;
    } else {
      const nextLt = input.indexOf('<', lt + 1);
      end = nextLt === -1 ? n : nextLt;
    }
    const tag = input.slice(lt, end);
    const m = /^<\/?([a-zA-Z][a-zA-Z0-9:-]*)/.exec(tag.length > 64 ? tag.slice(0, 64) : tag);
    const name = m ? m[1].toLowerCase() : '';
    const closing = tag[1] === '/';
    // A browser keeps '<' in a tag name ("<img<x", "<scr<script>"): no real element is named that way,
    // so the whole tag is dropped rather than cleaned.
    let nameEnd = lt + (closing ? 2 : 1);
    while (nameEnd < end && !isSpace(input[nameEnd]) && input[nameEnd] !== '/' && input[nameEnd] !== '>') nameEnd++;
    const oddName = input.slice(lt + 1, nameEnd).includes('<', closing ? 1 : 0);
    if (BLOCK_ELEMENTS.has(name) && !closing && terminated && !oddName) {
      const close = noBlockEnd.has(name) ? -1 : lower.indexOf(`</${name}`, end);
      if (close === -1) noBlockEnd.add(name);
      if (close !== -1) {
        const closeEnd = findTagEnd(input, close, budget);
        i = closeEnd === -1 ? n : closeEnd + 1;
        continue;
      }
    }
    const dropped = stripAllTags || oddName || BLOCK_ELEMENTS.has(name) || DROP_ELEMENTS.has(name) || !m;
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
