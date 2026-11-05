import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({ tenantService: { getSchemaName: (s: string) => `tenant_${s}` } }));
const invalidateTenant = vi.fn();
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: (_k: string, f: () => Promise<unknown>) => f(),
    invalidateTenant: (...a: unknown[]) => invalidateTenant(...a),
  },
}));

import { searchService } from '../../../src/services/search.js';

describe('searchService', () => {
  beforeEach(() => { query.mockReset(); invalidateTenant.mockReset(); });

  it('lists own plus shared templates', async () => {
    query.mockResolvedValue({ rows: [] });
    await searchService.listTemplates('acme', 'u1');
    expect(query.mock.calls[0][0]).toContain('user_id = $1 OR is_shared = true');
  });

  it('returns 409 on duplicate name', async () => {
    query.mockRejectedValue({ code: '23505' });
    await expect(searchService.createTemplate('acme', 'u1', { name: 'x' })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('only owner updates; others get 404', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(searchService.updateTemplate('acme', 'u2', 'id', { name: 'n' })).rejects.toMatchObject({ statusCode: 404 });
    expect(query.mock.calls[0][0]).toContain('user_id =');
    expect(invalidateTenant).not.toHaveBeenCalled();
  });

  it('only owner deletes; invalidates cache on success', async () => {
    query.mockResolvedValueOnce({ rowCount: 0 });
    await expect(searchService.deleteTemplate('acme', 'u2', 'id')).rejects.toMatchObject({ statusCode: 404 });
    query.mockResolvedValueOnce({ rowCount: 1 });
    await searchService.deleteTemplate('acme', 'u1', 'id');
    expect(invalidateTenant).toHaveBeenCalledWith('acme', 'search');
  });

  it('suggestions: own first, then popular, deduped, max 10', async () => {
    query.mockResolvedValueOnce({ rows: [{ query: 'vpn down' }] });
    query.mockResolvedValueOnce({ rows: [{ query: 'VPN down' }, { query: 'vpn slow' }] });
    expect(await searchService.getSuggestions('acme', 'u1', 'vp')).toEqual(['vpn down', 'vpn slow']);
  });

  it('analytics shapes results', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ query: 'a', count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ query: 'b', count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ date: '2026-11-01', count: 4 }] })
      .mockResolvedValueOnce({ rows: [{ avg: '2.5' }] });
    expect(await searchService.getAnalytics('acme', 7)).toEqual({
      topQueries: [{ query: 'a', count: 3 }],
      zeroResultQueries: [{ query: 'b', count: 1 }],
      dailyVolume: [{ date: '2026-11-01', count: 4 }],
      averageResultCount: 2.5,
    });
  });
});
