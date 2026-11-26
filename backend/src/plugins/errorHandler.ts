import { randomUUID } from 'node:crypto';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  AppError, ErrorCode, ErrorContext, SPECIFIC_MESSAGE_CODES, USER_MESSAGES, codeForStatus, isRetryableError,
} from '../lib/errors.js';
import { captureException } from '../lib/errorTracking.js';
import { attemptRecovery } from '../lib/errorRecovery.js';
import { logger } from '../utils/logger.js';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Opt-in: replay this side-effect free GET once after a transient failure. */
    replayOnTransientError?: boolean;
  }
  interface FastifyRequest {
    /** Mutable error context (tenant, user, operation); also holds optional recovery hooks. */
    errorContext?: ErrorContext & {
      fallback?: () => Promise<unknown>;
      retry?: () => Promise<unknown>;
    };
  }
}

const RECOVERY_HEADER = 'x-error-recovery';
// Per-process secret: only replays issued by this process carry it, so clients cannot forge the marker.
const RECOVERY_TOKEN = randomUUID();
const isReplay = (request: FastifyRequest) => request.headers[RECOVERY_HEADER] === RECOVERY_TOKEN;

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  requestId?: string;
  details?: unknown;
}

/** Build the per-request error context from whatever is known so far. */
export function buildErrorContext(request: FastifyRequest): ErrorContext {
  const user = (request as { user?: { userId?: string; tenantSlug?: string; tenantId?: string } }).user;
  const base = request.errorContext ?? {};
  return {
    ...base,
    requestId: String(request.id),
    method: request.method,
    url: request.url?.split('?')[0],
    tenantSlug: request.tenantSlug ?? user?.tenantSlug ?? base.tenantSlug,
    tenantId: request.tenant?.id ?? user?.tenantId ?? base.tenantId,
    userId: user?.userId ?? base.userId,
    operation: base.operation ?? `${request.method} ${request.routeOptions?.url ?? request.url?.split('?')[0]}`,
  };
}

/** Friendly message for a code; specific client messages (400/409) are kept. */
export function userMessageFor(code: string, statusCode: number, message?: string): string {
  if (statusCode < 500 && message && SPECIFIC_MESSAGE_CODES.has(code)) return message;
  return USER_MESSAGES[code as ErrorCode] ?? USER_MESSAGES[codeForStatus(statusCode)];
}

/** Normalise any thrown value into an AppError-shaped description. */
export function normalizeError(error: unknown): {
  statusCode: number;
  errorLabel: string;
  code: string;
  message: string;
  userMessage: string;
  retryable: boolean;
  details?: unknown;
  expose: boolean;
} {
  const e = (error ?? {}) as Record<string, any>;

  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      errorLabel: error.error,
      code: String(error.code),
      message: error.message,
      userMessage: error.userMessage,
      retryable: error.retryable,
      details: error.details,
      expose: error.statusCode < 500,
    };
  }

  if (e.name === 'ZodError' && Array.isArray(e.issues ?? e.errors)) {
    return {
      statusCode: 400,
      errorLabel: 'Validation Error',
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      userMessage: USER_MESSAGES[ErrorCode.VALIDATION_ERROR],
      retryable: false,
      details: e.issues ?? e.errors,
      expose: true,
    };
  }

  if (error instanceof Error && 'validation' in error) {
    return {
      statusCode: 400,
      errorLabel: 'Validation Error',
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request validation failed',
      userMessage: USER_MESSAGES[ErrorCode.VALIDATION_ERROR],
      retryable: false,
      details: e.validation,
      expose: true,
    };
  }

  // Legacy / third-party errors carrying a statusCode (Fastify, rate-limit, jwt, custom classes)
  if (typeof e.statusCode === 'number' && e.statusCode >= 400 && e.statusCode < 600) {
    const code = typeof e.code === 'string' && /^[A-Z_]+$/.test(e.code) && !e.code.startsWith('FST_') && !e.code.startsWith('ERR_')
      ? e.code
      : codeForStatus(e.statusCode);
    return {
      statusCode: e.statusCode,
      errorLabel: typeof e.error === 'string' ? e.error : (e.name ?? 'Error'),
      code,
      message: e.message || 'An error occurred',
      userMessage: userMessageFor(code, e.statusCode, e.message),
      retryable: isRetryableError(error),
      details: e.details,
      expose: e.statusCode < 500,
    };
  }

  // Transient infrastructure errors (network / PostgreSQL)
  if (isRetryableError(error)) {
    const isPg = typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && /\d/.test(e.code);
    const code = isPg ? ErrorCode.DATABASE_ERROR : ErrorCode.SERVICE_UNAVAILABLE;
    return {
      statusCode: 503,
      errorLabel: 'Service Unavailable',
      code,
      message: e.message || 'Service unavailable',
      userMessage: USER_MESSAGES[code],
      retryable: true,
      expose: false,
    };
  }

  return {
    statusCode: 500,
    errorLabel: 'Internal Server Error',
    code: ErrorCode.INTERNAL_ERROR,
    message: e.message || 'An unexpected error occurred',
    userMessage: USER_MESSAGES[ErrorCode.INTERNAL_ERROR],
    retryable: false,
    expose: false,
  };
}

