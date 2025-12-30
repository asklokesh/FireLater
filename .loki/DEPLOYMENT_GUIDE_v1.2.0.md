# Deployment Guide: v1.2.0 Security Enhancements
**Version:** 1.2.0
**Date:** 2025-12-30
**Status:** Ready for Deployment

---

## Pre-Deployment Checklist

### 1. Environment Variables
- [ ] Generate production `ENCRYPTION_KEY`
- [ ] Add to production environment (Kubernetes secrets, AWS SSM, etc.)
- [ ] Verify key is 64-character hex string
- [ ] Ensure key is different from development/staging

### 2. Dependencies
- [ ] Review `package.json` changes
- [ ] Run `npm audit` to verify no new vulnerabilities
- [ ] Verify Fastify v5 compatibility with other services

### 3. Database
- [ ] No migrations required for this release
- [ ] Credentials column already exists (no schema changes)
- [ ] Backup database before deployment

### 4. Testing
- [ ] All 122 tests passing locally
- [ ] Run tests in staging environment
- [ ] Verify encryption/decryption works
- [ ] Test webhook SSRF protection

---

## Deployment Steps

### Step 1: Generate Production Encryption Key

**Local/Development:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Generated Key (DO NOT USE IN PRODUCTION - generate your own):**
```
568f36268812e3b6ac726953fe9d3af9995733851265fe8855292d68b116a02a
```

**Store Securely:**
- AWS: AWS Secrets Manager or SSM Parameter Store
- Kubernetes: Sealed Secrets or External Secrets Operator
- Azure: Key Vault
- Google Cloud: Secret Manager
- Docker: Docker Secrets

### Step 2: Update Environment Variables

**Docker Compose:**
```yaml
services:
  backend:
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
```

**Kubernetes Secret:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: firelater-secrets
type: Opaque
stringData:
  ENCRYPTION_KEY: "568f36268812e3b6ac726953fe9d3af9995733851265fe8855292d68b116a02a"
```

**Kubernetes Deployment:**
```yaml
env:
  - name: ENCRYPTION_KEY
    valueFrom:
      secretKeyRef:
        name: firelater-secrets
        key: ENCRYPTION_KEY
```

**AWS ECS Task Definition:**
```json
{
  "secrets": [
    {
      "name": "ENCRYPTION_KEY",
      "valueFrom": "arn:aws:secretsmanager:region:account:secret:firelater/encryption-key"
    }
  ]
}
```

### Step 3: Deploy to Staging

**Build:**
```bash
cd backend
npm install
npm run build
npm test
```

**Deploy:**
```bash
# Docker
docker build -t firelater-api:v1.2.0 .
docker push your-registry/firelater-api:v1.2.0

# Kubernetes
kubectl set image deployment/firelater-api \
  firelater-api=your-registry/firelater-api:v1.2.0 \
  -n staging

# Verify
kubectl rollout status deployment/firelater-api -n staging
```

**Smoke Test:**
```bash
# Health check
curl https://staging-api.firelater.com/health

# Verify encryption (create test integration)
curl -X POST https://staging-api.firelater.com/api/v1/integrations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Slack",
    "type": "slack",
    "credentials": {"token": "xoxb-test-token"}
  }'

# Verify SSRF protection (should fail)
curl -X POST https://staging-api.firelater.com/api/v1/webhooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Bad Webhook",
    "url": "http://localhost:8080",
    "events": ["issue.created"]
  }'
# Expected: 400 Bad Request - "This hostname is not allowed for security reasons"
```

### Step 4: Verify Webhook URLs

**Check Existing Webhooks:**
```sql
-- Connect to database
SELECT id, name, url, is_active
FROM tenant_yourslug.webhooks
WHERE is_active = true;
```

**Test Each Webhook:**
```bash
# For each active webhook
curl -X POST https://staging-api.firelater.com/api/v1/webhooks/{id}/test \
  -H "Authorization: Bearer $TOKEN"
```

**Common Invalid URLs to Watch For:**
- `http://localhost:*`
- `http://127.0.0.1:*`
- `http://10.*.*.*`
- `http://192.168.*.*`
- `http://172.16-31.*.*`
- `http://169.254.169.254` (AWS metadata)

**Remediation:**
If webhooks fail SSRF validation:
1. Contact webhook owner
2. Verify intended destination
3. Update to public URL if legitimate
4. Disable if suspicious

### Step 5: Monitor Logs for SSRF Attempts

**Log Patterns to Monitor:**

```bash
# SSRF attempts
grep "SSRF attempt blocked" /var/log/firelater/app.log

# Encryption errors
grep "Failed to decrypt" /var/log/firelater/app.log

# JWT validation issues
grep "JWT" /var/log/firelater/app.log | grep -i error
```

**Set Up Alerts:**

**DataDog:**
```
logs("SSRF attempt blocked").rollup("count").last("5m") > 10
```

**CloudWatch:**
```json
{
  "filterPattern": "[time, request_id, level=WARN, msg=\"SSRF attempt blocked*\"]",
  "metricTransformations": [{
    "metricName": "SSRFAttempts",
    "metricNamespace": "FireLater/Security",
    "metricValue": "1"
  }]
}
```

**Grafana Loki:**
```
sum(rate({app="firelater"} |= "SSRF attempt blocked"[5m]))
```

**Alert Thresholds:**
- Warning: 5+ SSRF attempts in 5 minutes
- Critical: 20+ SSRF attempts in 5 minutes
- Action: Investigate source IP, block if malicious

### Step 6: Plan Credential Rotation

See `CREDENTIAL_ROTATION_GUIDE.md` for detailed steps.

