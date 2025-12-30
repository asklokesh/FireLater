# FireLater ITSM - Critical Remediation Plan

**Generated:** 2025-12-30T15:52:00Z
**Based on:** SDLC Phase Execution (2025-12-30)
**Status:** READY FOR IMPLEMENTATION

---

## Executive Summary

The FireLater ITSM platform passed all SDLC phases with observations. Before production deployment, **6 critical issues** and **10 high-priority issues** must be addressed. This plan provides specific, actionable remediation steps with verification criteria.

**Estimated Remediation Effort:** 3-5 days
**Risk Level if Unaddressed:** HIGH (SQL injection, DoS vulnerabilities)

---

## Priority 1: BLOCKING ISSUES (Must Fix Before Production)

### 1.1 SQL Injection in Tenant Management

**Severity:** CRITICAL
**CVE:** N/A (Custom code vulnerability)
**Impact:** Attacker could execute arbitrary SQL, access/modify any tenant data

#### Issue Details
- **Location:** `backend/src/services/tenant.ts:176-179`, `backend/src/services/tenant.ts:82-102`
- **Problem:** Schema names constructed via string replacement instead of parameterized identifiers
- **Current Code:**
  ```typescript
  getSchemaName(tenantSlug: string) {
    return `tenant_${tenantSlug.replace(/-/g, '_')}`
  }

  // Used in raw SQL:
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
  ```

#### Remediation Steps

**Step 1:** Install pg-format library
```bash
cd backend
npm install pg-format
npm install --save-dev @types/pg-format
```

**Step 2:** Update `backend/src/services/tenant.ts`
```typescript
import format from 'pg-format';

// Replace getSchemaName usage:
const schemaName = format('%I', `tenant_${tenantSlug.replace(/[^a-z0-9_]/gi, '_')}`);

// Or use PostgreSQL identifier escaping:
const schemaName = pool.escapeIdentifier(`tenant_${tenantSlug}`);
```

**Step 3:** Add validation for tenant slugs
```typescript
// In backend/src/routes/auth.ts registration
const tenantSlugSchema = z.string()
  .min(3)
  .max(63)
  .regex(/^[a-z][a-z0-9-]*$/, 'Slug must start with letter, contain only lowercase letters, numbers, and hyphens')
  .refine(slug => !RESERVED_SLUGS.includes(slug), 'Reserved slug name');

const RESERVED_SLUGS = ['public', 'pg_catalog', 'information_schema', 'admin', 'api'];
```

**Verification:**
```bash
# Test with malicious input
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenantSlug": "test; DROP SCHEMA public CASCADE; --", ...}'

# Should return validation error, not execute SQL
```

---

### 1.2 Dependency Vulnerabilities

**Severity:** HIGH
**Impact:** Source code exposure, DoS attacks

#### 1.2.1 Next.js Vulnerability

**CVE:** GHSA-w37m-7fhw-fmv9, GHSA-mwv6-3258-q52c
**Current Version:** 16.0.8
**Required Version:** 16.1.1+

**Remediation:**
```bash
cd frontend
npm update next@latest
npm audit fix
```

**Verification:**
```bash
npm list next
# Should show 16.1.1 or higher
```

#### 1.2.2 Axios DoS Vulnerability

**CVE:** GHSA-4hjh-wcwx-xvwj
**Current Version:** 1.0.0-1.11.0
**Fix:** Update to latest

**Remediation:**
```bash
cd frontend
npm update axios@latest
```

**Verification:**
```bash
npm list axios
# Should show 1.11.1+
```

---

### 1.3 Missing SLA Breach Detection

**Severity:** CRITICAL (Business Logic)
**Impact:** SLA breaches not detected, contractual violations

#### Issue Details
- **Location:** `backend/src/services/sla.ts`
- **Problem:** `sla_breached` field never automatically updated, breach detection not implemented

#### Remediation Steps

