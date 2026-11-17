# Bulk Operations API

Apply one change to many records in a single request. Entities: `issues`, `problems`, `changes`, `requests`.

All routes live under `/v1/bulk/:entity/` and need a bearer token. Required permission is `<entity>:update` (update, status), `<entity>:delete` (delete) or `<entity>:assign` (assign). Changes have no assign permission, so bulk assign of changes needs `changes:update`. Reading a job needs `<entity>:read` for the job's own entity, and only the user who started it (or an admin) can read it.

## Endpoints

- `POST /v1/bulk/:entity/update` with `{ "ids": [...], "changes": { "priority": "high" } }` to give every record the same values, or `{ "items": [{ "id": "...", "changes": { ... } }] }` for different values per record. Send one form, not both.
- `POST /v1/bulk/:entity/status` with `{ "ids": [...], "status": "resolved" }`. Valid statuses depend on the entity. Resolving or closing stamps the resolved/closed (or completed/cancelled) columns with the acting user.
- `POST /v1/bulk/:entity/assign` with `{ "ids": [...], "assignedTo": "<user uuid>", "assignedGroup": "<group uuid>" }`. Send either or both; `null` clears. For changes `assignedTo` is the implementer, for requests `assignedGroup` is the fulfillment group. New issues and problems move to `assigned`.
- `POST /v1/bulk/:entity/delete` with `{ "ids": [...] }`. Rows are removed and their number and status are kept in the audit log.
- `GET /v1/bulk/jobs/:id` returns `status` (`queued`, `running`, `completed`, `failed`), `processed`, `total`, `percent`, `result` or `error`.

Optional fields on every POST: `async` (force background run), `webhookUrl`, `reason` (stored in audit metadata).

## Behaviour

- Atomic: each request runs in one database transaction. If any id is missing or any statement fails, nothing is changed (404, 409 or 400).
- Limits: up to 50,000 distinct ids per request. Work is done in chunks of 1,000 rows per statement.
- Sync vs async: up to 1,000 records returns `200` with `{ requested, affected, mode: "sync" }`. Above 1,000, or with `async: true`, the request is queued and returns `202` with `jobId` and `statusUrl`. The queued job is still one transaction, so a failed job is fully rolled back and is not retried automatically.
- Webhooks: when `webhookUrl` is set (public http/https only, SSRF-checked), the worker POSTs JSON `{ event, jobId, tenantSlug, entity, operation, processed, total, affected?, error? }` for `bulk.started`, `bulk.progress` (at most every 5 seconds), `bulk.completed` and `bulk.failed`. Delivery is best effort and never fails the job.
- Audit: every affected record gets one `audit_logs` row (action `update`, `assign` or `delete`) with old and new values and metadata `{ bulk: true, operation, operationId?, reason? }`, written in the same transaction as the change.

## Best practices

- Prefer one request over many small ones; use `ids` + `changes` when values are identical, because they run as one statement per 1,000 rows.
- Use `async: true` plus a webhook or polling for anything you do not want to hold a connection for.
- Poll `GET /v1/bulk/jobs/:id` no faster than once per second.
- Resubmit a failed job only after reading its `error`; nothing was applied.
- Deleting is permanent. Check the ids first and set `reason` for the audit trail.

## Webhook targets

Webhook URLs that resolve to private or loopback addresses are refused. Deployments that need to call an internal receiver can set `BULK_WEBHOOK_ALLOW_PRIVATE=true` on the API server; only http and https URLs are then accepted without the address check.
