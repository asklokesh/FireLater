# Issue Search

`GET /v1/search` (requires `issues:read`) runs PostgreSQL full-text search over issues.
Query params: `q`, `filters` (JSON string), `page`, `per_page`.
`GET /v1/search/suggest?q=...` returns up to 10 `{id, issue_number, title}` rows matching a title or issue number prefix.

## Query syntax

- Words are AND-ed: `server outage`
- Phrases: `"disk full"`
- OR: `network OR vpn`
- Exclusion: `outage -planned`
- Issue number lookup: a leading prefix such as `INC-0012` matches `issue_number` by prefix.

Unbalanced quotes, dangling `OR` and bare operators are dropped; a query with nothing searchable is ignored. Results are ordered by `ts_rank` descending (title weighs highest, then issue number, then description) and include a `rank` field.

## Filters

```json
{
  "op": "and",
  "conditions": [
    { "field": "status", "op": "in", "value": ["new", "assigned"] },
    {
      "op": "or",
      "conditions": [
        { "field": "priority", "op": "eq", "value": "critical" },
        { "field": "sla_breached", "op": "eq", "value": true }
      ]
    },
    { "field": "created_at", "op": "gte", "value": "2025-01-01T00:00:00Z" }
  ]
}
```

Fields: status, priority, severity, assigned_to, assigned_group, application_id, reporter_id, sla_breached, created_at, updated_at. Operators: eq, in, neq, gte, lte (gte/lte only on dates). Unknown fields or operators are rejected with 400; values are bind parameters.

## Facets

```json
{ "facets": { "status": [{ "value": "new", "count": 4 }], "priority": [], "severity": [], "assigned_group": [], "application_id": [] } }
```

Facet counts are computed against the current query and filters.

## Indexes

Migration `037_search_fulltext` adds a stored `search_vector tsvector` column on `issues` and the GIN index `idx_issues_search_vector` for `tenant_template` and every `tenant_%` schema.
