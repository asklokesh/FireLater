import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { knowledgeService } from '../../src/services/knowledge.js';
import { cacheService } from '../../src/utils/cache.js';
import { pool } from '../../src/config/database.js';

/**
 * Knowledge Base Redis Caching Tests (PERF-004)
 *
 * Verifies that:
 * 1. Article listing uses cacheService.getOrSet with 5-minute TTL
 * 2. Cache is invalidated on create/update/delete operations
 * 3. Search queries use the same caching mechanism
 * 4. Different query parameters create different cache keys
 * 5. Tenant isolation in cache keys
 */
describe('Knowledge Base Redis Caching (PERF-004)', () => {
  const testTenant = 'test-tenant';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cache Integration', () => {
    it('should use cacheService.getOrSet for article listing', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({
        articles: [],
        total: 0,
        page: 1,
        perPage: 20,
        pages: 0,
      });

      await knowledgeService.listArticles(testTenant, {}, { page: 1, perPage: 20 });

      // Verify cacheService.getOrSet was called
      expect(getOrSetSpy).toHaveBeenCalledTimes(1);

      getOrSetSpy.mockRestore();
    });

    it('should pass correct options to cache (5-min TTL)', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({ articles: [], total: 0, page: 1, perPage: 20, pages: 0 });

      await knowledgeService.listArticles(testTenant, {}, { page: 1, perPage: 20 });

      // Verify TTL is 300 seconds (5 minutes) as per PERF-004 requirement
      expect(getOrSetSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          ttl: 300,
        })
      );

      getOrSetSpy.mockRestore();
    });

    it('should include tenant, filters, and pagination in cache key', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({ articles: [], total: 0, page: 1, perPage: 20, pages: 0 });

      const filters = { status: 'published' };
      await knowledgeService.listArticles(testTenant, filters, { page: 2, perPage: 10 });

      // Verify cache key contains tenant slug
      const cacheKey = getOrSetSpy.mock.calls[0][0];
      expect(cacheKey).toContain(testTenant);
      expect(cacheKey).toContain('kb:articles');

      getOrSetSpy.mockRestore();
    });

    it('should create different cache keys for different tenants', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({ articles: [], total: 0, page: 1, perPage: 20, pages: 0 });

      await knowledgeService.listArticles('tenant-1', {}, { page: 1, perPage: 20 });
      await knowledgeService.listArticles('tenant-2', {}, { page: 1, perPage: 20 });

      const key1 = getOrSetSpy.mock.calls[0][0];
      const key2 = getOrSetSpy.mock.calls[1][0];

      // Keys should be different (tenant isolation)
      expect(key1).not.toBe(key2);
      expect(key1).toContain('tenant-1');
      expect(key2).toContain('tenant-2');

      getOrSetSpy.mockRestore();
    });

    it('should create different cache keys for different query parameters', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({ articles: [], total: 0, page: 1, perPage: 20, pages: 0 });

      await knowledgeService.listArticles(testTenant, { status: 'published' }, { page: 1, perPage: 20 });
      await knowledgeService.listArticles(testTenant, { status: 'draft' }, { page: 1, perPage: 20 });

      const key1 = getOrSetSpy.mock.calls[0][0];
      const key2 = getOrSetSpy.mock.calls[1][0];

      // Different filters = different keys
      expect(key1).not.toBe(key2);

      getOrSetSpy.mockRestore();
    });
  });

  describe('Search Caching', () => {
    it('should use same caching mechanism for search queries', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({ articles: [], total: 0, page: 1, perPage: 20, pages: 0 });

      // searchArticles internally calls listArticles
      await knowledgeService.searchArticles(testTenant, { q: 'test query' });

      // Verify caching was used
      expect(getOrSetSpy).toHaveBeenCalled();
      expect(getOrSetSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({ ttl: 300 })
      );

      getOrSetSpy.mockRestore();
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate cache when article is created', async () => {
      const invalidateSpy = vi.spyOn(cacheService, 'invalidate').mockResolvedValue(5);

      // Mock database calls
      const mockQuery = vi.spyOn(pool, 'query')
        .mockResolvedValueOnce({ rows: [{ current_value: 1 }], command: 'UPDATE', rowCount: 1, oid: 0, fields: [] })
        .mockResolvedValueOnce({
          rows: [{ id: '123', article_number: 'KB000001', title: 'Test', content: 'Test' }],
          command: 'INSERT',
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await knowledgeService.createArticle(testTenant, {
        title: 'Test Article',
        content: 'Test content',
        authorId: 'user-123',
      });

      // Verify cache invalidation was called with correct pattern
      // Uses invalidateTenant which creates pattern: cache:{tenantSlug}:kb:*
      expect(invalidateSpy).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.stringMatching(/cache:test-tenant:kb:\*/)
      );

      mockQuery.mockRestore();
      invalidateSpy.mockRestore();
    });

    it('should invalidate cache when article is updated', async () => {
      const invalidateSpy = vi.spyOn(cacheService, 'invalidate').mockResolvedValue(3);

      const mockQuery = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: '123', title: 'Updated' }],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await knowledgeService.updateArticle(testTenant, '123', { title: 'Updated Article' });

      expect(invalidateSpy).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.stringMatching(/cache:test-tenant:kb:\*/)
      );

      mockQuery.mockRestore();
      invalidateSpy.mockRestore();
    });

    it('should invalidate cache when article is deleted', async () => {
      const invalidateSpy = vi.spyOn(cacheService, 'invalidate').mockResolvedValue(2);

      const mockQuery = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ article_number: 'KB000001' }],
        command: 'DELETE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await knowledgeService.deleteArticle(testTenant, '123');

      expect(invalidateSpy).toHaveBeenCalled();
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.stringMatching(/cache:test-tenant:kb:\*/)
      );

      mockQuery.mockRestore();
      invalidateSpy.mockRestore();
    });

    it('should only invalidate cache for specific tenant', async () => {
      const invalidateSpy = vi.spyOn(cacheService, 'invalidate').mockResolvedValue(1);

      const mockQuery = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: '123', title: 'Updated' }],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await knowledgeService.updateArticle('tenant-alpha', '123', { title: 'Updated' });

      // Should invalidate tenant-alpha cache only
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.stringMatching(/cache:tenant-alpha:kb:\*/)
      );

      // Should NOT invalidate other tenants
      expect(invalidateSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/cache:tenant-beta:kb:\*/)
      );

      mockQuery.mockRestore();
      invalidateSpy.mockRestore();
    });

    it('should handle cache invalidation failures gracefully', async () => {
      // Mock invalidation to fail
      const invalidateSpy = vi.spyOn(cacheService, 'invalidate').mockRejectedValue(
        new Error('Redis connection failed')
      );

      const mockQuery = vi.spyOn(pool, 'query').mockResolvedValueOnce({
        rows: [{ id: '123', title: 'Updated' }],
        command: 'UPDATE',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      // Operation should succeed despite cache invalidation failure
      const result = await knowledgeService.updateArticle(testTenant, '123', { title: 'Updated' });

      expect(result).toBeDefined();
      expect(result.id).toBe('123');

      mockQuery.mockRestore();
      invalidateSpy.mockRestore();
    });
  });

  describe('Cache Key Format', () => {
    it('should use consistent cache key format', async () => {
      const getOrSetSpy = vi.spyOn(cacheService, 'getOrSet');
      getOrSetSpy.mockResolvedValue({ articles: [], total: 0, page: 1, perPage: 20, pages: 0 });

      await knowledgeService.listArticles('my-tenant', { status: 'published' }, { page: 1, perPage: 20 });

      const cacheKey = getOrSetSpy.mock.calls[0][0];

      // Cache key should follow pattern: tenantSlug:kb:articles:{filters+pagination}
      expect(cacheKey).toMatch(/my-tenant:kb:articles:.+/);

      getOrSetSpy.mockRestore();
    });
  });
});
