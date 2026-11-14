# Search

Full-text search over issues, backed by a generated `search_vector` tsvector column
(title, description, issue_number) with a GIN index (migration `037_search`).

## Query syntax

The `q` parameter (max 200 chars) is passed to `websearch_to_tsquery`:

- Terms: `disk memory` (all terms must match)
- Quoted phrases: `"out of space"`
- OR: `disk OR memory`
- Exclusion: `-backup`

## Filter tree

```json
{ "op": "and", "conditions": [
  { "field": "status", "operator": "in", "value": ["new", "assigned"] },
  { "op": "or", "conditions": [
    { "field": "priority", "operator": "eq", "value": "critical" },
    { "field": "severity", "operator": "eq", "value": "S1" }
  ]}
]}
```

Nesting depth is capped at 4 levels and 50 conditions. Values are always bound as SQL parameters.

Allowed fields: `status`, `priority`, `severity`, `impact`, `urgency`, `issue_type`, `source`,
`assigned_group`, `assigned_to`, `application_id`, `reporter_id`, `category_id`, `sla_breached`,
`created_at`, `updated_at`.

Allowed operators: `eq`, `neq`, `in` (array value), `gte`, `lte`, `contains` (case-insensitive substring).
Comparisons are done on the text form of the column.

## Sort options

`sort`: `relevance` (default, `ts_rank`), `created_at`, `updated_at`. `order`: `asc` | `desc` (default `desc`).

## POST /v1/search

Requires permission `issues:read`. Results are scoped to the caller's tenant.

Request: `{q?, filter?, sort?, order?, page?, perPage?, facets?}` (`q` max 200, `perPage` max 100).

Response: `{data:[issue row with rank], pagination:{page,perPage,total,totalPages}, facets?}`

`facets` (when requested) is `{field:[{value,count}]}` for `status`, `priority`, `severity`,
`assigned_group` and `application_id`, computed for the current `q` plus filter in a single query
(at most 50 values per field).

## Elasticsearch

An Elasticsearch backend is an optional extension and is not implemented.
