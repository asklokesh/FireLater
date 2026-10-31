# Search

FireLater searches issues with PostgreSQL full-text search. Results are ranked by
`ts_rank` against `websearch_to_tsquery('english', ...)` over the issue title and
description. Migration 037 adds a GIN expression index on
`to_tsvector('english', title || ' ' || description)`.

## Search query syntax

A query is free text plus optional field filters, separated by spaces.

| Syntax | Meaning |
| --- | --- |
| `printer jam` | Both words (stemmed) must match title or description |
| `"disk full"` | Phrase match |
| `printer or scanner` | Either word |
| `printer -toner` | Exclude a word |
| `status:new` | Field equals value |
| `status:new,assigned` | Field is any of the values |
| `-priority:low` | Field does not equal value |

Free text uses PostgreSQL `websearch_to_tsquery` rules. Field filters are parsed by
`parseSearchQuery` in `backend/src/services/search-filters.ts`. Supported fields:
`status`, `priority`, `severity`, `urgency`, `impact`, `category`, `assigned_to`,
`assigned_group`, `application`, `reporter`, `sla_breached`, `created_at`,
`updated_at`. Unknown `field:value` tokens are treated as free text.

## Advanced filters (filterGroup)

`POST /v1/search` accepts a nested `filterGroup`, combined with AND against the
query string filters:

```json
{
  "q": "vpn",
  "filterGroup": {
    "operator": "AND",
    "conditions": [
      { "field": "priority", "op": "in", "value": ["high", "critical"] },
      { "operator": "OR", "conditions": [
        { "field": "status", "op": "eq", "value": "new" },
        { "field": "sla_breached", "op": "eq", "value": true }
      ] }
    ]
  },
  "page": 1,
  "perPage": 20
}
```

Operators: `eq`, `neq`, `in`, `contains`, `gt`, `gte`, `lt`, `lte`, `is_null`,
`not_null`. Groups nest up to 5 levels with at most 50 conditions. All values are
bound as SQL parameters; unknown fields or operators return 400.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/v1/search` | Ranked, paginated search |
| POST | `/v1/search/facets` | Counts by status, priority, category |
| GET | `/v1/search/suggest?prefix=` | Autocomplete from recent searches and titles |
| GET/DELETE | `/v1/search/history` | Current user's search history |
| GET/POST | `/v1/search/templates` | List or save filter templates |
| GET/DELETE | `/v1/search/templates/:id` | Load or delete a filter template |
| GET | `/v1/search/analytics?days=` | Popular and zero-result searches, daily volume |

## Elasticsearch

Elasticsearch is not implemented. If `ELASTICSEARCH_URL` is set, the backend logs a
warning and continues to use PostgreSQL.
