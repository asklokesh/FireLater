import { redis } from '../config/redis.js';
import { randomUUID, createHash } from 'node:crypto';
import { logger } from './logger.js';
import { cacheMetrics, namespaceOf } from './cacheMetrics.js';

// ============================================
// REDIS CACHING UTILITY
// ============================================

export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number;
  /** Key prefix for namespacing */
  prefix?: string;
  /** Whether to compress large payloads (>10KB) */
  compress?: boolean;
  /**
   * Stale-while-revalidate window in seconds. When set, a value older than `ttl` (but younger than
   * `ttl + staleTtl`) is returned immediately and refreshed in the background. Use only for
   * non-critical data.
   */
  staleTtl?: number;
  /** In-process (L1) cache lifetime in seconds; other instances drop it via Pub/Sub invalidation. */
  localTtl?: number;
}

export interface CacheMessage {
  origin: string;
  type: 'invalidate' | 'event';
  /** invalidate: key or glob pattern */
  pattern?: string;
  /** event: serialized cache event */
  event?: unknown;
}

const DEFAULT_TTL = 300; // 5 minutes
const DEFAULT_PREFIX = 'cache';
export const CACHE_CHANNEL = 'firelater:cache:invalidate';
const MAX_LOCAL_ENTRIES = 1000;

/** Convert a Redis glob (only `*` supported) to a RegExp */
function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Build a granular cache key: `<tenant>:<namespace>:<operation>[:<params>]`. Long params are hashed. */
export function buildCacheKey(
  tenantSlug: string,
  namespace: string,
  operation: string,
  params?: unknown
): string {
  const base = `${tenantSlug}:${namespace}:${operation}`;
  if (params === undefined || params === null) return base;
  const raw = typeof params === 'string' ? params : JSON.stringify(sortKeys(params));
  const part = raw.length > 120 ? createHash('sha1').update(raw).digest('hex') : raw;
  return `${base}:${part}`;
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, val]) => [k, sortKeys(val)])
    );
  }
  return v;
}

/**
 * Cache wrapper for expensive operations
 * Implements get-or-set pattern with automatic serialization
 */
export class CacheService {
  /** Unique id of this process, used to ignore our own Pub/Sub messages */
  readonly instanceId = randomUUID();
  private local = new Map<string, { value: string; expires: number }>();
  private refreshing = new Map<string, Promise<void>>();
  private subscriber: { quit(): unknown; subscribe(...a: string[]): Promise<unknown>; on(e: string, fn: (...a: any[]) => void): unknown } | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  private messageHandlers = new Set<(msg: CacheMessage) => void>();

