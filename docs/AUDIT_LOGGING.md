# Audit Logging

FireLater records who did what, to which entity, when and from where. The trail is hash-chained so tampering is detectable, and it can be searched, exported, reported on (SOC 2 / ISO 27001), retained, archived and alerted on.

All endpoints are mounted at `/v1/audit` and need the `admin:read` permission (reads) or `admin:write` (changes).

## What is recorded

Every record has: user (id, email), action, entity type / id / name, IP address, user agent, request id, HTTP method, request path, status code, severity (`info` .. `critical`), outcome (`success`, `failure`, `denied`) and a timestamp.

- **Action logging**: application-wide hooks (`backend/src/middleware/auditHooks.ts`) log every successful create / update / delete / assign / approve / reject / escalate request, role and permission changes, settings changes, logins and failed logins. Requests rejected with 403 are logged with outcome `denied`. Reads (`view`) are logged only when `log_reads` is enabled, exports when `log_exports` is enabled. The audit API itself is not audited by the hooks; its admin actions (settings, alert rules, legal hold, retention runs, exports) are logged explicitly.
- **Field-level changes**: for issues, problems, changes, applications, users, groups, roles, assets, requests and KB articles (`/v1/kb/:articleId`) the row is read before and after the request. `changed_fields` lists the fields that changed; `old_values` and `new_values` hold only those fields. A user's roles and a group's members are read too, so granting a role or adding a member shows the before and after list. Deleting an entity (`DELETE /v1/<entity>/:id`) stores the full previous row. Requests on a sub-resource of an entity (`DELETE /v1/groups/:id/members/:userId`, `DELETE /v1/issues/:id/problem`, `POST /v1/issues/:id/comments`, `PUT /v1/users/:id/roles`) are logged as an `update` (or `permission_granted` / `permission_revoked` for roles) of the parent, with the request body in `new_values` and the sub-resource path in `metadata.subResource`; they are never logged as deleting the parent.
- **One record per action**: many services also write their own short audit row (user, action, entity and a `changes` payload) while they handle a request. When such a row exists for the same entity and user, written during the request and not sealed yet, the request hook merges its context into that row (IP address, user agent, request id, HTTP method, path and status, `changed_fields`, `old_values`, `new_values`) instead of adding a second record; the service's action, entity type and `changes` are kept. If the service row was already sealed by a concurrent write, it is left unchanged and the hook writes nothing more, so the action still has one record (without the request context). Rows written outside a request (jobs, workflows) are unchanged. The internal replay of a failed `GET` (error recovery) is not audited; the outer request is.
- **Masking**: values of fields named like `password`, `token`, `secret`, `api_key`, `ssn`, ... (including camelCase and prefixed variants) plus the tenant's `sensitive_fields` are stored as `[REDACTED]`. Strings over 4096 characters are truncated.
- **Tamper evidence**: every record, however it was inserted, is sealed into a SHA-256 hash chain (on the next audit write, by the daily job, and before `GET /v1/audit/verify`). A record stores `chain_position`, `prev_hash`, `record_hash` and a `content_digest` over its old/new values, changed fields, the legacy `changes` payload, user, entity name, outcome, severity and request details; the record hash covers the digest, its `digest_version`, the metadata and the position. `GET /v1/audit/verify` re-derives every hash and digest over the live table and the archive, checks that each record links to the previous one, and reports a missing chain position as a failure unless a retention run recorded purging it. This makes edits of sealed records and deletions detectable; it does not prevent them, and records not yet sealed (normally only for the moment between the write and the seal) are not covered. Records sealed before migration `039_audit_digest_version` have `digest_version` NULL (version 1): their digest does not cover `changes`, so an edit of only that column on such a record is not detected. They are not re-sealed, because re-sealing would vouch for whatever they hold now; every record sealed since then (version 2) covers it. To make the tables immutable at the database level, revoke `UPDATE` and `DELETE` on the audit tables from the application's database role (the application only updates sealing columns and legal-hold / retention fields, and deletes only in the retention job and the cleanup endpoint).

## Search

`GET /v1/audit` and `GET /v1/audit/search` accept: `q` (full-text over user, entity, action and path), `userId`, `action`, `entityType`, `entityId`, `ipAddress`, `severity`, `outcome`, `startDate`, `endDate`, `source` (`live`, `archive`, `all`), `limit`, `offset`. The total is counted up to 100000 (`totalCapped` is set beyond that).

Other reads: `GET /v1/audit/entity/:entityType/:entityId`, `/user/:userId`, `/security`, `/security/failed-logins`, `/summary/users`, `/summary/entities`.

## Export

