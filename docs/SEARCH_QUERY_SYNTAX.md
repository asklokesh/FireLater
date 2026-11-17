# Search Query Syntax

FireLater search runs one ranked full-text query across issues, problems, changes and knowledge base articles. You only get results for the record types your role can read (`issues:read`, `problems:read`, `changes:read`, `kb:read`). Administrators can search every type.

Search is available in the UI at `/search` (press Enter in the header search box) and through the API at `/v1/search`.

## Free text

| Query | Meaning |
| --- | --- |
| `vpn timeout` | Records containing both words (stemmed, so `timeouts` also matches) |
| `"password reset"` | The exact phrase |
| `printer OR scanner` | Either word |
| `vpn -firmware` | `vpn` but not `firmware` |
| `ISS-00042` | That record number (exact match, ranked first) |

Free text is parsed by PostgreSQL `websearch_to_tsquery`, so stray punctuation never causes a syntax error. Common English stop words (`the`, `a`, `of` and so on) are ignored. A query made only of stop words matches nothing.

### Ranking

Results are ranked with `ts_rank_cd`, normalized by document length. Each field has its own weight:

| Weight | Issue | Problem | Change | Knowledge article |
| --- | --- | --- | --- | --- |
| A (highest) | title, number | title, number | title, number | title, number |
| B | description | description | description | summary |
| C | resolution notes | root cause, workaround | justification | content |

An exact record number match adds a fixed boost. Ties are broken by most recently updated.

## Field qualifiers

Add `field:value` anywhere in the query. Qualifiers are combined with AND, both with each other and with the free text.

| Syntax | Meaning | Example |
| --- | --- | --- |
| `field:value` | equals | `status:new` |
| `field:a,b,c` | any of | `priority:high,critical` |
| `-field:value` or `field:!value` | not equal (keeps records where the field is empty) | `-status:closed` |
| `-field:a,b` | none of | `-status:resolved,closed` |
| `field:>value`, `>=`, `<`, `<=` | compare (dates) | `created:>7d` |
| `field:none` | field is empty (`null` and `empty` also work) | `assignee:none` |
| `-field:none` | field is set | `-group:none` |
| `field:"a value"` | quoted value, commas inside it are not split | `status:"in_progress"` |
| `type:a,b` | only these record types | `type:issue,kb` |

Values are matched exactly and are case sensitive. Field names are not case sensitive. A word with a colon that is not a known field, such as `error: timeout` or a URL, is treated as free text.

### Record types

`type:` accepts `issue` (or `issues`, `incident`, `incidents`), `problem` (or `problems`), `change` (or `changes`) and `knowledge` (or `kb`, `article`, `articles`). Unknown types are ignored with a warning in the response.

### Fields

| Field | Type | Issue | Problem | Change | Knowledge |
| --- | --- | --- | --- | --- | --- |
| `status` | text | yes | yes | yes | yes |
| `priority` | text | yes | yes | | |
| `severity` | text | yes | | | |
| `source` | text | yes | | | |
| `issue_type` | text | yes | | | |
| `sla_breached` | boolean | yes | | | |
| `problem_type` | text | | yes | | |
| `known_error` | boolean | | yes | | |
| `risk` | text | | | yes | |
| `change_type` | text | | | yes | |
| `kb_type` | text | | | | yes |
| `visibility` | text | | | | yes |
| `assignee` | user id or `me` | assigned to | assigned to | implementer | |
| `group` | group id | yes | yes | yes | |
| `application` | application id | yes | yes | yes | |
| `reporter` | user id or `me` | reporter | reporter | requester | author |
| `created` | date | yes | yes | yes | yes |
| `updated` | date | yes | yes | yes | yes |
| `resolved` | date | yes | yes | | |
| `planned_start` | date | | | yes | |

A condition on a field that a record type does not have never matches that type. For example `priority:high` returns no knowledge articles. The one exception is `field:none`, which is true for types that lack the field.

### Values

* User and group fields take a UUID. `assignee:me` and `reporter:me` mean the signed-in user.
* Boolean fields take `true`/`false`, `yes`/`no` or `1`/`0`.
* Date fields take an ISO date (`2026-01-31`), an ISO datetime (`2026-01-31T09:00:00Z`) or a relative age: `12h`, `7d`, `2w`, `3m` (30 day months) or `1y`. `created:>7d` means created in the last 7 days. `created:2026-01-31` (no operator) matches that whole calendar day in the database session time zone (UTC unless the server is configured otherwise).

