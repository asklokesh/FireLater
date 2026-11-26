import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodTypeAny } from 'zod';
import { getRouteSchema, registryKey, type RateLimitConfig, type RouteSchema } from '../schemas/index.js';
import { InputTooDeepError, newReport, sanitizeInput, type SanitizeReport } from '../utils/inputSanitizer.js';
import {
  buildValidationErrorResponse,
  formatZodIssues,
  type ValidationIssue,
} from '../utils/validationErrors.js';
import { logger } from '../utils/logger.js';

/**
 * Unified request validation + sanitization.
 *
 * `setupValidation(app)` must be called BEFORE any route is registered. It adds an `onRoute` hook that appends a
 * validation preHandler to every route (after the route's own auth preHandlers), so each route is covered:
 *   - routes listed in the schema registry (src/schemas) get their Zod params/query/body schemas enforced
 *   - all other routes get BASELINE_* schemas (bounded strings, numeric paging, object-or-array bodies)
 * Every request first has its body, query and params sanitized (see utils/inputSanitizer.ts).
 * Failures answer 400 with the format from utils/validationErrors.ts and are written to the security audit log.
 */

const MAX_STRING = 10_000;

export const BASELINE_PARAMS: ZodTypeAny = z.record(
  z.string().max(255, 'must be at most 255 characters').refine((v) => !v.includes('..'), 'must not contain ".."'),
);

/** Params named `id` / `*Id` are database UUIDs, except these (e.g. BullMQ job ids are not UUIDs). */
const NON_UUID_ID_PARAMS = new Set(['jobId', 'sessionId']);
const derivedParams = new Map<string, ZodTypeAny>();

/**
 * Params schema for a route without an explicit registry schema: `:id` / `:xxxId` must be UUIDs,
 * every other param falls back to BASELINE_PARAMS' bounds.
 */
export function deriveParamsSchema(url: string): ZodTypeAny {
  const cached = derivedParams.get(url);
  if (cached) return cached;
  const names = [...url.matchAll(/:(\w+)/g)].map((m) => m[1]);
  const shape: Record<string, ZodTypeAny> = {};
  for (const n of names) {
    if ((n === 'id' || /Id$/.test(n)) && !NON_UUID_ID_PARAMS.has(n)) shape[n] = z.string().uuid();
  }
  const schema = Object.keys(shape).length
    ? z.intersection(z.object(shape).passthrough(), BASELINE_PARAMS)
    : BASELINE_PARAMS;
  derivedParams.set(url, schema);
  return schema;
}

const NUMERIC_QUERY_KEYS = ['page', 'per_page', 'perPage', 'limit', 'offset'];

export const BASELINE_QUERY: ZodTypeAny = z
  .record(z.union([z.string().max(MAX_STRING), z.array(z.string().max(MAX_STRING)).max(100)]))
  .superRefine((query, ctx) => {
    for (const key of NUMERIC_QUERY_KEYS) {
      const v = query[key];
      if (v !== undefined && (typeof v !== 'string' || !/^\d+$/.test(v))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'must be a non-negative integer' });
      }
    }
  });

export const BASELINE_BODY: ZodTypeAny = z.union([z.record(z.unknown()), z.array(z.unknown()), z.string().max(1_000_000)]);

export interface ValidationCoverageEntry {
  key: string;
  source: 'registry' | 'baseline';
}

export interface ValidationOptions {
  /** Extra / override registry used instead of the global one (tests). */
  registry?: Record<string, RouteSchema>;
}

/** Security audit log entry for validation / sanitization events. */
export function auditSecurityEvent(
  request: FastifyRequest,
  event: 'validation_failed' | 'input_sanitized' | 'rate_limited',
  extra: Record<string, unknown>,
) {
  logger.warn(
    {
      security: true,
      event: `request.${event}`,
      method: request.method,
      url: request.routeOptions?.url ?? request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      userId: (request as { user?: { userId?: string } }).user?.userId,
      tenant: (request as { user?: { tenantSlug?: string } }).user?.tenantSlug ?? request.headers['x-tenant-slug'],
      requestId: request.id,
      ...extra,
    },
    `Security audit: ${event}`,
  );
}

function resolveBodySchema(schema: RouteSchema | undefined, request: FastifyRequest): ZodTypeAny {
  const b = schema?.body;
  if (!b) return BASELINE_BODY;
  return typeof b === 'function' ? b(request) : b;
}

function isPlainContainer(v: unknown): boolean {
  return typeof v === 'string' || (typeof v === 'object' && v !== null && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype));
}

/**
 * Build the validation handler for one route. Exported so a route can also be validated ad hoc:
 *   app.post('/x', { preHandler: [validate({ body: mySchema })] }, handler)
 */