`GET /v1/audit/export?format=csv|json` takes the same filters and returns up to 50000 rows (`X-Audit-Export-Truncated` tells when more exist). CSV cells starting with `= + - @` are prefixed so spreadsheets do not run them. Each export is itself audited.

## Compliance reports

`GET /v1/audit/reports/templates` lists the templates; `GET /v1/audit/reports/:template?from=<iso>&to=<iso>&format=json|csv` generates one.

| Template | Framework | Controls |
|---|---|---|
| `audit_trail_soc2` | SOC 2 | CC6.1, CC6.2, CC6.3, CC6.6, CC6.7, CC7.2, CC8.1 |
| `audit_trail_iso27001` | ISO/IEC 27001:2022 | A.5.15, A.8.2, A.8.5, A.8.9, A.8.12, A.8.15, A.8.16, A.8.32 |

Each event row is mapped to a control. Reports read the live table and the archive, so a report for an older period is complete. The summary adds event counts by action / outcome / user, failed logins, denied access, privileged changes, alerts raised, a hash-chain verification result (`logIntegrity`) and the retention policy (`retention`). The same templates are available in `/v1/compliance-reports` and can be scheduled there.

## Retention and archival

Per tenant (`GET/PATCH /v1/audit/settings`): `retention_days` (30-3650, default 365), `archive_after_days` (optional, must be smaller than retention), `log_reads`, `log_exports`, `sensitive_fields`, `alerts_enabled`.

The daily audit integrity job seals unsealed records, verifies the chain and then applies the policy: sets every record's `retention_until` to `created_at + retention_days` (so raising or lowering `retention_days` applies to existing records too, immediately on `PATCH /v1/audit/settings` and again in the daily run), moves records older than `archive_after_days` to `audit_logs_archive` (every column of the record is copied, the column list is read from the database, and archiving refuses to run if the archive table lacks a column of the live table), and purges records past `retention_until`. A `PATCH` that would leave `archive_after_days` at or above `retention_days` is rejected, also when only one of the two is sent. `POST /v1/audit/retention/run` does the same on demand; `POST /v1/audit/cleanup` runs the same purge without archiving: it re-stamps `retention_until` and deletes expired records from the live table and the archive (legal holds and the newest record are kept), and writes the same `retention_run` record with the purged chain positions, attributed to the admin who called it, so verification still passes after a cleanup. There is one delete path for audit records (the retention service); deleting rows any other way (for example with SQL) shows up in verification as a missing chain position; `GET /v1/audit/retention/stats` shows storage counts. Records under **legal hold** are never purged: `POST /v1/audit/legal-hold` with `{ "hold": true, "entityType": "...", "entityId": "...", "userId": "...", "startDate": "...", "endDate": "..." }` (at least one scope field). The newest record is always kept so the chain stays anchored. Retention runs that delete data are audited (`retention_run`, with the purged chain positions in `metadata.purgedPositions`, which is what chain verification uses to accept the gap).

Records archived by a build before migration `039_audit_digest_version` lost their `changes` value (the archive copy left it NULL and the live row was deleted). That value cannot be recovered; those records still verify, because their version 1 digest never covered `changes`.

## Real-time alerts

Rules (`GET/POST /v1/audit/alert-rules`, `PATCH/DELETE /v1/audit/alert-rules/:id`) fire when `threshold` matching events occur within `windowMinutes` for the same user (`groupBy: user`), IP (`ip`) or tenant-wide (`none`). A rule filters by `actions`, `entityTypes` and `outcome`. Rules are evaluated for every record as it is sealed into the chain, so records written by services directly (for example bulk operations) count too. An alert is stored (`GET /v1/audit/alerts`, `POST /v1/audit/alerts/:id/acknowledge`), logged, and sent as an in-app notification to every active admin; one alert is raised per rule and actor per window.

Default rules: repeated failed logins, mass deletion, bulk export, access-denied burst, privilege changes.

## Performance

An audit write is one INSERT; sealing it into the chain (one short transaction under a per-tenant advisory lock) and alert evaluation run after the write returns, and login does not wait for its audit record. Every write invalidates the tenant's cached audit queries (a Redis key scan), so the query cache is always read-after-write consistent; the cost of that scan grows with the number of cached audit queries. Reads use composite indexes `(user_id, created_at)`, `(entity_type, entity_id, created_at)`, `(action, created_at)`, a BRIN index on `created_at`, partial indexes on non-info severity / non-success outcome and on unsealed records, and a GIN expression index for full-text search (migration `038_audit_enhancements`). Old data moves to the archive table to keep the live table small.

Settings: a tenant's own `sensitive_fields` are loaded at server start and refreshed on every settings change; another server process picks up a change within 30 seconds.
