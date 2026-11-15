import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...a: unknown[]) => mockQuery(...a) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import {
  createTemplate, listTemplates, updateTemplate, deleteTemplate,
  recordSearch, recentSearches, suggest, getAnalytics,
} from '../../../src/services/search-tracking.js';

describe('search-tracking service', () => {
  beforeEach(() => mockQuery.mockReset());

  it('creates a template with a valid filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a' }] });
    const f = { conditions: [{ field: 'status', op: 'eq' as const, value: 'new' }] };
    await createTemplate('t', 'u1', { name: 'n', entity: 'issues', filter: f });
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'n', 'issues', null, JSON.stringify(f), false]);
  });

  it('rejects an invalid stored filter', async () => {
    await expect(
      createTemplate('t', 'u1', { name: 'n', entity: 'issues', filter: { conditions: [{ field: 'password', op: 'eq', value: 1 }] } })
    ).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lists own plus shared templates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listTemplates('t', 'u1');
    expect(mockQuery.mock.calls[0][0]).toContain('owner_id = $1 OR is_shared = true');
  });

  it('only the owner can update or delete', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'a', owner_id: 'other', is_shared: true, entity: 'issues' }] });
    await expect(updateTemplate('t', 'u1', 'a', { name: 'x' })).rejects.toThrow(/owner/);
    await expect(deleteTemplate('t', 'u1', 'a')).rejects.toThrow(/owner/);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('owner can delete', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a', owner_id: 'u1', is_shared: false }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await deleteTemplate('t', 'u1', 'a');
    expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM tenant_test.saved_filters');
  });

  it('update validates the merged filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a', owner_id: 'u1', entity: 'issues', is_shared: false }] });
    await expect(
      updateTemplate('t', 'u1', 'a', { filter: { conditions: [{ field: 'nope', op: 'eq', value: 1 }] } })
    ).rejects.toThrow();
  });

  it('recordSearch skips empty queries and trims others', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await recordSearch('t', 'u1', '   ', 'issues', 0);
    expect(mockQuery).not.toHaveBeenCalled();
    await recordSearch('t', 'u1', ' disk ', 'issues', 3);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'disk', 'issues', 3]);
  });

  it('recentSearches returns queries', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ query: 'a' }, { query: 'b' }] });
    expect(await recentSearches('t', 'u1')).toEqual(['a', 'b']);
  });

  it('suggest lists own matches first then popular, deduplicated', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ query: 'disk full' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ query: 'disk full' }, { query: 'disk slow' }] });
    expect(await suggest('t', 'u1', 'di')).toEqual(['disk full', 'disk slow']);
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'di%', 10]);
  });

  it('suggest escapes LIKE wildcards', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await suggest('t', 'u1', '50%_');
    expect(mockQuery.mock.calls[0][1][1]).toBe('50\\%\\_%');
  });

  it('analytics aggregates the window', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ query: 'a', count: '4' }] })
      .mockResolvedValueOnce({ rows: [{ query: 'z', count: '2' }] })
      .mockResolvedValueOnce({ rows: [{ day: '2026-01-01', count: '6' }] })
      .mockResolvedValueOnce({ rows: [{ avg: '2.5' }] });
    const a = await getAnalytics('t', 7);
    expect(a).toEqual({
      topQueries: [{ query: 'a', count: 4 }],
      zeroResultQueries: [{ query: 'z', count: 2 }],
      searchesPerDay: [{ day: '2026-01-01', count: 6 }],
      averageResultCount: 2.5,
    });
    expect(mockQuery.mock.calls[0][1][0]).toBe(7);
  });
});
