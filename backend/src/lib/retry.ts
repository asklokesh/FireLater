import { isRetryableError } from './errors.js';

export interface RetryOptions {
  /** Total attempts including the first one (default 3). */
  maxAttempts?: number;
  /** Initial backoff in ms (default 100). */
  baseDelayMs?: number;
  /** Max backoff in ms (default 5000). */
  maxDelayMs?: number;
  /** Jitter ratio 0..1 applied to each delay (default 0.2). */
  jitter?: number;
  /** Custom predicate; defaults to isRetryableError. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
  /** Injectable sleep for tests. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function computeBackoff(attempt: number, opts: RetryOptions = {}): number {
  const base = opts.baseDelayMs ?? 100;
  const max = opts.maxDelayMs ?? 5000;
  const jitter = opts.jitter ?? 0.2;
  const raw = Math.min(max, base * 2 ** (attempt - 1));
  const spread = raw * jitter;
  return Math.max(0, Math.round(raw - spread + Math.random() * spread * 2));
}

/** Run fn, retrying retryable errors with exponential backoff and jitter. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3);
  const shouldRetry = opts.shouldRetry ?? ((e: unknown) => isRetryableError(e));
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    attempt++;
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      const delay = computeBackoff(attempt, opts);
      opts.onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
}

interface RetryDecorator {
  <T extends (...args: any[]) => Promise<any>>(value: T, context: ClassMethodDecoratorContext): T;
  (target: object, key: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor;
}

/**
 * Method decorator for service classes: retries the async method on retryable errors.
 * Works with standard (TC39, TypeScript 5 default) decorators and, if enabled, legacy ones.
 * Usage: `@Retry({ maxAttempts: 4 }) async fetchThing() {...}`
 */
export function Retry(opts: RetryOptions = {}) {
  function decorate(this: unknown, original: (...args: any[]) => Promise<any>) {
    return function (this: unknown, ...args: any[]) {
      return withRetry(() => original.apply(this, args), opts);
    };
  }
  function decorator(a: any, b: any, c?: PropertyDescriptor): any {
    if (typeof a === 'function' && b && typeof b === 'object' && 'kind' in b) {
      return decorate(a); // standard decorators: (method, context) => replacement
    }
    c!.value = decorate(c!.value); // legacy decorators: (target, key, descriptor)
    return c;
  }
  return decorator as RetryDecorator;
}

/** Wrap a function (non-decorator form) with retry behaviour. */
export function retryable<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: RetryOptions = {}
): (...args: A) => Promise<R> {
  return (...args: A) => withRetry(() => fn(...args), opts);
}
