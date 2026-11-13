# Issue Search

## Query syntax (`q`)

The free text is matched against issue title (weight A) and description (weight B) using
PostgreSQL `websearch_to_tsquery('english', ...)`:

| Syntax | Example | Meaning |
|---|---|---|
| Free text | `database outage` | both terms (stemmed) must match |
| Quoted phrase | `"disk full"` | exact phrase |
| OR | `vpn OR wifi` | either term |
| Exclusion | `login -test` | `login` but not `test` |
| Field qualifiers | `status:new priority:high severity:S1` | converted to equality filters |

Qualifiers supported: `status:` (new, assigned, in_progress, pending, resolved, closed),
`priority:` (critical, high, medium, low), `severity:` (S1–S4). Values are case-insensitive.
Unknown qualifiers (e.g. `owner:bob`) or disallowed values stay in the free text.

The `GET /v1/issues?search=` list filter also uses this full-text matching, and it still
matches `issue_number` with `ILIKE`, so you can look up an issue by number.

## Filter groups (`filter`)

```json
{
  "op": "and",
  "conditions": [
    { "field": "status", "operator": "in", "value": ["new", "assigned"] },
    { "op": "or", "conditions": [
      { "field": "priority", "operator": "eq", "value": "critical" },
      { "field": "sla_breached", "operator": "eq", "value": true }
    ] },
    { "field": "assigned_to", "operator": "is_null" }
  ]
}
```

- `op`: `and` | `or`
- `field`: `status`, `priority`, `severity`, `assigned_to`, `assigned_group`, `application_id`,
  `reporter_id`, `sla_breached`, `created_at`, `updated_at`
- `operator`: `eq`, `neq`, `in`, `not_in` (array value), `gt`, `gte`, `lt`, `lte`,
  `is_null`, `is_not_null` (no value)
- Nesting is limited to 3 levels, with at most 20 conditions in total. Requests with unknown
  fields or operators, or with deeper nesting, are rejected with a validation error.
  All values are sent as bound SQL parameters.

## `POST /v1/issues/search`

Requires the `issues:read` permission.

Request:

```json
{
  "q": "\"disk full\" status:new -test",
  "filter": { "op": "and", "conditions": [{ "field": "priority", "operator": "eq", "value": "high" }] },
  "page": 1,
  "per_page": 20,
  "sort": "relevance",
  "order": "desc",
  "facets": true
}
```

- `q`: optional, max 500 chars
- `per_page`: 1–100 (default 20)
- `sort`: `relevance` | `created_at` | `updated_at` | `priority` | `status` | `issue_number`.
  The default is `relevance` (rank desc, then created_at desc) when `q` has free text, and
  `created_at` desc otherwise.
- `order`: `asc` | `desc`
- `facets`: boolean, default `true`

Response:

```json
{
  "data": [{ "id": "...", "issue_number": "INC-00042", "title": "...", "rank": 0.42 }],
  "pagination": { "page": 1, "perPage": 20, "total": 1, "totalPages": 1 },
  "facets": {
    "status": [{ "value": "new", "count": 1 }],
    "priority": [{ "value": "high", "count": 1 }],
    "severity": [{ "value": "S2", "count": 1 }],
    "assigned_group": [{ "value": null, "count": 1 }]
  }
}
```

`rank` is the `ts_rank` value (0 when there is no free text). Facets are counted over the full
matching set, not only the current page. Results are cached for 5 minutes, and the cache is
cleared whenever an issue changes.

## Performance

Migration `037_issue_full_text_search` creates a GIN index in every tenant schema:

```sql
CREATE INDEX IF NOT EXISTS idx_issues_fulltext ON <schema>.issues USING GIN ((
  setweight(to_tsvector('english', coalesce(title,'')),'A') ||
  setweight(to_tsvector('english', coalesce(description,'')),'B')
));
```

The service queries use the same expression (`ISSUE_FULLTEXT_EXPRESSION` in
`backend/src/utils/search-query.ts`), so on large datasets the planner can use the index
instead of scanning the whole table.

## Saved templates, history, suggestions and analytics (`/v1/search`)

Migration `038_search_templates_history` creates the `search_filter_templates` and
`search_history` tables in every tenant schema. All endpoints below require `issues:read`,
except `GET /v1/search/analytics`, which requires `reports:read`.

### Search history recording

Each `POST /v1/issues/search` call writes one `search_history` row (user, `q`, `filter`,
total result count, duration in ms) once the results are computed. A request with an empty
`q` and no `filter` is not recorded. If writing the row fails, the error is logged and the
search response is still returned.

### Filter templates

`GET /v1/search/templates` returns the caller's own templates plus templates other users
shared (`isShared: true`).

```http
POST /v1/search/templates
{
  "name": "My open critical",
  "description": "Critical issues assigned to me",
  "query": "status:open",
  "filter": { "op": "and", "conditions": [{ "field": "priority", "operator": "eq", "value": "critical" }] },
  "isShared": false
}
```

Response `201`:

```json
{
  "id": "6f1c…",
  "user_id": "a3b2…",
  "name": "My open critical",
  "description": "Critical issues assigned to me",
  "entity_type": "issue",
  "query": "status:open",
  "filter": { "op": "and", "conditions": [{ "field": "priority", "operator": "eq", "value": "critical" }] },
  "is_shared": false,
  "created_at": "2026-11-13T10:00:00.000Z",
  "updated_at": "2026-11-13T10:00:00.000Z"
}
```

- `filter` is checked with the same filter-group schema `POST /v1/issues/search` uses.
- A name the caller already uses returns `409 Conflict`.
- `PUT /v1/search/templates/:id` (any subset of the fields above) and
  `DELETE /v1/search/templates/:id` (`204`) only work for the template's owner. Any other
  caller gets `404`.

### History

`GET /v1/search/history?limit=10` returns the caller's most recent searches, newest first
(`limit` defaults to 10, max 50):

```json
{ "data": [{ "id": "…", "user_id": "…", "entity_type": "issue", "query": "vpn", "filter": null, "result_count": 4, "duration_ms": 18, "created_at": "2026-11-13T09:59:00.000Z" }] }
```

`DELETE /v1/search/history` deletes only the caller's history and returns `{ "deleted": 12 }`.

### Suggestions

`GET /v1/search/suggestions?q=vp&limit=8` returns past queries that start with `q`, ignoring
case. The caller's own recent queries come first, then queries that are popular across the
tenant. Duplicates are removed and `limit` defaults to 8.

```json
{ "data": ["vpn down", "vpn certificate", "vpn slow"] }
```

### Analytics

`GET /v1/search/analytics?from=2026-10-01&to=2026-11-01&limit=10` (`reports:read`). The
default range is the last 30 days.

```json
{
  "totalSearches": 420,
  "uniqueUsers": 37,
  "zeroResultSearches": 21,
  "avgDurationMs": 34,
  "topQueries": [{ "query": "vpn", "count": 55 }],
  "zeroResultQueries": [{ "query": "printer 7th floor", "count": 6 }],
  "searchesPerDay": [{ "date": "2026-10-01", "count": 12 }]
}
```

Suggestions (60 s) and analytics (5 min) are cached under `<tenantSlug>:search:*` keys.
Creating, updating or deleting a template clears the tenant's `search` cache namespace.
