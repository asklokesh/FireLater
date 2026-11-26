# Request Validation & Sanitization

Every request passes through `src/middleware/validation.ts` (`validationPlugin`), registered
before all routes in `src/index.ts` (and `src/app.ts` for tests).

## What happens to a request

1. The route's own `preHandler`s run first (authentication, permissions).
2. The validation hook runs for params, query and body:
   1. optional per-route rate limit (429 + `Retry-After`)
   2. **sanitization** (`src/utils/inputSanitizer.ts`)
   3. **Zod validation**, if a schema applies; `request.params/query/body` are replaced with the parsed (coerced) values
3. Failures return a consistent 400 (`src/utils/validationErrors.ts`):

```json
{
  "statusCode": 400,
  "error": "Validation Error",
  "message": "Request validation failed",
  "details": [{ "location": "body", "field": "title", "message": "Required", "code": "invalid_type", "path": ["title"] }]
}
```

Every route is sanitized and has at least one schema check (explicit or default). `app.validationCoverage()` lists each route as
`explicit` (route-level `validate()` or an entry in `schemaRegistry`), `default` (convention schemas,
below) or `baseline` (sanitization only; no input shape applies). The server logs a
`validation_coverage` summary on startup (`LOG_VALIDATION_COVERAGE=true` also lists baseline routes).

## Schemas live in `src/schemas/`

- `common.ts` – shared pieces (uuid, id params, pagination)
- `<module>.ts` – one file per route module (`auth.ts`, `issues.ts`, `changes.ts`, ...), exporting schemas **and** `z.infer` types
- `index.ts` – the registry `schemaRegistry` keyed by `"METHOD /full/route/pattern"`

Conventions: export `<thing>Schema` plus a `<Thing>Input`/`<Thing>Params`/`<Thing>Query` type; use
`z.coerce` for query values; use `.passthrough()` on query schemas whose extra keys are read elsewhere
(e.g. `sort`/`order` for `parsePagination`); handlers cast with `request.body as CreateIssueInput`
instead of re-parsing.

## Using it in a route

```ts
app.post('/:id/comments', {
  preHandler: [requirePermission('issues:update'),
               app.validate({ params: issueIdParamSchema, body: commentSchema })],
}, async (request) => {
  const body = request.body as IssueCommentInput;
});
```

`app.validate({ rateLimit: { max: 5, windowMs: 60_000, keyGenerator? } })` adds a per-route,
per-process sliding-window limit (keyed by route + client IP by default). Routes listed in
`schemaRegistry` get their registered schemas automatically (even without `app.validate`); other routes get the convention defaults. Add the schema to `src/schemas/` and the registry to move a
route from `default` to `explicit`.

**All `validate()` calls on a route are merged into one validator**, and any location (`params`, `query`, `body`) the
route did not declare is filled from the registry, then from the convention defaults, so `validate({ body })` still
checks path params. Declaring the same location twice is an error at registration time. On GET routes the default
paging keys (`page`, `per_page`, `limit`, `offset`) are checked in addition to an explicit query schema. A schema may be a
function of the request (`body: (req) => ...`) when the shape depends on a header.

### Convention defaults (`lookupSchemas` in `src/schemas/index.ts`)

- path params named `id`, `appId`, `incidentId`, `userId` must be UUIDs; other params are non-empty strings (max 255, no whitespace, slashes or angle brackets)
- GET query: `page`, `per_page`, `limit`, `offset` must be numeric; `search`/`q` are length-capped; other keys pass through
- POST/PUT/PATCH/DELETE body: must be a JSON object when present

Write a real schema (and registry entry) whenever a handler reads specific fields.

## Sanitization rules

Sanitization is defence in depth, **not** a substitute for output encoding where data is rendered.
It uses a linear-time tag scanner (no backtracking regexes), so hostile input cannot stall the event loop.

- NUL/control characters are removed from all strings
- `<script>`/`<style>` blocks are removed; `iframe`, `object`, `embed`, `link`, `meta`, `base` tags are removed; HTML comments are removed
- inside any remaining tag, `on*` event-handler attributes, `srcdoc`, and attributes whose value is a `javascript:`, `vbscript:` or `data:text/html` URL
  (after HTML-entity decoding and whitespace stripping) are removed
- an unterminated comment, or an unterminated plain-field tag, only loses its own `<name` token; an unterminated dangerous tag
  (`<script`, `<style`, `<iframe`, ...) has its `<` escaped to `&lt;`; in every case the text after it is kept
- prose is untouched: `Set online = true`, `a < b`, `use javascript: URLs` are stored as written
- "plain" fields (`title`, `name`, `*Name`, `email`, `slug`, `subject`, `search`, ...) also have every tag stripped and are trimmed
- fields whose names look like secrets (`password`, `token`, `secret`, `apiKey`, ...) and raw-code fields (`script`, `expression`, `sql`, `regex`, ...) are never modified
- script/`file:` URLs are blanked in url-like fields (`*url`, `*href`, `*link`, `endpoint`, `webhook*`)
- `__proto__`, `constructor`, `prototype` keys are dropped; nesting deeper than 32 levels is a 400
- payloads that re-form after removal (`<scr<script>ipt>`) are escaped (`<` becomes `&lt;`) after a few passes
- SQL injection is prevented by parameterised queries, not by rewriting input

Altered fields are logged for security auditing (`input_sanitized`, `validation_rejected`,
`validation_rate_limited`) with field paths only, never values. The client is not told that a value was altered.

## Known exceptions

- `POST /v1/email/webhook/{sendgrid,mailgun}/:tenantSlug` parse their provider payload in the handler because the
  webhook signature must be verified (401) before the payload is judged (400); they still get the default body check.
- `GET` routes that only paginate use the convention query defaults rather than a dedicated schema.
- Services still enforce their own business rules; schemas only check shape and size.
