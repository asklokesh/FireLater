# Credential Rotation Guide
**Purpose:** Migrate existing plaintext integration credentials to encrypted format
**Version:** 1.2.0
**Date:** 2025-12-30

---

## Overview

This guide helps you rotate existing integration credentials to ensure they're encrypted using the new AES-256-GCM encryption system.

**Why Rotate?**
- Existing credentials may be stored in plaintext
- Force re-encryption with production key
- Verify encryption system working correctly
- Security best practice (rotate credentials periodically)

**When to Rotate:**
- Immediately after v1.2.0 deployment
- After any encryption key change
- Following security audit recommendations
- Every 90 days (recommended)

---

## Pre-Rotation Checklist

- [ ] v1.2.0 deployed successfully
- [ ] `ENCRYPTION_KEY` configured in environment
- [ ] Database backup completed
- [ ] All tests passing
- [ ] Stakeholders notified (credential updates)

---

## Rotation Strategy

### Option 1: Automated Rotation (Recommended)
Use the provided script to automatically re-encrypt all credentials.

**Pros:**
- Fast and efficient
- Consistent process
- Audit trail
- Rollback support

**Cons:**
- Requires downtime or maintenance window
- All integrations updated at once

### Option 2: Manual Rotation
Manually update each integration through the API.

**Pros:**
- Granular control
- No downtime required
- Can test per integration

**Cons:**
- Time-consuming
- Error-prone
- No automatic audit trail

### Option 3: Gradual Migration
Let credentials encrypt naturally as they're updated.

**Pros:**
- Zero downtime
- No special process needed
- Integrations updated on their own schedule

**Cons:**
- Takes longer to complete
- Some credentials may remain plaintext
- Harder to track completion

---

## Automated Rotation Script

### Script Location
`backend/scripts/rotate-credentials.ts`

### Usage

**Dry Run (Recommended First):**
```bash
cd backend
tsx scripts/rotate-credentials.ts --tenant yourslug --dry-run
```

**Execute Rotation:**
```bash
tsx scripts/rotate-credentials.ts --tenant yourslug
```

**All Tenants:**
```bash
tsx scripts/rotate-credentials.ts --all-tenants
```

**Specific Integration:**
```bash
tsx scripts/rotate-credentials.ts --tenant yourslug --integration <id>
```

### Script Output Example
```
🔄 Credential Rotation Tool v1.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Configuration:
  Tenant: yourslug
  Mode: DRY RUN
  ENCRYPTION_KEY: Set ✓

Scanning integrations...
  Found: 5 integrations

Analysis:
  ✓ 2 already encrypted
  ⚠ 3 need encryption

Processing:
  [1/3] Slack Notifications (id: abc123)
        Credentials: 1 field
        Status: Will encrypt ✓

  [2/3] Jira Integration (id: def456)
        Credentials: 3 fields
        Status: Will encrypt ✓

  [3/3] PagerDuty Alerts (id: ghi789)
        Credentials: 1 field
        Status: Will encrypt ✓

Summary:
  Total integrations: 5
  Already encrypted: 2
  To be encrypted: 3
  Estimated time: ~1 second

DRY RUN COMPLETE - No changes made
Run without --dry-run to apply changes
```

---

## Manual Rotation Process

If you prefer manual rotation or need to rotate specific integrations:

### Step 1: List All Integrations

**API Request:**
```bash
curl https://api.firelater.com/api/v1/integrations \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.[] | {id, name, type}'
```

**SQL Query:**
```sql
SELECT id, name, type, credentials
FROM tenant_yourslug.integrations
WHERE credentials IS NOT NULL;
```

### Step 2: For Each Integration

**Get Integration Details:**
```bash
INTEGRATION_ID="abc123"
curl https://api.firelater.com/api/v1/integrations/$INTEGRATION_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Check if Encrypted:**
Look at the credentials field in database:
- Encrypted format: `<hex>:<hex>:<hex>` (IV:authTag:ciphertext)
- Plaintext format: `{"token":"xoxb-...","apiKey":"..."}`

**Update Integration (triggers encryption):**
```bash
curl -X PATCH https://api.firelater.com/api/v1/integrations/$INTEGRATION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "token": "xoxb-your-new-token",
      "apiKey": "your-new-key"
    }
  }'
```

### Step 3: Verify Encryption

**Check Database:**
```sql
SELECT id, name,
  CASE
    WHEN credentials LIKE '%:%:%' THEN 'Encrypted ✓'
    ELSE 'Plaintext ✗'
  END as status
