import { logger } from '../utils/logger.js';
import type { ErrorContext } from './errors.js';

export interface ErrorTracker {
  readonly name: string;
  captureException(error: unknown, context?: ErrorContext): void;
  /** Wait (up to timeoutMs) until pending events are delivered. */
  flush?(timeoutMs: number): Promise<void>;
}

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential/i;

const MAX_SCRUB_DEPTH = 6;
const REDACTED = '[REDACTED]';

function scrubValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_SCRUB_DEPTH) return '[Truncated]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1, seen));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : scrubValue(v, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Remove sensitive values from a context object before it leaves the process. Nested objects and
 * arrays (headers, request bodies) are scrubbed too, down to MAX_SCRUB_DEPTH levels.
 */
export function scrubContext(context: ErrorContext = {}): ErrorContext {
  return scrubValue(context, 0, new WeakSet()) as ErrorContext;
}

/**
 * Merge the context attached to an error (AppError.withContext / options.context) into the context
 * known at the capture site. The capture site wins for identity fields (request, tenant, user);
 * the error's own `operation` wins, because it names what actually failed.
 */
export function mergeErrorContext(error: unknown, context: ErrorContext): ErrorContext {
  const own = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined;
  if (!own || typeof own !== 'object' || Array.isArray(own)) return context;
  const merged: ErrorContext = { ...context };
  for (const [k, v] of Object.entries(own as Record<string, unknown>)) {
    if (v === undefined) continue;
    if (k === 'operation' || merged[k] === undefined) merged[k] = v;
  }
  return merged;
}

/** Default tracker: only logs (no external dependency). */
class LogOnlyTracker implements ErrorTracker {
  readonly name = 'log';
  captureException(error: unknown, context?: ErrorContext): void {
    logger.debug({ err: error, context: scrubContext(context) }, 'Error captured (no external tracker configured)');
  }
}

/** Sentry tracker; @sentry/node is loaded on demand, only when SENTRY_DSN is set. */
class SentryTracker implements ErrorTracker {
  readonly name = 'sentry';
  constructor(private sentry: any) {}
  async flush(timeoutMs: number): Promise<void> {
    await this.sentry.flush?.(timeoutMs);
  }
  captureException(error: unknown, context?: ErrorContext): void {
    const ctx = scrubContext(context);
    this.sentry.withScope((scope: any) => {
      if (ctx.tenantSlug) scope.setTag('tenant', String(ctx.tenantSlug));
      if (ctx.operation) scope.setTag('operation', String(ctx.operation));
      if (ctx.userId) scope.setUser({ id: String(ctx.userId) });
      scope.setContext('error_context', ctx);
      this.sentry.captureException(error);
    });
  }
}

let tracker: ErrorTracker = new LogOnlyTracker();

export function setErrorTracker(t: ErrorTracker): void {
  tracker = t;
}

export function getErrorTracker(): ErrorTracker {
  return tracker;
}

/** Flush pending events (used before the process exits). Never throws. */
export async function flushErrorTracking(timeoutMs = 2000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    // Enforce the deadline here too: a tracker whose flush never settles must not block process exit
    await Promise.race([
      Promise.resolve(tracker.flush?.(timeoutMs)),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } catch {
    // ignore
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function captureException(error: unknown, context?: ErrorContext): void {
  try {
    tracker.captureException(error, context);
  } catch (trackingError) {
    // Tracking must never break request handling
    logger.warn({ err: trackingError }, 'Error tracker failed');
  }
}

/**
 * Initialise tracking. Uses Sentry when SENTRY_DSN is set; otherwise (or if @sentry/node fails to
 * load or initialise) falls back to log-only tracking.
 */
export async function initErrorTracking(
  env: NodeJS.ProcessEnv = process.env,
  loader: (name: string) => Promise<any> = (name) => import(name)
): Promise<ErrorTracker> {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('Error tracking is log-only: set SENTRY_DSN to send errors to Sentry');
    tracker = new LogOnlyTracker();
    return tracker;
  }
  try {
    const sentry = await loader('@sentry/node');
    sentry.init({
      dsn,
      environment: env.NODE_ENV,
      tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    });
    tracker = new SentryTracker(sentry);
    logger.info({ environment: env.NODE_ENV }, 'Error tracking sends errors to Sentry');
  } catch (err) {
    logger.warn({ err }, 'SENTRY_DSN set but Sentry could not be initialised; using log-only error tracking');
    tracker = new LogOnlyTracker();
  }
  return tracker;
}
