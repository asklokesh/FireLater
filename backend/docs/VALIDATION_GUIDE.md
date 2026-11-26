# Request Validation & Sanitization

Every HTTP route is validated and sanitized by one middleware (`src/middleware/validation.ts`),
driven by a central Zod schema registry (`src/schemas/`).

## How it works

`setupValidation(app)` is called before routes are registered (`src/index.ts`, `src/app.ts`). It adds an
`onRoute` hook that appends a validation `preHandler` to **every** route, after the route's own auth guards.
For each request it:

1. **Sanitizes** body, query and params (`src/utils/inputSanitizer.ts`).
2. **Validates** them: the registry schema for `"METHOD /path"` if one exists, otherwise the baseline schemas.
3. Replaces `request.params` / `request.body` with the parsed, typed output when a registry schema exists
   (query keeps the sanitized raw strings, handlers still parse it).
4. On failure answers `400` and writes a security audit log entry.

Coverage: every route (488 incl. the inline ones in `src/index.ts`) has an explicit entry in the registry;
`tests/unit/schemas/coverage.test.ts` fails if a route is declared without one, and the server logs a warning
listing any route that falls back to the baseline. Routes with a dedicated domain schema get strict
per-field validation. Routes that read loose input (`schemas/remaining.routes.ts`, built with
`schemas/builders.ts`) validate params per name (`:id` / `:xxxId` are UUIDs, except `jobId`, `sessionId`),
the query/body fields the handler reads (bounded, type-checked when present, numeric paging) and tolerate
unknown keys. The baseline schemas (`BASELINE_PARAMS`, `BASELINE_QUERY`, `BASELINE_BODY`, plus derived UUID
params) remain only as a safety net for routes added without a registry entry.
Search routes keep their in-handler schemas (they depend on service constants) and are registered with loose
field schemas in `remaining.routes.ts`.

## Layout and conventions

```
src/schemas/
  common.ts            reusable pieces (uuid, idParamSchema, paginationQuerySchema, ...)
  types.ts             RouteSchema / RouteSchemaMap
  <domain>.ts          Zod schemas for a domain (users.ts, issues.ts, ...) - exported, no route logic
  remaining.routes.ts  loose-input endpoints without a domain schema; builders.ts has its helpers
  <domain>.routes.ts   map of "METHOD /path" -> { params, query, body, rateLimit }
  index.ts             schemaRegistry (merges all *.routes.ts) + inferred types (Infer<>, CreateUserBody, ...)
```

- Registry keys use Fastify path syntax without the `/v1` prefix and without a trailing slash:
  `'PUT /users/:id/roles'`.
- Route handlers import schemas from `src/schemas` and use inferred types, never re-parse:
  `const body = request.body as z.infer<typeof createUserSchema>;`
- `body` may be a function `(request) => schema` when the shape depends on the request
  (`POST /auth/register` picks tenant vs user registration from the `x-tenant-slug` header).
- Add a `rateLimit: { max, timeWindow }` to a registry entry for a per-route limit
  (uses `@fastify/rate-limit`; counted per route and client IP).
- For a one-off route outside the registry: `preHandler: [app.validate({ body: schema })]`.

### Adding a schema

1. Define it in `src/schemas/<domain>.ts` (`export const createFooSchema = z.object({...})`).
2. Register it in `src/schemas/<domain>.routes.ts` and spread that map into `schemaRegistry` in `index.ts`.
3. Remove inline parsing from the handler and use `z.infer<typeof createFooSchema>`.
4. Add a test case next to `tests/unit/middleware/validation.test.ts`.

## Sanitization policy

| Input | Treatment |
| --- | --- |
| Any string | NUL / control characters (except tab, newline, CR) removed |
| Keys matching password, token, secret, api key, credential, signature, private key, certificate, authorization | otherwise untouched (credentials are never altered) |
| Keys `content`, `html`, `richText`, `body_html`, `article_body` | allow-list HTML sanitizer (`sanitizeHTML` in `contentSanitization.ts`) |
| Everything else | HTML tags and script/style contents stripped, entities escaped (bare `&` kept) |
| `javascript:`, `vbscript:`, `data:text/html` | removed |
| `__proto__` keys | dropped (prototype pollution) |
| Nesting deeper than 32 levels | rejected with 400 |

SQL injection is prevented by parameterized queries / Drizzle in the service layer; sanitization does not
rewrite SQL-looking text.

## Error format

```json
{
  "statusCode": 400,
  "error": "Validation Error",
  "message": "Request validation failed - body.email: Invalid email",
  "details": [
    { "location": "body", "field": "email", "message": "Invalid email", "code": "invalid_string", "path": ["email"] }
  ]
}
```

`location` is `body`, `params` or `query`. Built by `src/utils/validationErrors.ts`.

## Security audit log

Structured `warn` log entries with `security: true` and `event` of `request.validation_failed`,
`request.input_sanitized` (with the sanitized paths) or `request.rate_limited`, including method, route,
IP, user agent, user, tenant and request id.
