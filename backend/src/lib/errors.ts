/**
 * Unified error hierarchy. Every error carries a stable machine-readable `code`,
 * a `userMessage` safe to show to end users, a `retryable` flag and optional
 * `context` (tenant, user, operation) for logging and tracking.
 */

export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  TENANT_ERROR = 'TENANT_ERROR',
  TIMEOUT = 'TIMEOUT',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CACHE_ERROR = 'CACHE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ErrorContext {
  tenantSlug?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  operation?: string;
  method?: string;
  url?: string;
  [key: string]: unknown;
}

export interface AppErrorOptions {
  code?: ErrorCode | string;
  userMessage?: string;
  retryable?: boolean;
  context?: ErrorContext;
  cause?: unknown;
}

/** Default user-facing messages per code (never expose internals). */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.BAD_REQUEST]: 'The request could not be processed. Please check your input and try again.',
  [ErrorCode.VALIDATION_ERROR]: 'Some of the information provided is invalid. Please review and try again.',
  [ErrorCode.UNAUTHORIZED]: 'Please sign in to continue.',
  [ErrorCode.FORBIDDEN]: 'You do not have permission to perform this action.',
  [ErrorCode.NOT_FOUND]: 'The requested item could not be found.',
  [ErrorCode.CONFLICT]: 'This action conflicts with the current state. Please refresh and try again.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',
  [ErrorCode.TENANT_ERROR]: 'We could not determine your organization. Please sign in again.',
  [ErrorCode.TIMEOUT]: 'The request took too long. Please try again.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'The service is temporarily unavailable. Please try again shortly.',
  [ErrorCode.DATABASE_ERROR]: 'We had trouble accessing your data. Please try again.',
  [ErrorCode.CACHE_ERROR]: 'A temporary issue occurred. Please try again.',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'An external service did not respond correctly. Please try again later.',
  [ErrorCode.INTERNAL_ERROR]: 'Something went wrong on our side. Please try again.',
};

/** Client-error codes whose specific message (why it conflicts, what is wrong) is safe and useful to show. */
export const SPECIFIC_MESSAGE_CODES: ReadonlySet<string> = new Set([ErrorCode.BAD_REQUEST, ErrorCode.CONFLICT]);

export class AppError extends Error {
  statusCode: number;
  error: string;
  details?: any;
  code: ErrorCode | string;
  userMessage: string;
  retryable: boolean;
  context: ErrorContext;

  constructor(
    statusCode: number,
    error: string,
    message: string,
    details?: any,
    options: AppErrorOptions = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
    this.code = options.code ?? codeForStatus(statusCode);
    this.userMessage =
      options.userMessage ??
      (SPECIFIC_MESSAGE_CODES.has(this.code) ? message : undefined) ??
      USER_MESSAGES[this.code as ErrorCode] ??
      USER_MESSAGES[ErrorCode.INTERNAL_ERROR];
    this.retryable = options.retryable ?? isRetryableStatus(statusCode);
    this.context = { ...(options.context ?? {}) };
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }

  /** Attach more context (e.g. tenant/user/operation); returns this for chaining. */
  withContext(context: ErrorContext): this {
    this.context = { ...this.context, ...context };
    return this;
  }

  toJSON() {
    const json: any = {
      statusCode: this.statusCode,
      error: this.error,
      message: this.message,
    };
    if (this.details) {
      json.details = this.details;
    }
    return json;
  }
}

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400: return ErrorCode.BAD_REQUEST;
    case 401: return ErrorCode.UNAUTHORIZED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 408: return ErrorCode.TIMEOUT;
    case 409: return ErrorCode.CONFLICT;
    case 422: return ErrorCode.VALIDATION_ERROR;
    case 429: return ErrorCode.RATE_LIMITED;
    case 502: return ErrorCode.EXTERNAL_SERVICE_ERROR;
    case 503: return ErrorCode.SERVICE_UNAVAILABLE;
    case 504: return ErrorCode.TIMEOUT;
    default: return status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST;
  }
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, options: AppErrorOptions = {}) {
    super(
      404,
      'Not Found',
      identifier ? `${resource} with id '${identifier}' not found` : `${resource} not found`,
      undefined,
      { code: ErrorCode.NOT_FOUND, ...options }
    );
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(400, 'Bad Request', message, undefined, { code: ErrorCode.BAD_REQUEST, ...options });
    this.name = 'BadRequestError';
  }
}

