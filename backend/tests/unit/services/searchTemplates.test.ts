import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));
vi.mock('../../../src/utils/cache.js', () => ({ cacheService: { getOrSet: vi.fn(), invalidateTenant: vi.fn() } }));

import { searchTemplateService } from '../../../src/services/searchTemplates.js';

const validFilters = { op: 'and', conditions: [{ field: 'status', op: 'eq', value: 'new' }] };

describe('searchTemplateService', () => {
  beforeEach(() => mockQuery.mockReset());

  it('rejects invalid filters', async () => {
    await expect(
      searchTemplateService.create('acme', 'u1', {
        name: 'x',
        filters: { op: 'and', conditions: [{ field: 'bogus', op: 'eq', value: 1 }] },
      })
    ).rejects.toThrow(/Unknown filter field/);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects empty name', async () => {
    await expect(searchTemplateService.create('acme', 'u1', { name: '  ' })).rejects.toThrow();
  });

  it('rejects duplicate names per user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    await expect(searchTemplateService.create('acme', 'u1', { name: 'dup' })).rejects.toThrow(/already exists/);
  });

  it('creates a template', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 't1' }] });
    const r = await searchTemplateService.create('acme', 'u1', { name: 'n', filters: validFilters });
    expect(r).toEqual({ id: 't1' });
    expect(mockQuery.mock.calls[1][1]).toEqual(['u1', 'n', null, null, JSON.stringify(validFilters), false]);
  });

  it('lists own plus shared', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await searchTemplateService.list('acme', 'u1');
    expect(mockQuery.mock.calls[0][0]).toContain('user_id = $1 OR is_shared = true');
  });

  it('hides other users private templates', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 't', user_id: 'u2', is_shared: false }] });
    await expect(searchTemplateService.get('acme', 'u1', 't')).rejects.toThrow(/not found/);
  });

  it('allows reading shared but not updating or deleting', async () => {
    const row = { id: 't', user_id: 'u2', is_shared: true };
    mockQuery.mockResolvedValue({ rows: [row] });
    await expect(searchTemplateService.get('acme', 'u1', 't')).resolves.toEqual(row);
    await expect(searchTemplateService.update('acme', 'u1', 't', { name: 'z' })).rejects.toThrow(/owner/);
    await expect(searchTemplateService.delete('acme', 'u1', 't')).rejects.toThrow(/owner/);
    expect(mockQuery.mock.calls.every((c) => !/^\s*(UPDATE|DELETE)/.test(c[0]))).toBe(true);
  });

  it('owner can update and delete', async () => {
    const row = { id: 't', user_id: 'u1', is_shared: false };
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...row, name: 'z' }] });
    const r = await searchTemplateService.update('acme', 'u1', 't', { name: 'z' });
    expect(r.name).toBe('z');
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [row] });
    await searchTemplateService.delete('acme', 'u1', 't');
    expect(mockQuery.mock.calls[1][0]).toContain('DELETE');
  });

  it('rename colliding with another template conflicts', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 't', user_id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [{ x: 1 }] });
    await expect(searchTemplateService.update('acme', 'u1', 't', { name: 'z' })).rejects.toThrow(/already exists/);
  });
});
