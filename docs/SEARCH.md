# Issue Search

`POST /v1/issues/search` (permission `issues:read`) combines full-text search, a filter tree and facets.

## `q` syntax (websearch_to_tsquery)

- Plain words: `server outage` (all words must match)
- Quoted phrases: `"disk full"`
- `OR`: `network OR vpn`
- Leading minus excludes: `server -backup`
- Issue number prefix: `ISS-00` matches issue numbers starting with it (case-insensitive)

Max length 200 characters. Without `sort`, results are ordered by `ts_rank` descending.

## Filter tree

```json
{ "op": "AND", "conditions": [
  { "field": "status", "operator": "in", "value": ["new", "assigned"] },
  { "op": "OR", "conditions": [
    { "field": "priority", "operator": "eq", "value": "high" },
    { "field": "sla_breached", "operator": "eq", "value": true }
  ] }
] }
```

Fields: `status`, `priority`, `severity`, `assigned_to`, `assigned_group`, `application_id`, `reporter_id`, `sla_breached`, `created_at`, `updated_at`.

Operators: `eq`, `neq`, `in`, `not_in` (array value), `gt`, `gte`, `lt`, `lte`, `is_null`, `not_null` (no value).

Limits: nesting depth 3, 25 conditions in total. Unknown fields/operators return a validation error. Values are always bound parameters.

## Facets

`facets` may contain `status`, `priority`, `assigned_group`, `application_id`. Each returns `[{ "value", "count" }]` over the `q` + `filter` result set.

## Request / response

```json
{ "q": "server -backup", "filter": { "op": "AND", "conditions": [{ "field": "status", "operator": "eq", "value": "new" }] },
  "facets": ["status", "priority"], "page": 1, "per_page": 20, "sort": "created_at", "order": "desc" }
```

Response: `{ "data": [{ "id": "...", "title": "...", "rank": 0.07 }], "meta": { "total": 1, "page": 1, "perPage": 20 }, "facets": { "status": [{ "value": "new", "count": 1 }] } }`

## Indexing strategy

Migration 037 creates GIN index `idx_issues_fulltext` on the same tsvector expression used by the queries (`ISSUE_TSVECTOR_EXPR`) in `tenant_template` and every `tenant_%` schema. For large datasets, create it with `CREATE INDEX CONCURRENTLY` manually beforehand (the migration is idempotent via `IF NOT EXISTS`), keep the expression identical so the planner uses it, and rely on btree indexes on filtered columns for the filter tree. Results are cached under `<tenant>:issues:search:` and cleared on issue writes.
