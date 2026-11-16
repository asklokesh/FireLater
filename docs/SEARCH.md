# Search

## Query syntax

The free-text query is passed as a bound parameter to `websearch_to_tsquery('english', $n)`.

| Syntax | Meaning | Example |
|--------|---------|---------|
| words | all words must match | `server down` |
| `"..."` | exact phrase | `"disk full"` |
| `OR` | either term | `disk OR memory` |
| `-term` | exclude term | `server -network` |
| `field:value` | filter on a supported field (equality) | `status:open priority:high` |
| `field:"a b"` | field value containing spaces | `cost_center:"IT Ops"` |

Unknown `field:value` tokens are treated as ordinary free text.

### Supported fields per entity

- **issues**: status, priority, severity, assigned_to, assigned_group, reporter_id, application_id, sla_breached, created_at, updated_at, resolved_at
- **problems**: status, priority, problem_type, assigned_to, assigned_group, reporter_id, category_id, is_known_error, created_at, updated_at, resolved_at
- **requests**: status, priority, requester_id, assigned_to, catalog_item_id, cost_center, due_date, created_at, completed_at
- **kb**: status, type, visibility, category_id, author_id, published_at, created_at

## JSON filter tree

A group is `{ "op": "and" | "or", "conditions": [condition | group] }`; a condition is
`{ "field", "operator", "value" }`. Limits: at most 4 levels of nesting and 25 conditions.
Fields must be in the entity's list above. All values are bound parameters.

| Operator | Value |
|----------|-------|
| eq, ne | single scalar |
| in, nin | non-empty array |
| gt, gte, lt, lte | single date/text value |
| between | array of two dates |
| contains | non-empty string (text/enum fields; case-insensitive) |
| isnull, notnull | no value |

Value types must match the field type: uuid fields need UUIDs, boolean fields booleans, date fields parseable date strings.

### Examples

Open issues:

```json
{ "op": "and", "conditions": [{ "field": "status", "operator": "eq", "value": "open" }] }
```

Created in January, not yet resolved:

```json
{ "op": "and", "conditions": [
  { "field": "created_at", "operator": "between", "value": ["2024-01-01", "2024-01-31"] },
  { "field": "resolved_at", "operator": "isnull" }
] }
```

Nested: open, and either high or critical priority or SLA breached:

```json
{ "op": "and", "conditions": [
  { "field": "status", "operator": "eq", "value": "open" },
  { "op": "or", "conditions": [
    { "field": "priority", "operator": "in", "value": ["high", "critical"] },
    { "field": "sla_breached", "operator": "eq", "value": true }
  ] }
] }
```
