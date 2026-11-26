import { logger } from '../utils/logger.js';
import type { ErrorContext } from './errors.js';

export interface ErrorTracker {
  readonly name: string;
  captureException(error: unknown, context?: ErrorContext): void;
  /** Wait (up to timeoutMs) until pending events are delivered. */
  flush?(timeoutMs: number): Promise<void>;
}

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|credential/i;

/** Remove sensitive values from a context object before it leaves the process. */
export function scrubContext(context: ErrorContext = {}): ErrorContext {
  const out: ErrorContext = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : v;
  }
  return out;
}

/** Default tracker: only logs (no external dependency). */
class LogOnlyTracker implements ErrorTracker {
  readonly name = 'log';
  captureException(error: unknown, context?: ErrorContext): void {
    logger.debug({ err: error, context: scrubContext(context) }, 'Error captured (no external tracker configured)');
  }
}

/** Sentry tracker; @sentry/node is an optional runtime dependency loaded dynamically. */
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
 * Initialise tracking. Uses Sentry when SENTRY_DSN is set and @sentry/node is installed;
 * otherwise falls back to log-only tracking.
 */
export async function initErrorTracking(
  env: NodeJS.ProcessEnv = process.env,
  loader: (name: string) => Promise<any> = (name) => import(name)
): Promise<ErrorTracker> {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('Error tracking is log-only: set SENTRY_DSN and install @sentry/node to send errors to Sentry');
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
  } catch (err) {
    logger.warn({ err }, 'SENTRY_DSN set but @sentry/node could not be loaded; using log-only error tracking');
    tracker = new LogOnlyTracker();
  }
  return tracker;
}
