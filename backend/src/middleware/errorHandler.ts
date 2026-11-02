import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ErrorCode,
  GENERIC_ERROR_MESSAGE,
  InternalError,
  ServiceUnavailableError,
  ValidationError,
  codeForStatus,
} from '../utils/errors.js';
import { captureError } from '../utils/errorTracking.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const REDACT_KEYS = /^(authorization|cookie|set-cookie|password|.*password.*)$/i;

interface ErrorLogger {
  error: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

const requestIds = new WeakMap<FastifyRequest, string>();

export function resolveRequestId(header: unknown): string {
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

/** Map any thrown value onto an AppError. */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  if (isObject(err)) {
    // Zod errors
    if (err.name === 'ZodError') {
      const v = new ValidationError(err.issues ?? err.errors);
      v.error = 'Validation Error';
      v.message = 'Request validation failed';
      v.userMessage = v.message;
      return v;
    }
    // Fastify schema validation errors
    if ('validation' in err && err.validation) {
      const v = new ValidationError(err.validation);
      v.message = 'Request validation failed';
      v.userMessage = v.message;
      return v;
    }
    // Rate limiting (incl. @fastify/rate-limit)
    if (err.statusCode === 429) {
      const ttl = typeof err.ttl === 'number' ? Math.ceil(err.ttl / 1000) : undefined;
      return new AppError(429, typeof err.error === 'string' ? err.error : 'Too Many Requests',
        typeof err.message === 'string' && err.message ? err.message : 'Rate limit exceeded', undefined, {
          code: ErrorCode.RATE_LIMITED,
          retryable: true,
          cause: err,
          retryAfterSeconds: typeof err.retryAfterSeconds === 'number' ? err.retryAfterSeconds : ttl,
        });
    }
    // PostgreSQL SQLSTATE codes
    const pgCode = typeof err.code === 'string' ? err.code : undefined;
    if (pgCode === '23505') return new ConflictError('Resource already exists', { cause: err });
    if (pgCode === '23503') return new BadRequestError('Referenced resource does not exist', { cause: err });
    if (pgCode === '22P02') return new BadRequestError('Invalid input syntax', { cause: err });
    const msg = typeof err.message === 'string' ? err.message : '';
    if (
      (pgCode && (/^08/.test(pgCode) || pgCode === '57P01')) ||
      /timeout exceeded when trying to connect|connection terminated/i.test(msg)
    ) {
      return new ServiceUnavailableError('Database unavailable', {
        code: ErrorCode.DATABASE_UNAVAILABLE,
        cause: err,
      });
    }
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
      const label = typeof err.error === 'string' ? err.error : 'Error';
      return new AppError(err.statusCode, label, msg || 'An error occurred', undefined, {
        code: codeForStatus(err.statusCode),
        cause: err,
      });
    }
  }

  return new InternalError(err instanceof Error ? err.message : GENERIC_ERROR_MESSAGE, { cause: err });
}

function redact(value: unknown): unknown {
  if (!isObject(value)) return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_KEYS.test(k) ? '[Redacted]' : redact(v);
  }
  return out;
}

function sendError(
  appErr: AppError,
  raw: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  log: ErrorLogger,
) {
  const requestId = requestIds.get(request) ?? resolveRequestId(request.headers['x-request-id']);
  const isProd = process.env.NODE_ENV === 'production';
  const is5xx = appErr.statusCode >= 500;

  const body: Record<string, unknown> = {
    statusCode: appErr.statusCode,
    error: appErr.error,
    code: appErr.code,
    message: is5xx && isProd ? appErr.userMessage : appErr.message,
    requestId,
  };
  if (appErr.details !== undefined && appErr.details !== null && !(is5xx && isProd)) {
    body.details = appErr.details;
  }

  const user = (request as any).user;
  const context: Record<string, unknown> = {
    requestId,
    method: request.method,
    route: request.routeOptions?.url ?? request.url,
    statusCode: appErr.statusCode,
    code: appErr.code,
  };
  if (request.tenantSlug ?? user?.tenantSlug) context.tenantSlug = request.tenantSlug ?? user?.tenantSlug;
  if (user?.userId) context.userId = user.userId;

  if (is5xx) {
    const errObj = raw instanceof Error ? raw : appErr;
    log.error(
      { ...context, err: { type: errObj.name, message: errObj.message, stack: errObj.stack } },
      'Request error',
    );
  } else {
    log.warn({ ...context, message: appErr.message, details: redact(appErr.details) }, 'Request rejected');
  }

  // Report 5xx (including non-operational errors, which normalise to 500); never 4xx.
  if (is5xx) {
    captureError(raw instanceof Error ? raw : appErr, {
      tags: {
        tenant: context.tenantSlug as string | undefined,
        code: appErr.code,
        route: context.route as string,
        requestId,
        method: request.method,
        statusCode: appErr.statusCode,
      },
      user: user?.userId ? { id: String(user.userId) } : undefined,
    });
  }

  if ((appErr.statusCode === 429 || appErr.statusCode === 503) && appErr.retryAfterSeconds !== undefined) {
    reply.header('Retry-After', String(appErr.retryAfterSeconds));
  }
  reply.header('x-request-id', requestId);
  return reply.status(appErr.statusCode).send(body);
}

export interface ErrorHandlingOptions {
  logger?: ErrorLogger;
}

/** Install request-id propagation, the error handler and the not-found handler. */
export function registerErrorHandling(app: FastifyInstance, options: ErrorHandlingOptions = {}): void {
  const getLog = (request: FastifyRequest): ErrorLogger => options.logger ?? request.log;

  app.addHook('onRequest', async (request, reply) => {
    const id = resolveRequestId(request.headers['x-request-id']);
    requestIds.set(request, id);
    reply.header('x-request-id', id);
  });

  app.setErrorHandler((error, request, reply) => {
    return sendError(normalizeError(error), error, request, reply, getLog(request));
  });

  app.setNotFoundHandler((request, reply) => {
    const err = new AppError(404, 'Not Found', `Route ${request.method}:${request.url} not found`, undefined, {
      code: ErrorCode.NOT_FOUND,
    });
    return sendError(err, err, request, reply, getLog(request));
  });
}
