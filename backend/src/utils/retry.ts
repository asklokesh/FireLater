import { AppError, ErrorCode } from './errors.js';
import { logger } from './logger.js';

export interface RetryOptions {
  /** Total attempts including the first call. Default 3. */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff. Default 200. */
  baseDelayMs?: number;
  /** Backoff multiplier. Default 2. */
  factor?: number;
  /** Maximum delay in ms. Default 2000. */
  maxDelayMs?: number;
  /** Apply full jitter (random delay in [0, computed]). Default true. */
  jitter?: boolean;
  /** Stops further attempts when aborted. */
  signal?: AbortSignal;
  /** Operation name used in logs. */
  operationName?: string;
  /** Override the transient classifier. */
  isRetryable?: (error: unknown) => boolean;
  /** Random source in [0, 1); injectable for tests. */
  random?: () => number;
}

export const DEFAULT_RETRY_OPTIONS = {
  maxAttempts: 3,
  baseDelayMs: 200,
  factor: 2,
  maxDelayMs: 2000,
  jitter: true,
} as const;

const TRANSIENT_PG_CODES = new Set(['40001', '40P01', '57P01']);
const TRANSIENT_NODE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN']);

/** True when retrying the same idempotent call may succeed. */
export function isTransientError(error: unknown): boolean {
  if (error instanceof AppError) {
    if (error.statusCode >= 400 && error.statusCode < 500) return false;
    if (error.code === ErrorCode.CIRCUIT_OPEN) return false;
    return error.retryable === true;
  }
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  if (TRANSIENT_PG_CODES.has(code)) return true;
  if (/^08[0-9A-Z]{3}$/.test(code)) return true;
  return TRANSIENT_NODE_CODES.has(code);
}

/** Delay before retry number `retry` (1-based), before jitter. */
export function computeBackoff(retry: number, baseDelayMs: number, factor: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, retry - 1));
}

function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

function attachAttempts(error: unknown, attempts: number): void {
  if (error && typeof error === 'object') {
    try {
      (error as { attempts?: number }).attempts = attempts;
    } catch {
      // frozen error objects: ignore
    }
  }
}

function abortError(signal: AbortSignal): unknown {
  const reason = (signal as { reason?: unknown }).reason;
  if (reason instanceof Error) return reason;
  const err = new Error('Retry aborted');
  err.name = 'AbortError';
  return err;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal!));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Run `operation`, retrying transient failures with exponential backoff and
 * full jitter. Only use for idempotent operations.
 */
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_RETRY_OPTIONS.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs;
  const factor = options.factor ?? DEFAULT_RETRY_OPTIONS.factor;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const jitter = options.jitter ?? DEFAULT_RETRY_OPTIONS.jitter;
  const classify = options.isRetryable ?? isTransientError;
  const random = options.random ?? Math.random;
  const operationName = options.operationName ?? (operation.name || 'anonymous');
  const { signal } = options;

  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw abortError(signal);
    try {
      return await operation();
    } catch (error) {
      if (!classify(error) || attempt >= maxAttempts || signal?.aborted) {
        attachAttempts(error, attempt);
        throw error;
      }
      const ceiling = computeBackoff(attempt, baseDelayMs, factor, maxDelayMs);
      const delay = jitter ? Math.floor(random() * ceiling) : ceiling;
      logger.warn(
        { operation: operationName, attempt, delayMs: delay, errorCode: errorCode(error) },
        'Retrying transient failure'
      );
      try {
        await sleep(delay, signal);
      } catch (abortErr) {
        attachAttempts(error, attempt);
        throw error ?? abortErr;
      }
    }
  }
}

/** Wrap a function so every call goes through withRetry. */
export function retryable<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  options: RetryOptions = {}
): (...args: A) => Promise<R> {
  const operationName = options.operationName ?? (fn.name || 'anonymous');
  return function (this: unknown, ...args: A): Promise<R> {
    return withRetry(() => fn.apply(this, args), { ...options, operationName });
  };
}
