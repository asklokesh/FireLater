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

TBD



## Recovery handlers

TBD