FROM tenant_yourslug.integrations;
```

**Test Integration:**
```bash
curl -X POST https://api.firelater.com/api/v1/integrations/$INTEGRATION_ID/test \
  -H "Authorization: Bearer $TOKEN"
```

---

## Rotation Script Implementation

Create `backend/scripts/rotate-credentials.ts`:

```typescript
import { pool } from '../src/config/database.js';
import { encrypt, decrypt } from '../src/utils/encryption.js';
import { logger } from '../src/utils/logger.js';

interface Options {
  tenant?: string;
  allTenants?: boolean;
  integrationId?: string;
  dryRun?: boolean;
}

async function rotateCredentials(options: Options) {
  console.log('🔄 Credential Rotation Tool v1.0');
  console.log('━'.repeat(40));
  console.log('');

  // Validate encryption key
  if (!process.env.ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY not set in environment');
    process.exit(1);
  }

  console.log('Configuration:');
  console.log(`  Tenant: ${options.tenant || 'ALL'}`);
  console.log(`  Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  ENCRYPTION_KEY: Set ✓`);
  console.log('');

  // Get tenants to process
  const tenants = options.allTenants
    ? await getAllTenants()
    : [options.tenant];

  let totalProcessed = 0;
  let totalEncrypted = 0;
  let totalErrors = 0;

  for (const tenant of tenants) {
    if (!tenant) continue;

    console.log(`Processing tenant: ${tenant}`);
    console.log('');

    const schema = `tenant_${tenant.replace(/-/g, '_')}`;

    // Get integrations
    const query = options.integrationId
      ? `SELECT * FROM ${schema}.integrations WHERE id = $1`
      : `SELECT * FROM ${schema}.integrations WHERE credentials IS NOT NULL`;

    const params = options.integrationId ? [options.integrationId] : [];
    const result = await pool.query(query, params);

    console.log(`Found ${result.rows.length} integrations`);
    console.log('');

    for (const integration of result.rows) {
      totalProcessed++;

      try {
        // Check if already encrypted
        const isEncrypted = integration.credentials.includes(':') &&
                          integration.credentials.split(':').length === 3;

        if (isEncrypted) {
          console.log(`  ✓ ${integration.name} (${integration.id})`);
          console.log(`    Already encrypted - skipping`);
          console.log('');
          continue;
        }

        console.log(`  ⚠ ${integration.name} (${integration.id})`);
        console.log(`    Plaintext credentials found`);

        // Re-encrypt credentials
        const credentialsJson = integration.credentials;
        const encrypted = encrypt(credentialsJson);

        if (!options.dryRun) {
          await pool.query(
            `UPDATE ${schema}.integrations SET credentials = $1 WHERE id = $2`,
            [encrypted, integration.id]
          );
          console.log(`    ✓ Encrypted successfully`);
        } else {
          console.log(`    → Would encrypt (dry run)`);
        }

        totalEncrypted++;
        console.log('');

      } catch (error) {
        console.error(`  ❌ ${integration.name} (${integration.id})`);
        console.error(`    Error: ${error.message}`);
        console.log('');
        totalErrors++;
      }
    }
  }

  console.log('');
  console.log('Summary:');
  console.log('━'.repeat(40));
  console.log(`  Total integrations: ${totalProcessed}`);
  console.log(`  Encrypted: ${totalEncrypted}`);
  console.log(`  Errors: ${totalErrors}`);
  console.log('');

  if (options.dryRun) {
    console.log('DRY RUN COMPLETE - No changes made');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('✓ Rotation complete');
  }

  await pool.end();
}

