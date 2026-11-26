# Error Handling and Recovery

## Response format

Errors thrown by routes and services are formatted by the central handler (`backend/src/plugins/errorHandler.ts`). Routes that reply with an inline error body (`reply.status(404).send({ ... })`) are enriched by an `onSend` hook with the same `code`, `userMessage`, `retryable` and `requestId` fields (and logged/tracked like thrown errors) whenever the body has a string `error` or `message`:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "code": "NOT_FOUND",
  "message": "Issue with id '123' not found",
  "userMessage": "The requested item could not be found.",
  "retryable": false,
  "requestId": "req-1",
  "details": []
}
```

- `code` is stable and meant for client logic. `message` is technical (the raw message of unexpected 5xx errors is exposed only when `NODE_ENV=development`). `userMessage` is safe to show to end users; for thrown `BAD_REQUEST` and `CONFLICT` errors it is the specific message of the error; inline `{ error: '...' }` replies (whose text is often a raw database or library message) keep that text in `message` and get the generic text for the code as `userMessage`, like every other code. Do not put internal details into messages of 400/409 errors.
- `details` is only sent for client errors (e.g. validation issues).
- `retryable` tells clients whether the same request may succeed later.

## Error codes

| Code | HTTP | Class | Retryable |
|------|------|-------|-----------|
| `BAD_REQUEST` | 400 | `BadRequestError` | no |
| `VALIDATION_ERROR` | 400 | `ValidationError`, Zod/Fastify schema errors | no |
| `UNAUTHORIZED` | 401 | `UnauthorizedError` | no |
| `FORBIDDEN` | 403 | `ForbiddenError` | no |
| `NOT_FOUND` | 404 | `NotFoundError` | no |
| `CONFLICT` | 409 | `ConflictError` | no |
| `RATE_LIMITED` | 429 | `RateLimitError` | yes |
| `TENANT_ERROR` | 400 | `TenantError` | no |
| `TIMEOUT` | 504 | `TimeoutError` | yes |
| `SERVICE_UNAVAILABLE` | 503 | `ServiceUnavailableError`, transient network errors | yes |
| `DATABASE_ERROR` | 503 | `DatabaseError`, transient PostgreSQL errors (`40001`, `40P01`, `53300`, `57P01`, `57P03`, `08xxx`) | yes |
| `CACHE_ERROR` | 503 | `CacheError` | yes |
| `EXTERNAL_SERVICE_ERROR` | 502 | `ExternalServiceError` | yes |
| `INTERNAL_ERROR` | 500 | `InternalError`, any unknown error | no |

All classes extend `AppError` (`backend/src/lib/errors.ts`; `utils/errors.ts` re-exports them). Throw them from services and attach context with `err.withContext({ operation: 'issues.create' })`.

## Context and logging

On each request the plugin builds an error context: `requestId`, `method`, `url`, `tenantSlug`, `tenantId`, `userId`, `route` (for example `GET /v1/issues/:id`) and `operation` (the route unless set). Routes may add to `request.errorContext`. Context attached to the error with `withContext()` is merged in: its fields are added, its `operation` replaces the route operation, and the request fields (request, tenant, user) are kept. Failed jobs merge it the same way (the worker is kept as `worker`). Errors are logged with this context at `error` (5xx), `info` (401/403/404) or `warn` (other 4xx).

## Error tracking

`backend/src/lib/errorTracking.ts` sends 5xx errors (thrown or inline), failed background jobs (every worker started by the app: cleanup, SLA breaches, health scores, notifications, cloud sync, scheduled reports and bulk), `unhandledRejection`/`uncaughtException` (the event is flushed, then the process exits with code 1 as Node does by default) and frontend render errors (`POST /v1/client-errors`) to a tracker, with scrubbed context: values of keys that look secret (password, secret, token, authorization, cookie, api key, credential) are replaced by `[REDACTED]` at any depth in nested objects and arrays, in the tracked context and in the log line (including `err.context`). If `SENTRY_DSN` is set, Sentry (`@sentry/node`, a dependency of the backend) is used (`SENTRY_TRACES_SAMPLE_RATE` optional); otherwise errors are only logged. Use `setErrorTracker()` to plug in another tracker.

## Retries

```ts
import { withRetry, Retry } from '../lib/retry.js';
await withRetry(() => callExternalApi(), { maxAttempts: 3, baseDelayMs: 100 });
class Svc { @Retry({ maxAttempts: 4 }) async fetch() { ... } }
```

Only retryable errors (the table above, `retryable: true`, network codes such as `ECONNRESET`) are retried, with exponential backoff and jitter. `@Retry` uses standard TypeScript 5 decorators (no compiler flag needed); legacy decorators also work. In use today: Redis reads in `cacheService.getOrSet`, and on the frontend the axios interceptor in `lib/api.ts` replays an idempotent request (GET/HEAD) once when no response arrived at all (network failure; cancelled requests are never replayed). Server-side failures (503, 429, ...) are not replayed by the client, to avoid retry amplification and burning the rate limit; the React Query default `retry: 1` is unchanged.

## Recovery

`backend/src/lib/errorRecovery.ts` holds a registry of recovery handlers. Defaults (`registerDefaultRecoveryHandlers()`, called at startup):

- `cache-fallback`: on `CACHE_ERROR`, runs the `fallback` function from the context. `cacheService.getOrSet` uses it, so a failing cache read (or a corrupt entry) is served from the source of truth, which is queried exactly once, and the value is cached again.
- `transient-retry`: on a retryable error, runs the `retry` function from the context once. GET routes that are free of side effects opt in with `config: { replayOnTransientError: true }` (done for `GET /v1/issues` and `GET /v1/issues/:id`); the plugin then replays the request once (same headers and client address) and answers with the replay only if it was a plain 200 JSON response. A replayed request is tracked once (the replay is marked with a per-process secret header value, so a client cannot forge it). Note that a replay counts as a second request against the client's rate limit, and only the JSON body (not headers) of the replay is used.

A route can add its own `fallback` with `request.errorContext = { ...request.errorContext, fallback: () => loadFromDb() }`; use `withRecovery(fn, ctx)` inside services.

## Frontend

- `frontend/src/lib/errorMessages.ts`: `parseApiError(error)` returns `{ code, message, retryable, requestId }`; messages come from the server `userMessage` or the code mapping. `shouldRetryRequest` is a React Query retry predicate (available, not set as the default).
- `app/(dashboard)/error.tsx` and `app/error.tsx` (the Next.js error boundaries that catch a page that throws) show the friendly message and the error code line for errors that carry an API error code (a generic message otherwise, never the technical text) and report the error to `POST /v1/client-errors` (only when signed in, since the endpoint needs a session). Next.js clears them when the route changes.
- `frontend/src/components/ui/error-boundary.tsx`: `ErrorDisplay` (used by both error pages, with optional `code` and `requestId`) and the `ErrorBoundary` class for wrapping a part of a page. The class shows the friendly message and code for coded errors, takes an element or a renderer as `fallback`, an `onError` callback for reporting, and a `resetKey` that clears a caught error when it changes.
- The React Query default `retry: 1` in `providers/QueryProvider.tsx` is unchanged.
