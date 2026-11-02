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

The backend reports errors to [Sentry](https://sentry.io) via `@sentry/node`, wrapped by
`backend/src/utils/errorTracking.ts` (`initErrorTracking`, `captureError`, `flushErrorTracking`).

### Configuration

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `SENTRY_DSN` | no | unset | Project DSN. When unset, every tracking function is a no-op, so dev and test runs need no Sentry account. |
| `SENTRY_ENVIRONMENT` | no | `NODE_ENV` | Environment name attached to events. |
| `SENTRY_TRACES_SAMPLE_RATE` | no | `0` | Performance tracing sample rate (0 to 1). |

### What is reported

- **HTTP requests**: only 5xx responses, which include non-operational errors because they normalise to 500. Each event gets the tags `tenant`, `code`, `route`, `requestId`, `method` and `statusCode`. The user is identified by id only.
- **Background jobs**: the `failed` handlers of all BullMQ workers (integration-sync, cleanup, cloud-sync, health-scores, notifications, scheduled-reports, sla-breaches) report a failure only after the job has used up its configured attempts. Events carry `queue`, `jobName`, `jobId`, `attemptsMade` and `tenantSlug` (when present).
- **Process faults**: `unhandledRejection` and `uncaughtException`. On shutdown and after an uncaught exception, pending events are flushed with a 2 second timeout.

### What is not reported

- 4xx responses: validation, auth, not found, conflict and rate limiting errors.
- Job failures that will still be retried.

### PII rules

A `beforeSend` hook scrubs every event before it is sent:

- the `authorization`, `proxy-authorization`, `x-api-key`, `cookie` and `set-cookie` headers are removed;
- request bodies (`request.data`) and cookies are dropped;
- email addresses anywhere in the event are replaced with `[email]`;
- user data is reduced to `{ id }`. `sendDefaultPii` is disabled.

## Retry policy

TBD



## Recovery handlers

TBD