**Step 1:** Create SLA monitoring background job
```typescript
// backend/src/jobs/slaMonitor.ts
import { pool } from '../db';
import { logger } from '../logger';

export async function monitorSLABreaches() {
  const now = new Date();

  // Update breached issues
  const result = await pool.query(`
    UPDATE issues
    SET sla_breached = true,
        response_met = CASE
          WHEN response_due < $1 AND first_response_at IS NULL THEN false
          ELSE response_met
        END,
        resolution_met = CASE
          WHEN resolution_due < $1 AND resolved_at IS NULL THEN false
          ELSE resolution_met
        END,
        updated_at = NOW()
    WHERE (
      (response_due < $1 AND first_response_at IS NULL AND response_met IS NOT FALSE)
      OR (resolution_due < $1 AND resolved_at IS NULL AND resolution_met IS NOT FALSE)
    )
    AND status NOT IN ('closed', 'resolved')
  `, [now]);

  if (result.rowCount > 0) {
    logger.warn(`Updated ${result.rowCount} issues with SLA breaches`);
  }
}

// Run every minute
setInterval(monitorSLABreaches, 60000);
```

**Step 2:** Add to server startup
```typescript
// backend/src/index.ts
import { monitorSLABreaches } from './jobs/slaMonitor';

// After server start
monitorSLABreaches(); // Initial run
```

**Verification:**
```sql
-- Create test issue with expired SLA
INSERT INTO issues (title, response_due, tenant_id, created_by)
VALUES ('Test', NOW() - INTERVAL '1 hour', 1, 1);

-- Wait 1 minute for job to run
SELECT sla_breached, response_met FROM issues WHERE title = 'Test';
-- Should show: sla_breached = true, response_met = false
```

---

### 1.4 Missing CAB Approval Enforcement

**Severity:** CRITICAL (Business Logic)
**Impact:** High-risk changes deployed without approval, compliance violations

#### Issue Details
- **Location:** `backend/src/services/changes.ts:762-793`
- **Problem:** Changes can be implemented even when `cab_required = true` without CAB approval

#### Remediation Steps

**Step 1:** Add CAB approval validation
```typescript
// backend/src/services/changes.ts - updateChange method
async updateChange(tenant: TenantContext, changeId: number, updates: any) {
  // Before allowing status change to 'approved' or 'scheduled'
  if (updates.status === 'approved' || updates.status === 'scheduled') {
    const change = await this.getChange(tenant, changeId);

    if (change.cab_required) {
      const approvalCount = await pool.query(
        'SELECT COUNT(*) FROM change_approvers WHERE change_id = $1 AND approved = true',
        [changeId]
      );

      if (approvalCount.rows[0].count < change.required_approvals) {
        throw new Error(
          `CAB approval required: ${approvalCount.rows[0].count}/${change.required_approvals} approvals received`
        );
      }
    }
  }

  // Continue with update...
}
```

**Verification:**
```bash
# Test API
curl -X PATCH http://localhost:3000/v1/changes/123 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status": "approved"}'

# Should return error if insufficient CAB approvals
```

---

### 1.5 Missing Change Status Transition Validation

**Severity:** CRITICAL (Business Logic)
**Impact:** Invalid state transitions, workflow bypass

#### Issue Details
- **Location:** `backend/src/services/changes.ts:899-926`
- **Problem:** No `VALID_STATUS_TRANSITIONS` matrix enforced

#### Remediation Steps

**Step 1:** Define valid transitions
```typescript
// backend/src/services/changes.ts
const VALID_CHANGE_TRANSITIONS: Record<string, string[]> = {
  'draft': ['submitted', 'cancelled'],
  'submitted': ['under_review', 'cancelled'],
  'under_review': ['approved', 'rejected', 'needs_info'],
  'needs_info': ['submitted'],
  'approved': ['scheduled', 'cancelled'],
  'scheduled': ['in_progress', 'cancelled'],
  'in_progress': ['completed', 'failed', 'cancelled'],
  'completed': ['closed'],
  'failed': ['scheduled'], // Allow rescheduling
  'closed': [],
  'cancelled': [],
  'rejected': []
};
```

