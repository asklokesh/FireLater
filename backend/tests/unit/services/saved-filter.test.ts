import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({ pool: { query: (...a: unknown[]) => mockQuery(...a) } }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}` },
}));

import { savedFilterService } from '../../../src/services/saved-filter.js';

const row = { id: 'i1', name: 'n', query: null, filter: null, is_shared: true, created_at: 'x' };

describe('savedFilterService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and maps the template', async () => {
    mockQuery.mockResolvedValue({ rows: [row] });
    const f = { field: 'status', operator: 'eq', value: 'new' };
    const out = await savedFilterService.create('acme', 'u1', { name: 'n', filter: f, isShared: true });
    expect(out).toEqual({ id: 'i1', name: 'n', query: null, filter: null, isShared: true, createdAt: 'x' });
    expect(mockQuery.mock.calls[0][0]).toContain('tenant_acme.saved_filters');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1', 'n', null, JSON.stringify(f), true]);
  });

  it('rejects an invalid filter', async () => {
    await expect(
      savedFilterService.create('acme', 'u1', { name: 'n', filter: { field: 'bogus', operator: 'eq', value: 1 } })
    ).rejects.toThrow('Invalid filter');
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lists own plus shared', async () => {
    mockQuery.mockResolvedValue({ rows: [row] });
    const out = await savedFilterService.list('acme', 'u1');
    expect(out).toHaveLength(1);
    expect(mockQuery.mock.calls[0][0]).toContain('user_id = $1 OR is_shared = true');
    expect(mockQuery.mock.calls[0][1]).toEqual(['u1']);
  });

  it('deletes only own templates', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    await savedFilterService.delete('acme', 'u1', 'i1');
    expect(mockQuery.mock.calls[0][0]).toContain('id = $1 AND user_id = $2');
    expect(mockQuery.mock.calls[0][1]).toEqual(['i1', 'u1']);
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await expect(savedFilterService.delete('acme', 'other', 'i1')).rejects.toThrow('not found');
  });

  it('refuses to update another user template', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(savedFilterService.update('acme', 'other', 'i1', { name: 'z' })).rejects.toThrow('not found');
    expect(mockQuery.mock.calls[0][0]).toContain('user_id = $3');
  });

  it('gets own or shared', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    expect((await savedFilterService.get('acme', 'u1', 'i1')).id).toBe('i1');
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(savedFilterService.get('acme', 'u1', 'x')).rejects.toThrow('not found');
  });
});
