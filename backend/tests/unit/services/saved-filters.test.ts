import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (slug: string) => `tenant_${slug}` },
}));

import { savedFilterService } from '../../../src/services/saved-filters.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../src/utils/errors.js';

const OWNER = 'u-owner';
const OTHER = 'u-other';
const row = { id: 'f1', name: 'Mine', created_by: OWNER, is_shared: false };

describe('savedFilterService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('lists own and shared filters with parameterized SQL', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] });
    const rows = await savedFilterService.list('acme', OWNER);
    expect(rows).toEqual([row]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('tenant_acme.saved_filters');
    expect(sql).toContain('sf.created_by = $1 OR sf.is_shared = true');
    expect(params).toEqual([OWNER]);
  });

  it('narrows by entity type', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await savedFilterService.list('acme', OWNER, 'issues');
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('sf.entity_type = $2');
    expect(params).toEqual([OWNER, 'issues']);
  });

  it('creates a filter storing the definition as submitted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'f1' }] }).mockResolvedValueOnce({ rows: [row] });
    const def = { anything: [1, 2] };
    const created = await savedFilterService.create('acme', OWNER, {
      name: 'Mine',
      entityType: 'issues',
      definition: def,
    });
    expect(created).toEqual(row);
    expect(mockQuery.mock.calls[0][1]).toEqual(['Mine', 'issues', JSON.stringify(def), false, OWNER]);
  });

  it('maps duplicate name to ConflictError', async () => {
    mockQuery.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(
      savedFilterService.create('acme', OWNER, { name: 'Mine', entityType: 'issues', definition: {} })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('maps duplicate name on update to ConflictError', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(
      savedFilterService.update('acme', 'f1', OWNER, false, { name: 'X' })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows owner to update', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...row, name: 'New' }] });
    const updated = await savedFilterService.update('acme', 'f1', OWNER, false, { name: 'New', isShared: true });
    expect(updated.name).toBe('New');
    expect(mockQuery.mock.calls[1][0]).toContain('name = $1, is_shared = $2');
    expect(mockQuery.mock.calls[1][1]).toEqual(['New', true, 'f1']);
  });

  it('forbids non-owner non-admin update and delete', async () => {
    mockQuery.mockResolvedValue({ rows: [row] });
    await expect(savedFilterService.update('acme', 'f1', OTHER, false, { name: 'X' })).rejects.toBeInstanceOf(
      ForbiddenError
    );
    await expect(savedFilterService.delete('acme', 'f1', OTHER, false)).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('allows admin to delete another user filter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [] });
    await savedFilterService.delete('acme', 'f1', OTHER, true);
    expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM tenant_acme.saved_filters');
  });

  it('throws NotFoundError for unknown id', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(savedFilterService.update('acme', 'x', OWNER, true, { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundError
    );
    await expect(savedFilterService.delete('acme', 'x', OWNER, true)).rejects.toBeInstanceOf(NotFoundError);
  });
});
