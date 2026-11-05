# Issue Search

`POST /v1/issues/search` performs full-text search, structured filtering and faceting over issues.

## Query syntax (`q`, max 200 chars)

Uses PostgreSQL `websearch_to_tsquery('english', ...)` against title (weight A) and description (weight B).

- Plain words: `disk full` matches issues containing both words.
- Quoted phrases: `"disk full"` matches the words adjacent.
- `OR`: `disk OR memory`.
- Exclusion: `disk -network`.
- Issue number: `q` is also matched with `ILIKE` against `issue_number` (e.g. `ISS-0042`).
- Ranking: when `q` is present and no `sort` is given, results are ordered by `ts_rank_cd` descending, then `created_at` descending; each row has `search_rank`.

## Filter grammar

```json
{ "op": "and" | "or", "conditions": [ {"field": "...", "operator": "...", "value": ...}, { "op": "or", "conditions": [] } ] }
```

- Fields: status, priority, severity, assigned_to, assigned_group, application_id, reporter_id, sla_breached, created_at, updated_at.
- Operators: eq, neq, in, not_in (array value), gt, gte, lt, lte, is_null, is_not_null (no value).
- Limits: nesting depth at most 3, at most 50 conditions. Violations return 400.
- All values are bound parameters.

## Request body

`{ q?, filter?, page?, per_page? (max 100), sort?, order?, facets? }`

## Facets

With `"facets": true` the response adds, computed with the same WHERE clause:

```json
"facets": {
  "status": [{"value": "open", "count": 3}],
  "priority": [{"value": "high", "count": 2}],
  "assigned_group": [{"value": "<uuid>", "label": "Support", "count": 1}],
  "application_id": [{"value": "<uuid>", "label": "CRM", "count": 4}]
}
```

## Example

```bash
curl -X POST https://host/v1/issues/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"q":"\"disk full\" -network","filter":{"op":"and","conditions":[{"field":"status","operator":"in","value":["open","in_progress"]}]},"facets":true}'
```
