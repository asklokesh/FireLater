import { ErrorCode, ErrorContext, isRetryableError } from './errors.js';

export interface RecoveryHandler {
  name: string;
  /** True if this handler knows how to recover from the error. */
  canHandle(error: unknown, context: ErrorContext): boolean;
  /** Attempt recovery; resolve with the recovered value. Throw to signal failure. */
  recover<T = unknown>(error: unknown, context: ErrorContext): Promise<T>;
}

const handlers: RecoveryHandler[] = [];

export function registerRecoveryHandler(handler: RecoveryHandler): void {
  const i = handlers.findIndex((h) => h.name === handler.name);
  if (i >= 0) handlers[i] = handler;
  else handlers.push(handler);
}

export function clearRecoveryHandlers(): void {
  handlers.length = 0;
}

export function listRecoveryHandlers(): string[] {
  return handlers.map((h) => h.name);
}

export type RecoveryResult<T> = { recovered: true; value: T; handler: string } | { recovered: false };

/** Run the first matching handler. A failing handler never masks the original error. */
export async function attemptRecovery<T = unknown>(
  error: unknown,
  context: ErrorContext = {}
): Promise<RecoveryResult<T>> {
  for (const h of handlers) {
    let match = false;
    try {
      match = h.canHandle(error, context);
    } catch {
      match = false;
    }
    if (!match) continue;
    try {
      const value = await h.recover<T>(error, context);
      return { recovered: true, value, handler: h.name };
    } catch {
      return { recovered: false };
    }
  }
  return { recovered: false };
}

/**
 * Run `primary`; if it throws and a recovery handler applies, return the recovered value.
 * Otherwise rethrow the original error.
 */
export async function withRecovery<T>(primary: () => Promise<T>, context: ErrorContext = {}): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    const result = await attemptRecovery<T>(error, context);
    if (result.recovered) return result.value;
    throw error;
  }
}

/** Cache failures: serve from the source of truth instead. Context must provide `fallback`. */
export const cacheFallbackHandler: RecoveryHandler = {
  name: 'cache-fallback',
  canHandle: (error, ctx) =>
    typeof ctx.fallback === 'function' &&
    !!error &&
    typeof error === 'object' &&
    ((error as { code?: unknown }).code === ErrorCode.CACHE_ERROR ||
      (error as { name?: unknown }).name === 'CacheError'),
  recover: async (_error, ctx) => (ctx.fallback as () => Promise<never>)(),
};

/** Transient failures: re-run `ctx.retry` once. */
export const transientRetryHandler: RecoveryHandler = {
  name: 'transient-retry',
  canHandle: (error, ctx) => typeof ctx.retry === 'function' && isRetryableError(error),
  recover: async (_error, ctx) => (ctx.retry as () => Promise<never>)(),
};

export function registerDefaultRecoveryHandlers(): void {
  registerRecoveryHandler(cacheFallbackHandler);
  registerRecoveryHandler(transientRetryHandler);
}