**Quick Start:**
```bash
# Run credential rotation script
cd backend
tsx scripts/rotate-credentials.ts --tenant yourslug --dry-run

# Review changes
# If OK, run without dry-run
tsx scripts/rotate-credentials.ts --tenant yourslug
```

---

## Production Deployment

Once staging is verified:

### 1. Schedule Maintenance Window
- **Recommended:** Off-peak hours
- **Duration:** 15-30 minutes
- **Notify:** All users via email/banner

### 2. Backup Database
```bash
# PostgreSQL
pg_dump -h $DB_HOST -U $DB_USER -Fc firelater_prod > backup_$(date +%Y%m%d_%H%M%S).dump

# Verify backup
pg_restore --list backup_*.dump | head -20
```

### 3. Deploy to Production
```bash
# Build
docker build -t firelater-api:v1.2.0 .
docker tag firelater-api:v1.2.0 your-registry/firelater-api:v1.2.0
docker push your-registry/firelater-api:v1.2.0

# Deploy (Kubernetes example)
kubectl set image deployment/firelater-api \
  firelater-api=your-registry/firelater-api:v1.2.0 \
  -n production

# Monitor rollout
kubectl rollout status deployment/firelater-api -n production

# Verify pods
kubectl get pods -n production | grep firelater-api
```

### 4. Post-Deployment Verification

**Health Checks:**
```bash
# API health
curl https://api.firelater.com/health

# Database health
curl https://api.firelater.com/health/db

# Redis health
curl https://api.firelater.com/health/redis
```

**Integration Tests:**
```bash
# Run E2E tests against production (read-only)
npm run test:e2e -- --config=playwright.config.prod.ts
```

**Monitor Metrics:**
- Response times (should be similar to pre-deployment)
- Error rates (should not increase)
- CPU/Memory usage (may increase slightly due to encryption)
- Database connections (should be stable)

### 5. Enable Monitoring

**Metrics to Track:**
- `encryption_operations_total` (new encryptions)
- `decryption_operations_total` (credential reads)
- `ssrf_blocks_total` (blocked webhook URLs)
- `webhook_validation_failures_total` (invalid webhooks)
- `jwt_validation_errors_total` (JWT issues)

**Dashboards:**
Create dashboards for:
- Security events (SSRF, encryption errors)
- Webhook health (success/failure rates)
- JWT validation (tokens issued/validated)

---

## Rollback Plan

If issues occur:

### Quick Rollback
```bash
# Kubernetes
kubectl rollout undo deployment/firelater-api -n production

# Verify
kubectl rollout status deployment/firelater-api -n production
```

### Manual Rollback
```bash
# Deploy previous version
kubectl set image deployment/firelater-api \
  firelater-api=your-registry/firelater-api:v1.1.0 \
  -n production
```

### Data Considerations
- Encrypted credentials will remain encrypted
- v1.1.0 can still read encrypted data (graceful fallback)
- New credentials created during v1.2.0 will not be encrypted if rolled back
- SSRF protection will be disabled on rollback

---

## Post-Deployment Tasks

### Week 1
- [ ] Monitor SSRF attempt logs
- [ ] Review encryption error logs
- [ ] Verify webhook success rates
- [ ] Check JWT validation metrics
- [ ] Begin credential rotation (see guide)

### Week 2
- [ ] Complete credential rotation for all integrations
- [ ] Audit all webhook URLs
- [ ] Review security metrics
- [ ] Update documentation based on findings

### Month 1
- [ ] Penetration testing of new features
- [ ] Security audit of encrypted data
- [ ] Review SSRF block patterns
- [ ] Plan next security enhancements

---

## Troubleshooting

### Issue: Encryption Key Not Found
**Error:** `ENCRYPTION_KEY environment variable is required`

**Solution:**
1. Verify environment variable is set
2. Restart application/pods
3. Check secret/config map is mounted correctly

### Issue: Decryption Fails
**Error:** `Failed to decrypt or parse integration credentials`

**Possible Causes:**
- Wrong encryption key
- Corrupted data
- Key rotation without migration

**Solution:**
1. Verify ENCRYPTION_KEY matches what was used to encrypt
2. Check database for corrupted records
3. Run credential rotation script to re-encrypt

### Issue: SSRF False Positives
**Error:** Valid webhook URL blocked

**Solution:**
1. Verify URL is truly public (not internal)
2. Check DNS resolution
3. If legitimate, consider adding to allowlist (requires code change)
4. Use public proxy/relay if internal endpoint needed

### Issue: JWT Validation Fails
**Error:** JWT validation errors after upgrade

**Solution:**
1. Verify JWT_SECRET unchanged
2. Check token expiration
3. Review fastify-plugin compatibility
4. Check logs for specific error details

---

## Security Contacts

**Issues to Report Immediately:**
- Mass SSRF attempts (potential attack)
- Encryption key compromise
- JWT validation bypass
- Unusual credential access patterns

**Escalation:**
1. DevOps team (monitoring alerts)
2. Security team (security@firelater.com)
3. Engineering lead (critical vulnerabilities)
4. Executive team (major incidents)

---

## Success Criteria

Deployment is successful when:
- [ ] All health checks passing
- [ ] Zero 500 errors in first hour
- [ ] Response times within 10% of baseline
- [ ] All existing integrations working
- [ ] Webhooks firing successfully
- [ ] No encryption/decryption errors
- [ ] SSRF protection blocking only invalid URLs
- [ ] JWT validation working correctly

---

**Document Version:** 1.0
**Last Updated:** 2025-12-30
**Approved By:** Security Team
**Next Review:** 2025-01-15
