# Security Monitoring Guide - v1.2.0
**Purpose:** Monitor security enhancements and detect potential threats
**Version:** 1.2.0
**Date:** 2025-12-30

---

## Overview

This guide provides monitoring strategies for the security enhancements introduced in v1.2.0:
- SSRF attack detection (webhooks)
- Encryption/decryption operations
- JWT validation
- Integration credential access

---

## Quick Reference

### Critical Alerts (Immediate Action)
- **SSRF mass attempts:** 20+ in 5 minutes → Potential attack
- **Encryption key errors:** Any occurrence → Key mismatch/missing
- **JWT validation bypass:** Any occurrence → Security breach
- **Mass credential access:** 100+ in 1 minute → Data exfiltration

### Warning Alerts (Review Within 1 Hour)
- **SSRF attempts:** 5+ in 5 minutes → Investigate source
- **Decryption failures:** 5+ in 10 minutes → Data corruption
- **Webhook validation failures:** 10+ in 10 minutes → Configuration issues

---

## Log Patterns to Monitor

### 1. SSRF Attempts

**Log Entry Example:**
```json
{
  "level": 40,
  "time": 1767130326221,
  "hostname": "localhost",
  "url": "http://localhost:8080",
  "msg": "SSRF attempt blocked: dangerous hostname"
}
```

**Log Queries:**

**Grep:**
```bash
# All SSRF attempts today
grep "SSRF attempt blocked" /var/log/firelater/app.log

# Count by hour
grep "SSRF attempt blocked" /var/log/firelater/app.log | \
  awk '{print $1}' | cut -d: -f1 | uniq -c

# Top blocked hostnames
grep "SSRF attempt blocked" /var/log/firelater/app.log | \
  grep -oP 'hostname":"[^"]+' | sort | uniq -c | sort -rn
```

**Splunk:**
```
index=firelater "SSRF attempt blocked"
| timechart count by hostname
| sort -count
```

**Elasticsearch:**
```json
GET firelater-*/_search
{
  "query": {
    "match": {
      "msg": "SSRF attempt blocked"
    }
  },
  "aggs": {
    "by_hostname": {
      "terms": {
        "field": "hostname.keyword"
      }
    }
  }
}
```

**Grafana Loki:**
```
{app="firelater"} |= "SSRF attempt blocked"
| json
| line_format "{{.hostname}} - {{.url}}"
```

**Alerts:**
- **Warning:** 5 attempts in 5 minutes
- **Critical:** 20 attempts in 5 minutes
- **Action:** Investigate source IP, block if malicious

---

### 2. Encryption Operations

**Log Entry Example:**
```json
{
  "level": 30,
  "integrationId": "abc123",
  "tenant": "acme",
  "msg": "Credentials encrypted"
}
```

**Metrics to Track:**
- `encryption_operations_total` - Total encryptions performed
- `decryption_operations_total` - Total decryptions performed
- `encryption_errors_total` - Failed encryption attempts
- `decryption_errors_total` - Failed decryption attempts

**Log Queries:**

**Grep:**
```bash
# Encryption errors
grep "Failed to decrypt" /var/log/firelater/app.log

# Daily encryption count
grep "Credentials encrypted" /var/log/firelater/app.log | wc -l
```

**Alerts:**
- **Critical:** Any decryption error → Key mismatch or corruption
- **Warning:** 10+ decryption errors in 1 hour → Investigate pattern

---

### 3. Webhook Validation

**Log Entry Example:**
```json
{
  "level": 50,
  "webhookId": "wh_123",
  "url": "http://internal.service",
  "error": "BadRequestError: This hostname is not allowed",
  "msg": "Webhook URL failed SSRF validation"
}
```

**Metrics:**
- `webhook_validation_failures_total`
- `webhook_ssrf_blocks_total`
- `webhook_creation_attempts_total`

**Log Queries:**

**Grep:**
```bash
# Failed webhook validations
grep "Webhook URL failed SSRF validation" /var/log/firelater/app.log

# By webhook ID
grep "webhookId\":\"wh_123\"" /var/log/firelater/app.log
```

**Alerts:**
- **Warning:** 5+ validation failures in 10 minutes
- **Action:** Review webhook configurations, contact users

---

### 4. JWT Validation

**Log Entry Example:**
```json
{
  "level": 50,
  "error": "JWT verification failed",
  "msg": "Invalid token signature"
}
```

**Metrics:**
- `jwt_tokens_issued_total`
- `jwt_tokens_validated_total`
- `jwt_validation_errors_total`

