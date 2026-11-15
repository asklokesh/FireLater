import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '../../../src/services/search/templates.js';

const U1 = '11111111-1111-1111-1111-111111111111';
const U2 = '22222222-2222-2222-2222-222222222222';
const ID = '33333333-3333-3333-3333-333333333333';

beforeEach(() => { mockQuery.mockReset(); });

describe('search templates service', () => {
  it('lists own plus shared ordered by name', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ID }] });
    const rows = await listTemplates('t', U1);
    expect(rows).toEqual([{ id: ID }]);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('owner_id = $1 OR f.is_shared = true');
    expect(sql).toContain('ORDER BY f.name ASC');
    expect(params).toEqual([U1]);
  });

  it('creates a template', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: ID, name: 'n' }] });
    const row = await createTemplate('t', U1, { name: 'n', definition: { q: 'x' }, isShared: true });
    expect(row.id).toBe(ID);
    expect(mockQuery.mock.calls[0][1]).toEqual(['n', U1, JSON.stringify({ q: 'x' }), true]);
  });

  it('maps duplicate name to 409', async () => {
    mockQuery.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(createTemplate('t', U1, { name: 'n', definition: {} })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects invalid filter', async () => {
    await expect(
      createTemplate('t', U1, { name: 'n', definition: { filter: { op: 'xor', conditions: [] } } })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('rejects oversized definition', async () => {
    await expect(
      createTemplate('t', U1, { name: 'n', definition: { q: 'a'.repeat(21 * 1024) } })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('update: owner allowed, others 403, unknown 404', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ owner_id: U1 }] }).mockResolvedValueOnce({ rows: [{ id: ID }] });
    await expect(updateTemplate('t', U1, ID, { name: 'z', isShared: true })).resolves.toEqual({ id: ID });
    expect(mockQuery.mock.calls[1][0]).toContain('name = $1, is_shared = $2');

    mockQuery.mockResolvedValueOnce({ rows: [{ owner_id: U1 }] });
    await expect(updateTemplate('t', U2, ID, { name: 'z' })).rejects.toMatchObject({ statusCode: 403 });

    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(updateTemplate('t', U1, ID, { name: 'z' })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('delete: owner only', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ owner_id: U1 }] }).mockResolvedValueOnce({ rows: [] });
    await deleteTemplate('t', U1, ID);
    expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM');

    mockQuery.mockResolvedValueOnce({ rows: [{ owner_id: U1 }] });
    await expect(deleteTemplate('t', U2, ID)).rejects.toMatchObject({ statusCode: 403 });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await expect(deleteTemplate('t', U1, ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
