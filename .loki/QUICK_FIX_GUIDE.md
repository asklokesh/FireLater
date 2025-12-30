# FireLater - Quick Fix Guide

**Critical Issues Only - Complete in 1-2 Days**

---

## Fix #1: SQL Injection (30 minutes)

```bash
cd backend
npm install pg-format @types/pg-format
```

**Edit:** `backend/src/services/tenant.ts`

```typescript
import format from 'pg-format';

// Line 176-179: Replace getSchemaName usage
const schemaName = format('%I', `tenant_${tenantSlug.replace(/[^a-z0-9_]/gi, '_')}`);

// Line 82-102: Use pg-format in CREATE SCHEMA
const query = format('CREATE SCHEMA IF NOT EXISTS %I', schemaName);
await pool.query(query);
```

**Test:**
```bash
npm test -- tenant.test.ts
```

---

## Fix #2: Update Dependencies (15 minutes)

```bash
cd frontend
npm update next@latest axios@latest
npm audit fix

cd ../backend
npm audit fix
```

**Verify:**
```bash
npm list next axios
# next should be 16.1.1+
# axios should be 1.11.1+
```

---

## Fix #3: SLA Breach Detection (1 hour)

**Create:** `backend/src/jobs/slaMonitor.ts`

```typescript
import { pool } from '../db';

export async function monitorSLABreaches() {
  await pool.query(`
    UPDATE issues
    SET sla_breached = true,
        response_met = CASE WHEN response_due < NOW() AND first_response_at IS NULL THEN false ELSE response_met END,
        resolution_met = CASE WHEN resolution_due < NOW() AND resolved_at IS NULL THEN false ELSE resolution_met END
    WHERE (response_due < NOW() AND first_response_at IS NULL) OR (resolution_due < NOW() AND resolved_at IS NULL)
    AND status NOT IN ('closed', 'resolved')
  `);
}

setInterval(monitorSLABreaches, 60000); // Every minute
```

**Edit:** `backend/src/index.ts`

```typescript
import { monitorSLABreaches } from './jobs/slaMonitor';

// After server.listen()
monitorSLABreaches();
```

---

## Fix #4: CAB Approval (30 minutes)

**Edit:** `backend/src/services/changes.ts` (around line 762)

```typescript
async updateChange(tenant: TenantContext, changeId: number, updates: any) {
  if (updates.status === 'approved' || updates.status === 'scheduled') {
    const change = await this.getChange(tenant, changeId);

    if (change.cab_required) {
      const { rows } = await pool.query(
        'SELECT COUNT(*) FROM change_approvers WHERE change_id = $1 AND approved = true',
        [changeId]
      );

      if (rows[0].count < change.required_approvals) {
        throw new Error(`CAB approval required: ${rows[0].count}/${change.required_approvals} approvals`);
      }
    }
  }
  // ... continue with existing code
}
```

---

## Fix #5: Change Status Transitions (30 minutes)

**Edit:** `backend/src/services/changes.ts` (top of file)

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  'draft': ['submitted', 'cancelled'],
  'submitted': ['under_review', 'cancelled'],
  'under_review': ['approved', 'rejected', 'needs_info'],
  'needs_info': ['submitted'],
  'approved': ['scheduled', 'cancelled'],
  'scheduled': ['in_progress', 'cancelled'],
  'in_progress': ['completed', 'failed', 'cancelled'],
  'completed': ['closed'],
  'failed': ['scheduled'],
  'closed': [],
  'cancelled': [],
  'rejected': []
};
```

**Edit:** `updateChange` method

```typescript
async updateChange(tenant: TenantContext, changeId: number, updates: any) {
  if (updates.status) {
    const current = await this.getChange(tenant, changeId);
    const allowed = VALID_TRANSITIONS[current.status] || [];

    if (!allowed.includes(updates.status)) {
      throw new Error(`Invalid transition: ${current.status} → ${updates.status}`);
    }
  }
  // ... continue
}
```

---

## Fix #6: Problem Root Cause (20 minutes)

**Edit:** `backend/src/services/problems.ts` (around line 386)

```typescript
async updateProblem(tenant: TenantContext, problemId: number, updates: any) {
  if (updates.status === 'resolved' || updates.status === 'closed') {
    const problem = await this.getProblem(tenant, problemId);

    if (!problem.root_cause_identified || !problem.root_cause) {
      throw new Error('Root cause identification required before resolution');
    }
  }
  // ... continue
}
```

---

## Verification Script

**Create:** `scripts/verify-fixes.sh`

```bash
#!/bin/bash

