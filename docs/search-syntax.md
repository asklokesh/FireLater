# Search query syntax

Issue search is served by `POST /v1/search` (permission `issues:read`). Text matching uses PostgreSQL full-text search (`websearch_to_tsquery`, English) against a GIN-indexed `search_vector` on issues. Titles weigh more than descriptions, and results are ordered by `ts_rank` when a text query is given.

## Text query (`q`)

- `vpn login` - all words must match.
- `"login failure"` - words in order, as a phrase.
- `vpn or email` - either word.
- `-outage` - exclude a word.

## Filter tree (`filter`)

A filter is a condition or a group. Groups hold either `and` or `or` (not both) and can nest up to 5 levels, with at most 50 nodes.

    { "and": [
      { "field": "priority", "op": "in", "value": ["high", "critical"] },
      { "or": [
        { "field": "status", "op": "eq", "value": "new" },
        { "field": "assigned_to", "op": "is_null" }
      ] }
    ] }

Operators: `eq`, `neq`, `in`, `gt`, `gte`, `lt`, `lte`, `is_null`, `not_null`. Ordering operators (`gt`, `gte`, `lt`, `lte`) are not allowed on id and boolean fields.

Fields: status, priority, severity, impact, urgency, issue_type, source, category_id, application_id, assigned_to, assigned_group, reporter_id, sla_breached, created_at, updated_at, resolved_at. Any other field is rejected.

## Other parameters

- `page`, `perPage` (max 100), `sort` (`relevance`, `created_at`, `updated_at`).

## Related endpoints (all under `/v1/search`)

- `POST /facets` - counts per status, priority, severity, category, application, assignee for the same `q` and `filter`.
- `GET/POST /filters`, `DELETE /filters/:id` - saved filters (own or shared).
- `GET /history`, `GET /suggest?q=` - the caller's recent searches and prefix suggestions.
- `GET /analytics?days=` - popular searches, searches with no results and daily volume (permission `admin:read`).

Elasticsearch is not supported; the PostgreSQL index is used for all deployments.