export function validate(schema: RouteSchema | undefined, routeUrl?: string) {
  return async function validationHandler(request: FastifyRequest, reply: FastifyReply) {
    const report: SanitizeReport = newReport();
    const issues: ValidationIssue[] = [];

    try {
      // 1. Sanitize
      const body = isPlainContainer(request.body) ? sanitizeInput(request.body, report, '', 'body') : request.body;
      const query = sanitizeInput((request.query ?? {}) as Record<string, unknown>, report, '', 'query');
      const params = sanitizeInput((request.params ?? {}) as Record<string, unknown>, report, '', 'params');

      // 2. Validate
      const paramsResult = (schema?.params ?? (routeUrl ? deriveParamsSchema(routeUrl) : BASELINE_PARAMS)).safeParse(params);
      if (!paramsResult.success) issues.push(...formatZodIssues(paramsResult.error, 'params'));

      const queryResult = (schema?.query ?? BASELINE_QUERY).safeParse(query);
      if (!queryResult.success) issues.push(...formatZodIssues(queryResult.error, 'query'));

      const hasBody = request.body !== undefined && request.body !== null;
      let bodyResult: z.SafeParseReturnType<unknown, unknown> | undefined;
      if (schema?.body || (hasBody && isPlainContainer(request.body))) {
        bodyResult = resolveBodySchema(schema, request).safeParse(hasBody ? body : undefined);
        if (!bodyResult.success) issues.push(...formatZodIssues(bodyResult.error, 'body'));
      }

      if (issues.length > 0) {
        auditSecurityEvent(request, 'validation_failed', {
          issueCount: issues.length,
          fields: issues.slice(0, 20).map((i) => `${i.location}.${i.field}`),
          sanitizedChanges: report.changes,
        });
        return reply.status(400).send(buildValidationErrorResponse(issues));
      }

      // 3. Replace request data. Body/params use the parsed (typed, defaulted) output when a registry
      //    schema exists; query stays the sanitized raw strings since handlers parse it themselves.
      if (schema?.params && paramsResult.success) (request as { params: unknown }).params = paramsResult.data;
      else request.params = params;
      request.query = query;
      if (hasBody) {
        request.body = schema?.body && bodyResult?.success ? bodyResult.data : body;
      } else if (schema?.body && bodyResult?.success) {
        request.body = bodyResult.data;
      }

      if (report.changes > 0) {
        auditSecurityEvent(request, 'input_sanitized', { changes: report.changes, paths: report.paths });
      }
    } catch (err) {
      if (err instanceof InputTooDeepError) {
        auditSecurityEvent(request, 'validation_failed', { reason: 'input_too_deep' });
        return reply.status(400).send(
          buildValidationErrorResponse([
            { location: 'body', field: '', message: err.message, code: 'custom', path: [] },
          ]),
        );
      }
      throw err;
    }
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Validation preHandler factory for ad-hoc use: `app.validate({ body: schema })`. */
    validate: typeof validate;
  }
}

type Limiter = (req: FastifyRequest, rep: FastifyReply) => Promise<unknown>;
const limiters = new Map<string, Limiter>();

/** Lazily build one @fastify/rate-limit handler per route config (the plugin is registered on the root app). */
function getLimiter(app: FastifyInstance, request: FastifyRequest, cfg: RateLimitConfig): Limiter | undefined {
  const route = `${request.method}:${request.routeOptions.url}`;
  const existing = limiters.get(route);
  if (existing) return existing;
  const factory = (app as unknown as { rateLimit?: (o: object) => Limiter }).rateLimit;
  if (typeof factory !== 'function') return undefined;
  const limiter = factory.call(app, {
    max: cfg.max,
    timeWindow: cfg.timeWindow,
    keyGenerator: (req: FastifyRequest) => `validation:${route}:${req.ip}`,
  });
  limiters.set(route, limiter);
  return limiter;
}

/** Routes seen so far, with how each is validated (inspectable by tests and the startup log). */
const coverage = new Map<string, ValidationCoverageEntry>();

export function getValidationCoverage(): ValidationCoverageEntry[] {
  return [...coverage.values()];
}

export function resetValidationCoverage() {
  coverage.clear();
}

/**
 * Install the unified validation on the app: decorator + onRoute hook. Call before registering routes.
 * Returns nothing; use getValidationCoverage() to inspect.
 */
export function setupValidation(app: FastifyInstance, options: ValidationOptions = {}) {
  if (!app.hasDecorator('validate')) app.decorate('validate', validate);

  app.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      const key = registryKey(method, routeOptions.url);
      const schema = options.registry ? options.registry[key] : getRouteSchema(method, routeOptions.url);
      coverage.set(key, { key, source: schema ? 'registry' : 'baseline' });
    }

    const existing = routeOptions.preHandler;
    const chain = existing ? (Array.isArray(existing) ? [...existing] : [existing]) : [];

    const handler = async function routeValidation(this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
      const schema = options.registry
        ? options.registry[registryKey(request.method, request.routeOptions.url ?? request.url)]
        : getRouteSchema(request.method, request.routeOptions.url ?? request.url);

      if (schema?.rateLimit) {
        const limiter = getLimiter(app, request, schema.rateLimit);
        if (limiter) {
          try {
            await limiter(request, reply);
          } catch (e) {
            auditSecurityEvent(request, 'rate_limited', {});
            throw e;
          }
          if (reply.sent) return;
        }
      }

      return validate(schema, request.routeOptions.url)(request, reply);
    };

    chain.push(handler as never);
    routeOptions.preHandler = chain as never;
  });
}
