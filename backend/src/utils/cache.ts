import { redis } from '../config/redis.js';
import { logger } from './logger.js';

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
}

const DEFAULT_TTL = 300; // 5 minutes
const DEFAULT_PREFIX = 'cache';

/**
 * Cache wrapper for expensive operations
 * Implements get-or-set pattern with automatic serialization
 */
export class CacheService {
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
      compress = false,
    } = options;

    const cacheKey = `${prefix}:${key}`;

    try {
      // Try to get from cache
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ key: cacheKey }, 'Cache hit');
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

    // Cache miss or error - fetch fresh data
    const data = await fetcher();

    // Try to cache the result (non-blocking)
    this.set(cacheKey, data, ttl).catch((err) => {
      logger.error({ err, key: cacheKey }, 'Failed to cache data');
    });

    return data;
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
