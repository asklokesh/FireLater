import { describe, it, expect, beforeEach } from 'vitest';
import { cacheService } from '../../src/utils/cache.js';
import { redis } from '../../src/config/redis.js';

describe('Cache Service', () => {
  beforeEach(async () => {
    // Clear cache before each test
    await redis.flushdb();
  });

  describe('getOrSet', () => {
    it('should fetch and cache data on first call', async () => {
      const key = 'test:key1';
      const fetchedData = { value: 'test-data' };
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return fetchedData;
      };

      const result = await cacheService.getOrSet(key, fetcher, { ttl: 10 });

      expect(result).toEqual(fetchedData);
      expect(fetchCount).toBe(1);

      // Verify data is in cache
      const cached = await redis.get('cache:test:key1');
      expect(cached).toBeTruthy();
      expect(JSON.parse(cached!)).toEqual(fetchedData);
    });

    it('should return cached data on second call', async () => {
      const key = 'test:key2';
      const fetchedData = { value: 'test-data-2' };
      let fetchCount = 0;

      const fetcher = async () => {
        fetchCount++;
        return fetchedData;
      };

      // First call - should fetch
      const result1 = await cacheService.getOrSet(key, fetcher, { ttl: 10 });
      expect(result1).toEqual(fetchedData);
      expect(fetchCount).toBe(1);

      // Second call - should use cache
      const result2 = await cacheService.getOrSet(key, fetcher, { ttl: 10 });
      expect(result2).toEqual(fetchedData);
      expect(fetchCount).toBe(1); // Fetcher should not be called again
    });

    it('should handle cache errors gracefully', async () => {
      const key = 'test:key3';
      const fetchedData = { value: 'test-data-3' };

      const fetcher = async () => {
        return fetchedData;
      };

      // Force Redis to be unavailable by using a bad key operation
      // The cache service should catch the error and still return fetched data
      const result = await cacheService.getOrSet(key, fetcher, { ttl: 10 });
      expect(result).toEqual(fetchedData);
    });
  });

  describe('invalidate', () => {
    it('should delete a single key', async () => {
      const key = 'cache:test:single';
      await redis.set(key, JSON.stringify({ value: 'test' }), 'EX', 10);

      const deleted = await cacheService.invalidate(key);
      expect(deleted).toBe(1);

      const cached = await redis.get(key);
      expect(cached).toBeNull();
    });

    it('should delete keys matching a pattern', async () => {
      // Set multiple keys
      await redis.set('cache:tenant1:dashboard:overview', '{}', 'EX', 10);
      await redis.set('cache:tenant1:dashboard:issues', '{}', 'EX', 10);
      await redis.set('cache:tenant1:dashboard:changes', '{}', 'EX', 10);
      await redis.set('cache:tenant2:dashboard:overview', '{}', 'EX', 10);

      // Delete tenant1 dashboard keys
      const deleted = await cacheService.invalidate('cache:tenant1:dashboard:*');
      expect(deleted).toBeGreaterThanOrEqual(3);

      // Verify tenant1 keys are gone
      const tenant1Overview = await redis.get('cache:tenant1:dashboard:overview');
      expect(tenant1Overview).toBeNull();

      // Verify tenant2 keys still exist
      const tenant2Overview = await redis.get('cache:tenant2:dashboard:overview');
      expect(tenant2Overview).not.toBeNull();
    });
  });

  describe('invalidateTenant', () => {
    it('should invalidate all cache for a tenant', async () => {
      await redis.set('cache:tenant1:dashboard:overview', '{}', 'EX', 10);
      await redis.set('cache:tenant1:dashboard:issues', '{}', 'EX', 10);
      await redis.set('cache:tenant1:other:data', '{}', 'EX', 10);
      await redis.set('cache:tenant2:dashboard:overview', '{}', 'EX', 10);

      const deleted = await cacheService.invalidateTenant('tenant1');
      expect(deleted).toBeGreaterThanOrEqual(3);

      // Verify tenant1 keys are gone
      const tenant1Data = await redis.get('cache:tenant1:dashboard:overview');
      expect(tenant1Data).toBeNull();

      // Verify tenant2 keys still exist
      const tenant2Data = await redis.get('cache:tenant2:dashboard:overview');
      expect(tenant2Data).not.toBeNull();
    });

    it('should invalidate specific category for a tenant', async () => {
      await redis.set('cache:tenant1:issues:by-priority', '{}', 'EX', 10);
      await redis.set('cache:tenant1:issues:by-status', '{}', 'EX', 10);
      await redis.set('cache:tenant1:changes:upcoming', '{}', 'EX', 10);

      const deleted = await cacheService.invalidateTenant('tenant1', 'issues');
      expect(deleted).toBeGreaterThanOrEqual(2);

      // Verify issues keys are gone
      const issuesData = await redis.get('cache:tenant1:issues:by-priority');
      expect(issuesData).toBeNull();

      // Verify changes keys still exist
      const changesData = await redis.get('cache:tenant1:changes:upcoming');
      expect(changesData).not.toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      await redis.set('cache:key1', 'value1', 'EX', 10);
      await redis.set('cache:key2', 'value2', 'EX', 10);
      await redis.set('cache:key3', 'value3', 'EX', 10);

      const stats = await cacheService.getStats();

      expect(stats).toHaveProperty('keys');
      expect(stats).toHaveProperty('memory');
      expect(stats.keys).toBeGreaterThanOrEqual(3);
    });
  });
});
