# Learning: On-Call Service N+1 Query Optimization

**Date**: 2026-01-02
**Task**: PERF-002 - Fix N+1 query issue in on-call schedule loading
**Commit**: b837813

## Problem Identified

The `validatePublicSubscriptionToken()` method in the on-call service had an N+1 query pattern when searching for calendar subscription tokens across multiple tenant schemas.

### Original Implementation
```typescript
// Get all tenant schemas
const schemasResult = await pool.query(
  `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
);

// Loop through each tenant schema (N+1 pattern)
for (const row of schemasResult.rows) {
  const schema = row.nspname;
  const result = await pool.query(
    `SELECT user_id, filter_user_id FROM ${schema}.oncall_calendar_subscriptions
     WHERE schedule_id = $1 AND token = $2`,
    [scheduleId, token]
  );
  if (result.rows.length > 0) {
    // Found the subscription
    return processResult(result.rows[0], schema);
  }
}
```

**Performance**: 1 + N queries (where N = number of tenants)
- 1 query to get tenant schemas
- N queries to search each tenant

## Solution: UNION ALL Pattern

Replaced the loop with a single UNION ALL query that searches all tenant schemas at once:

```typescript
// Get all tenant schemas
const schemasResult = await pool.query(
  `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
);

// Build UNION ALL query to search all tenant schemas in single query
const unionQueries: string[] = [];
for (const row of schemasResult.rows) {
  const schema = row.nspname;
  unionQueries.push(`
    SELECT
      '${schema}' as schema_name,
      user_id,
      filter_user_id
    FROM ${schema}.oncall_calendar_subscriptions
    WHERE schedule_id = $1 AND token = $2
  `);
}

const unionQuery = unionQueries.join(' UNION ALL ');

// Execute single query across all tenant schemas
const result = await pool.query(unionQuery, [scheduleId, token]);
```

**Performance**: 2 queries (constant time)
- 1 query to get tenant schemas
- 1 UNION ALL query to search all schemas

## Performance Metrics

| Tenant Count | Before (queries) | After (queries) | Improvement |
|-------------|------------------|-----------------|-------------|
| 1           | 2                | 2               | 0%          |
| 10          | 11               | 2               | 82%         |
| 100         | 101              | 2               | 98%         |
| 1000        | 1001             | 2               | 99.8%       |

## Additional Improvements

### 1. Extract Inline Object Types
Changed inline object types to named interfaces for better type safety and bundler compatibility:

**Before**:
```typescript
async createShift(tenantSlug: string, params: {
  scheduleId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  shiftType?: string;
  layer?: number;
}, createdBy: string): Promise<unknown>
```

**After**:
```typescript
interface CreateShiftParams {
  scheduleId: string;
  userId: string;
  startTime: Date;
  endTime: Date;
  shiftType?: string;
  layer?: number;
}

async createShift(tenantSlug: string, params: CreateShiftParams, createdBy: string): Promise<unknown>
```

### 2. Replace Dynamic Imports
Changed dynamic crypto import to static import:

**Before**:
```typescript
const crypto = await import('crypto');
const token = crypto.randomBytes(32).toString('hex');
```

**After**:
```typescript
import { randomBytes } from 'crypto';
const token = randomBytes(32).toString('hex');
```

### 3. Replace .map() with for-of
Changed `.map()` to `for-of` loop to avoid potential bundler parsing issues with complex arrow functions.

## Key Patterns

### Multi-Tenant Cross-Schema Query Pattern
```typescript
// 1. Get all tenant schemas
const schemasResult = await pool.query(
  `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
);

// 2. Build UNION ALL query
const unionQueries: string[] = [];
for (const row of schemasResult.rows) {
  const schema = row.nspname;
  unionQueries.push(`
    SELECT '${schema}' as schema_name, column1, column2
    FROM ${schema}.table_name
    WHERE condition = $1
  `);
}

// 3. Execute single query
const result = await pool.query(unionQueries.join(' UNION ALL '), [param]);

// 4. Extract tenant slug from schema name
if (result.rows.length > 0) {
  const schema = result.rows[0].schema_name;
  const tenantSlug = schema.replace('tenant_', '').replace(/_/g, '-');
  return { tenantSlug, ...result.rows[0] };
}
```

## Applicable To

This pattern should be used when:
1. Searching for data across multiple tenant schemas without tenant context
2. Public/unauthenticated endpoints that need to find which tenant owns a resource
3. Calendar subscriptions, public share links, webhook tokens, API keys
4. Any cross-tenant lookup scenario

## Related Optimizations

- PERF-001: Knowledge base N+1 queries (LEFT JOIN + batch user fetching)
- PERF-003: Asset relationships (pending)

## Notes

- Encountered Vite/Rollup parsing issues with inline object types in method signatures
- Extraction to named interfaces resolved bundler compatibility issues
- Dynamic imports can cause similar parsing issues in test environments
- UNION ALL is more efficient than UNION when duplicates don't matter
