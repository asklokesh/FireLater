/**
 * Maps backend error codes (see docs/ERROR_HANDLING.md) to friendly, user-facing messages.
 * Technical messages from the server are never shown directly for server-side failures.
 */

export type ErrorCode =
  | 'BAD_REQUEST' | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT'
  | 'RATE_LIMITED' | 'TENANT_ERROR' | 'TIMEOUT' | 'SERVICE_UNAVAILABLE' | 'DATABASE_ERROR'
  | 'CACHE_ERROR' | 'EXTERNAL_SERVICE_ERROR' | 'INTERNAL_ERROR' | 'NETWORK_ERROR';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'The request could not be processed. Please check your input and try again.',
  VALIDATION_ERROR: 'Some of the information provided is invalid. Please review and try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  NOT_FOUND: 'The requested item could not be found.',
  CONFLICT: 'This action conflicts with the current state. Please refresh and try again.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  TENANT_ERROR: 'We could not determine your organization. Please sign in again.',
  TIMEOUT: 'The request took too long. Please try again.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again shortly.',
  DATABASE_ERROR: 'We had trouble accessing your data. Please try again.',
  CACHE_ERROR: 'A temporary issue occurred. Please try again.',
  EXTERNAL_SERVICE_ERROR: 'An external service did not respond correctly. Please try again later.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  NETWORK_ERROR: 'Unable to reach the server. Please check your connection and try again.',
};

const DEFAULT_MESSAGE = 'An unexpected error occurred. Please try again.';

export interface ErrorInfo {
  code: string;
  statusCode?: number;
  message: string;
  retryable: boolean;
  requestId?: string;
  details?: unknown;
}

const RETRYABLE: ReadonlySet<string> = new Set([
  'RATE_LIMITED', 'TIMEOUT', 'SERVICE_UNAVAILABLE', 'DATABASE_ERROR', 'CACHE_ERROR',
  'EXTERNAL_SERVICE_ERROR', 'NETWORK_ERROR',
]);

function statusToCode(status?: number): string {
  switch (status) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 408: case 504: return 'TIMEOUT';
    case 409: return 'CONFLICT';
    case 422: return 'VALIDATION_ERROR';
    case 429: return 'RATE_LIMITED';
    case 502: return 'EXTERNAL_SERVICE_ERROR';
    case 503: return 'SERVICE_UNAVAILABLE';
    default: return status && status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST';
  }
}

/**
 * Pick the message to show. Prefers the server's userMessage, then the code mapping.
 * Client errors without a mapping keep the server message (it is specific and safe).
 */
export function getUserMessage(input: {
  code?: string;
  userMessage?: string;
  message?: string;
  statusCode?: number;
}): string {
  const { code, userMessage, message, statusCode } = input;
  if (userMessage) return userMessage;
  if (code && code in ERROR_MESSAGES) return ERROR_MESSAGES[code as ErrorCode];
  if (statusCode && statusCode < 500 && message) return message;
  return DEFAULT_MESSAGE;
}

/** Normalise an axios error, a backend error body, or any thrown value into ErrorInfo. */
export function parseApiError(error: unknown): ErrorInfo {
  const e = error as
    | {
        code?: unknown;
        name?: unknown;
        isAxiosError?: boolean;
        response?: { data?: unknown; status?: number };
      }
    | null
    | undefined;

  // A cancelled request (AbortController / axios cancel) is not a failure to retry or to show
  if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError') {
    return { code: 'CANCELED', message: '', retryable: false };
  }

  if (e?.isAxiosError && !e.response) {
    return { code: 'NETWORK_ERROR', message: ERROR_MESSAGES.NETWORK_ERROR, retryable: true };
  }

  const body =
    e?.response?.data ??
    (e && typeof e === 'object' && ('statusCode' in e || 'code' in e) && !(e instanceof Error) ? e : undefined);

  if (body && typeof body === 'object') {
    const b = body as {
      statusCode?: number;
      code?: unknown;
      userMessage?: string;
      message?: string;
      retryable?: unknown;
      requestId?: string;
      details?: unknown;
    };
    const statusCode: number | undefined = e?.response?.status ?? b.statusCode;
    const code: string = typeof b.code === 'string' ? b.code : statusToCode(statusCode);
    return {
      code,
      statusCode,
      message: getUserMessage({ code, userMessage: b.userMessage, message: b.message, statusCode }),
      retryable: typeof b.retryable === 'boolean' ? b.retryable : RETRYABLE.has(code),
      requestId: b.requestId,
      details: b.details,
    };
  }

  return { code: 'UNKNOWN', message: DEFAULT_MESSAGE, retryable: false };
}

/** Convenience: friendly message for anything thrown. */
export function getErrorMessage(error: unknown): string {
  return parseApiError(error).message;
}

/** React Query retry predicate: retry only transient failures, at most 3 times. */
export function shouldRetryRequest(failureCount: number, error: unknown): boolean {
  return failureCount < 3 && parseApiError(error).retryable;
}

export const MAX_HTTP_RETRIES = 1;

/**
 * Decide whether a failed HTTP request may be replayed automatically by the client: only idempotent
 * methods (GET/HEAD), only when no response arrived at all (network failure), once. Server-side
 * failures (503, 429, ...) are not replayed here: the API already replays opted-in reads, honours
 * rate limits itself, and replaying 429s would burn more of the limit.
 */
export function shouldRetryHttp(
  config: { method?: string } | undefined,
  error: unknown,
  attempt: number
): boolean {
  const method = (config?.method ?? 'get').toLowerCase();
  if (method !== 'get' && method !== 'head') return false;
  if (attempt >= MAX_HTTP_RETRIES) return false;
  return parseApiError(error).code === 'NETWORK_ERROR';
}

/** Exponential backoff for HTTP replays (ms). */
export function httpRetryDelay(attempt: number): number {
  return Math.min(2000, 300 * 2 ** attempt);
}
