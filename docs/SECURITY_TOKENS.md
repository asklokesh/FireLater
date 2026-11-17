# Token Security Model

How FireLater issues, rotates, tracks and revokes authentication tokens.

## Token types

| Token | Format | Lifetime | Where it lives |
|-------|--------|----------|----------------|
| Access token | JWT signed with `JWT_SECRET` | `JWT_ACCESS_EXPIRY` (default `1h`) | Client memory, `Authorization: Bearer` header |
| Refresh token | 64 random bytes (hex), opaque | 7 days | `httpOnly` `SameSite=Strict` cookie `refreshToken`; only its SHA-256 hash is stored in `<tenant schema>.refresh_tokens` |

Refresh tokens are not JWTs and are not signed with a static secret, so there is no
shared secret to leak: each token is an independent random value that can be revoked individually.

The access token carries two extra claims:

- `sid` - the session id (the refresh token *family*, see below)
- `rtv` - the user's `users.refresh_token_version` when the token was issued

## Sessions and rotation

A **session** is one login. Every refresh token that belongs to the login shares a `family_id`
(the `sid` claim). Exactly one token of a family is active at a time.

`POST /v1/auth/refresh`:

1. The presented token is looked up by hash.
2. The token is claimed with `UPDATE ... SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`.
   Only one of two concurrent requests can win, so a token is single use.
3. A new token is inserted in the same family with `version + 1`, a fresh 7 day expiry, and the
   session metadata carried over (IP address and User-Agent are updated to the latest request).
4. A new access token is signed with the same `sid`.

### Reuse detection

Presenting a token that was already rotated or revoked means it was copied. The whole family is
revoked (every token of the session and every access token carrying that `sid`), a
`token_reuse_detected` audit event is written and the request gets the same `401` as an unknown
token. The legitimate user and the attacker are both signed out of that session and must log in again.

## Revocation list (Redis)

Revocations are Redis keys that carry a TTL, so the list cleans itself up:

| Key | Meaning | TTL |
|-----|---------|-----|
| `revoked:session:<schema>:<sid>` | access tokens of that session are rejected | access token lifetime |
| `revoked:user:<schema>:<userId>` | access tokens with `rtv` below the stored version are rejected | access token lifetime |
| `revoked:refresh:<schema>:<hash>` | this refresh token is rejected | remaining lifetime of the token |

An entry only has to outlive the tokens it covers, so nothing is kept longer than needed.
The authentication middleware (`authenticate`, `requirePermission`, `requireRole`, `optionalAuth`)
checks every verified access token against the list. It **fails closed**: if Redis cannot be read,
the token is rejected. The `refresh_tokens` table stays the source of truth for refresh tokens; the
Redis entry is a second, faster line of defence.

Revocation events:

- `POST /v1/auth/logout` revokes the refresh token and the session's access tokens immediately.
- `DELETE /v1/auth/sessions/:id` revokes one session.
- `DELETE /v1/auth/sessions` revokes all sessions and bumps `users.refresh_token_version`.
- Password change and password reset revoke all sessions the same way.
- Refresh token reuse and a device mismatch revoke the affected session.

Websocket connections (`/v1/ws`) verify the JWT signature only; they do not consult the revocation list.

## Session tracking

`GET /v1/auth/sessions` lists the caller's active sessions: id, IP address, User-Agent,
whether the session is device bound, rotation count, creation and last use time, expiry and
`current` (true for the session making the call). The repository is `backend/src/services/sessions.ts`.

## Device binding (optional)

Send a stable, client generated fingerprint in the `X-Device-Fingerprint` header when logging in.
Only its SHA-256 hash is stored. From then on the session can only be refreshed with the same
fingerprint; a missing or different fingerprint revokes the session (`token_revoked`, reason
`device_mismatch`). Sessions created without the header are not bound. Binding is a defence in
depth: a fingerprint is not a secret, so it raises the cost of using a stolen refresh token but
does not replace the other controls.

## Audit log

Events are written to the tenant `audit_logs` table with entity type `auth_session`
(entity id = session id), including IP address and User-Agent:

| Action | When |
|--------|------|
| `token_issued` | login (a session and its first refresh token were created) |
| `token_refreshed` | successful refresh (metadata has the new token version) |
| `token_revoked` | logout, session revoked, revoke all, device mismatch (metadata `reason`) |
| `token_reuse_detected` | a rotated or revoked refresh token was presented again |

`GET /v1/auth/audit-log` (requires `admin:read`) returns these events. Filters: `userId`,
`action`, `startDate`, `endDate`, `limit`, `offset`. A failure to write an audit event is logged
but never blocks authentication. Raw tokens and fingerprints are never written to the log.

## Database changes (migration 037)

- `users.refresh_token_version` (integer, default 1)
- `refresh_tokens.family_id`, `version`, `ip_address`, `user_agent`, `device_hash`,
  `session_created_at`, `last_used_at`

## Best practices

- Serve the API over TLS; `NODE_ENV=production` marks the refresh cookie `Secure`.
- Keep `JWT_ACCESS_EXPIRY` short. It is also the longest a revoked access token could be accepted
  if Redis were lost, and it bounds the TTL of session revocation entries.
- Run Redis with persistence or accept that a Redis flush drops pending access token revocations
  (refresh tokens stay revoked in the database).
- Clients must always store the refresh token they received from the latest refresh response, and
  must not retry a refresh with an old token: that looks like theft and ends the session.
  Serialize refresh calls from multiple tabs.
- Review `GET /v1/auth/audit-log?action=token_reuse_detected` regularly and alert on spikes.
- Behind a reverse proxy, configure Fastify `trustProxy` so the recorded IP is the client IP.
