import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import { searchHistoryService } from '../../../src/services/searchHistory.js';

describe('searchHistoryService', () => {
  beforeEach(() => mockQuery.mockReset());

  it('records a search', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await searchHistoryService.record('test', 'u1', { query: 'vpn', resultCount: 3 });
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO tenant_test.search_history');
    expect(params).toEqual(['u1', 'issue', 'vpn', null, 3]);
  });

  it('lists recent distinct queries newest first', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ query: 'b' }, { query: 'a' }] });
    const res = await searchHistoryService.listRecent('test', 'u1', 5);
    expect(res).toEqual(['b', 'a']);
    expect(mockQuery.mock.calls[0][0]).toContain('GROUP BY query');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 5]);
  });

  it('suggests with prefix match and case-insensitive dedupe', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query: 'VPN down' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'vpn down' }, { query: 'vpn slow' }] });
    const res = await searchHistoryService.suggest('test', 'u1', 'vp', 10);
    expect(res).toEqual(['VPN down', 'vpn slow']);
    expect(mockQuery.mock.calls[0][0]).toContain('ILIKE');
    expect(mockQuery.mock.calls[0][1][1]).toBe('vp%');
  });

  it('escapes LIKE wildcards in prefix', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await searchHistoryService.suggest('test', 'u1', '50%_', 5);
    expect(mockQuery.mock.calls[0][1][1]).toBe('50\\%\\_%');
  });

  it('respects the limit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query: 'a1' }, { query: 'a2' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'a3' }] });
    expect(await searchHistoryService.suggest('test', 'u1', 'a', 2)).toEqual(['a1', 'a2']);
  });

  it('clears the user history', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await searchHistoryService.clear('test', 'u1');
    expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM tenant_test.search_history');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1']);
  });
});
