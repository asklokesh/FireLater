# Search

Endpoint: `GET /v1/search?entity=issues&q=...` (entities: issues, problems, changes, requests).
Facet counts: `GET /v1/search/facets` with the same parameters.

## Query syntax

The `q` parameter uses PostgreSQL `websearch_to_tsquery` syntax:

- `vpn timeout`: both words must match (AND).
- `vpn OR wifi`: either word matches.
- `"login error"`: exact phrase.
- `vpn -timeout`: exclude a word.

Results are ranked with `ts_rank`; titles weigh more than descriptions.

Field filters are separate query parameters, comma-separated values are OR-ed and
different fields are AND-ed: `status=new,assigned&priority=high`.

Complex filters use the `filters` parameter with a JSON tree:

```json
{"logic":"AND","conditions":[
  {"field":"status","op":"in","value":["new","assigned"]},
  {"logic":"OR","conditions":[
    {"field":"priority","op":"eq","value":"critical"},
    {"field":"priority","op":"eq","value":"high"}]}]}
```

Operators: eq, neq, in, gt, gte, lt, lte. Only allowlisted fields are accepted.
`limit` is capped at 100.
