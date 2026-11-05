import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
const mockInvalidate = vi.fn().mockResolvedValue(0);
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_k: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: (...args: unknown[]) => mockInvalidate(...args),
  },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import { searchTemplatesService } from '../../../src/services/searchTemplates.js';

const validFilter = { op: 'AND' as const, conditions: [{ field: 'status', operator: 'eq' as const, value: 'new' }] };

describe('searchTemplatesService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInvalidate.mockClear();
  });

  it('lists own plus shared templates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
    const rows = await searchTemplatesService.list('test', 'u1');
    expect(rows).toEqual([{ id: 't1' }]);
    expect(mockQuery.mock.calls[0][0]).toContain('is_shared = true');
  });

  it('gets own template and hides others private templates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', is_shared: false }] });
    await expect(searchTemplatesService.get('test', 'u1', 't1')).resolves.toMatchObject({ id: 't1' });
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1', user_id: 'u1', is_shared: false }] });
    await expect(searchTemplatesService.get('test', 'u2', 't1')).rejects.toThrow();
  });

  it('creates and invalidates cache', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't1' }] });
    const row = await searchTemplatesService.create('test', 'u1', { name: 'n', filter: validFilter });
    expect(row).toEqual({ id: 't1' });
    expect(mockInvalidate).toHaveBeenCalledWith('test', 'search-templates');
  });

  it('rejects invalid filter before saving', async () => {
    const bad = { op: 'AND' as const, conditions: [{ field: 'nope', operator: 'eq' as const, value: 1 }] };
    await expect(searchTemplatesService.create('test', 'u1', { name: 'n', filter: bad })).rejects.toThrow();
    await expect(searchTemplatesService.update('test', 'u1', 't1', { filter: bad })).rejects.toThrow();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('updates when owner', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 't1', name: 'x' }] });
    const row = await searchTemplatesService.update('test', 'u1', 't1', { name: 'x' });
    expect(row).toMatchObject({ name: 'x' });
    expect(mockInvalidate).toHaveBeenCalledWith('test', 'search-templates');
  });

  it('rejects update by non-owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
    await expect(searchTemplatesService.update('test', 'u2', 't1', { name: 'x' })).rejects.toThrow(/owner/);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('deletes when owner and rejects non-owner', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] }).mockResolvedValueOnce({ rows: [] });
    await searchTemplatesService.delete('test', 'u1', 't1');
    expect(mockInvalidate).toHaveBeenCalledWith('test', 'search-templates');

    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'u1' }] });
    await expect(searchTemplatesService.delete('test', 'u2', 't1')).rejects.toThrow(/owner/);
  });

  it('throws not found for missing template', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(searchTemplatesService.delete('test', 'u1', 'missing')).rejects.toThrow();
  });
});