**Step 2:** Enforce in updateChange
```typescript
async updateChange(tenant: TenantContext, changeId: number, updates: any) {
  if (updates.status) {
    const current = await this.getChange(tenant, changeId);
    const allowed = VALID_CHANGE_TRANSITIONS[current.status] || [];

    if (!allowed.includes(updates.status)) {
      throw new Error(
        `Invalid transition: ${current.status} → ${updates.status}. Allowed: ${allowed.join(', ')}`
      );
    }
  }
  // Continue...
}
```

**Verification:**
```bash
# Test invalid transition
curl -X PATCH http://localhost:3000/v1/changes/123 \
  -d '{"status": "completed"}' # When current status is 'draft'

# Should return error
```

---

### 1.6 Problem Resolution Without Root Cause

**Severity:** CRITICAL (Business Logic)
**Impact:** Problems marked resolved without identifying root cause, recurring incidents

#### Issue Details
- **Location:** `backend/src/services/problems.ts:386-424`
- **Problem:** Can resolve problem without setting `root_cause_identified = true`

#### Remediation Steps

```typescript
// backend/src/services/problems.ts - updateProblem method
async updateProblem(tenant: TenantContext, problemId: number, updates: any) {
  if (updates.status === 'resolved' || updates.status === 'closed') {
    const problem = await this.getProblem(tenant, problemId);

    if (!problem.root_cause_identified) {
      throw new Error(
        'Cannot resolve problem without identifying root cause. Set root_cause_identified = true first.'
      );
    }

    if (!problem.root_cause) {
      throw new Error('Root cause description is required before resolution');
    }
  }
  // Continue...
}
```

**Verification:**
```bash
# Test without root cause
curl -X PATCH http://localhost:3000/v1/problems/123 \
  -d '{"status": "resolved"}'

# Should return error if root_cause_identified = false
```

---

## Priority 2: HIGH PRIORITY (Should Fix)

### 2.1 Missing Password Complexity Requirements

**Severity:** HIGH
**Impact:** Weak passwords, account compromise risk

#### Current State
- Only validates minimum 8 characters
- No complexity requirements

#### Remediation
```typescript
// backend/src/routes/auth.ts
const passwordSchema = z.string()
  .min(12, 'Password must be at least 12 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
```

---

### 2.2 Missing Account Lockout Mechanism

**Severity:** HIGH
**Impact:** Brute force attacks possible

#### Remediation Steps

**Step 1:** Add failed_login_attempts tracking
```sql
-- Migration
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP;
```

**Step 2:** Implement lockout logic
```typescript
// backend/src/services/auth.ts
async login(tenant: TenantContext, email: string, password: string) {
  const user = await this.getUserByEmail(tenant, email);

  // Check if locked
  if (user.locked_until && new Date() < user.locked_until) {
    throw new Error(`Account locked until ${user.locked_until.toISOString()}`);
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    // Increment failures
    const attempts = user.failed_login_attempts + 1;
    const locked = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null; // 30 min

    await pool.query(
      'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
      [attempts, locked, user.id]
    );

    throw new Error('Invalid credentials');
  }

  // Reset on success
  await pool.query(
    'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
    [user.id]
  );

  // Continue...
}
```

---

### 2.3 Unencrypted Integration Credentials

**Severity:** HIGH
**Impact:** Credentials exposed if database compromised

#### Remediation Steps

**Step 1:** Install encryption library
```bash
cd backend
npm install crypto
```

**Step 2:** Implement encryption service
```typescript
// backend/src/services/encryption.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

**Step 3:** Update integrations service
```typescript
// backend/src/services/integrations.ts
import { encrypt, decrypt } from './encryption';

