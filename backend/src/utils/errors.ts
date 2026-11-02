/**
 * Error catalog shared by the whole backend. Every code maps to one HTTP
 * status and one error class; see docs/ERROR_HANDLING.md.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  CIRCUIT_OPEN: 'CIRCUIT_OPEN',
  UPSTREAM_TIMEOUT: 'UPSTREAM_TIMEOUT',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

// eslint-disable-next-line no-redeclare
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred';
export const SERVICE_UNAVAILABLE_MESSAGE = 'The service is temporarily unavailable. Please try again later.';
export const EXTERNAL_SERVICE_MESSAGE = 'An external service failed to respond. Please try again later.';

export interface AppErrorOptions {
  code?: ErrorCode;
  userMessage?: string;
  isOperational?: boolean;
  retryable?: boolean;
  cause?: unknown;
  retryAfterSeconds?: number;
}

/** Default code for a given HTTP status. */
export function codeForStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400: return ErrorCode.BAD_REQUEST;
    case 401: return ErrorCode.UNAUTHORIZED;
    case 403: return ErrorCode.FORBIDDEN;
    case 404: return ErrorCode.NOT_FOUND;
    case 409: return ErrorCode.CONFLICT;
    case 422: return ErrorCode.VALIDATION_FAILED;
    case 429: return ErrorCode.RATE_LIMITED;
    case 502: return ErrorCode.EXTERNAL_SERVICE_ERROR;
    case 503: return ErrorCode.SERVICE_UNAVAILABLE;
    case 504: return ErrorCode.UPSTREAM_TIMEOUT;
    default:
      return statusCode >= 400 && statusCode < 500 ? ErrorCode.BAD_REQUEST : ErrorCode.INTERNAL_ERROR;
  }
}

export class AppError extends Error {
  statusCode: number;
  error: string;
  details?: any;
  code: ErrorCode;
  userMessage: string;
  isOperational: boolean;
  retryable: boolean;
  declare cause?: unknown;
  retryAfterSeconds?: number;
  private readonly explicitCode: boolean;

  constructor(statusCode: number, error: string, message: string, details?: any, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.error = error;
    this.details = details;
    this.code = options.code ?? codeForStatus(statusCode);
    this.explicitCode = options.code !== undefined;
    this.userMessage = options.userMessage ?? (statusCode >= 500 ? GENERIC_ERROR_MESSAGE : message);
    this.isOperational = options.isOperational ?? true;
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) this.cause = options.cause;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
  }

  toJSON() {
    const json: any = {
      statusCode: this.statusCode,
      error: this.error,
      message: this.message,
    };
    if (this.explicitCode) {
      json.code = this.code;
    }
    if (this.details) {
      json.details = this.details;
    }
    return json;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(
      404,
      'Not Found',
      identifier ? `${resource} with id '${identifier}' not found` : `${resource} not found`,
      undefined,
      { code: ErrorCode.NOT_FOUND },
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
  constructor(details: any) {
    super(400, 'Validation Error', 'Validation failed', details, { code: ErrorCode.VALIDATION_FAILED });
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, 'Unauthorized', message, undefined, { code: ErrorCode.UNAUTHORIZED });
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, 'Forbidden', message, undefined, { code: ErrorCode.FORBIDDEN });
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
  constructor(message: string = 'Rate limit exceeded', options: AppErrorOptions = {}) {
    super(429, 'Too Many Requests', message, undefined, {
      code: ErrorCode.RATE_LIMITED,
      retryable: true,
      ...options,
    });
    this.name = 'RateLimitError';
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service unavailable', options: AppErrorOptions = {}) {
    super(503, 'Service Unavailable', message, undefined, {
      code: ErrorCode.SERVICE_UNAVAILABLE,
      userMessage: SERVICE_UNAVAILABLE_MESSAGE,
      retryable: true,
      ...options,
    });
    this.name = 'ServiceUnavailableError';
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string = 'External service error', options: AppErrorOptions = {}) {
    super(502, 'Bad Gateway', message, undefined, {
      code: ErrorCode.EXTERNAL_SERVICE_ERROR,
      userMessage: EXTERNAL_SERVICE_MESSAGE,
      retryable: true,
      ...options,
    });
    this.name = 'ExternalServiceError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database error', options: AppErrorOptions = {}) {
    super(500, 'Internal Server Error', message, undefined, { code: ErrorCode.DATABASE_ERROR, ...options });
    this.name = 'DatabaseError';
  }
}

export class InternalError extends AppError {
  constructor(message: string = GENERIC_ERROR_MESSAGE, options: AppErrorOptions = {}) {
    super(500, 'Internal Server Error', message, undefined, {
      code: ErrorCode.INTERNAL_ERROR,
      isOperational: false,
      ...options,
    });
    this.name = 'InternalError';
  }
}

export const getSafeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    // For validation or user-facing errors, return the message
    if (error.name === 'ValidationError' || error.name === 'AuthenticationError') {
      return error.message;
    }
    // For other errors, return a generic message to avoid leaking internals
    return GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
};
