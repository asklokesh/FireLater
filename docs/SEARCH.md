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