  /**
   * Get cached value or execute function and cache result
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const {
      ttl = DEFAULT_TTL,
      prefix = DEFAULT_PREFIX,
      compress: _compress = false,
    } = options;

    const cacheKey = `${prefix}:${key}`;
    const ns = namespaceOf(cacheKey);
    const { staleTtl = 0, localTtl = 0 } = options;

    // L1 (in-process) read
    if (localTtl > 0) {
      const entry = this.local.get(cacheKey);
      if (entry && entry.expires > Date.now()) {
        cacheMetrics.inc('firelater_cache_hits_total', { namespace: ns, layer: 'local' });
        return JSON.parse(entry.value) as T;
      }
      if (entry) this.local.delete(cacheKey);
    }

    try {
      // Try to get from cache
      const cached = await redis.get(cacheKey);
      if (cached) {
        const fresh = staleTtl > 0 ? await redis.exists(this.freshKey(cacheKey)) : 1;
        if (fresh) {
          logger.debug({ key: cacheKey }, 'Cache hit');
          cacheMetrics.inc('firelater_cache_hits_total', { namespace: ns, layer: 'redis' });
          if (localTtl > 0) this.setLocal(cacheKey, cached, localTtl);
          return JSON.parse(cached) as T;
        }
        // Stale: serve it and refresh in the background
        logger.debug({ key: cacheKey }, 'Cache stale, revalidating');
        cacheMetrics.inc('firelater_cache_stale_hits_total', { namespace: ns });
        this.revalidate(cacheKey, fetcher, ttl, staleTtl);
        return JSON.parse(cached) as T;
      }

      logger.debug({ key: cacheKey }, 'Cache miss');
    } catch (cacheError) {
      // Redis read failure - log and continue with fetch
      logger.warn(
        { err: cacheError, key: cacheKey },
        'Failed to read from cache, fetching fresh data'
      );
    }

    cacheMetrics.inc('firelater_cache_misses_total', { namespace: ns });

    // Cache miss or error - fetch fresh data
    const data = await fetcher();

    // Try to cache the result (non-blocking)
    this.set(cacheKey, data, ttl + staleTtl)
      .then(() => (staleTtl > 0 ? redis.setex(this.freshKey(cacheKey), ttl, '1') : undefined))
      .catch((err) => {
        logger.error({ err, key: cacheKey }, 'Failed to cache data');
      });
    if (localTtl > 0) this.setLocal(cacheKey, JSON.stringify(data), localTtl);

    return data;
  }

  private freshKey(cacheKey: string): string {
    return `${cacheKey}::fresh`;
  }

  private setLocal(key: string, value: string, ttlSeconds: number): void {
    if (this.local.size >= MAX_LOCAL_ENTRIES) {
      const oldest = this.local.keys().next().value;
      if (oldest !== undefined) this.local.delete(oldest);
    }
    this.local.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  }

  private revalidate<T>(cacheKey: string, fetcher: () => Promise<T>, ttl: number, staleTtl: number): void {
    if (this.refreshing.has(cacheKey)) return; // dedupe concurrent refreshes
    const p = (async () => {
      try {
        const data = await fetcher();
        await this.set(cacheKey, data, ttl + staleTtl);
        await redis.setex(this.freshKey(cacheKey), ttl, '1');
      } catch (err) {
        logger.warn({ err, key: cacheKey }, 'Background cache revalidation failed; stale value kept');
      } finally {
        this.refreshing.delete(cacheKey);
      }
    })();
    this.refreshing.set(cacheKey, p);
  }

  /** Resolves once all background revalidations started so far have finished (used by tests/shutdown). */
  async settleRefreshes(): Promise<void> {
    await Promise.all([...this.refreshing.values()]);
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, value: T, ttl: number = DEFAULT_TTL): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(key, ttl, serialized);
      logger.debug({ key, ttl }, 'Cached data');
    } catch (error) {
      logger.error({ err: error, key }, 'Failed to set cache');
      throw error;
    }
  }

  /**
   * Delete a single key or pattern
   */
  async invalidate(pattern: string): Promise<number> {
    const deleted = await this.invalidateLocalAndRedis(pattern);
    this.publish({ origin: this.instanceId, type: 'invalidate', pattern });
    return deleted;
  }

  /** Invalidate several keys/patterns (one Pub/Sub message each) */
  async invalidateMany(patterns: string[]): Promise<number> {
    let total = 0;
    for (const p of patterns) total += await this.invalidate(p);
    return total;
  }

  private async invalidateLocalAndRedis(pattern: string): Promise<number> {
    this.dropLocal(pattern);
    cacheMetrics.inc('firelater_cache_invalidations_total', { namespace: namespaceOf(pattern) });
    const n = await this.invalidateRedis(pattern);
    if (n > 0) cacheMetrics.inc('firelater_cache_invalidated_keys_total', { namespace: namespaceOf(pattern) }, n);
    return n;
  }

  private dropLocal(pattern: string): void {
    if (this.local.size === 0) return;
    if (!pattern.includes('*')) {
      this.local.delete(pattern);
      return;
    }
    const re = globToRegExp(pattern);
    for (const k of this.local.keys()) if (re.test(k)) this.local.delete(k);
  }

  private async invalidateRedis(pattern: string): Promise<number> {
    try {
      // If pattern contains wildcards, use scan and delete
      if (pattern.includes('*')) {
        let cursor = '0';
        let deleted = 0;

        do {
          const [nextCursor, keys] = await redis.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100
          );
          cursor = nextCursor;

          if (keys.length > 0) {
            deleted += await redis.del(...keys);
          }
        } while (cursor !== '0');

        logger.debug({ pattern, deleted }, 'Invalidated cache pattern');
        return deleted;
      } else {
        // Single key deletion
        const deleted = await redis.del(pattern);
        logger.debug({ key: pattern, deleted }, 'Invalidated cache key');
        return deleted;
      }
    } catch (error) {
      logger.error({ err: error, pattern }, 'Failed to invalidate cache');
      return 0;
    }
  }

  /**
   * Invalidate all cache keys with a specific prefix
   */
  async invalidatePrefix(prefix: string): Promise<number> {
    return this.invalidate(`${prefix}:*`);
  }

  /**
   * Invalidate tenant-specific cache
   */
  async invalidateTenant(tenantSlug: string, category?: string): Promise<number> {
    const pattern = category
      ? `${DEFAULT_PREFIX}:${tenantSlug}:${category}:*`
      : `${DEFAULT_PREFIX}:${tenantSlug}:*`;

    return this.invalidate(pattern);
  }

  // ---------- Redis Pub/Sub cross-instance sync ----------

  /** Publish a message to other instances. Never throws: Redis is the source of truth. */
  publish(msg: CacheMessage): void {
    try {
      const r = redis.publish(CACHE_CHANNEL, JSON.stringify(msg)) as unknown as Promise<unknown> | undefined;
      cacheMetrics.inc('firelater_cache_pubsub_messages_total', { direction: 'sent' });
      r?.catch?.((err: unknown) => logger.warn({ err }, 'Failed to publish cache message'));
    } catch (err) {
      logger.warn({ err }, 'Failed to publish cache message');
    }
  }

  /** Register a handler for messages from other instances (own messages are filtered out). */
  onMessage(handler: (msg: CacheMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /** Handle a raw Pub/Sub payload. Exposed for tests. */
  handleMessage(raw: string): void {
    let msg: CacheMessage;
    try {
      msg = JSON.parse(raw) as CacheMessage;
    } catch {
      logger.warn('Ignoring malformed cache Pub/Sub message');
      return;
    }
    if (!msg || msg.origin === this.instanceId) return;
    cacheMetrics.inc('firelater_cache_pubsub_messages_total', { direction: 'received' });
    if (msg.type === 'invalidate' && typeof msg.pattern === 'string') this.dropLocal(msg.pattern);
    for (const h of this.messageHandlers) {
      try {
        h(msg);
      } catch (err) {
        logger.error({ err }, 'Cache message handler failed');
      }
    }
  }

  /** Subscribe this instance to cache invalidation messages (idempotent). */
  async startPubSub(): Promise<void> {
    if (this.subscriber) return;
    const sub = redis.duplicate();
    sub.on('message', (_channel: string, raw: string) => this.handleMessage(raw));
    sub.on('error', (err: unknown) => logger.error({ err }, 'Cache subscriber error'));
    await sub.subscribe(CACHE_CHANNEL);
    this.subscriber = sub;
    logger.info({ instanceId: this.instanceId }, 'Cache Pub/Sub subscribed');
  }

  async stopPubSub(): Promise<void> {
    const sub = this.subscriber;
    this.subscriber = null;
    if (sub) await sub.quit();
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ keys: number; memory: string; hitRate?: number }> {
    try {
      const info = await redis.info('stats');
      const keyspace = await redis.info('keyspace');

      // Parse key count from keyspace info
      const dbMatch = keyspace.match(/db0:keys=(\d+)/);
      const keys = dbMatch ? parseInt(dbMatch[1], 10) : 0;

      // Parse hit rate if available
      const hitsMatch = info.match(/keyspace_hits:(\d+)/);
      const missesMatch = info.match(/keyspace_misses:(\d+)/);

      let hitRate: number | undefined;
      if (hitsMatch && missesMatch) {
        const hits = parseInt(hitsMatch[1], 10);
        const misses = parseInt(missesMatch[1], 10);
        const total = hits + misses;
        hitRate = total > 0 ? (hits / total) * 100 : undefined;
      }

      // Get memory usage
      const memInfo = await redis.info('memory');
      const memMatch = memInfo.match(/used_memory_human:(.+)/);
      const memory = memMatch ? memMatch[1].trim() : 'unknown';

      return { keys, memory, hitRate };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get cache stats');
      return { keys: 0, memory: 'unknown' };
    }
  }

  /**
   * Clear all cache entries (use with caution)
   */
  async flush(): Promise<void> {
    try {
      await redis.flushdb();
      logger.warn('Flushed all cache data');
    } catch (error) {
      logger.error({ err: error }, 'Failed to flush cache');
      throw error;
    }
  }
}

export const cacheService = new CacheService();
