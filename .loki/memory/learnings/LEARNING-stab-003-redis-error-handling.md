# Learning: Redis Error Handling in Background Job Schedulers

**Date**: 2026-01-02
**Task**: STAB-003
**Finding**: Valid critical stability issue

## Investigation

**Original Issue**: "Redis connection failures in on-call scheduler and notification services cause uncaught exceptions."

## Root Cause Analysis

While the notification queue processors already had BullMQ retry logic (added in STAB-001/002), the **scheduler functions** that queue jobs lacked error handling around `queue.add()` calls.

### Affected Functions

All scheduler functions that call `queue.add()` without try-catch:

1. **`backend/src/services/workflow.ts:575`**
   - Function: `executeWorkflowAction()`
   - Issue: Workflow notifications fail silently if Redis is down
   - Impact: Users don't receive critical workflow notifications

2. **`backend/src/jobs/processors/slaBreaches.ts:212`**
   - Function: `queueBreachNotifications()`
   - Issue: SLA breach notifications fail to queue
   - Impact: Teams miss critical SLA breach alerts

3. **`backend/src/jobs/processors/slaBreaches.ts:341`**
   - Function: `scheduleSlaBreachChecks()`
   - Issue: SLA breach checks fail to schedule for all tenants
   - Impact: No SLA monitoring across platform

4. **`backend/src/jobs/processors/scheduledReports.ts:160`**
   - Function: `queueDueScheduledReports()`
   - Issue: Scheduled reports fail to queue
   - Impact: Stakeholders miss regular reports

5. **`backend/src/jobs/processors/healthScores.ts:362`**
   - Function: `scheduleHealthScoreCalculation()`
   - Issue: Health score calculations fail to schedule
   - Impact: No application health monitoring

6. **`backend/src/jobs/processors/cleanup.ts:202`**
   - Function: `scheduleCleanup()`
   - Issue: Cleanup jobs fail to schedule
   - Impact: Database bloat and potential disk space issues

## Solution Implemented

Added try-catch blocks around all `queue.add()` calls with:
1. Specific error logging including context (tenant, job type, etc.)
2. Graceful degradation - continue processing other items even if one fails
3. Clear error messages distinguishing Redis errors from business logic errors

### Example Pattern

```typescript
try {
  await notificationQueue.add('send-notification', jobData, options);
} catch (queueError) {
  logger.error(
    { err: queueError, tenantSlug, recipientId },
    'Failed to queue workflow notification due to Redis error'
  );
  // Continue with other recipients even if one fails
}
```

## Impact Assessment

**Before Fix**:
- Redis connection failure → uncaught exception → scheduler crashes
- All subsequent jobs for all tenants fail
- No visibility into what failed

**After Fix**:
- Redis connection failure → logged error → scheduler continues
- Other tenants' jobs still get queued
- Clear error logs for debugging
- Partial success better than total failure

## Lesson Learned

Queue operations are I/O operations that can fail due to network/Redis issues. Always wrap queue.add() calls in try-catch blocks, especially in multi-tenant loops where one failure shouldn't block others.

## Related Tasks

- STAB-001/002: Added BullMQ retry logic to job processors (handles failures during execution)
- STAB-003: Added error handling to job schedulers (handles failures during queuing)

## Files Modified

1. `backend/src/services/workflow.ts` - Workflow notification queuing
2. `backend/src/jobs/processors/slaBreaches.ts` - SLA breach notification and check scheduling
3. `backend/src/jobs/processors/scheduledReports.ts` - Scheduled report queuing
4. `backend/src/jobs/processors/healthScores.ts` - Health score calculation scheduling
5. `backend/src/jobs/processors/cleanup.ts` - Cleanup job scheduling