echo "Verifying critical fixes..."

# Check dependencies
echo "1. Checking Next.js version..."
cd frontend && npm list next | grep -q "16.1.[1-9]" && echo "✓ Next.js updated" || echo "✗ Next.js NOT updated"

echo "2. Checking axios version..."
npm list axios | grep -q "1.1[1-9]" && echo "✓ axios updated" || echo "✗ axios NOT updated"

# Check code changes
echo "3. Checking pg-format import..."
cd ../backend && grep -q "import.*pg-format" src/services/tenant.ts && echo "✓ pg-format imported" || echo "✗ pg-format NOT imported"

echo "4. Checking SLA monitor..."
[ -f "src/jobs/slaMonitor.ts" ] && echo "✓ SLA monitor created" || echo "✗ SLA monitor NOT created"

echo "5. Checking VALID_TRANSITIONS..."
grep -q "VALID_TRANSITIONS" src/services/changes.ts && echo "✓ Transitions defined" || echo "✗ Transitions NOT defined"

# Run tests
echo "6. Running tests..."
npm test 2>&1 | tail -5

echo "Done!"
```

```bash
chmod +x scripts/verify-fixes.sh
./scripts/verify-fixes.sh
```

---

## After Fixes Checklist

- [ ] All 6 fixes implemented
- [ ] Tests passing (`npm test`)
- [ ] No new `npm audit` HIGH/CRITICAL vulnerabilities
- [ ] Verification script shows all checkmarks
- [ ] Committed changes to git
- [ ] Deployed to staging
- [ ] Smoke tested key workflows:
  - [ ] Create tenant (SQL injection test)
  - [ ] Wait 2 minutes, check SLA breach detection
  - [ ] Try to approve change without CAB approval (should fail)
  - [ ] Try invalid status transition (should fail)
  - [ ] Try to resolve problem without root cause (should fail)

---

## Quick Test Commands

```bash
# SQL Injection Test
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenantSlug": "test; DROP SCHEMA public; --", "email": "test@example.com", "password": "Test1234!@#$"}'
# Should return: 400 validation error

# SLA Breach Test
psql -d firelater -c "SELECT issue_number, sla_breached, response_met FROM issues WHERE response_due < NOW() LIMIT 5;"
# Should show sla_breached = true for overdue issues

# CAB Approval Test
curl -X PATCH http://localhost:3000/v1/changes/1 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "approved"}'
# Should return: 400 "CAB approval required" if cab_required = true

# Change Transition Test
curl -X PATCH http://localhost:3000/v1/changes/1 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "completed"}'
# Should return: 400 "Invalid transition" if status is 'draft'

# Problem Root Cause Test
curl -X PATCH http://localhost:3000/v1/problems/1 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "resolved"}'
# Should return: 400 "Root cause identification required"
```

---

## Rollback Plan

If any fix causes issues:

```bash
git log --oneline -10
git revert <commit-hash>
git push
```

Or revert specific file:
```bash
git checkout HEAD~1 -- backend/src/services/tenant.ts
git commit -m "Revert tenant.ts changes"
```

---

## Support

- Full details: `.loki/REMEDIATION_PLAN.md`
- Executive summary: `.loki/EXECUTIVE_SUMMARY.md`
- SDLC logs: `.loki/logs/sdlc/`
