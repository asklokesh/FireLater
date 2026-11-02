import * as Sentry from '@sentry/node';

type TagValue = string | number | boolean | undefined | null;

export interface ErrorTrackingContext {
  /** Request context (flat form). */
  tenant?: string | null;
  code?: string | null;
  route?: string | null;
  requestId?: string | null;
  /** Users are identified by id only. */
  userId?: string | number | null;
  /** Background job context (flat form). */
  queue?: string | null;
  jobName?: string | null;
  jobId?: string | null;
  attemptsMade?: number | null;
  tenantSlug?: string | null;
  tags?: Record<string, TagValue>;
  extra?: Record<string, unknown>;
  user?: { id?: string | number | null };
}

const FLAT_TAG_KEYS = ['tenant', 'code', 'route', 'requestId', 'queue', 'jobName', 'jobId'] as const;
const JOB_EXTRA_KEYS = ['queue', 'jobName', 'jobId', 'attemptsMade', 'tenantSlug'] as const;

export interface ErrorTrackingOptions {
  dsn?: string;
  environment?: string;
  tracesSampleRate?: number;
}

let enabled = false;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-api-key']);

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return value.replace(EMAIL_PATTERN, '[email]');
  if (depth > 10 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = scrubValue(v, depth + 1);
  }
  return out;
}

/** Strip credentials, request bodies and email addresses from an outgoing event. */
export function scrubEvent<T extends Record<string, any>>(event: T): T {
  const e: Record<string, any> = { ...event };
  if (e.request) {
    const request: Record<string, any> = { ...e.request };
    delete request.data;
    delete request.cookies;
    if (request.headers && typeof request.headers === 'object') {
      const headers: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(request.headers as Record<string, unknown>)) {
        if (!SENSITIVE_HEADERS.has(k.toLowerCase())) headers[k] = v;
      }
      request.headers = headers;
    }
    e.request = request;
  }
  if (e.user) {
    e.user = e.user.id !== undefined ? { id: e.user.id } : {};
  }
  return scrubValue(e) as T;
}

export function isErrorTrackingEnabled(): boolean {
  return enabled;
}

/** Initialise Sentry. No-op unless a DSN is configured. */
export function initErrorTracking(options: ErrorTrackingOptions = {}): boolean {
  const dsn = options.dsn ?? process.env.SENTRY_DSN;
  if (!dsn) {
    enabled = false;
    return false;
  }
  const rate = options.tracesSampleRate ?? Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0);
  Sentry.init({
    dsn,
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: Number.isFinite(rate) ? rate : 0,
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event as Record<string, any>) as typeof event,
  });
  enabled = true;
  return true;
}

/** Report an error. No-op when error tracking is not initialised. */
export function captureError(error: unknown, context: ErrorTrackingContext = {}): void {
  if (!enabled) return;
  try {
    const tags: Record<string, TagValue> = {};
    for (const k of FLAT_TAG_KEYS) tags[k] = context[k];
    if (tags.tenant == null && context.tenantSlug != null) tags.tenant = context.tenantSlug;
    Object.assign(tags, context.tags ?? {});

    const extra: Record<string, unknown> = {};
    for (const k of JOB_EXTRA_KEYS) {
      if (context[k] !== undefined && context[k] !== null) extra[k] = context[k];
    }
    Object.assign(extra, context.extra ?? {});

    const userId = context.user?.id ?? context.userId;

    Sentry.withScope((scope) => {
      for (const [k, v] of Object.entries(tags)) {
        if (v !== undefined && v !== null) scope.setTag(k, String(v));
      }
      if (Object.keys(extra).length > 0) scope.setExtras(extra);
      if (userId !== undefined && userId !== null && userId !== '') scope.setUser({ id: String(userId) });
      Sentry.captureException(error);
    });
  } catch {
    // Never let error reporting break the caller.
  }
}

/** Flush pending events, bounded by timeoutMs. Resolves false on timeout or when disabled. */
export async function flushErrorTracking(timeoutMs = 2000): Promise<boolean> {
  if (!enabled) return true;
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}

interface FailedJobLike {
  id?: string | null;
  name?: string;
  attemptsMade?: number;
  opts?: { attempts?: number };
  data?: unknown;
}

/** True once a job has used up all its configured attempts. */
export function isFinalAttempt(job: FailedJobLike | undefined | null): boolean {
  if (!job) return true;
  const attempts = job.opts?.attempts ?? 1;
  return (job.attemptsMade ?? 0) >= attempts;
}

/** Report a failed BullMQ job, only when its retries are exhausted. */
export function captureJobFailure(queue: string, job: FailedJobLike | undefined | null, error: unknown): void {
  if (!isFinalAttempt(job)) return;
  captureError(error, {
    queue,
    jobName: job?.name,
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    tenantSlug: jobTenantSlug(job),
  });
}

/** tenantSlug from a job's data, when present. */
export function jobTenantSlug(job: FailedJobLike | undefined | null): string | undefined {
  const data = job?.data as { tenantSlug?: unknown } | undefined;
  return data && typeof data.tenantSlug === 'string' ? data.tenantSlug : undefined;
}

/** Test helper: reset module state. */
export function resetErrorTrackingForTests(): void {
  enabled = false;
}
