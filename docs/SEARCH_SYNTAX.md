# Search Syntax

This describes the search query library in `backend/src/lib/` (`search-fts.ts`, `search-query.ts`, `filter-builder.ts`). It is a library only; no HTTP endpoint uses it yet.

## Free text

Free text is passed to PostgreSQL `websearch_to_tsquery('english', ...)`.

| Syntax | Example | Meaning |
|---|---|---|
| Words | `disk full` | all words must match |
| Phrase | `"disk full" server` | words adjacent, in order |
| OR | `login OR password` | either word |
| Exclusion | `network -vpn` | leading `-` excludes the word |

Input is trimmed and capped at 200 characters.

## Field tokens

`field:value` tokens are removed from the free text and turned into filters. A value with spaces is quoted: `group:"service desk"`.

Fields: `status`, `priority`, `assignee`, `group`, `application`, `reporter`. Any other `name:value` is treated as free text. Repeating a field matches any of the values. Requests have no `application` column, so that token cannot be satisfied for requests (the helper reports it). `reporter` maps to `requester_id` and `group` to `fulfillment_group_id` for requests.

Example: `"disk full" OR outage -vpn status:open priority:critical` has free text `"disk full" OR outage -vpn` and tokens `status=open`, `priority=critical`.

## JSON filter groups

```json
{
  "op": "and",
  "conditions": [
    { "field": "status", "operator": "in", "value": ["new", "assigned"] },
    {
      "op": "or",
      "conditions": [
        { "field": "priority", "operator": "eq", "value": "critical" },
        { "field": "title", "operator": "contains", "value": "outage" }
      ]
    },
    { "field": "resolved_at", "operator": "is_null" }
  ]
}
```

For `issues` with alias `i` and start index 1 this yields:

```sql
(i.status = ANY($1) AND (i.priority = $2 OR i.title ILIKE $3 ESCAPE '\') AND i.resolved_at IS NULL)
```

with values `[["new","assigned"], "critical", "%outage%"]`. Every value is a bound parameter; field names must be on the per-entity whitelist (`issues`, `problems`, `requests`).

## Operators

| Field type | Operators |
|---|---|
| string | `eq`, `neq`, `in`, `not_in`, `contains`, `is_null`, `is_not_null` |
| number | `eq`, `neq`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `is_null`, `is_not_null` |
| boolean | `eq`, `neq`, `is_null`, `is_not_null` |
| date | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `is_null`, `is_not_null` |

`contains` is a case-insensitive substring match; `%`, `_` and `\` in the value are escaped. `in`/`not_in` take 1 to 100 values. `is_null`/`is_not_null` take no value.

## Limits

- Search text: 200 characters.
- Nesting depth: 3 groups.
- Leaf conditions: 25.

Unknown fields, unknown operators or oversized groups raise `BadRequestError` and no SQL is produced.