## Examples

```
vpn status:new,in_progress assignee:me
"disk full" type:issue priority:critical created:>24h
-status:closed,resolved group:none type:issue
firmware type:change risk:high,critical planned_start:<2w
reset password type:kb status:published
known_error:true type:problem
```

## Advanced filters (AND / OR)

The filter builder in the UI, and the `filters` field in the API, accept a tree of groups. Each group joins its conditions with `and` or `or`, and groups can be nested up to 4 levels deep with at most 50 conditions in total. The tree is ANDed with any qualifiers in the query text.

```json
{
  "op": "or",
  "conditions": [
    { "field": "priority", "operator": "eq", "value": "critical" },
    {
      "op": "and",
      "conditions": [
        { "field": "status", "operator": "eq", "value": "new" },
        { "field": "assignee", "operator": "is_null" }
      ]
    }
  ]
}
```

| Operator | Applies to | Value |
| --- | --- | --- |
| `eq`, `neq` | all | single value |
| `in`, `nin` | text, uuid | array (up to 50) |
| `contains` | text | substring, case insensitive |
| `gt`, `gte`, `lt`, `lte` | date | date or relative age |
| `is_null`, `not_null` | text, uuid, date | none |

`GET /v1/search/fields` returns the fields and operators available to the current user, so clients can build the filter UI dynamically.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1/search?q=&types=&filters=&page=&per_page=&sort=` | Search. `filters` is the JSON tree, URL encoded. `sort` is `relevance` (default with text), `updated` (default without text) or `created` |
| POST | `/v1/search/query` | Same search with a JSON body: `{ q, filters, entityTypes, page, perPage, sort }` |
| GET | `/v1/search/fields` | Filterable fields and operators per permitted type |
| GET | `/v1/search/suggest?q=&limit=` | Autocomplete: your recent searches, popular searches and matching records (prefix match). A query only shows up as popular once at least 3 different users have searched it in the last 30 days |
| GET | `/v1/search/history?limit=` | Your recent distinct searches |
| DELETE | `/v1/search/history` | Clear your history |
| DELETE | `/v1/search/history/:id` | Remove one search from your history |
| GET, POST | `/v1/search/templates` | List (yours plus shared) or save a template |
| GET, PATCH, DELETE | `/v1/search/templates/:id` | Read, update or delete a template (only the owner can change or delete it) |
| POST | `/v1/search/templates/:id/use` | Record that a template was used |
| GET | `/v1/search/analytics?days=30` | Tenant search analytics. Needs `reports:read` or `admin:read` |

A search response contains `results` (with a highlighted `snippet`), `total`, `page`, `perPage`, `totalPages`, `facets` (counts by `entityType`, `status` and `priority` across all matches, not just the page) and `query.warnings`.

Snippets wrap matched terms in the Unicode private use characters U+E000 (start) and U+E001 (end). Clients split on these and render the parts as highlighted text. Never insert snippets as raw HTML.

## Limits and performance

* Every searched table has a GIN index on the same weighted `tsvector` expression the query uses (migration `037_advanced_search`), so text matching is an index scan rather than a table scan.
* Query text is capped at 500 characters and `per_page` at 100.
* Only the first 1000 results can be paged to (`page * per_page <= 1000`). Refine the query to go further.
* Each search runs in a read-only transaction with a 5 second statement timeout. A search that hits it returns HTTP 400 asking for a more specific query.
* For the page of results, each record type contributes at most `page * per_page` rows before the merge. Snippets are only generated for the rows on the page.
* Results are cached in Redis for 30 seconds per user and query. Analytics are cached for 5 minutes.

## Search history and analytics

Every search with text or filters is stored in the tenant `search_history` table along with the result count and duration. Only the first page is recorded, so paging through results counts as one search. Cache hits are recorded too. If recording fails the search still succeeds. Your recent searches are only shown to you. Other users only see a query as a popular suggestion after at least 3 different users have searched it, and tenant analytics (for report and admin readers) show aggregated query text. Tenant-wide analytics report total searches, unique users, average duration and result count, the zero-result rate, top queries, top zero-result queries, searches per day, record type usage and the most used templates.

## Not included

Elasticsearch integration, which the issue lists as optional, is not part of this change. PostgreSQL full-text search with GIN indexes covers the current scale. A pluggable backend can be added behind `SearchService` later if needed.
