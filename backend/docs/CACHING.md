# Caching: patterns and best practices

Code: `src/utils/cache.ts`, `cacheEvents.ts`, `cacheDependencies.ts`, `cacheMetrics.ts`.
Tests: `tests/unit/cache-invalidation.test.ts`, `tests/unit/cache.test.ts`.

## Key convention (granular keys)

```
cache:<tenant>:<namespace>:<kind>:<id>      single entity   e.g. cache:acme:applications:app:<uuid>
cache:<tenant>:<namespace>:list:<filters>   list view       e.g. cache:acme:applications:list:{...}
```

Build keys with `buildCacheKey(tenant, namespace, operation, params?)`. Params are key-sorted, so equal
filters give equal keys, and values over 120 characters are hashed. `getOrSet` adds the `cache:` prefix.

## Invalidate with events, not with `invalidateTenant`

```ts
import { cacheEvents } from '../utils/cacheEvents.js';
await cacheEvents.emit({ tenantSlug, entity: 'application', id: app.id, action: 'update' });
```

`emit` resolves the affected key patterns through the dependency graph, deletes only those keys
(never the whole tenant), calls subscribers, and tells other instances. It does not throw on cache errors.
No service emits events yet: all services, including `applications.ts`, still call
`invalidateTenant(tenant, namespace)`, which keeps working; migrate them one at a time by emitting an event for their entity.

Subscribe in a service with `cacheEvents.subscribe('issue' | '*', (event, { remote, patterns }) => ...)`.
`remote` is true when the mutation happened on another instance.

## Dependency graph

`cacheDependencies.ts` registers entities (`registerEntity`) and edges (`registerDependency`).
An edge `application -> issue (lists)` means issue list caches embed application data, so an application
change also drops `issues:list:*` (but not individual issue keys). Scope `all` drops the whole namespace of
the dependent (used for `dashboard`). Edges are followed transitively; cycles are safe. An entity without
an id invalidates its whole namespace; an unregistered entity invalidates only `cache:<tenant>:<entity>:*`.

## Stale-while-revalidate

```ts
cacheService.getOrSet(key, fetcher, { ttl: 60, staleTtl: 300 });
```

After `ttl` the cached value is still served for up to `staleTtl` more seconds while one background refresh
runs (deduplicated per key). If the refresh fails the stale value stays. Use it for dashboards and reports,
never for data a user must see immediately after a write (invalidation still removes stale entries at once).

## Local (L1) cache and Redis Pub/Sub

`localTtl` (seconds) adds a small in-process cache in front of Redis. Every `invalidate` and every cache event is
published on the Redis channel `firelater:cache:invalidate`; other instances drop matching L1 entries and run
their event subscribers. An instance ignores its own messages. `cacheService.startPubSub()` is called at server
startup and `stopPubSub()` at shutdown. Redis stays the source of truth; a failed publish only logs a warning.

## Metrics

`GET /metrics` (Prometheus text format, no authentication, counters only, labelled by namespace) exposes
`firelater_cache_hits_total`, `firelater_cache_stale_hits_total`, `firelater_cache_misses_total`,
`firelater_cache_invalidations_total`, `firelater_cache_invalidated_keys_total`,
`firelater_cache_events_total`, `firelater_cache_pubsub_messages_total`. Miss ratio =
`misses / (hits + stale_hits + misses)`; compare it before and after migrating a service from
`invalidateTenant` to events. No improvement figure is claimed here: measure it on your own traffic with these counters.
The counters are implemented in-process (no `prom-client` dependency), per instance.

## Best practices

- Always put tenant first in the key; never share keys across tenants.
- Emit an event after the database write succeeded, not before.
- Prefer a detail key + list key per entity so one write clears a few keys, not the namespace.
- Add a dependency edge only when one entity's cached payload really embeds the other's data.
- Keep `localTtl` short (seconds); it is only a read optimisation.
