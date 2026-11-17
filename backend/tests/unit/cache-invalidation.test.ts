import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory fake Redis with Pub/Sub shared between "instances"
const store = vi.hoisted(() => {
  const data = new Map<string, string>();
  const subs: Array<(channel: string, msg: string) => void> = [];
  const toRe = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return { data, subs, toRe };
});

vi.mock('../../src/config/redis.js', () => ({
  redis: {
    get: async (k: string) => store.data.get(k) ?? null,
    setex: async (k: string, _t: number, v: string) => {
      store.data.set(k, v);
      return 'OK';
    },
    exists: async (k: string) => (store.data.has(k) ? 1 : 0),
    del: async (...ks: string[]) => ks.filter((k) => store.data.delete(k)).length,
    scan: async (_c: string, _m: string, pattern: string) => {
      const re = store.toRe(pattern);
      return ['0', [...store.data.keys()].filter((k) => re.test(k))];
    },
    publish: async (channel: string, msg: string) => {
      store.subs.forEach((s) => s(channel, msg));
      return store.subs.length;
    },
    duplicate: () => {
      let handler: ((c: string, m: string) => void) | undefined;
      return {
        on: (e: string, fn: (c: string, m: string) => void) => {
          if (e === 'message') handler = fn;
        },
        subscribe: async () => {
          if (handler) store.subs.push(handler);
        },
        quit: async () => undefined,
      };
    },
  },
}));

import { CacheService, buildCacheKey, CACHE_CHANNEL, cacheService } from '../../src/utils/cache.js';
import { cacheEvents } from '../../src/utils/cacheEvents.js';
import { cacheMetrics } from '../../src/utils/cacheMetrics.js';
import { resolveInvalidations } from '../../src/utils/cacheDependencies.js';

const seed = (...keys: string[]) => keys.forEach((k) => store.data.set(k, JSON.stringify({ k })));
const tick = () => new Promise((r) => setTimeout(r, 10));