async createIntegration(tenant: TenantContext, data: any) {
  const encryptedConfig = encrypt(JSON.stringify(data.config));

  await pool.query(
    'INSERT INTO integrations (config, ...) VALUES ($1, ...)',
    [encryptedConfig, ...]
  );
}

async getIntegration(tenant: TenantContext, id: number) {
  const result = await pool.query('SELECT * FROM integrations WHERE id = $1', [id]);

  if (result.rows[0].config) {
    result.rows[0].config = JSON.parse(decrypt(result.rows[0].config));
  }

  return result.rows[0];
}
```

**Step 4:** Add environment variable
```bash
# Generate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
ENCRYPTION_KEY=<generated_key>
```

---

### 2.4 SSRF Vulnerabilities in Webhooks/Integrations

**Severity:** HIGH
**Impact:** Internal network scanning, cloud metadata access

#### Issue Details
- **Location:** `backend/src/services/integrations.ts:519-529`, `backend/src/services/integrations.ts:698-811`
- **Problem:** Webhook URLs and integration connection tests not validated against private IPs

#### Remediation Steps

**Step 1:** Create IP validation utility
```typescript
// backend/src/utils/ipValidation.ts
import { isIPv4, isIPv6 } from 'net';

const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/
];

const CLOUD_METADATA_URLS = [
  '169.254.169.254', // AWS, Azure, GCP
  'metadata.google.internal',
  '100.100.100.200' // Alibaba Cloud
];

export function isPrivateIP(ip: string): boolean {
  return PRIVATE_IP_RANGES.some(range => range.test(ip));
}

export async function isUrlSafe(url: string): Promise<boolean> {
  const parsed = new URL(url);

  // Block private IP schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  // Block cloud metadata
  if (CLOUD_METADATA_URLS.includes(parsed.hostname)) {
    return false;
  }

  // Resolve hostname to IP
  const dns = require('dns').promises;
  try {
    const addresses = await dns.resolve(parsed.hostname);
    return !addresses.some(isPrivateIP);
  } catch {
    return false;
  }
}
```

**Step 2:** Validate webhook URLs
```typescript
// backend/src/services/integrations.ts
import { isUrlSafe } from '../utils/ipValidation';

