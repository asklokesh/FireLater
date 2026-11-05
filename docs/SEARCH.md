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

## Saved filter templates, history, suggestions and analytics

All endpoints are under `/v1/search`.

### Templates

- `GET /v1/search/templates` – the caller's templates plus templates other users marked `isShared`.
- `POST /v1/search/templates` – create. `filter` is validated with the filter grammar above (400 if invalid); a duplicate name for the same user and entity type returns 409.
- `GET|PUT|DELETE /v1/search/templates/:id` – only the owner can update or delete (others get 404).

```json
POST /v1/search/templates
{ "name": "Open P1", "query": "outage", "filter": { "op": "and", "conditions": [{ "field": "priority", "operator": "eq", "value": "critical" }] }, "isShared": true }

201 { "id": "…", "userId": "…", "name": "Open P1", "entityType": "issue", "query": "outage", "filter": {…}, "isShared": true, "createdAt": "…", "updatedAt": "…" }
```

### History

`POST /v1/issues/search` records a row whenever `q` or `filter` is non-empty (failures to record are logged and do not affect the response).

- `GET /v1/search/history?limit=10` (max 50) → `{ "data": [{ "query": "outage", "lastSearchedAt": "…" }] }` (distinct, most recent first)
- `DELETE /v1/search/history` → `{ "deleted": 3 }` (caller's rows only)

### Suggestions

`GET /v1/search/suggestions?q=out` → `{ "data": ["outage vpn", "outlook"] }` – at most 10 case-insensitive prefix matches: the caller's recent queries first, then the tenant's most frequent.

### Analytics

`GET /v1/search/analytics?days=30` (requires `reports:read`; default 30, max 365)

```json
{
  "topQueries": [{ "query": "outage", "count": 12 }],
  "zeroResultQueries": [{ "query": "xyzzy", "count": 2 }],
  "dailyVolume": [{ "date": "2026-11-01", "count": 5 }],
  "averageResultCount": 7.5
}
```
