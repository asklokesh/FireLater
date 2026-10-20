# WebSocket Real-Time API

FireLater pushes entity changes and presence updates over a WebSocket at `/v1/ws`
(backend `src/routes/ws.ts`, registered with `@fastify/websocket` in `src/index.ts`).

## Connecting

```
ws(s)://<api-host>/v1/ws?token=<access JWT>
```

The access token can also be sent as `Authorization: Bearer <token>` by non-browser clients.
An invalid or missing token gets an `error` message and the socket is closed with code `4401`.
All subscriptions are scoped to the tenant in the token; clients never receive another tenant's events.

## Channels

- `<entityType>`: every change of that type, e.g. `issue`
- `<entityType>:<id>`: a single entity, e.g. `issue:3f2c...`

Entity types: `issue`, `problem`, `change`, `request`, `incident`, `notification`.
Each connection may hold up to 100 channels. Currently the issues service publishes
`created` and `updated` events; other types can publish with `publishEntityChange()` from
`src/lib/websocket/realtime-bridge.ts`.

## Client to server messages

```json
{ "type": "subscribe", "channel": "issue:123" }
{ "type": "unsubscribe", "channel": "issue:123" }
{ "type": "presence", "channel": "issue:123", "state": "viewing" | "editing" | "idle" }
{ "type": "ping" }
```

Sending `presence` subscribes the connection to the channel if needed.

## Server to client messages

```json
{ "type": "connected", "userId": "..." }
{ "type": "subscribed", "channel": "issue:123" }
{ "type": "unsubscribed", "channel": "issue:123" }
{ "type": "event", "channel": "issue", "event": { "tenantSlug": "...", "entityType": "issue", "entityId": "...", "action": "updated", "actorId": "...", "data": { "changes": {} }, "timestamp": "..." } }
{ "type": "presence", "channel": "issue:123", "users": [{ "userId": "...", "state": "editing", "since": "..." }], "collision": true }
{ "type": "pong" }
{ "type": "error", "message": "invalid channel" }
```

`collision` is `true` when two or more distinct users are `editing` the same channel.
Presence is removed when a connection unsubscribes or disconnects.

## Multi-instance delivery

Events are published to the Redis Pub/Sub channel `firelater:realtime:events`. Each API
instance subscribes with a dedicated Redis connection and forwards events to its local
subscribers, so a change made on one instance reaches clients connected to any instance.

## Conflict resolution

`PUT /v1/issues/:id` accepts an optional `expectedVersion` (the `updated_at` value the client
edited). If the issue has changed since then, the API returns `409 Conflict`; the client should
reload the issue, merge its edits and retry.

## React client usage

`useWebSocket` (`frontend/src/hooks/useWebSocket.ts`) manages one connection:

- Auto reconnect with exponential backoff (1s, 2s, 4s ... capped at 30s)
- Resubscribes every active channel after a reconnect (state recovery)
- After 5 failed reconnect attempts, or on an auth rejection (`4401`), status becomes
  `fallback`; the hook retries the socket every 60s

`useRealtimeEntity` (`frontend/src/hooks/useRealtimeEntity.ts`) builds on it:

```tsx
import { useRealtimeEntity } from '@/hooks/useRealtimeEntity';

function IssueDetail({ id }: { id: string }) {
  const { status, presenceUsers, collision } = useRealtimeEntity('issue', id, {
    queryKeys: [['issues', id]],   // invalidated on every change event
    presence: 'viewing',           // set to 'editing' while the edit form is open
    pollIntervalMs: 30000,         // polling fallback while status === 'fallback'
  });
  // render a warning when collision is true
}
```

While the socket is in fallback, `useRealtimeEntity` invalidates the given query keys on
`pollIntervalMs`, so data stays fresh through polling.