**Log Queries:**

**Grep:**
```bash
# JWT errors
grep -i "jwt" /var/log/firelater/app.log | grep -i error

# Token validation failures
grep "JWT verification failed" /var/log/firelater/app.log
```

**Alerts:**
- **Critical:** Any validation bypass attempt
- **Warning:** 10+ validation failures in 5 minutes

---

### 5. Credential Access Patterns

**Log Entry Example:**
```json
{
  "level": 30,
  "userId": "user_123",
  "integrationId": "int_456",
  "action": "credentials_accessed",
  "msg": "Integration credentials retrieved"
}
```

**Suspicious Patterns:**
- Multiple integrations accessed by same user in short time
- Credentials accessed outside business hours
- Credentials accessed from unusual IPs
- Mass credential access (data exfiltration attempt)

**Log Queries:**

**SQL (Audit Trail):**
```sql
-- Recent credential access
SELECT created_at, user_id, entity_type, entity_id, action
FROM tenant_acme.audit_logs
WHERE action = 'credentials_accessed'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Suspicious mass access
SELECT user_id, COUNT(*) as access_count
FROM tenant_acme.audit_logs
WHERE action = 'credentials_accessed'
  AND created_at > NOW() - INTERVAL '5 minutes'
GROUP BY user_id
HAVING COUNT(*) > 10;
```

**Alerts:**
- **Critical:** 100+ accesses in 1 minute → Data exfiltration
- **Warning:** 20+ accesses in 5 minutes → Investigate user

---

## Monitoring Dashboard Templates

### Grafana Dashboard

**SSRF Protection Panel:**
```json
{
  "title": "SSRF Attempts",
  "targets": [
    {
      "expr": "sum(rate(ssrf_blocks_total[5m]))",
      "legendFormat": "SSRF Blocks/sec"
    }
  ],
  "alert": {
    "conditions": [
      {
        "evaluator": {
          "params": [5],
          "type": "gt"
        },
        "operator": {
          "type": "and"
        },
        "query": {
          "params": ["A", "5m", "now"]
        },
        "reducer": {
          "type": "avg"
        },
        "type": "query"
      }
    ]
  }
}
```

**Encryption Operations Panel:**
```json
{
  "title": "Encryption Operations",
  "targets": [
    {
      "expr": "rate(encryption_operations_total[5m])",
      "legendFormat": "Encryptions/sec"
    },
    {
      "expr": "rate(decryption_operations_total[5m])",
      "legendFormat": "Decryptions/sec"
    },
    {
      "expr": "rate(encryption_errors_total[5m])",
      "legendFormat": "Errors/sec"
    }
  ]
}
```

### DataDog Dashboard

**SSRF Monitor:**
```
avg(last_5m):sum:firelater.ssrf.blocks{*} > 5
```

**Encryption Errors:**
```
avg(last_10m):sum:firelater.encryption.errors{*} > 0
```

### CloudWatch Metrics

**Metric Filters:**

**SSRF Attempts:**
```json
{
  "filterPattern": "[time, request_id, level=WARN, msg=\"SSRF attempt blocked*\"]",
  "metricTransformations": [
    {
      "metricName": "SSRFAttempts",
      "metricNamespace": "FireLater/Security",
      "metricValue": "1",
      "defaultValue": 0
    }
  ]
}
```

**Encryption Errors:**
```json
{
  "filterPattern": "[time, request_id, level=ERROR, msg=\"*decrypt*\"]",
  "metricTransformations": [
    {
      "metricName": "EncryptionErrors",
      "metricNamespace": "FireLater/Security",
      "metricValue": "1",
      "defaultValue": 0
    }
  ]
}
```

**Alarms:**
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name firelater-ssrf-attempts-high \
  --alarm-description "High number of SSRF attempts" \
  --metric-name SSRFAttempts \
  --namespace FireLater/Security \
  --statistic Sum \
  --period 300 \
  --evaluation-periods 1 \
  --threshold 20 \
  --comparison-operator GreaterThanThreshold
```

---

## Alert Response Playbooks

### Playbook 1: Mass SSRF Attempts

**Trigger:** 20+ SSRF blocks in 5 minutes

**Investigation Steps:**
1. Identify source IP addresses
2. Check user accounts associated with attempts
3. Review targeted internal endpoints
4. Check for patterns (automated vs manual)

**Actions:**
```bash
# Get source IPs
grep "SSRF attempt blocked" /var/log/firelater/app.log | \
  grep -oP 'ip":"[^"]+' | sort | uniq -c | sort -rn

