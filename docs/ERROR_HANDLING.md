# Error Handling

## Hierarchy

All application errors extend `AppError` (`backend/src/utils/errors.ts`):

```
AppError
├── NotFoundError
├── BadRequestError
├── ValidationError
├── UnauthorizedError
├── ForbiddenError
├── ConflictError
├── RateLimitError
├── ServiceUnavailableError
├── ExternalServiceError
├── DatabaseError
└── InternalError
```

`AppError` carries `statusCode`, `error`, `code`, `message`, `userMessage`, `isOperational`, `retryable`, optional `details`, `cause` and `retryAfterSeconds`.

## Error codes

| Code | HTTP | Class | Retryable | Default user message |
|------|------|-------|-----------|----------------------|
| VALIDATION_FAILED | 400 | ValidationError | no | Validation failed |
| BAD_REQUEST | 400 | BadRequestError | no | (error message) |
| UNAUTHORIZED | 401 | UnauthorizedError | no | Unauthorized |
| FORBIDDEN | 403 | ForbiddenError | no | Forbidden |
| NOT_FOUND | 404 | NotFoundError | no | (error message) |
| CONFLICT | 409 | ConflictError | no | (error message) |
| RATE_LIMITED | 429 | RateLimitError | yes | Rate limit exceeded |
| SERVICE_UNAVAILABLE | 503 | ServiceUnavailableError | yes | The service is temporarily unavailable. Please try again later. |
| CIRCUIT_OPEN | 503 | ServiceUnavailableError | yes | The service is temporarily unavailable. Please try again later. |
| UPSTREAM_TIMEOUT | 504 | AppError | no | An unexpected error occurred |
| EXTERNAL_SERVICE_ERROR | 502 | ExternalServiceError | yes | An external service failed to respond. Please try again later. |
| DATABASE_UNAVAILABLE | 503 | ServiceUnavailableError | yes | The service is temporarily unavailable. Please try again later. |
| DATABASE_ERROR | 500 | DatabaseError | no | An unexpected error occurred |
| INTERNAL_ERROR | 500 | InternalError | no | An unexpected error occurred |

## Response format

`registerErrorHandling(app)` (`backend/src/middleware/errorHandler.ts`) installs the error and not-found handlers. Every error response body is:

```json
{ "statusCode": 404, "error": "Not Found", "code": "NOT_FOUND", "message": "...", "requestId": "...", "details": {} }
```

`details` is present only when set. In production, 5xx responses use the class's `userMessage` and never include the raw message or stack. 429 and 503 responses whose error has `retryAfterSeconds` include a `Retry-After` header.

`normalizeError` maps ZodError and Fastify schema validation errors to `ValidationError` (400 "Validation Error" "Request validation failed"), statusCode 429 to `RATE_LIMITED`, pg `23505` to `ConflictError`, `23503`/`22P02` to `BadRequestError`, pg `08xxx`, `57P01` and pool connection timeouts to `ServiceUnavailableError` with `DATABASE_UNAVAILABLE`, other objects with a numeric `statusCode` to a matching `AppError`, and everything else to `InternalError`.

## Logging and context

Every response carries an `x-request-id` header equal to the body `requestId`. An incoming `x-request-id` is reused only when it matches `^[A-Za-z0-9._-]{1,64}$`.

Each handled error writes one log entry with `requestId`, `method`, `route`, `statusCode`, `code`, and `tenantSlug`/`userId` when available. 5xx errors log at `error` level with `err`; 4xx errors log at `warn` without a stack. Authorization, cookie and password fields are redacted.



## Error tracking

TBD



## Retry policy

`backend/src/utils/retry.ts` exports `withRetry(operation, options)`, `retryable(fn, options)` (a higher-order wrapper for service methods, no decorators) and `isTransientError(error)`.

Defaults (each can be overridden per call):

| Option | Default | Meaning |
|---|---|---|
| `maxAttempts` | 3 | Total attempts, including the first call |
| `baseDelayMs` | 200 | Delay ceiling before the first retry |
| `factor` | 2 | Exponential growth of the ceiling per retry |
| `maxDelayMs` | 2000 | Upper bound of the ceiling |
| `jitter` | `true` | Full jitter: the actual delay is random in `[0, ceiling)` |
| `signal` | none | `AbortSignal`; once aborted no further attempt is made |

Ceiling for retry *n* (1-based): `min(maxDelayMs, baseDelayMs * factor^(n-1))`.

Non-transient errors are rethrown after one attempt. After the last attempt the final error is rethrown with `error.attempts` set to the attempt count. Each retry writes a `warn` log with `operation`, `attempt`, `delayMs` and `errorCode`.

### Transient classification

| Source | Transient | Not transient |
|---|---|---|
| `AppError` | `retryable: true` with a non-4xx status (e.g. `SERVICE_UNAVAILABLE`, `UPSTREAM_TIMEOUT`, `EXTERNAL_SERVICE_ERROR`) | Every 4xx (incl. `RATE_LIMITED`), `CIRCUIT_OPEN`, `retryable: false` |
| PostgreSQL SQLSTATE | `40001` serialization failure, `40P01` deadlock, `57P01` admin shutdown, `08xxx` connection exceptions | Everything else (e.g. `23505`) |
| Node.js `code` | `ECONNRESET`, `ETIMEDOUT`, `ECONNREFUSED`, `EAI_AGAIN` | Everything else |
| Other errors | | Always (unclassified) |

### Idempotency rule

Retry is opt-in and only for idempotent operations. Currently `syncResources`, `getCostData` and `validateCredentials` in `awsService` wrap the circuit-breaker call in `withRetry`. No write path is retried by default; a write may only be wrapped when it is idempotent (for example, guarded by an idempotency key).

## Recovery handlers

| Scenario | Trigger | Server response | Expected client action |
|---|---|---|---|
| Circuit open | `CircuitBreaker` has reached `failureThreshold` and the cooldown has not elapsed | `503`, `code: CIRCUIT_OPEN`, `Retry-After` = remaining cooldown in seconds (rounded up, min 1); the operation is not invoked and the call is not retried server-side | Do not retry before `Retry-After`; show a temporary-unavailability message |
| Upstream timeout | Operation exceeds the breaker `timeout` (the timer is cleared once the operation settles) | `502` (`ExternalServiceError`) with `code: UPSTREAM_TIMEOUT`, `retryable: true`; counts as a breaker failure; retried server-side by `withRetry` for idempotent calls | Retry an idempotent request with backoff; do not blindly resubmit writes |
| Transient DB/network failure | SQLSTATE `40001`, `40P01`, `57P01`, `08xxx` or Node `ECONNRESET`/`ETIMEDOUT`/`ECONNREFUSED`/`EAI_AGAIN` inside a wrapped operation | Retried up to `maxAttempts`; if all fail, the final error is mapped by the error handler | Retry later if the response is retryable |
| Cache (Redis) unavailable | Any Redis call fails | No error: `cacheService.getOrSet` falls back to the fetcher result; `invalidate`, `invalidatePrefix` and `invalidateTenant` resolve with `0` and log the failure | None; responses are served uncached |
