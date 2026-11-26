# Request Validation & Sanitization

Every route is validated and sanitized by one layer, installed once with
`registerValidation(app)` (`src/middleware/validation.ts`) before routes are registered
(`src/index.ts`, `src/app.ts`). It covers all routes, including those in prefixed plugins and routes that authenticate in an `onRequest` hook.

## Pipeline

Three hooks, installed once by `registerValidation(app)`:

1. **`onRequest` (early)**: sanitize and check the baseline for `params` and `query`. This runs before any route-level
   authentication hook, so even routes that authenticate in `onRequest` reject unsafe path parameters.
2. **`preValidation` (body)**: sanitize the body and, for routes **without** a dedicated body schema, apply the baseline body
   limits. Per-route rate limits (opt-in, see below) run here.
3. **`preHandler` (schema)**: appended after the route's own preHandler hooks, so after authentication and permission checks.
   Dedicated registry schemas for params, query and body run here; anonymous callers get 401/403, never field-level details.

### Sanitization

- control characters and null bytes are removed
- script-capable markup is removed: `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>`, `<link>`, `<meta>` and friends,
  inline event-handler attributes (`onerror=...`) and `javascript:` / `vbscript:` / `data:text/html` URLs in attributes
- a value that *is* a script URL (`javascript:alert(1)`) loses the scheme; ordinary text such as `JavaScript error on login` is untouched
- ordinary text is never rewritten: `Jane <jane@example.com>`, message ids like `<abc@host>`, `a<b`, code and markdown pass through as sent
- keys `__proto__`, `constructor`, `prototype`, nesting deeper than 20 levels and more than 500,000 keys are rejected (400)
- fields whose key matches password/secret/token/signature/api key/credential/certificate/hash are left untouched
- SQL-injection-looking input is logged for auditing (queries are parameterized; input is not rejected)

### Baseline checks

- path params: identifier-like params (`id`, `*Id`, `*_id`) must match `[\w.:@~+=%-]{1,255}`; other params may be free text
  (spaces, non-ASCII) but never contain control characters, quotes, `;`, `<`, `>`, `|`, backslashes or `/` (except wildcard params)
- query values: strings or arrays of strings (max 4000 characters each)
- bodies on routes without a dedicated body schema: JSON object or array, strings up to 5,000,000 characters, arrays up to
  50,000 items (the bulk API limit), property names up to 200 characters. A dedicated schema owns its own limits.

### Rate limiting

Per-route rate limiting is opt-in: add `rateLimit: { max, timeWindowMs }` to a `defineRoute` entry (fixed window per route and
client IP, in memory per process; behind a proxy set Fastify `trustProxy` so `request.ip` is the client). No route is limited by default.

### Audit log

`security: validation_failed`, `input_sanitized` and `route_rate_limited` are logged at warn level with method, route, ip, user id and field paths (never values).

## Schema registry

Schemas live in `src/schemas/`:

| File | Content |
| --- | --- |
| `common.ts` | shared building blocks and the baseline schemas |
| `auth.ts`, `issues.ts`, `requests.ts` | schemas per domain, exported with `Schema` suffix |
| `registry.ts` | the registry: `defineRoute(method, path, { body, params, query, rateLimit })` |
| `index.ts`, `modules.ts` | registry entries for auth/issues/requests and for every other module |

Registry paths use Fastify syntax without the `/v1` prefix and trailing slash: `defineRoute('POST', '/issues/:id/assign', { params, body })`.
Types come from the schemas: `type CreateIssueBody = z.infer<typeof createIssueSchema>`.

### Adding or migrating a route

1. Put the Zod schemas in `src/schemas/<domain>.ts` and export them.
2. Add a `defineRoute` entry in `src/schemas/index.ts`.
3. In the route file import the schema (no local copies); handlers may still call `schema.parse(request.body)` to get typed values.
4. A route can also opt into an explicit schema: `preValidation: [app.validate({ body })]`.

`app.validationCoverage()` lists every registered route and whether it has a dedicated schema; the server logs the counts at startup.
Every route module has registry entries: auth, issues and requests in `src/schemas/index.ts`, all other modules in `src/schemas/modules.ts` with their schemas in `src/schemas/<module>.ts`. Routes whose handlers take no validated input are registered with an empty entry; the baseline (safe params, string/array query values, bounded JSON bodies) always applies in addition to a dedicated schema. Dedicated schemas not yet written: `assets` and `search` (their schemas depend on service types), so those routes rely on the baseline plus handler-level parsing.

## Error format

```json
{
  "statusCode": 400,
  "error": "Validation Error",
  "message": "Validation failed: body.title: String must contain at least 5 character(s)",
  "details": [{ "location": "body", "field": "title", "message": "...", "code": "too_small" }]
}
```

Built by `buildValidationError` / `formatZodIssues` in `src/utils/validationErrors.ts`.
