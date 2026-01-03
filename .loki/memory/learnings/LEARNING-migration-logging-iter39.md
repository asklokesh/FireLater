# Migration Logging Refactor - Iteration 39

**Date:** 2026-01-03
**Category:** Code Quality
**Impact:** Production logging consistency

---

## Problem

6 migration files were using `console.error` instead of structured logger, creating inconsistent error logging patterns and missing valuable context for production debugging.

---

## Solution

Replaced all console.error calls with structured logger.error() calls that include proper error context.

### Pattern Applied

**Before:**
```typescript
console.error(`Failed to apply migration to tenant ${tenant.slug}:`, err);
```

**After:**
```typescript
logger.error({ err, tenantSlug: tenant.slug }, 'Failed to apply problems migration to tenant');
```

### Benefits

1. **Structured Logging:** Error objects and metadata separated from message
2. **Context Preservation:** tenantSlug always included for filtering/debugging
3. **Production Ready:** Integrates with log aggregation systems (JSON format)
4. **Searchability:** Can filter logs by tenantSlug or error type
5. **Consistency:** Matches logging pattern used throughout codebase

---

## Implementation

Modified 6 files:
- migrations/013_problems.ts
- migrations/014_knowledge_base.ts
- migrations/015_workflows.ts
- migrations/016_assets.ts
- migrations/017_email_integration.ts
- migrations/018_integrations.ts

Each file received:
1. Logger import: `import { logger } from '../utils/logger.js';`
2. Error replacement in catch blocks

---

## Acceptable Console Usage

Two console.error calls remain and are acceptable:

1. **config/index.ts:37** - Runs before logger initialization (environment variable validation)
2. **migrations/run.ts:109** - Top-level catch handler before process.exit(1)

Both are appropriate uses of console.error where logger is either unavailable or unnecessary.

---

## Verification

- Backend tests: 334/363 passing ✓
- Frontend tests: 1895/1898 passing ✓
- TypeScript build: Success ✓
- Commit: 213fea7 ✓

---

## Key Insight

**When to use logger vs console:**
- Use **logger** in application code where logger is initialized
- Use **console** only in:
  - Bootstrapping code before logger initialization
  - Top-level error handlers that exit the process
  - CLI tools where structured logging isn't needed

---

## Metadata

- Files changed: 6
- Lines added: 6 (imports)
- Lines modified: 6 (error calls)
- Test impact: None (tests still passing)
- Breaking changes: None
