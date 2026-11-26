import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { ZodTypeAny } from 'zod';
import { logger } from '../utils/logger.js';
import { sanitizeInput, InputTooDeepError } from '../utils/inputSanitizer.js';
import {
  buildValidationError,
  formatZodIssues,
  type FormattedValidationIssue,
  type ValidationLocation,
} from '../utils/validationErrors.js';
import { lookupSchemas, schemaRegistry } from '../schemas/index.js';

export interface RateLimitOptions {
  /** Maximum requests per window per key. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Defaults to client IP. The route is always part of the key. */
  keyGenerator?: (request: FastifyRequest) => string;
}

/** A schema, or a function choosing one from the request (e.g. by header). */
export type SchemaSource = ZodTypeAny | ((request: FastifyRequest) => ZodTypeAny);

export interface ValidateOptions {
  body?: SchemaSource;
  params?: SchemaSource;
  query?: SchemaSource;
  /** Extra query schema that only adds checks (output ignored); used for the convention paging keys. */
  alsoQuery?: ZodTypeAny;
  /** Per-route rate limit (in-memory, per process). */
  rateLimit?: RateLimitOptions;
}

/**
 * explicit: route-level validate() or an entry in schemaRegistry
 * default:  convention schemas from lookupSchemas (path params, GET query, JSON-object body)
 * baseline: sanitization only (no input shape to check)
 */
export type ValidationCoverage = { route: string; mode: 'explicit' | 'default' | 'baseline' };

const VALIDATOR_MARK = Symbol.for('firelater.validator');
const VALIDATOR_OPTIONS = Symbol.for('firelater.validator.options');
const LOCATIONS: ValidationLocation[] = ['params', 'query', 'body'];

declare module 'fastify' {
  interface FastifyInstance {
    validate: (options?: ValidateOptions) => preHandlerAsyncHookHandler;
    validationCoverage: () => ValidationCoverage[];
  }
  interface FastifyRequest {
    inputValidated?: boolean;
  }
}

/** Sliding-window in-memory limiter, one instance per validate() call. */
function createLimiter(options: RateLimitOptions) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): { allowed: boolean; retryAfterSec: number } => {
    const cutoff = now - options.windowMs;
    const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= options.max) {
      hits.set(key, recent);
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000)) };
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (!v.some((t) => t > cutoff)) hits.delete(k);
    }
    return { allowed: true, retryAfterSec: 0 };
  };
}

function auditContext(request: FastifyRequest) {
  const user = (request as { user?: { userId?: string; tenantSlug?: string } }).user;
  return {
    method: request.method,
    route: request.routeOptions?.url ?? request.url.split('?')[0],
    ip: request.ip,
    userId: user?.userId,
    tenantSlug: user?.tenantSlug,
  };
}

/**
 * Sanitize and (optionally) validate params, query and body of a request.
 * Replaces request.params/query/body with the sanitized, parsed values.
 * Returns the reply when it has already answered (400/429), otherwise undefined.
 */
