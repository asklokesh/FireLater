import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodTypeAny } from 'zod';
import {
  RouteSchema, getRouteSchema, routeKey,
  defaultBodySchema, defaultParamsSchema, defaultQuerySchema,
} from '../schemas/index.js';
import { buildValidationError, formatZodIssues, ValidationErrorDetail, ValidationLocation } from '../utils/validationErrors.js';
import { logger } from '../utils/logger.js';

/**
 * Unified request validation + sanitization.
 *
 * registerValidation(app) installs, for EVERY route registered afterwards:
 *   1. input sanitization of params, query and body (XSS, control chars, prototype pollution)
 *   2. Zod validation using the schema from the registry (src/schemas/index.ts), or a
 *      strict baseline schema when the route has no dedicated entry
 *   3. optional per-route rate limiting (registry `rateLimit`)
 *   4. security audit logging
 */

export const MAX_DEPTH = 20;
// Guards against pathological payloads only; the HTTP bodyLimit (10 MB) bounds real input.
export const MAX_KEYS = 500_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Fields carrying secrets/credentials must reach handlers byte-for-byte.
const RAW_KEY_PATTERN = /pass(word|phrase)?|secret|token|signature|api[-_]?key|credential|private[-_]?key|certificate|hash/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
// A scheme only counts as dangerous when it is used as a URL: "javascript:alert(1)", not "JavaScript error".
const DANGEROUS_SCHEME = /^\s*(?:javascript|vbscript|data\s*:\s*text\/html)\s*:(?=\S)/i;
// Elements that can execute or restyle the page. Removed together with their content.
const DANGEROUS_ELEMENT = /<\s*(script|iframe|object|embed|style|template|noscript)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const DANGEROUS_OPEN_TAG = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|base|template|noscript)\b[^>]*>/gi;
// Inside any real tag: inline event handlers and javascript:/vbscript:/data:text/html URLs.
const HTML_TAG = /<\s*[a-zA-Z][^<>]*>/g;
const EVENT_HANDLER_ATTR = /[\s/"']on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi;
const SCRIPT_URL_ATTR = /\s(?:href|src|action|formaction|xlink:href|srcdoc|data)\s*=\s*(["']?)\s*(?:javascript|vbscript|data\s*:\s*text\/html)[^"'>\s]*\1/gi;
const SUSPICIOUS = [
  /\bunion\s+(all\s+)?select\b/i,
  /'\s*or\s+'?\d+'?\s*=\s*'?\d+/i,
  /;\s*(drop|truncate|delete\s+from|insert\s+into|update\s+\w+\s+set)\b/i,
  /\bpg_sleep\s*\(/i,
  /\.\.[\\/]/,
];

export class SanitizationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = 'SanitizationError';
  }
}

export interface SanitizeReport {
  modified: string[];
  suspicious: string[];
}

/**
 * Neutralise script-capable markup without rewriting ordinary text. Only dangerous elements, event-handler
 * attributes and script URLs are removed; "Jane <jane@example.com>", "<msg-id@host>", "a<b" and code snippets
 * are returned unchanged.
 */
export function sanitizeString(value: string, key = ''): string {
  if (RAW_KEY_PATTERN.test(key)) return value;
  let out = value.replace(CONTROL_CHARS, '');
  out = out.replace(DANGEROUS_SCHEME, '');
  // Repeat until stable so nested payloads like <scr<script>ipt> cannot reassemble.
  for (let i = 0; i < 5 && out.includes('<'); i++) {
    const before = out;
    out = out
      .replace(DANGEROUS_ELEMENT, '')
      .replace(DANGEROUS_OPEN_TAG, '')
      .replace(HTML_TAG, (tag) => tag.replace(EVENT_HANDLER_ATTR, '').replace(SCRIPT_URL_ATTR, ''));
    if (out === before) break;
  }
  return out;
}

/** Deeply sanitize a value. Throws SanitizationError on forbidden keys / excessive nesting. */
export function sanitizeValue(value: unknown, report: SanitizeReport, path = '', depth = 0, key = '', counter = { keys: 0 }): unknown {
  if (typeof value === 'string') {
    const out = sanitizeString(value, key);
    if (out !== value) report.modified.push(path || '(root)');
    if (!RAW_KEY_PATTERN.test(key) && SUSPICIOUS.some((re) => re.test(value))) report.suspicious.push(path || '(root)');
    return out;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (depth >= MAX_DEPTH) throw new SanitizationError(`Input is nested deeper than ${MAX_DEPTH} levels`, path || '(root)');

  if (Array.isArray(value)) {
    return value.map((item, i) => sanitizeValue(item, report, `${path}[${i}]`, depth + 1, key, counter));
  }
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) throw new SanitizationError(`Forbidden key "${k}"`, path ? `${path}.${k}` : k);
    if (++counter.keys > MAX_KEYS) throw new SanitizationError('Too many keys in input', path || '(root)');
    result[k] = sanitizeValue(v, report, path ? `${path}.${k}` : k, depth + 1, k, counter);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Per-route rate limiting (fixed window, in-memory per process)
// ---------------------------------------------------------------------------
const windows = new Map<string, { count: number; resetAt: number }>();

export function resetRouteRateLimits(): void {
  windows.clear();
}

function hitRateLimit(key: string, max: number, windowMs: number, now = Date.now()): number | null {
  if (windows.size > 10_000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const w = windows.get(key);
  if (!w || w.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  w.count += 1;
  return w.count > max ? Math.ceil((w.resetAt - now) / 1000) : null;
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------
function shouldValidateBody(request: FastifyRequest): boolean {
  const body = request.body;
  if (body === undefined || body === null) return false;
  const type = String(request.headers['content-type'] ?? '');
  if (/multipart\//i.test(type)) return false;
  return !Buffer.isBuffer(body) && (typeof body === 'object' || typeof body === 'string');
}

function isJsonBody(request: FastifyRequest): boolean {
  return /json/i.test(String(request.headers['content-type'] ?? ''));
}

function routePattern(request: FastifyRequest): string {
  return request.routeOptions?.url ?? request.url.split('?')[0] ?? '';
}

function audit(request: FastifyRequest, event: string, extra: Record<string, unknown>): void {
  const user = (request as { user?: { userId?: string } }).user;
  logger.warn({
    event,
    method: request.method,
    route: routePattern(request),
    ip: request.ip,
    userId: user?.userId,
    requestId: request.id,
    ...extra,
  }, `security: ${event}`);
}

function fail(request: FastifyRequest, reply: FastifyReply, details: ValidationErrorDetail[]): FastifyReply {
  audit(request, 'validation_failed', { fields: details.map((d) => `${d.location}.${d.field}`).slice(0, 20) });
  return reply.code(400).send(buildValidationError(details));
}

export type ValidationPhase = 'early' | 'body' | 'schema' | 'full';

/**
 * Sanitize and validate one request in up to three phases, so that anonymous callers are not shown
 * schema details for routes they may not use:
 *   early  (onRequest)     sanitize + baseline checks of params/query (ahead of any auth hook)
 *   body   (preValidation) sanitize body, baseline body limits (routes without a dedicated body schema), rate limit
 *   schema (preHandler)    dedicated registry schemas; appended after the route's own auth/permission hooks
 *   full                   all of the above at once (explicit app.validate(schema) hooks)
 * Returns the reply when it already responded (400/429), otherwise undefined. `override` replaces the registry lookup.
 */
export async function validateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  override?: RouteSchema,
  phase: ValidationPhase = 'full',
): Promise<FastifyReply | undefined> {
  const schema = override ?? getRouteSchema(request.method, routePattern(request));
  const doEarly = phase === 'early' || phase === 'full';
  const doBody = phase === 'body' || phase === 'full';
  const doSchema = phase === 'schema' || phase === 'full';
  const report: SanitizeReport = { modified: [], suspicious: [] };

  // 1. Sanitize (each location separately so reported field paths are relative to it)
  const locations: ValidationLocation[] = [];
  if (doEarly) locations.push('params', 'query');
  if (doBody && shouldValidateBody(request)) locations.push('body');
  for (const location of locations) {
    const local: SanitizeReport = { modified: [], suspicious: [] };
    try {
      const clean = sanitizeValue(request[location], local);
      (request as unknown as Record<string, unknown>)[location] = clean;
    } catch (err) {
      if (err instanceof SanitizationError) {
        return fail(request, reply, [{ location, field: err.field, message: err.message, code: 'sanitization' }]);
      }
      throw err;
    }
    report.modified.push(...local.modified.map((f) => `${location}.${f}`));
    report.suspicious.push(...local.suspicious.map((f) => `${location}.${f}`));
  }
  if (report.modified.length > 0 || report.suspicious.length > 0) {
    audit(request, 'input_sanitized', {
      sanitizedFields: report.modified.slice(0, 20),
      suspiciousFields: report.suspicious.slice(0, 20),
    });
  }

  // 2. Opt-in per-route rate limit (registry `rateLimit`); no route has one unless it is configured
  if (doBody && schema?.rateLimit) {
    const retryAfter = hitRateLimit(`${routeKey(request.method, routePattern(request))}|${request.ip}`, schema.rateLimit.max, schema.rateLimit.timeWindowMs);
    if (retryAfter !== null) {
      audit(request, 'route_rate_limited', {});
      reply.header('retry-after', String(retryAfter));
      return reply.code(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${retryAfter} seconds`,
        retryAfter,
      });
    }
  }

  // 3. Validate
  const details: ValidationErrorDetail[] = [];
  const check = (location: ValidationLocation, zod: ZodTypeAny | undefined, value: unknown) => {
    if (!zod) return;
    const result = zod.safeParse(value);
    if (!result.success) details.push(...formatZodIssues(location, result.error.issues));
  };
  if (doEarly) {
    check('params', defaultParamsSchema, request.params ?? {});
    check('query', defaultQuerySchema, request.query ?? {});
  }
  if (doBody && !schema?.body && shouldValidateBody(request) && isJsonBody(request)) {
    check('body', defaultBodySchema, request.body);
  }
  if (doSchema && details.length === 0) {
    check('params', schema?.params, request.params ?? {});
    check('query', schema?.query, request.query ?? {});
    if (schema?.body) check('body', schema.body, request.body ?? {});
  }
  if (details.length > 0) return fail(request, reply, details);
  return undefined;
}

function hasDedicatedSchema(entry: RouteSchema | undefined): boolean {
  return !!entry && !!(entry.body || entry.params || entry.query);
}

export interface ValidationCoverageEntry {
  method: string;
  url: string;
  /** Has an explicit registry entry (even if the route takes no input). */
  registered: boolean;
  /** Registry entry declares a body, params or query schema. */
  dedicatedSchema: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Build a preValidation hook that validates with an explicit schema instead of the registry. */
    validate: (schema: RouteSchema) => (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
    /** Every route seen by the validation layer, and whether it has a dedicated schema. */
    validationCoverage: () => ValidationCoverageEntry[];
  }
}

/**
 * Install the global validation layer. Call BEFORE registering routes so that
 * every route (including prefixed plugins) is covered.
 */
export function registerValidation(app: FastifyInstance): void {
  const coverage: ValidationCoverageEntry[] = [];

  app.decorate('validate', (schema: RouteSchema) => (request: FastifyRequest, reply: FastifyReply) =>
    validateRequest(request, reply, schema));
  app.decorate('validationCoverage', () => coverage);

  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      coverage.push({ method, url: route.url, registered: getRouteSchema(method, route.url) !== undefined, dedicatedSchema: hasDedicatedSchema(getRouteSchema(method, route.url)) });
    }
    // Dedicated schemas run last in the preHandler chain, i.e. after the route's own authentication and
    // permission hooks, so anonymous callers get 401/403 rather than schema details.
    const existing = route.preHandler ? (Array.isArray(route.preHandler) ? route.preHandler : [route.preHandler]) : [];
    route.preHandler = [...existing, schemaPhase] as typeof route.preHandler;
  });

  // onRequest runs before route-level hooks (e.g. authentication registered in an onRequest hook), so the
  // baseline checks of params and query also cover routes that would otherwise answer 401 first.
  app.addHook('onRequest', async (request, reply) => validateRequest(request, reply, undefined, 'early'));

  // preValidation runs after body parsing.
  app.addHook('preValidation', async (request, reply) => validateRequest(request, reply, undefined, 'body'));
}

async function schemaPhase(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
  return validateRequest(request, reply, undefined, 'schema');
}