# Block malicious IPs (firewall)
iptables -A INPUT -s <malicious-ip> -j DROP

# Or via AWS Security Group
aws ec2 revoke-security-group-ingress \
  --group-id sg-xxxxx \
  --protocol tcp \
  --port 443 \
  --cidr <malicious-ip>/32
```

**Escalation:**
- Security team (immediate)
- Engineering lead (within 15 min)
- Incident commander (if sustained attack)

---

### Playbook 2: Encryption Key Error

**Trigger:** Any decryption error

**Investigation Steps:**
1. Verify `ENCRYPTION_KEY` environment variable
2. Check if key was recently rotated
3. Identify affected integrations
4. Check database for corruption

**Actions:**
```bash
# Verify key in environment
echo $ENCRYPTION_KEY | wc -c  # Should be 65 (64 chars + newline)

# Check affected integrations
grep "Failed to decrypt" /var/log/firelater/app.log | \
  grep -oP 'integrationId":"[^"]+' | sort | uniq

# Restore from backup if needed
pg_restore -h $DB_HOST -U $DB_USER \
  --table=integrations \
  --data-only \
  backup.dump
```

**Escalation:**
- DevOps team (immediate)
- Database admin (within 10 min)
- Security team (if key compromised)

---

### Playbook 3: Suspicious Credential Access

**Trigger:** 100+ credential accesses in 1 minute

**Investigation Steps:**
1. Identify user account
2. Check access patterns
3. Review IP addresses and user agents
4. Determine if account compromised

**Actions:**
```sql
-- Get access details
SELECT
  created_at,
  user_id,
  ip_address,
  user_agent,
  entity_id
FROM tenant_acme.audit_logs
WHERE action = 'credentials_accessed'
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;

-- Disable user account if compromised
UPDATE tenant_acme.users
SET status = 'suspended'
WHERE id = 'user_123';

-- Revoke all tokens
DELETE FROM tenant_acme.refresh_tokens
WHERE user_id = 'user_123';
```

**Escalation:**
- Security team (immediate)
- User's manager (within 30 min)
- Legal/compliance (if data breach suspected)

---

## Scheduled Reports

### Daily Security Report

**Contents:**
- SSRF attempts summary
- Encryption operation counts
- Webhook validation failures
- JWT validation errors
- Top users by credential access

**Automation:**
```bash
#!/bin/bash
# Daily security report script

DATE=$(date +%Y-%m-%d)
REPORT_FILE="/tmp/security-report-${DATE}.txt"

echo "FireLater Security Report - ${DATE}" > $REPORT_FILE
echo "======================================" >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "SSRF Attempts:" >> $REPORT_FILE
grep "SSRF attempt blocked" /var/log/firelater/app.log | wc -l >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "Top Blocked Hostnames:" >> $REPORT_FILE
grep "SSRF attempt blocked" /var/log/firelater/app.log | \
  grep -oP 'hostname":"[^"]+' | sort | uniq -c | sort -rn | head -10 >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "Encryption Errors:" >> $REPORT_FILE
grep "Failed to decrypt" /var/log/firelater/app.log | wc -l >> $REPORT_FILE
echo "" >> $REPORT_FILE

# Email report
mail -s "FireLater Security Report - ${DATE}" \
  security@firelater.com < $REPORT_FILE
```

**Schedule (cron):**
```
0 8 * * * /opt/firelater/scripts/daily-security-report.sh
```

---

## Compliance Audit Trails

### GDPR Article 32 - Security of Processing
- ✓ Encryption of personal data at rest
- ✓ Ability to ensure confidentiality (SSRF protection)
- ✓ Audit logs of data access

### SOC 2 CC6.1 - Logical and Physical Access
- ✓ Authentication mechanisms (JWT)
- ✓ Authorization controls (RBAC)
- ✓ Access logging (audit trail)

### HIPAA Security Rule
- ✓ Encryption and decryption (§164.312(a)(2)(iv))
- ✓ Audit controls (§164.312(b))
- ✓ Integrity controls (§164.312(c)(1))

---

## Review Schedule

- **Daily:** Check critical alerts
- **Weekly:** Review SSRF patterns
- **Monthly:** Audit credential access logs
- **Quarterly:** Security metrics review
- **Annually:** Full security audit

---

**Document Version:** 1.0
**Last Updated:** 2025-12-30
**Next Review:** 2025-02-01