export class ValidationError extends AppError {
  constructor(details: any, options: AppErrorOptions = {}) {
    super(400, 'Validation Error', 'Validation failed', details, { code: ErrorCode.VALIDATION_ERROR, ...options });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', options: AppErrorOptions = {}) {
    super(401, 'Unauthorized', message, undefined, { code: ErrorCode.UNAUTHORIZED, ...options });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', options: AppErrorOptions = {}) {
    super(403, 'Forbidden', message, undefined, { code: ErrorCode.FORBIDDEN, ...options });
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(409, 'Conflict', message, undefined, { code: ErrorCode.CONFLICT, ...options });
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  retryAfterSeconds?: number;
  constructor(message: string = 'Too many requests', retryAfterSeconds?: number, options: AppErrorOptions = {}) {
    super(429, 'Too Many Requests', message, undefined, {
      code: ErrorCode.RATE_LIMITED,
      retryable: true,
      ...options,
    });
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class TenantError extends AppError {
  constructor(message: string = 'Invalid tenant', options: AppErrorOptions = {}) {
    super(400, 'Bad Request', message, undefined, { code: ErrorCode.TENANT_ERROR, ...options });
    this.name = 'TenantError';
  }
}

export class TimeoutError extends AppError {
  constructor(message: string = 'Operation timed out', options: AppErrorOptions = {}) {
    super(504, 'Gateway Timeout', message, undefined, { code: ErrorCode.TIMEOUT, retryable: true, ...options });
    this.name = 'TimeoutError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', options: AppErrorOptions = {}) {
    super(503, 'Service Unavailable', message, undefined, {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      retryable: true,
      ...options,
    });
    this.name = 'ServiceUnavailableError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', options: AppErrorOptions = {}) {
    super(503, 'Service Unavailable', message, undefined, {
      code: ErrorCode.DATABASE_ERROR,
      retryable: true,
      ...options,
    });
    this.name = 'DatabaseError';
  }
}

export class CacheError extends AppError {
  constructor(message: string = 'Cache error', options: AppErrorOptions = {}) {
    super(503, 'Service Unavailable', message, undefined, {
      code: ErrorCode.CACHE_ERROR,
      retryable: true,
      ...options,
    });
    this.name = 'CacheError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string, options: AppErrorOptions = {}) {
    super(502, 'Bad Gateway', message ?? `${service} request failed`, undefined, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      retryable: true,
      context: { service },
      ...options,
    });
    this.name = 'ExternalServiceError';
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal error', options: AppErrorOptions = {}) {
    super(500, 'Internal Server Error', message, undefined, { code: ErrorCode.INTERNAL_ERROR, ...options });
    this.name = 'InternalError';
  }
}

/** Node network error codes and PostgreSQL SQLSTATEs that are safe to retry. */
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND', 'ECONNABORTED',
]);
const TRANSIENT_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '53300', // too_many_connections
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now
  '08000', '08003', '08006', '08001', '08004', // connection exceptions
]);

/** True if the error is transient and the operation may be retried. */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { retryable?: unknown; code?: unknown; statusCode?: unknown; name?: unknown };
  if (typeof e.retryable === 'boolean') return e.retryable;
  if (typeof e.code === 'string' && (TRANSIENT_NETWORK_CODES.has(e.code) || TRANSIENT_PG_CODES.has(e.code))) {
    return true;
  }
  if (typeof e.statusCode === 'number') return isRetryableStatus(e.statusCode);
  if (e.name === 'TimeoutError') return true;
  return false;
}

export const getSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // For validation or user-facing errors, return the message
    if (error.name === 'ValidationError' || error.name === 'AuthenticationError') {
      return error.message;
    }
    // For other errors, return a generic message to avoid leaking internals
    return 'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
};
