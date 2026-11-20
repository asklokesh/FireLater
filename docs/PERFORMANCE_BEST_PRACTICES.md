# Database Performance Monitoring & Best Practices

FireLater uses raw `pg` (not Drizzle), so instrumentation lives in the pooled
connection wrapper in `backend/src/config/database.ts`. Every `pool.query` and
every query on a client from `pool.connect()` is timed and recorded.

## What is tracked
- Per-query fingerprint (literals/params stripped): calls, avg/max/min ms, rows, errors, slow count
  (`backend/src/services/queryStats.ts`, in-memory per process).
- Slow queries (duration > `DB_SLOW_QUERY_THRESHOLD` ms, default 100) are logged at `warn`
  ("Slow query detected") and kept in a ring buffer of the last 200.
- For slow `SELECT`/`WITH` queries the plan (`EXPLAIN (VERBOSE, FORMAT JSON)`, no ANALYZE) is logged at
  `info` ("Slow query plan"), at most once per fingerprint per 5 minutes. Disable with `DB_LOG_QUERY_PLANS=false`.
  Plans are produced on a dedicated connection inside a `READ ONLY` transaction that is always rolled back; if the
  slow query ran on a connection that issued `SET search_path`, that search_path is replayed. Failures to
  produce a plan are logged at `warn`.
- Alerting: set `DB_SLOW_QUERY_ALERT_WEBHOOK_URL` (Slack/Teams/generic webhook) and each slow query POSTs
  `{ event: "slow_query", text, fingerprint, query, durationMs, rowCount, thresholdMs, at }`
  (`backend/src/services/slowQueryAlerts.ts`). Alerts are limited to one per query pattern per
  `DB_SLOW_QUERY_ALERT_INTERVAL` seconds (default 300) and `DB_SLOW_QUERY_ALERT_MAX_PER_MINUTE` overall (default 30).
  The `db_slow_queries_total` Prometheus counter can be used for alert rules as well.
- Index recommendations: a Seq Scan with a filter on a table with at least `DB_INDEX_ADVISOR_MIN_ROWS`
  (default 1000) rows produces a `CREATE INDEX CONCURRENTLY` suggestion
  (`backend/src/services/indexAdvisor.ts`). Table size comes from `pg_class.reltuples` (or the rows actually read
  for an ANALYZE plan), so a selective filter on a large table is still flagged.
  Suggestions are never applied automatically.

## Admin API (`admin:read`, prefix `/v1/query-analytics`)
- `GET /` overview (summary, most frequent, slowest, recent slow, recommendations); `?limit=`
- `GET /slow`, `GET /recommendations`
- `POST /explain` `{ "query": "SELECT ...", "params": [], "analyze": false }` — a single read-only SELECT/WITH
  statement only (keywords inside string literals and quoted identifiers are fine; `;`-separated statements,
  `INTO`, `FOR UPDATE` etc. are rejected). `analyze: true` runs `EXPLAIN ANALYZE`, which executes the query
  inside a `READ ONLY` transaction (rolled back, 10s statement timeout), so side-effecting functions fail.
- `GET /metrics` Prometheus text: `db_query_duration_seconds` histogram, `db_queries_total`,
  `db_query_errors_total`, `db_slow_queries_total`.
- `POST /reset` (`admin:write`) clears statistics.

The admin UI is at `/admin/query-analytics`.

## Best practices
- Always filter tenant tables on indexed columns; check `/recommendations` after load tests.
- Avoid `SELECT *` on wide tables and unbounded lists; paginate.
- Batch lookups (`= ANY($1)`) instead of per-row queries (N+1).
- Create indexes with `CONCURRENTLY` and add them in a migration for every tenant schema.
- Use `EXPLAIN (ANALYZE, BUFFERS)` on a copy of production-sized data before shipping new queries.
- Regression tests: unit tests in `backend/tests/unit/` (`queryStats`, `indexAdvisor`, `slowQueryAlerts`) and
  performance tests in `backend/tests/performance/` with budgets in `baseline.json`: pool-wrapper overhead per
  query, and (with `PERF_DB=1` plus `PERF_DATABASE_URL` or the standard `PG*` env vars, run in CI by `npm run test:perf`) a real-PostgreSQL plan
  check that the advisor flags a seq scan and the recommended index cuts plan cost below the baseline ratio.
