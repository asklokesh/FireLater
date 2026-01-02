# Learning: Redis Error Handling for Job Schedulers

**Date**: 2026-01-02
**Task**: STAB-003 - Add error handling for Redis connection failures

## Problem

Redis connection failures causing uncaught exceptions in auth service, job queues, and monitoring endpoints.

## Solutions

1. **Auth Service**: Added try-catch to all Redis operations with appropriate error handling strategies
2. **Queue Configuration**: Added error event handlers to all BullMQ queues
3. **Status Monitoring**: Wrapped queue status checks with graceful degradation
4. **Missing Export**: Added `redisConnection` export for BullMQ compatibility

## Patterns

- **Graceful Degradation**: Cache operations return null, fall back to DB
- **Fail Fast**: Critical operations (password reset) throw errors
- **Best Effort**: Cleanup operations log but don't throw
- **Sentinel Values**: Monitoring returns -1 when Redis unavailable
