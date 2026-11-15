# Search

Full-text search over issues and problems, backed by PostgreSQL. Elasticsearch integration is optional and not part of this change.

## Endpoint

`GET /v1/search` (authenticated, tenant taken from the JWT, requires `issues:read`, or `problems:read` for `entity=problems`)

| Param | Description |
|-------|-------------|
| `q` | Search text, max 200 characters. Empty means filters only. |
| `entity` | `issues` (default) or `problems`. |
| `filters` | URL-encoded JSON filter group (see below). |
| `page` | Page number, default 1. |
| `per_page` | Page size, default 20, capped at 100. |

Response: `{ "results": [...], "total": 42, "facets": { ... } }`. Each result includes a `rank` value.

## Query syntax

| Form | Example | Meaning |
|------|---------|---------|
| Words | `disk full` | All words must match |
| Phrase | `"disk full"` | Words adjacent, in order |
| Exclusion | `disk -network` | Must not contain `network` |
| OR | `disk OR memory` | Either word |
| Prefix | `serv*` | Trailing star, parsed by `parseSearchQuery`. Note: PostgreSQL `websearch_to_tsquery` has no prefix operator, so the star is dropped before matching. |

Text is passed as a bind parameter to `websearch_to_tsquery('english', $n)`; it is never concatenated into SQL.

## Filters

```json
{
  "logic": "AND",
  "conditions": [
    { "field": "status", "op": "eq", "value": "new" },
    { "logic": "OR", "conditions": [
      { "field": "priority", "op": "eq", "value": "high" },
      { "field": "priority", "op": "eq", "value": "critical" }
    ] }
  ]
}
```

Ops: `eq`, `neq`, `in` (array value), `gt`, `gte`, `lt`, `lte`, `contains` (case-insensitive substring), `is_null` (`value: false` means not null). Groups nest up to 3 levels. Fields are checked against a per-entity allowlist; unknown fields, ops or deeper nesting return 400.

## Ranking

Results are ordered by `ts_rank` descending (then newest first). With an empty `q`, rank is 0 and order is newest first. `issueService.list` with `search` also ranks by relevance when no explicit sort is given, and still matches `issue_number` by prefix.

## Facets

Counts of `status`, `priority`, `severity` and `assigned_group`, computed against the current `q` and filters. Problems have no severity column, so that facet is omitted for `entity=problems`.

## Indexing

Migration `037_search_fulltext` creates GIN expression indexes on `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))` for issues and problems in every tenant schema and `tenant_template`. No generated columns are added.