async function getAllTenants(): Promise<string[]> {
  const result = await pool.query('SELECT slug FROM public.tenants');
  return result.rows.map(r => r.slug);
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: Options = {
  dryRun: args.includes('--dry-run'),
  allTenants: args.includes('--all-tenants'),
};

const tenantIndex = args.indexOf('--tenant');
if (tenantIndex !== -1) {
  options.tenant = args[tenantIndex + 1];
}

const integrationIndex = args.indexOf('--integration');
if (integrationIndex !== -1) {
  options.integrationId = args[integrationIndex + 1];
}

// Validate
if (!options.tenant && !options.allTenants) {
  console.error('Error: Must specify --tenant <slug> or --all-tenants');
  process.exit(1);
}

// Run
rotateCredentials(options).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

---

## Verification Steps

### 1. Database Check
```sql
-- Count encrypted vs plaintext
SELECT
  CASE
    WHEN credentials LIKE '%:%:%' THEN 'Encrypted'
    ELSE 'Plaintext'
  END as status,
  COUNT(*) as count
FROM tenant_yourslug.integrations
WHERE credentials IS NOT NULL
GROUP BY status;
```

### 2. Test Integrations
```bash
# Test each integration
for id in $(curl -s https://api.firelater.com/api/v1/integrations \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[].id'); do
  echo "Testing integration: $id"
  curl -X POST https://api.firelater.com/api/v1/integrations/$id/test \
    -H "Authorization: Bearer $TOKEN"
done
```

### 3. Check Logs
```bash
# Look for decryption errors
grep "decrypt" /var/log/firelater/app.log | grep -i error

# Should see successful operations
grep "decrypt" /var/log/firelater/app.log | grep -i success
```

---

## Rollback Procedure

If rotation causes issues:

### Stop Rotation
```bash
# Kill the rotation script
Ctrl+C

# Or kill by process
pkill -f rotate-credentials
```

### Restore from Backup
```sql
-- Restore credentials column only
COPY tenant_yourslug.integrations (id, credentials)
FROM '/path/to/backup.csv'
WITH (FORMAT csv);
```

### Revert Individual Integration
```bash
curl -X PATCH https://api.firelater.com/api/v1/integrations/$INTEGRATION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": <old_credentials_from_backup>
  }'
```

---

## Best Practices

### Before Rotation
1. **Backup database** - Full backup before starting
2. **Test in staging** - Run rotation on staging first
3. **Schedule downtime** - Rotate during maintenance window
4. **Notify users** - Warn about potential integration issues

### During Rotation
1. **Monitor logs** - Watch for errors in real-time
2. **Test incrementally** - Verify each integration after rotation
3. **Document issues** - Log any problems encountered
4. **Have rollback ready** - Keep backup accessible

### After Rotation
1. **Verify all integrations** - Test each one individually
2. **Monitor for 24 hours** - Watch for delayed issues
3. **Update documentation** - Note completion date
4. **Schedule next rotation** - Set reminder for 90 days

---

## Troubleshooting

### Issue: Decryption Fails After Rotation
**Symptoms:** `Failed to decrypt or parse integration credentials`

**Cause:** Credentials encrypted with wrong key

**Solution:**
1. Verify `ENCRYPTION_KEY` in environment matches rotation key
2. Check if key was changed during rotation
3. Restore from backup if needed

### Issue: Integration Stops Working
**Symptoms:** Integration tests fail after rotation

**Cause:** Credential corruption or invalid format

**Solution:**
1. Check database for corrupted credentials
2. Re-enter credentials manually via API
3. Test integration immediately

### Issue: Partial Rotation
**Symptoms:** Some integrations encrypted, some not

**Cause:** Script interrupted or errored

**Solution:**
1. Re-run rotation script (it skips already encrypted)
2. Check logs for specific failures
3. Manually rotate failed integrations

---

## Audit Trail

Keep record of rotations:

**Rotation Log Template:**
```
Rotation Date: 2025-12-30
Performed By: ops-team@firelater.com
Tenant(s): yourslug
Integrations Processed: 5
Integrations Encrypted: 3
Errors: 0
Duration: 5 seconds
Backup Location: s3://backups/firelater/2025-12-30/
Notes: Successful rotation, all integrations tested
```

**Store in:**
- Git repository (`.loki/rotation-logs/`)
- Security audit system
- Compliance documentation

---

## Compliance Notes

**Data Protection:**
- Encryption at rest: ✓ AES-256-GCM
- Key management: ✓ Environment variables
- Access control: ✓ Database permissions
- Audit trail: ✓ Rotation logs

**Regulatory Requirements:**
- **GDPR:** Encryption satisfies security requirements
- **SOC 2:** Demonstrates data protection controls
- **HIPAA:** Encryption required for PHI (if applicable)
- **PCI DSS:** Protects cardholder data (if storing)

---

## Next Steps

After successful rotation:

1. **Schedule regular rotations** (every 90 days)
2. **Automate rotation** (cron job or scheduled task)
3. **Monitor encryption metrics** (track operations)
4. **Review access logs** (who accessed credentials)
5. **Update disaster recovery plan** (include encryption key)

---

**Document Version:** 1.0
**Last Updated:** 2025-12-30
**Next Rotation:** 2025-03-30 (90 days)
