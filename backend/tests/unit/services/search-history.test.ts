import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
vi.mock('../../../src/config/database.js', () => ({ pool: { query } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { searchHistoryService } from '../../../src/services/search-history.js';

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('searchHistoryService', () => {
  it('records a search with all columns', async () => {
    await searchHistoryService.record({ tenantSlug: 'acme', userId: 'u1', query: ' vpn ', entity: 'issues', filter: { a: 1 }, resultCount: 3, durationMs: 12.4 });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tenant_acme.search_history');
    expect(params).toEqual(['u1', 'vpn', 'issues', '{"a":1}', 3, 12]);
  });

  it('skips empty queries', async () => {
    await searchHistoryService.record({ tenantSlug: 'acme', userId: 'u1', query: '   ', entity: 'issues', resultCount: 0, durationMs: 1 });
    expect(query).not.toHaveBeenCalled();
  });

  it('logs and swallows insert failures', async () => {
    query.mockRejectedValue(new Error('db down'));
    await expect(searchHistoryService.record({ tenantSlug: 'acme', userId: 'u1', query: 'x', entity: 'kb', resultCount: 0, durationMs: 1 })).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
  });

  it('recent is scoped to user and capped at 20', async () => {
    query.mockResolvedValue({ rows: [{ query: 'vpn', last_searched_at: 't' }] });
    const res = await searchHistoryService.recent('acme', 'u1', 500);
    expect(query.mock.calls[0][1]).toEqual(['u1', 20]);
    expect(query.mock.calls[0][0]).toContain('user_id = $1');
    expect(res).toEqual([{ query: 'vpn', lastSearchedAt: 't' }]);
  });

  it('clear deletes only the current user rows', async () => {
    query.mockResolvedValue({ rowCount: 4 });
    expect(await searchHistoryService.clear('acme', 'u1')).toBe(4);
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = $1');
    expect(query.mock.calls[0][1]).toEqual(['u1']);
  });

  it('suggestions are user scoped, prefix matched, max 8, escaped', async () => {
    query.mockResolvedValue({ rows: [{ query: 'vpn down' }] });
    expect(await searchHistoryService.suggestions('acme', 'u1', '50%_v')).toEqual(['vpn down']);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('user_id = $1');
    expect(sql).toContain('LIMIT 8');
    expect(sql).toContain('MAX(created_at) DESC, COUNT(*) DESC');
    expect(params).toEqual(['u1', '50\\%\\_v%']);
  });
});
