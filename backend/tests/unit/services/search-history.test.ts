import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));

import { searchHistoryService } from '../../../src/services/search-history.js';

describe('searchHistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('skips empty queries and records trimmed ones', async () => {
    await searchHistoryService.record('acme', 'u1', { query: '  ', resultCount: 0 });
    expect(mockQuery).not.toHaveBeenCalled();
    await searchHistoryService.record('acme', 'u1', { query: ' disk ', resultCount: 3 });
    expect(mockQuery.mock.calls[0][0]).toContain('tenant_acme.search_history');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'disk', null, 3]);
  });

  it('lists deduplicated, limited, retention-bounded history for the caller', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: '1', query: 'a', result_count: '2', created_at: 'x' }] });
    const out = await searchHistoryService.list('acme', 'u1');
    expect(out).toEqual([{ id: '1', query: 'a', resultCount: 2, createdAt: 'x' }]);
    expect(mockQuery.mock.calls[0][0]).toContain('DISTINCT ON (query)');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 90, 20]);
  });

  it('clears for the caller only', async () => {
    await searchHistoryService.clear('acme', 'u1');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1']);
  });

  it('suggests by escaped prefix with limit 8 and retention', async () => {
    mockQuery.mockResolvedValue({ rows: [{ query: 'disk full' }] });
    expect(await searchHistoryService.suggest('acme', 'u1', '50%_')).toEqual(['disk full']);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 90, '50\\%\\_%', 8]);
  });
});
