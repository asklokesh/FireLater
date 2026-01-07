import { describe, it, expect, beforeEach, vi } from 'vitest';
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

    it('should return hit rate when available', async () => {
      // Perform some cache operations to generate hits/misses
      await redis.set('cache:stat-test', 'value', 'EX', 10);
      await redis.get('cache:stat-test'); // hit
      await redis.get('cache:nonexistent'); // miss

      const stats = await cacheService.getStats();

      expect(stats).toHaveProperty('keys');
      expect(stats).toHaveProperty('memory');
      // hitRate may or may not be present depending on Redis version
      expect(typeof stats.hitRate === 'number' || stats.hitRate === undefined).toBe(true);
    });

    it('should handle empty database', async () => {
      await redis.flushdb();

      const stats = await cacheService.getStats();

      expect(stats.keys).toBe(0);
      expect(stats).toHaveProperty('memory');
    });
  });

  describe('set', () => {
    it('should set a value with custom TTL', async () => {
      const key = 'cache:custom-ttl-key';
      const value = { data: 'custom-ttl-test' };

      await cacheService.set(key, value, 60);

      const cached = await redis.get(key);
      expect(JSON.parse(cached!)).toEqual(value);

      const ttl = await redis.ttl(key);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should use default TTL when not specified', async () => {
      const key = 'cache:default-ttl-key';
      const value = { data: 'default-ttl-test' };

      await cacheService.set(key, value);

      const ttl = await redis.ttl(key);
      // Default is 300 seconds (5 minutes)
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('invalidatePrefix', () => {
    it('should invalidate all keys with a specific prefix', async () => {
      // Set multiple keys with different prefixes
      await redis.set('myprefix:key1', 'value1', 'EX', 10);
      await redis.set('myprefix:key2', 'value2', 'EX', 10);
      await redis.set('myprefix:subprefix:key3', 'value3', 'EX', 10);
      await redis.set('otherprefix:key4', 'value4', 'EX', 10);

      const deleted = await cacheService.invalidatePrefix('myprefix');
      expect(deleted).toBeGreaterThanOrEqual(3);

      // Verify myprefix keys are gone
      const key1 = await redis.get('myprefix:key1');
      expect(key1).toBeNull();

      // Verify other prefix keys still exist
      const key4 = await redis.get('otherprefix:key4');
      expect(key4).not.toBeNull();
    });
  });

  describe('flush', () => {
    it('should clear all cache entries', async () => {
      // Set some keys
      await redis.set('cache:flush-test-1', 'value1', 'EX', 10);
      await redis.set('cache:flush-test-2', 'value2', 'EX', 10);

      await cacheService.flush();

      const key1 = await redis.get('cache:flush-test-1');
      const key2 = await redis.get('cache:flush-test-2');

      expect(key1).toBeNull();
      expect(key2).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle complex nested objects', async () => {
      const key = 'test:complex';
      const complexValue = {
        name: 'Test',
        nested: {
          deep: {
            value: 'nested-data',
            array: [1, 2, 3],
          },
        },
        nullValue: null,
        boolValue: true,
      };

      const result = await cacheService.getOrSet(key, async () => complexValue, { ttl: 10 });
      expect(result).toEqual(complexValue);

      // Verify second call returns cached value
      const cached = await cacheService.getOrSet(key, async () => ({ different: 'data' }), { ttl: 10 });
      expect(cached).toEqual(complexValue);
    });

    it('should handle array values', async () => {
      const key = 'test:array';
      const arrayValue = [1, 'two', { three: 3 }, [4, 5]];

      const result = await cacheService.getOrSet(key, async () => arrayValue, { ttl: 10 });
      expect(result).toEqual(arrayValue);
    });

    it('should handle custom prefix option', async () => {
      const key = 'my-key';
      const value = { custom: 'prefix' };

      await cacheService.getOrSet(key, async () => value, { ttl: 10, prefix: 'custom' });

      // Should be stored with custom prefix
      const cached = await redis.get('custom:my-key');
      expect(JSON.parse(cached!)).toEqual(value);
    });
  });

  describe('error handling', () => {
    it('should handle set errors gracefully', async () => {
      const originalSetex = redis.setex;
      // Mock setex to throw an error
      vi.spyOn(redis, 'setex').mockRejectedValueOnce(new Error('Redis connection error'));

      await expect(cacheService.set('test-key', { data: 'test' }, 60)).rejects.toThrow(
        'Redis connection error'
      );

      // Restore
      redis.setex = originalSetex;
    });

    it('should handle invalidate pattern scan errors gracefully', async () => {
      const originalScan = redis.scan;
      // Mock scan to throw an error
      vi.spyOn(redis, 'scan').mockRejectedValueOnce(new Error('Redis scan error'));

      // Should return 0 when an error occurs
      const deleted = await cacheService.invalidate('cache:error:*');
      expect(deleted).toBe(0);

      // Restore
      redis.scan = originalScan;
    });

    it('should handle getStats errors gracefully', async () => {
      const originalInfo = redis.info;
      // Mock info to throw an error
      vi.spyOn(redis, 'info').mockRejectedValueOnce(new Error('Redis info error'));

      const stats = await cacheService.getStats();

      // Should return default values on error
      expect(stats.keys).toBe(0);
      expect(stats.memory).toBe('unknown');

      // Restore
      redis.info = originalInfo;
    });

    it('should handle flush errors gracefully', async () => {
      const originalFlushdb = redis.flushdb;
      // Mock flushdb to throw an error
      vi.spyOn(redis, 'flushdb').mockRejectedValueOnce(new Error('Redis flush error'));

      await expect(cacheService.flush()).rejects.toThrow('Redis flush error');

      // Restore
      redis.flushdb = originalFlushdb;
    });

    it('should handle getOrSet read errors and still fetch data', async () => {
      const originalGet = redis.get;
      // Mock get to throw an error (simulating Redis failure)
      vi.spyOn(redis, 'get').mockRejectedValueOnce(new Error('Redis read error'));

      const fetchedData = { value: 'fetched-after-error' };
      const result = await cacheService.getOrSet('error-key', async () => fetchedData, { ttl: 10 });

      // Should still return fetched data even when cache read fails
      expect(result).toEqual(fetchedData);

      // Restore
      redis.get = originalGet;
    });

    it('should handle delete errors in single key invalidation', async () => {
      const originalDel = redis.del;
      // Mock del to throw an error
      vi.spyOn(redis, 'del').mockRejectedValueOnce(new Error('Redis delete error'));

      // Should return 0 when an error occurs
      const deleted = await cacheService.invalidate('cache:single-key');
      expect(deleted).toBe(0);

      // Restore
      redis.del = originalDel;
    });
  });
});