async testWebhook(tenant: TenantContext, url: string) {
  if (!await isUrlSafe(url)) {
    throw new Error('Webhook URL points to private network or metadata service');
  }

  // Continue with test...
}
```

---

## Priority 3: RECOMMENDED IMPROVEMENTS

### 3.1 Add Workflow Transaction Rollback

**Location:** `backend/src/services/workflow.ts:644-708`

Add try-catch with rollback for workflow action execution:
```typescript
async executeWorkflowActions(actions: any[]) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const action of actions) {
      await this.executeAction(client, action);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

### 3.2 Fix Concurrent Update Race Condition

**Location:** `backend/src/services/problems.ts:623-633`

Use atomic SQL operations:
```typescript
async incrementRelatedIncidentCount(problemId: number) {
  await pool.query(
    'UPDATE problems SET related_incident_count = related_incident_count + 1 WHERE id = $1',
    [problemId]
  );
}
```

---

### 3.3 Add On-Call Shift Validation

**Location:** `backend/src/services/oncall.ts:326-353`

Validate shift overlaps and user existence:
```typescript
async createShift(tenant: TenantContext, data: any) {
  // Check for overlaps
  const overlaps = await pool.query(`
    SELECT COUNT(*) FROM oncall_shifts
    WHERE schedule_id = $1
    AND user_id = $2
    AND (
      (start_time, end_time) OVERLAPS ($3, $4)
    )
  `, [data.schedule_id, data.user_id, data.start_time, data.end_time]);

  if (overlaps.rows[0].count > 0) {
    throw new Error('Shift overlaps with existing shift for this user');
  }

  // Verify user exists and is active
  const user = await pool.query(
    'SELECT id FROM users WHERE id = $1 AND active = true',
    [data.user_id]
  );

  if (user.rows.length === 0) {
    throw new Error('User not found or inactive');
  }

  // Continue...
}
```

---

## Verification & Testing Plan

### 1. Security Testing

```bash
# SQL Injection Tests
npm run test:security:sql

# SSRF Tests
npm run test:security:ssrf

# Authentication Tests
npm run test:security:auth
```

### 2. Business Logic Tests

```bash
# Run full test suite
cd backend
npm test

# Specific tests
npm test -- --grep "SLA breach detection"
npm test -- --grep "CAB approval"
npm test -- --grep "change transitions"
```

### 3. Dependency Audit

```bash
# Frontend
cd frontend
npm audit
npm audit fix

# Backend
cd backend
npm audit
npm audit fix
```

### 4. Manual Verification

- [ ] Test SQL injection with malicious tenant slugs
- [ ] Verify SLA breach detection runs every minute
- [ ] Test CAB approval enforcement
- [ ] Verify change status transition validation
- [ ] Test problem resolution requires root cause
- [ ] Test account lockout after 5 failed logins
- [ ] Verify integration credentials are encrypted
- [ ] Test SSRF protection blocks private IPs

---

## Implementation Checklist

### Week 1: Critical Issues

- [ ] 1.1 Fix SQL injection in tenant management
- [ ] 1.2.1 Update Next.js to 16.1.1+
- [ ] 1.2.2 Update axios to latest
- [ ] 1.3 Implement SLA breach detection job
- [ ] 1.4 Add CAB approval enforcement
- [ ] 1.5 Add change status transition validation
- [ ] 1.6 Require root cause for problem resolution

### Week 1: High Priority

- [ ] 2.1 Add password complexity requirements
- [ ] 2.2 Implement account lockout mechanism
- [ ] 2.3 Encrypt integration credentials
- [ ] 2.4 Add SSRF protection

### Week 2: Recommended

- [ ] 3.1 Add workflow transaction rollback
- [ ] 3.2 Fix concurrent update race conditions
- [ ] 3.3 Add on-call shift validation

### Testing & Deployment

- [ ] Run full test suite
- [ ] Perform security audit
- [ ] Conduct penetration testing
- [ ] Deploy to staging
- [ ] Verify all fixes in staging
- [ ] Deploy to production

---

## Post-Remediation Actions

1. **Re-run SDLC phases** to verify fixes
2. **Update documentation** with new security controls
3. **Train team** on new validation requirements
4. **Schedule security review** quarterly
5. **Monitor SLA breach logs** for patterns
6. **Review locked accounts** weekly

---

## Risk Assessment

| Issue | Current Risk | Post-Fix Risk | Notes |
|-------|-------------|---------------|-------|
| SQL Injection | CRITICAL | LOW | pg-format + validation |
| Next.js DoS | HIGH | LOW | Update to 16.1.1+ |
| axios DoS | HIGH | LOW | Update to latest |
| SLA Breaches | HIGH | LOW | Automated detection |
| CAB Bypass | HIGH | LOW | Enforcement added |
| Weak Passwords | MEDIUM | LOW | Complexity requirements |
| Brute Force | HIGH | LOW | Account lockout |
| Credential Exposure | HIGH | LOW | AES-256-GCM encryption |
| SSRF | HIGH | LOW | IP validation |

---

## Support & Resources

**Documentation:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Node.js Security Best Practices: https://nodejs.org/en/docs/guides/security/
- PostgreSQL Security: https://www.postgresql.org/docs/current/sql-syntax-lexical.html#SQL-SYNTAX-IDENTIFIERS

**Tools:**
- npm audit: Built-in security scanner
- pg-format: SQL identifier escaping
- Snyk: Continuous security monitoring

**Contact:**
- Security Issues: security@firelater.com
- Development Team: dev@firelater.com

---

**End of Remediation Plan**
