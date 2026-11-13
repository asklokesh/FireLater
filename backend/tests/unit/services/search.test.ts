import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * Unit tests for SearchService (filter templates, history, suggestions, analytics)
 */

const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { searchService } from '../../../src/services/search.js';
import { cacheService } from '../../../src/utils/cache.js';
import { logger } from '../../../src/utils/logger.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../../src/utils/errors.js';

const tenantSlug = 'test';
const userId = '11111111-1111-1111-1111-111111111111';
const templateId = '22222222-2222-2222-2222-222222222222';
const validFilter = { op: 'and' as const, conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };

describe('SearchService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  describe('templates', () => {
    it('lists own and shared templates', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }] });
      const rows = await searchService.listTemplates(tenantSlug, userId);
      expect(rows).toHaveLength(2);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('user_id = $1 OR is_shared = true');
      expect(params).toEqual([userId]);
    });

    it('creates a template and invalidates the search cache', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: templateId, name: 'Mine' }] });
      const t = await searchService.createTemplate(tenantSlug, userId, { name: ' Mine ', filter: validFilter });
      expect(t.id).toBe(templateId);
      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('Mine');
      expect(JSON.parse(params[5])).toEqual(validFilter);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'search');
    });

    it('rejects an invalid filter using filterGroupSchema', async () => {
      await expect(
        searchService.createTemplate(tenantSlug, userId, { name: 'Bad', filter: { op: 'xor', conditions: [] } })
      ).rejects.toBeInstanceOf(BadRequestError);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns 409 for a duplicate name', async () => {
      mockQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
      const err = await searchService.createTemplate(tenantSlug, userId, { name: 'Dup' }).catch((e) => e);
      expect(err).toBeInstanceOf(ConflictError);
      expect(err.statusCode).toBe(409);
      expect(cacheService.invalidateTenant).not.toHaveBeenCalled();
    });

    it('returns 409 when renaming to a duplicate name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: templateId, user_id: userId }] })
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
      await expect(
        searchService.updateTemplate(tenantSlug, userId, templateId, { name: 'Dup' })
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('update returns 404 for templates the caller does not own', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const err = await searchService.updateTemplate(tenantSlug, userId, templateId, { name: 'X' }).catch((e) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect(err.statusCode).toBe(404);
      expect(mockQuery.mock.calls[0][0]).toContain('user_id = $2');
      expect(mockQuery.mock.calls[0][1]).toEqual([templateId, userId]);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('update by owner succeeds and invalidates cache', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: templateId, user_id: userId }] })
        .mockResolvedValueOnce({ rows: [{ id: templateId, name: 'New', is_shared: true }] });
      const t = await searchService.updateTemplate(tenantSlug, userId, templateId, { name: 'New', isShared: true });
      expect(t.name).toBe('New');
      const [sql, params] = mockQuery.mock.calls[1];
      expect(sql).toContain('WHERE id = $3 AND user_id = $4');
      expect(params).toEqual(['New', true, templateId, userId]);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'search');
    });

    it('delete returns 404 for templates the caller does not own', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      await expect(searchService.deleteTemplate(tenantSlug, userId, templateId)).rejects.toBeInstanceOf(NotFoundError);
      expect(mockQuery.mock.calls[0][1]).toEqual([templateId, userId]);
      expect(cacheService.invalidateTenant).not.toHaveBeenCalled();
    });

    it('delete by owner invalidates cache', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      await searchService.deleteTemplate(tenantSlug, userId, templateId);
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'search');
    });
  });

  describe('history', () => {
    it('records a search with query, filter, result count and duration', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const recorded = await searchService.recordSearch(tenantSlug, {
        userId, query: ' login ', filter: validFilter as never, resultCount: 3, durationMs: 12.4,
      });
      expect(recorded).toBe(true);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO tenant_test.search_history');
      expect(params).toEqual([userId, 'issue', 'login', JSON.stringify(validFilter), 3, 12]);
    });

    it('records a filter-only search', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      expect(await searchService.recordSearch(tenantSlug, {
        userId, filter: validFilter as never, resultCount: 0, durationMs: 5,
      })).toBe(true);
      expect(mockQuery.mock.calls[0][1][2]).toBeNull();
    });

    it('skips a search with empty q and no filter', async () => {
      expect(await searchService.recordSearch(tenantSlug, { userId, query: '  ', resultCount: 5, durationMs: 1 })).toBe(false);
      expect(await searchService.recordSearch(tenantSlug, { userId, resultCount: 5, durationMs: 1 })).toBe(false);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('logs and swallows recording failures', async () => {
      mockQuery.mockRejectedValueOnce(new Error('db down'));
      await expect(searchService.recordSearch(tenantSlug, { userId, query: 'x', resultCount: 1, durationMs: 1 }))
        .resolves.toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('caps history limit at 50 and orders newest first', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await searchService.getHistory(tenantSlug, userId, 500);
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('ORDER BY created_at DESC');
      expect(params).toEqual([userId, 50]);
    });

    it('clears only the caller history', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 4, rows: [] });
      expect(await searchService.clearHistory(tenantSlug, userId)).toBe(4);
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE user_id = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual([userId]);
    });
  });

  describe('suggestions', () => {
    it('returns recent queries first, then popular, deduplicated case-insensitively', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ query: 'Login error' }, { query: 'log rotation' }] })
        .mockResolvedValueOnce({ rows: [{ query: 'login error', count: 9 }, { query: 'logout', count: 4 }, { query: 'log rotation', count: 2 }] });
      const result = await searchService.getSuggestions(tenantSlug, userId, 'Log');
      expect(result).toEqual(['Login error', 'log rotation', 'logout']);
      expect(mockQuery.mock.calls[0][0]).toContain('ILIKE');
      expect(mockQuery.mock.calls[0][1]).toEqual([userId, 'Log%', 8]);
      const key = (cacheService.getOrSet as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(key.startsWith(`${tenantSlug}:search:`)).toBe(true);
    });

    it('respects the limit', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ query: 'a1' }] })
        .mockResolvedValueOnce({ rows: [{ query: 'a2' }, { query: 'a3' }] });
      expect(await searchService.getSuggestions(tenantSlug, userId, 'a', 2)).toEqual(['a1', 'a2']);
    });
  });

  describe('analytics', () => {
    it('aggregates totals, top queries, zero-result queries and per-day counts', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total_searches: 10, unique_users: 3, zero_result_searches: 2, avg_duration_ms: 41.6 }] })
        .mockResolvedValueOnce({ rows: [{ query: 'vpn', count: '5' }] })
        .mockResolvedValueOnce({ rows: [{ query: 'foo', count: 2 }] })
        .mockResolvedValueOnce({ rows: [{ date: '2026-11-01', count: '4' }, { date: new Date('2026-11-02T00:00:00Z'), count: 6 }] });
      const from = new Date('2026-10-01T00:00:00Z');
      const to = new Date('2026-11-05T00:00:00Z');
      const result = await searchService.getAnalytics(tenantSlug, { from, to });
      expect(result).toEqual({
        totalSearches: 10,
        uniqueUsers: 3,
        zeroResultSearches: 2,
        avgDurationMs: 42,
        topQueries: [{ query: 'vpn', count: 5 }],
        zeroResultQueries: [{ query: 'foo', count: 2 }],
        searchesPerDay: [{ date: '2026-11-01', count: 4 }, { date: '2026-11-02', count: 6 }],
      });
      expect(mockQuery.mock.calls[0][1]).toEqual([from.toISOString(), to.toISOString()]);
      const key = (cacheService.getOrSet as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(key.startsWith(`${tenantSlug}:search:analytics`)).toBe(true);
    });

    it('defaults to the last 30 days', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await searchService.getAnalytics(tenantSlug);
      const [fromIso, toIso] = mockQuery.mock.calls[0][1];
      const diff = new Date(toIso).getTime() - new Date(fromIso).getTime();
      expect(diff).toBe(30 * 24 * 60 * 60 * 1000);
      expect(result.totalSearches).toBe(0);
      expect(result.topQueries).toEqual([]);
    });
  });
});
