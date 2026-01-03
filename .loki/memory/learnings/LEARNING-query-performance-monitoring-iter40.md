# Learning: Database Query Performance Monitoring (Iteration 40)

**Date:** 2026-01-03
**Context:** Production observability and performance optimization
**Commit:** da63ed1

---

## Problem

No visibility into slow database queries in production:
- Can't identify performance bottlenecks
- No data to prioritize optimization efforts
- Slow queries go unnoticed until users complain
- Difficult to correlate performance issues with specific queries

---

## Solution

Implemented automatic query performance monitoring by wrapping `pool.query()`:

### Implementation

**File:** `backend/src/config/database.ts`

```typescript
// Slow query threshold in milliseconds
const SLOW_QUERY_THRESHOLD = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100');

// Wrap pool.query to add performance monitoring
const originalQuery = originalPool.query.bind(originalPool);

originalPool.query = function (queryTextOrConfig: string | { text: string }, values?: unknown[]): Promise<QueryResult> {
  const startTime = Date.now();
  const queryText = typeof queryTextOrConfig === 'string' ? queryTextOrConfig : queryTextOrConfig.text;

  const resultPromise = originalQuery(queryTextOrConfig as never, values as never) as Promise<QueryResult>;

  // Only log slow queries in production or when explicitly enabled
  if (process.env.NODE_ENV === 'production' || process.env.LOG_SLOW_QUERIES === 'true') {
    return resultPromise
      .then((res: QueryResult) => {
        const duration = Date.now() - startTime;
        if (duration > SLOW_QUERY_THRESHOLD) {
          const truncatedQuery = queryText.length > 200
            ? queryText.substring(0, 200) + '...'
            : queryText;

          logger.warn({
            duration,
            rowCount: res.rowCount,
            query: truncatedQuery,
          }, 'Slow query detected');
        }
        return res;
      })
      .catch((err: Error) => {
        const duration = Date.now() - startTime;
        logger.error({
          duration,
          err,
          query: queryText.substring(0, 200),
        }, 'Query failed');
        throw err;
      });
  }

  return resultPromise;
} as typeof originalQuery;
```

---

## Features

### 1. Automatic Timing

- Every query is timed from start to completion
- Zero code changes required in existing queries
- Transparent to application code

### 2. Configurable Threshold

Environment variable: `DB_SLOW_QUERY_THRESHOLD`
- Default: 100ms
- Can be adjusted for different environments
- Production: 100ms is appropriate for OLTP workloads

### 3. Conditional Logging

Only logs when:
- `NODE_ENV=production`, OR
- `LOG_SLOW_QUERIES=true` (development debugging)

Benefits:
- No log spam in development
- No performance impact during testing
- Can enable manually for debugging

### 4. Query Truncation

- Limits logged query text to 200 characters
- Prevents log bloat from large queries
- Still provides enough context to identify the query

### 5. Structured Logging

Log format:
```json
{
  "level": "warn",
  "duration": 250,
  "rowCount": 1500,
  "query": "SELECT * FROM tenant_acme.issues WHERE status = $1 AND...",
  "msg": "Slow query detected"
}
```

Benefits:
- Easy to parse and aggregate
- Can filter by duration or row count
- Query text searchable

---

## Key Learnings

### 1. Function Binding is Critical

```typescript
const originalQuery = originalPool.query.bind(originalPool);
```

Without `.bind(originalPool)`, the `this` context is lost and queries fail. The original method needs to maintain its reference to the pool instance.

### 2. TypeScript Type Assertion

```typescript
originalPool.query = function (...): Promise<QueryResult> {
  // Implementation
} as typeof originalQuery;
```

The `as typeof originalQuery` type assertion preserves the original function signature while allowing custom implementation. This maintains type safety for consumers.

### 3. Promise Chain Doesn't Block

```typescript
const resultPromise = originalQuery(...);

if (shouldLog) {
  return resultPromise
    .then(logSlowQuery)
    .catch(logError);
}

return resultPromise;
```

The monitoring logic runs in the promise chain without blocking the query execution. Timing is still accurate because we measure from `startTime`.

### 4. Production-Only Monitoring

Don't log every query in development:
- Creates noise in test output
- Slows down tests
- Fills up logs unnecessarily

Production is where it matters:
- Real user traffic patterns
- Actual data volumes
- True performance characteristics

---

## Use Cases

### 1. Identify N+1 Query Patterns

Slow query logs will show repeated similar queries:
```
Slow query (120ms): SELECT * FROM issues WHERE id = $1
Slow query (115ms): SELECT * FROM issues WHERE id = $1
Slow query (118ms): SELECT * FROM issues WHERE id = $1
```

Action: Batch the queries (as we did in iteration 39)

### 2. Missing Index Detection

Slow query with table scans:
```
Slow query (450ms, 50000 rows): SELECT * FROM issues WHERE created_at > $1
```

Action: Add index on `created_at` column

### 3. Large Result Sets

Slow query with many rows:
```
Slow query (800ms, 100000 rows): SELECT * FROM notifications WHERE tenant_id = $1
```

Action: Add pagination or limit result size

### 4. Complex Joins

Slow query with joins:
```
Slow query (350ms): SELECT * FROM issues i JOIN users u ... LEFT JOIN ...
```

Action: Optimize join strategy or denormalize data

---

## Monitoring Strategy

### Once Deployed

1. **Aggregate Slow Queries**
   - Use log aggregation tool (e.g., Datadog, CloudWatch)
   - Group by query pattern
   - Identify top 10 slowest queries

2. **Set Alerts**
   - Alert when >10 slow queries/minute
   - Alert when any query >1000ms
   - Alert on failed queries

3. **Weekly Review**
   - Review top slow queries
   - Prioritize optimization efforts
   - Track improvements over time

4. **Adjust Threshold**
   - Start at 100ms
   - Lower to 50ms once baseline established
   - Different thresholds for different tenants

---

## Performance Impact

### Overhead Analysis

**Monitoring adds:**
- ~1 microsecond to get `Date.now()` (twice)
- Promise chain overhead (negligible)
- Conditional check (< 1 microsecond)

**Total overhead:** < 0.01ms per query

**Impact:** Negligible (<0.01% for 100ms query)

### When Logging

**Additional overhead when query is slow:**
- String truncation: ~1 microsecond
- Logger call: ~1-5ms (asynchronous)

**Note:** Logger is non-blocking, so doesn't impact query response time.

---

## Future Enhancements

### 1. Query Categorization

Tag queries by type:
- SELECT vs INSERT/UPDATE/DELETE
- Table name extraction
- Route/endpoint that triggered query

### 2. Percentile Tracking

Instead of just threshold:
- Track p50, p95, p99 latencies
- Identify latency distribution
- Detect latency spikes

### 3. Query Plan Analysis

For very slow queries (>1000ms):
- Automatically run EXPLAIN ANALYZE
- Log query plan
- Identify missing indexes

### 4. Tenant-Specific Thresholds

Different thresholds per tenant:
- Enterprise tier: 50ms threshold
- Standard tier: 100ms threshold
- Trial tier: 200ms threshold

---

## Related Optimizations

This monitoring will help identify:
1. Queries that need indexes
2. N+1 query patterns (like we fixed in iteration 39)
3. Missing pagination
4. Inefficient joins
5. Full table scans
6. Lock contention issues

---

## Conclusion

Query performance monitoring provides critical visibility into production database performance. The implementation is non-invasive, has negligible overhead, and provides actionable data for optimization efforts.

**Status:** ✅ Implemented
**Impact:** 🔍 High - Production observability
**Risk:** ⭐ Very Low - No breaking changes, minimal overhead