describe('cache invalidation strategy', () => {
  beforeEach(() => {
    store.data.clear();
    store.subs.length = 0;
    cacheMetrics.reset();
  });

  describe('granular keys', () => {
    it('builds stable operation-specific keys regardless of param order', () => {
      expect(buildCacheKey('acme', 'applications', 'list', { b: 1, a: 2 })).toBe(
        buildCacheKey('acme', 'applications', 'list', { a: 2, b: 1 })
      );
      expect(buildCacheKey('acme', 'applications', 'app', 'x1')).toBe('acme:applications:app:x1');
      expect(buildCacheKey('acme', 'ns', 'op')).toBe('acme:ns:op');
      expect(buildCacheKey('acme', 'ns', 'op', { big: 'x'.repeat(500) }).length).toBeLessThan(80);
    });
  });

  describe('dependency graph', () => {
    it('invalidates only the entity detail, lists and dependents', () => {
      const p = resolveInvalidations('acme', 'application', 'a1');
      expect(p).toContain('cache:acme:applications:app:a1');
      expect(p).toContain('cache:acme:applications:list:*');
      expect(p).toContain('cache:acme:issues:list:*');
      expect(p).toContain('cache:acme:dashboard:*');
      expect(p).not.toContain('cache:acme:applications:app:*');
      expect(p).not.toContain('cache:acme:issues:issue:*');
      expect(p.every((x) => x.startsWith('cache:acme:'))).toBe(true);
    });

    it('falls back to the entity namespace (not the tenant) for unknown entities', () => {
      expect(resolveInvalidations('acme', 'widget', '1')).toEqual(['cache:acme:widget:*']);
    });

    it('wider pattern subsumes narrower ones', () => {
      const p = resolveInvalidations('acme', 'application');
      expect(p).toContain('cache:acme:applications:*');
      expect(p).not.toContain('cache:acme:applications:list:*');
    });
  });

  describe('event-driven invalidation', () => {
    it('removes affected keys and keeps unrelated ones', async () => {
      seed(
        'cache:acme:applications:app:a1',
        'cache:acme:applications:app:a2',
        'cache:acme:applications:list:{}',
        'cache:acme:issues:list:{}',
        'cache:acme:issues:issue:i1',
        'cache:acme:dashboard:overview',
        'cache:acme:kb:article:k1',
        'cache:other:applications:app:a1'
      );
      await cacheEvents.emit({ tenantSlug: 'acme', entity: 'application', id: 'a1', action: 'update' });
      expect([...store.data.keys()].sort()).toEqual([
        'cache:acme:applications:app:a2',
        'cache:acme:issues:issue:i1',
        'cache:acme:kb:article:k1',
        'cache:other:applications:app:a1',
      ]);
    });

    it('notifies subscribers with the invalidated patterns', async () => {
      const seen: unknown[] = [];
      const off = cacheEvents.subscribe('application', (e, ctx) => {
        seen.push([e.id, ctx.remote, ctx.patterns.includes('cache:acme:applications:app:z')]);
      });
      await cacheEvents.emit({ tenantSlug: 'acme', entity: 'application', id: 'z', action: 'delete' });
      off();
      await cacheEvents.emit({ tenantSlug: 'acme', entity: 'application', id: 'z', action: 'delete' });
      expect(seen).toEqual([['z', false, true]]);
    });

    it('a failing subscriber does not break the emit', async () => {
      const off = cacheEvents.subscribe('*', () => {
        throw new Error('boom');
      });
      await expect(cacheEvents.emit({ tenantSlug: 'acme', entity: 'issue', action: 'create' })).resolves.toBeTypeOf('number');
      off();
    });
  });

  describe('stale-while-revalidate', () => {
    it('serves stale immediately and refreshes in the background', async () => {
      const key = 'acme:dashboard:swr';
      let version = 1;
      const fetcher = vi.fn(async () => ({ v: version }));
      const opts = { ttl: 60, staleTtl: 300 };

      expect(await cacheService.getOrSet(key, fetcher, opts)).toEqual({ v: 1 });
      await tick();

      await cacheService.getOrSet(key, fetcher, opts); // fresh hit
      expect(fetcher).toHaveBeenCalledTimes(1);

      store.data.delete('cache:' + key + '::fresh'); // fresh window elapsed
      version = 2;
      expect(await cacheService.getOrSet(key, fetcher, opts)).toEqual({ v: 1 }); // stale served
      await cacheService.settleRefreshes();
      expect(fetcher).toHaveBeenCalledTimes(2);

      expect(await cacheService.getOrSet(key, fetcher, opts)).toEqual({ v: 2 });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(cacheMetrics.total('firelater_cache_stale_hits_total')).toBe(1);
    });

    it('keeps the stale value when the refresh fails', async () => {
      const key = 'acme:dashboard:swr-fail';
      const opts = { ttl: 60, staleTtl: 300 };
      await cacheService.getOrSet(key, async () => ({ v: 1 }), opts);
      await tick();
      store.data.delete('cache:' + key + '::fresh');
      const res = await cacheService.getOrSet(
        key,
        async () => {
          throw new Error('db down');
        },
        opts
      );
      await cacheService.settleRefreshes();
      expect(res).toEqual({ v: 1 });
      expect(JSON.parse(store.data.get('cache:' + key)!)).toEqual({ v: 1 });
    });
  });

  describe('metrics', () => {
    it('counts hits, misses and renders Prometheus text', async () => {
      const f = async () => 1;
      await cacheService.getOrSet('acme:applications:app:m1', f);
      await tick();
      await cacheService.getOrSet('acme:applications:app:m1', f);
      expect(cacheMetrics.total('firelater_cache_misses_total')).toBe(1);
      expect(cacheMetrics.total('firelater_cache_hits_total')).toBe(1);
      expect(cacheMetrics.missRatio()).toBeCloseTo(0.5);
      const text = cacheMetrics.render();
      expect(text).toContain('# TYPE firelater_cache_hits_total counter');
      expect(text).toContain('firelater_cache_misses_total{namespace="applications"} 1');
    });
  });

  describe('Pub/Sub multi-instance sync', () => {
    it('drops the L1 entry on another instance and ignores own messages', async () => {
      const a = new CacheService();
      const b = new CacheService();
      await a.startPubSub();
      await b.startPubSub();

      const key = 'acme:applications:app:p1';
      let v = 1;
      const opts = { ttl: 60, localTtl: 60 };
      expect(await b.getOrSet(key, async () => v, opts)).toBe(1);
      await tick();
      v = 2;
      expect(await b.getOrSet(key, async () => v, opts)).toBe(1); // served from B's L1

      await a.invalidate('cache:' + key); // A mutates: Redis delete + publish
      expect(await b.getOrSet(key, async () => v, opts)).toBe(2); // B's L1 was dropped
      expect(cacheMetrics.total('firelater_cache_pubsub_messages_total')).toBeGreaterThanOrEqual(2);

      const handler = vi.fn();
      a.onMessage(handler);
      a.handleMessage(JSON.stringify({ origin: a.instanceId, type: 'invalidate', pattern: 'x' }));
      expect(handler).not.toHaveBeenCalled();
      a.handleMessage('not json');
    });

    it('delivers cache events to subscribers on other instances', async () => {
      const got: boolean[] = [];
      const off = cacheEvents.subscribe('problem', (_e, ctx) => {
        got.push(ctx.remote);
      });
      cacheService.handleMessage(
        JSON.stringify({ origin: 'other', type: 'event', event: { tenantSlug: 'acme', entity: 'problem', id: '1', action: 'update' } })
      );
      await tick();
      off();
      expect(got).toEqual([true]);
      expect(CACHE_CHANNEL).toBe('firelater:cache:invalidate');
    });
  });
});
