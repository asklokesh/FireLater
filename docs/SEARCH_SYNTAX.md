# Search Syntax

Search queries combine free text with optional `field:value` tokens. Tokens are extracted into a structured filter; everything else is passed unchanged to PostgreSQL `websearch_to_tsquery`.

## Free text

- Plain words: `database timeout`
- Quoted phrases: `"disk full" OR "out of space" -network status:new`
- `OR` between terms, and a leading `-` to exclude a term (`-network`).

Quoted phrases, `OR` and minus terms are never treated as tokens: `"status:new now" -priority:low` stays entirely text.

## Field tokens

| Token | Field | Allowed values |
|-------|-------|----------------|
| `status:` | status | new, assigned, in_progress, pending, resolved, closed |
| `priority:` | priority | critical, high, medium, low |
| `severity:` | severity | S1, S2, S3, S4 |
| `type:` | issue_type | issue, problem, question |
| `source:` | source | portal, email, phone, monitoring, api |
| `breached:` | sla_breached | true, false |

Examples: `status:new`, `priority:critical`, `severity:S1`, `type:problem`, `source:email`, `breached:true`.

Comma separated values become an `in` condition: `status:new,assigned`.

Combined: `database priority:high,critical timeout breached:true`.

Unknown tokens such as `color:red error` stay in the text. Invalid values (for example `priority:urgentish`) are returned as warnings and not applied.

## Date ranges

`created:>=2024-01-01 created:<=2024-01-31 updated:>=2024-02-01 updated:<=2024-02-28`

Dates use `YYYY-MM-DD`. A malformed date such as `created:>=2024-13-45` produces a warning.

## JSON filter groups

A group is `{ "op": "and" | "or", "conditions": [...] }`; each entry is a group or a condition `{ "field", "operator", "value" }`.

```json
{
  "op": "and",
  "conditions": [
    { "field": "status", "operator": "eq", "value": "new" },
    {
      "op": "or",
      "conditions": [
        { "field": "priority", "operator": "in", "value": ["high", "critical"] },
        { "field": "created_at", "operator": "between", "value": ["2024-01-01", "2024-02-01"] }
      ]
    },
    { "field": "text", "operator": "eq", "value": "disk" }
  ]
}
```

Groups are parenthesised in SQL, an empty group is `TRUE`, and all values are bound parameters.

### Fields

| Field | Type | Operators |
|-------|------|-----------|
| status, priority, severity, impact, urgency, issue_type, source | enum | eq, neq, in, nin, is_null, is_not_null |
| category_id, assigned_to, assigned_group, application_id, environment_id, reporter_id | id | eq, neq, in, nin, is_null, is_not_null |
| sla_breached | boolean | eq, neq |
| created_at, updated_at, resolved_at | timestamp | eq, gt, gte, lt, lte, between, is_null, is_not_null |
| text | full-text | eq |

### Operators

eq, neq, in, nin, gt, gte, lt, lte, between (two values, timestamps only), is_null, is_not_null. `in`/`nin` take 1 to 50 values.

### Limits

- Nesting depth: 4 levels.
- Total conditions: 50.
- Result window: 10000 matches. Requests where `(page - 1) * perPage` is 10000 or more are rejected with HTTP 400; narrow the query or filters. The total is reported as 10000 with `totalCapped: true` when more match.
- Facets: computed over at most the first 10000 matching rows, at most 20 values per facet; `facetsApproximate: true` when that cap is hit.
- Timeout: search queries are cancelled after 5000 ms (`SEARCH_STATEMENT_TIMEOUT_MS`) and return HTTP 503; retry or narrow the query.
