import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));
vi.mock('../../../src/utils/cache.js', () => ({ cacheService: { getOrSet: vi.fn(), invalidateTenant: vi.fn() } }));
const mockLogError = vi.fn();
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { error: (...a: unknown[]) => mockLogError(...a), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { searchHistoryService } from '../../../src/services/searchHistory.js';

describe('searchHistoryService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockLogError.mockReset();
  });

  it('records a non-empty query', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await searchHistoryService.record('acme', 'u1', { query: ' disk ', resultCount: 3 });
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'disk', null, 3]);
  });

  it('skips empty query and empty filters', async () => {
    await searchHistoryService.record('acme', 'u1', { query: '  ', filters: { op: 'and', conditions: [] }, resultCount: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('records filter-only searches', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const filters = { op: 'and' as const, conditions: [{ field: 'status', op: 'eq' as const, value: 'new' }] };
    await searchHistoryService.record('acme', 'u1', { filters, resultCount: 1 });
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', null, JSON.stringify(filters), 1]);
  });

  it('is non-fatal when the insert fails', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(searchHistoryService.record('acme', 'u1', { query: 'x', resultCount: 0 })).resolves.toBeUndefined();
    expect(mockLogError).toHaveBeenCalled();
  });

  it('defaults to 10 and caps at 50', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await searchHistoryService.recent('acme', 'u1');
    await searchHistoryService.recent('acme', 'u1', 500);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 10]);
    expect(mockQuery.mock.calls[1][1]).toEqual(['u1', 50]);
    expect(mockQuery.mock.calls[0][0]).toContain('DISTINCT');
  });

  it('clears only the user history', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 4 });
    expect(await searchHistoryService.clear('acme', 'u1')).toBe(4);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1']);
  });
});