export async function runValidation(
  request: FastifyRequest,
  reply: FastifyReply,
  schemas: ValidateOptions,
  limits: Array<{ limiter: ReturnType<typeof createLimiter>; options: RateLimitOptions }> = [],
): Promise<FastifyReply | undefined> {
  if (request.inputValidated) return undefined;

  for (const { limiter, options: rateLimit } of limits) {
    const who = rateLimit.keyGenerator ? rateLimit.keyGenerator(request) : request.ip;
    const route = request.routeOptions?.url ?? request.url;
    const result = limiter(`${request.method} ${route}|${who}`);
    if (!result.allowed) {
      logger.warn({ event: 'validation_rate_limited', ...auditContext(request) }, 'Route rate limit exceeded');
      reply.header('Retry-After', String(result.retryAfterSec));
      return reply.status(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${result.retryAfterSec} seconds`,
      });
    }
  }

  const issues: FormattedValidationIssue[] = [];
  const sanitizedPaths: string[] = [];

  for (const location of LOCATIONS) {
    const raw = (request as unknown as Record<string, unknown>)[location];
    let value = raw;
    if (raw !== undefined && raw !== null) {
      try {
        const sanitized = sanitizeInput(raw);
        value = sanitized.value;
        sanitizedPaths.push(...sanitized.changed.map((p) => `${location}.${p}`));
      } catch (err) {
        if (err instanceof InputTooDeepError) {
          issues.push({ location, field: '(root)', message: err.message, code: 'too_deep', path: [] });
          continue;
        }
        throw err;
      }
    }
    const source = schemas[location];
    const schema = typeof source === 'function' ? source(request) : source;
    if (schema) {
      const parsed = schema.safeParse(value);
      if (parsed.success && location === 'query' && schemas.alsoQuery) {
        const extra = schemas.alsoQuery.safeParse(value);
        if (!extra.success) {
          issues.push(...formatZodIssues(location, extra.error));
          continue;
        }
      }
      if (parsed.success) {
        // Query: keep unknown keys (sort, order, ...) that handlers read directly.
        value = location === 'query' && value && typeof value === 'object' && parsed.data && typeof parsed.data === 'object'
          ? { ...(value as object), ...(parsed.data as object) }
          : parsed.data;
      } else {
        issues.push(...formatZodIssues(location, parsed.error));
        continue;
      }
    }
    if (value !== undefined) {
      (request as unknown as Record<string, unknown>)[location] = value;
    }
  }

  if (sanitizedPaths.length) {
    // Security audit: record which fields were altered, never their values.
    logger.warn({ event: 'input_sanitized', fields: sanitizedPaths.slice(0, 50), ...auditContext(request) }, 'Request input sanitized');
  }

  if (issues.length) {
    logger.warn(
      { event: 'validation_rejected', fields: issues.map((i) => `${i.location}.${i.field}`).slice(0, 50), ...auditContext(request) },
      'Request validation failed',
    );
    return reply.status(400).send(buildValidationError(issues));
  }

  request.inputValidated = true;
  return undefined;
}

/** Build a route validator (also available as `app.validate`). */
export function createValidator(options: ValidateOptions = {}, extraRateLimits: RateLimitOptions[] = []): preHandlerAsyncHookHandler {
  const rateLimits = [options.rateLimit, ...extraRateLimits].filter((r): r is RateLimitOptions => !!r);
  const limits = rateLimits.map((o) => ({ limiter: createLimiter(o), options: o }));
  const hook: preHandlerAsyncHookHandler = async function (request, reply) {
    const sent = await runValidation(request, reply, options, limits);
    if (sent) return reply;
  };
  const marked = hook as unknown as Record<symbol, unknown>;
  marked[VALIDATOR_MARK] = true;
  marked[VALIDATOR_OPTIONS] = { options, rateLimits };
  return hook;
}

/**
 * Combine every validate() on one route into a single validator and fill the
 * locations the route did not declare from the registry / convention defaults.
 * Throws at registration time when two validators declare the same location.
 */
export function mergeValidators(validators: unknown[], fallback?: ValidateOptions, label = 'route'): preHandlerAsyncHookHandler {
  const merged: ValidateOptions = {};
  const rateLimits: RateLimitOptions[] = [];
  let explicitQuery = false;
  for (const v of validators) {
    const meta = (v as Record<symbol, { options: ValidateOptions; rateLimits: RateLimitOptions[] }>)[VALIDATOR_OPTIONS];
    for (const loc of LOCATIONS) {
      if (meta.options[loc]) {
        if (merged[loc]) throw new Error(`${label}: more than one validate() declares "${loc}"`);
        merged[loc] = meta.options[loc];
      }
    }
    if (meta.options.query) explicitQuery = true;
    rateLimits.push(...meta.rateLimits);
  }
  if (fallback) {
    for (const loc of LOCATIONS) if (!merged[loc] && fallback[loc]) merged[loc] = fallback[loc];
    // an explicit query schema does not replace the convention checks on the paging keys
    if (explicitQuery && fallback.alsoQuery) merged.alsoQuery = fallback.alsoQuery;
  }
  return createValidator(merged, rateLimits);
}

export const validate = createValidator;

function isValidator(hook: unknown): boolean {
  return typeof hook === 'function' && (hook as unknown as Record<symbol, boolean>)[VALIDATOR_MARK] === true;
}

/**
 * Fastify plugin (not encapsulated): decorates `app.validate(...)` and makes
 * EVERY route registered afterwards pass through sanitization + validation:
 *  - routes that call app.validate(...) keep their explicit schemas
 *  - routes found in the schema registry get the registered schemas
 *  - all other routes get baseline sanitization (no schema)
 * The hook is appended after the route's own preHandlers, so authentication
 * and permission checks still run first.
 */
export async function validationPlugin(app: FastifyInstance): Promise<void> {
  const coverage: ValidationCoverage[] = [];

  app.decorate('validate', (options: ValidateOptions = {}) => createValidator(options));
  app.decorate('validationCoverage', () => coverage.slice());
  app.decorateRequest('inputValidated', false);

  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    const url = routeOptions.url;
    const existing = routeOptions.preHandler
      ? (Array.isArray(routeOptions.preHandler) ? routeOptions.preHandler : [routeOptions.preHandler])
      : [];
    const explicit = existing.filter(isValidator);
    const real = methods.filter((m) => m !== 'HEAD' && m !== 'OPTIONS');
    const fallback = real.length === 1 ? lookupSchemas(real[0], url) : undefined;

    for (const method of real) {
      const normalized = url.length > 1 && url.endsWith('/') ? url.slice(0, -1) : url;
      const mode = explicit.length || schemaRegistry[`${method} ${normalized}`]
        ? 'explicit'
        : fallback ? 'default' : 'baseline';
      coverage.push({ route: `${method} ${url}`, mode });
    }

    // One merged validator per route, placed where the first explicit validate() was
    // (so authentication/permission preHandlers declared before it still run first).
    // Locations the route did not declare fall back to the registry / convention defaults.
    const merged = mergeValidators(explicit, fallback, `${methods.join('|')} ${url}`);
    const at = explicit.length ? existing.indexOf(explicit[0]) : existing.length;
    routeOptions.preHandler = [
      ...existing.slice(0, at),
      merged,
      ...existing.slice(at).filter((h) => !isValidator(h)),
    ];
  });

  app.addHook('onReady', async () => {
    const withSchema = coverage.filter((c) => c.mode === 'explicit').length;
    const withDefaults = coverage.filter((c) => c.mode === 'default').length;
    logger.info(
      {
        event: 'validation_coverage',
        routes: coverage.length,
        withSchema,
        withDefaults,
        baselineOnly: coverage.length - withSchema - withDefaults,
        // set LOG_VALIDATION_COVERAGE=true to list routes that only get baseline sanitization
        ...(process.env.LOG_VALIDATION_COVERAGE === 'true'
          ? { baselineRoutes: coverage.filter((c) => c.mode === 'baseline').map((c) => c.route) }
          : {}),
      },
      'Request validation active on all routes',
    );
  });
}

// Skip Fastify's plugin encapsulation (same effect as fastify-plugin).
(validationPlugin as unknown as Record<symbol | string, unknown>)[Symbol.for('skip-override')] = true;
(validationPlugin as unknown as Record<symbol | string, unknown>)[Symbol.for('fastify.display-name')] = 'validation';

export default validationPlugin;
