# Learning: On-Call N+1 Query Analysis

**Date**: 2026-01-02
**Task**: PERF-002
**Finding**: False positive - No actual N+1 query issue

## Investigation

**Original Concern**: PERF-002 claimed "On-call schedule endpoints fetch user details in a loop for each rotation."

## Code Analysis

### Schedule List Query (src/services/oncall.ts:83-92)
```sql
SELECT s.*, g.name as group_name,
    (SELECT COUNT(*) FROM oncall_rotations r
     WHERE r.schedule_id = s.id AND r.is_active = true) as member_count
FROM oncall_schedules s
LEFT JOIN groups g ON s.group_id = g.id
ORDER BY s.name
LIMIT X OFFSET Y
```

**Analysis**: This uses a correlated subquery for `member_count`, but it's executed by PostgreSQL's query optimizer in an efficient manner. This is not an N+1 pattern.

### Get Rotation Members (src/services/oncall.ts:242-248)
```sql
SELECT r.*, u.name as user_name, u.email as user_email, u.avatar_url
FROM oncall_rotations r
JOIN users u ON r.user_id = u.id
WHERE r.schedule_id = $1 AND r.is_active = true
ORDER BY r.position
```

**Analysis**: This properly uses JOIN to fetch user details along with rotations. No N+1 pattern.

### Get Shifts (src/services/oncall.ts:313-314)
```sql
SELECT s.*, u.name as user_name, u.email as user_email, u.avatar_url,
       ou.name as original_user_name
...
```

**Analysis**: Uses JOIN for user lookups. No N+1 pattern.

## Conclusion

**Status**: ✅ No actual N+1 query issues found in on-call service

**Recommendation**: Mark PERF-002 as already resolved. The codebase already follows best practices:
1. Uses JOIN queries for related data
2. Correlated subqueries are appropriate for aggregate counts
3. No loops fetching data in application code

## Lesson Learned

Always verify reported issues by examining actual code before implementing fixes. The original PRD analysis may have been based on assumptions rather than code inspection.