/** Structured error log; level depends on severity. */
export function logError(error: unknown, status: number, code: string, context: ErrorContext): void {
  const payload = {
    err: error,
    statusCode: status,
    errorCode: code,
    ...context,
  };
  if (status >= 500) logger.error(payload, 'Request failed');
  else if (status === 401 || status === 403 || status === 404) logger.info(payload, 'Request rejected');
  else logger.warn(payload, 'Request error');
}

export async function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  const context = buildErrorContext(request);
  const n = normalizeError(error);

  // Recovery: routes may register `fallback` / `retry` on request.errorContext
  if (n.statusCode >= 500 || n.retryable) {
    const recovery = await attemptRecovery(error, context);
    if (recovery.recovered) {
      logger.warn({ ...context, errorCode: n.code, handler: recovery.handler }, 'Request recovered from error');
      return reply.status(200).send(recovery.value);
    }
  }

  logError(error, n.statusCode, n.code, context);
  if (n.statusCode >= 500 && !isReplay(request)) {
    // (a replayed request is tracked once, by the outer request)
    captureException(error, { ...context, errorCode: n.code });
  }

  // Raw messages of unexpected (5xx) errors are exposed only in development, as before.
  const isDev = process.env.NODE_ENV === 'development';
  const message = n.expose || isDev ? n.message : 'An unexpected error occurred';
  const body: ErrorResponseBody = {
    statusCode: n.statusCode,
    error: n.errorLabel,
    code: n.code,
    message,
    userMessage: n.userMessage,
    retryable: n.retryable,
    requestId: context.requestId,
  };
  if (n.details !== undefined && n.expose) body.details = n.details;

  const retryAfter = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
  if (n.statusCode === 429 && retryAfter) reply.header('retry-after', String(retryAfter));
  return reply.status(n.statusCode).send(body);
}

/** Fastify plugin: error-context hook + centralized error handler. */
export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('errorContext', undefined);
  app.addHook('onRequest', async (request) => {
    request.errorContext = { requestId: String(request.id) };
  });
  // Refresh context after auth/tenant resolution so errors carry user + tenant
  app.addHook('preHandler', async (request) => {
    request.errorContext = { ...request.errorContext, ...buildErrorContext(request) };
    // Reads that opt in (route config `replayOnTransientError: true`, only for side-effect free
    // GET handlers) recover from transient failures by being replayed once.
    const routeConfig = (request.routeOptions?.config ?? {}) as { replayOnTransientError?: boolean };
    if (
      request.method === 'GET' &&
      routeConfig.replayOnTransientError === true &&
      !isReplay(request) &&
      !request.errorContext.retry
    ) {
      request.errorContext.retry = async () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(request.headers)) {
          if (typeof v === 'string' && !['host', 'content-length', 'connection'].includes(k)) headers[k] = v;
        }
        headers[RECOVERY_HEADER] = RECOVERY_TOKEN;
        const res = await app.inject({
          method: 'GET',
          url: request.url,
          headers,
          remoteAddress: request.ip,
        });
        const type = String(res.headers['content-type'] ?? '');
        if (res.statusCode !== 200 || !type.includes('application/json')) {
          throw new Error(`recovery replay not usable (${res.statusCode})`);
        }
        return res.json();
      };
    }
  });
  // Routes that reply with an inline error body ({statusCode, error, message}) get the same
  // unified fields (code, userMessage, retryable, requestId) as thrown errors.
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode < 400 || typeof payload !== 'string') return payload;
    const type = String(reply.getHeader('content-type') ?? '');
    if (!type.includes('application/json')) return payload;
    try {
      const body = JSON.parse(payload);
      if (!body || typeof body !== 'object' || Array.isArray(body) || 'code' in body) return payload;
      if (typeof body.message !== 'string' && typeof body.error !== 'string') return payload;
      const status = reply.statusCode;
      const code = codeForStatus(status);
      const context = buildErrorContext(request);
      const err = new Error(typeof body.message === 'string' ? body.message : String(body.error));
      logError(err, status, code, context);
      if (status >= 500) captureException(err, { ...context, errorCode: code });
      return JSON.stringify({
        statusCode: status,
        error: typeof body.error === 'string' ? body.error : reply.raw.statusMessage || 'Error',
        message: err.message,
        ...body,
        code,
        userMessage: userMessageFor(code, status, err.message),
        retryable: isRetryableError({ statusCode: status }),
        requestId: String(request.id),
      });
    } catch {
      return payload;
    }
  });
  app.setErrorHandler(errorHandler);
}
// Equivalent of fastify-plugin: share the handler/hooks with the parent scope
(errorHandlerPlugin as unknown as Record<symbol, unknown>)[Symbol.for('skip-override')] = true;

export default errorHandlerPlugin;
