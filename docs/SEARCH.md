# Search

Backend routes are mounted at `/v1/search` (`backend/src/routes/search.ts`).

## Query syntax

Free text is parsed with PostgreSQL `websearch_to_tsquery('english', ...)` and matched
against a weighted `search_tsvector` column (title weight A, description weight B).
Results are ordered by `ts_rank` relevance, then newest first.

| Input                     | Meaning                                  |
|---------------------------|------------------------------------------|
| `database outage`         | both words (AND)                         |
| `"login failure"`         | exact phrase                             |
| `vpn OR proxy`            | either word                              |
| `timeout -test`           | `timeout` but not `test`                 |

Inputs are trimmed, whitespace collapsed, and truncated to 500 characters. A query
also matches records whose number starts with the input (for example `ISS-001`).

## Structured filters

`POST /v1/search` accepts a `filter` tree; `GET /v1/search` accepts the same tree as a
JSON-encoded `filter` query parameter.

```json
{
  "q": "outage",
  "entityType": "issue",
  "filter": {
    "logicalOperator": "AND",
    "conditions": [
      { "field": "status", "operator": "in", "value": ["new", "assigned"] },
      {
        "logicalOperator": "OR",
        "conditions": [
          { "field": "priority", "operator": "eq", "value": "critical" },
          { "field": "assignedTo", "operator": "isNull" }
        ]
      }
    ]
  }
}
```

Fields: `status`, `priority`, `urgency`, `impact`, `assignedTo`, `assignedGroup`,
`reporterId`, `applicationId`, `createdAt`, `updatedAt`, `resolvedAt`, `title`.

Operators: `eq`, `neq`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `contains` (text fields
only), `isNull`, `isNotNull`.

Limits: nesting depth 5, 50 conditions. Unknown fields are rejected; values are always
bound as SQL parameters.

## Other endpoints

- `GET /v1/search/facets?q=&entityType=` counts by status, priority, urgency, impact (cached 5 minutes, cleared by issue/problem mutations)
- `GET /v1/search/suggest?q=` autocomplete from the user's history and issue titles
- `GET|DELETE /v1/search/history` the current user's recent searches
- `GET /v1/search/analytics?days=30` popular, zero-result and daily search counts (`reports:read`)
- `GET|POST /v1/search/templates`, `GET|PUT|DELETE /v1/search/templates/:id` saved filter templates, owned per user; shared templates are readable by all users in the tenant

## Performance

Migration `037_search` adds stored generated `search_tsvector` columns with GIN indexes
on `issues` and `problems`. Each search runs with `SET LOCAL statement_timeout = 5000`.

## External search backends

No Elasticsearch adapter is bundled. `setSearchAdapter()` in
`backend/src/services/search.ts` accepts an `ExternalSearchAdapter` implementation for
deployments that need one; without it, PostgreSQL full-text search is used.
