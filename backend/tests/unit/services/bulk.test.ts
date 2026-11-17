import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockClientQuery = vi.fn();
const mockRelease = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    connect: vi.fn(async () => ({ query: (...a: unknown[]) => mockClientQuery(...a), release: mockRelease })),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: vi.fn().mockReturnValue('tenant_test') },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  BULK_ASYNC_THRESHOLD,
  BULK_CHUNK_SIZE,
  BULK_MAX_RECORDS,
  countRecords,
  executeBulk,
  getBulkSchema,
  shouldRunAsync,
} from '../../../src/services/bulk.js';

const actor = { userId: '11111111-1111-4111-8111-111111111111', tenantSlug: 'test' };
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const makeIds = (n: number) => Array.from({ length: n }, (_, i) => uid(i + 1));

// Default mock: SELECT returns one row per requested id, everything else succeeds
function installDefaultQuery() {
  mockClientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.startsWith('SELECT 1')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (sql.startsWith('SELECT')) {
      const ids = (params?.[0] as string[]) || [];
      return { rows: ids.map((id) => ({ id, status: 'new', issue_number: 'ISS-1', assigned_to: null })), rowCount: ids.length };
    }
    if (sql.startsWith('UPDATE') || sql.startsWith('DELETE')) {
      return { rows: [], rowCount: (params?.[0] as string[]).length };
    }
    return { rows: [], rowCount: 0 };
  });
}

describe('bulk validation', () => {
  it('rejects empty and non-uuid id lists', () => {
    const schema = getBulkSchema('issues', 'delete');
    expect(schema.safeParse({ ids: [] }).success).toBe(false);
    expect(schema.safeParse({ ids: ['nope'] }).success).toBe(false);
    expect(schema.safeParse({ ids: [uid(1)] }).success).toBe(true);
  });

  it('rejects more than the maximum number of records', () => {
    const schema = getBulkSchema('issues', 'delete');
    expect(schema.safeParse({ ids: makeIds(BULK_MAX_RECORDS + 1) }).success).toBe(false);
    expect(schema.safeParse({ ids: makeIds(BULK_MAX_RECORDS) }).success).toBe(true);
  });

  it('rejects unknown fields and columns outside the whitelist', () => {
    const schema = getBulkSchema('issues', 'update');
    expect(schema.safeParse({ ids: [uid(1)], changes: { issue_number: 'x' } }).success).toBe(false);
    expect(schema.safeParse({ ids: [uid(1)], changes: {} }).success).toBe(false);
    expect(schema.safeParse({ ids: [uid(1)], changes: { priority: 'urgent' } }).success).toBe(false);
    expect(schema.safeParse({ ids: [uid(1)], changes: { priority: 'high' } }).success).toBe(true);
  });

  it('update needs ids+changes or items, not both', () => {
    const schema = getBulkSchema('issues', 'update');
    expect(schema.safeParse({ ids: [uid(1)] }).success).toBe(false);
    expect(schema.safeParse({ items: [{ id: uid(1), changes: { priority: 'low' } }] }).success).toBe(true);
    expect(
      schema.safeParse({ ids: [uid(1)], changes: { priority: 'low' }, items: [{ id: uid(2), changes: { priority: 'low' } }] }).success
    ).toBe(false);
  });

  it('validates status per entity', () => {
    expect(getBulkSchema('issues', 'status').safeParse({ ids: [uid(1)], status: 'resolved' }).success).toBe(true);
    expect(getBulkSchema('issues', 'status').safeParse({ ids: [uid(1)], status: 'draft' }).success).toBe(false);
    expect(getBulkSchema('changes', 'status').safeParse({ ids: [uid(1)], status: 'draft' }).success).toBe(true);
  });

  it('assign needs a user or group and rejects bad webhook urls', () => {
    const schema = getBulkSchema('issues', 'assign');
    expect(schema.safeParse({ ids: [uid(1)] }).success).toBe(false);
    expect(schema.safeParse({ ids: [uid(1)], assignedTo: uid(9) }).success).toBe(true);
    expect(schema.safeParse({ ids: [uid(1)], assignedTo: null }).success).toBe(true);
    expect(schema.safeParse({ ids: [uid(1)], assignedTo: uid(9), webhookUrl: 'not a url' }).success).toBe(false);
  });
});

describe('async threshold', () => {
  it('runs sync up to the threshold and async above it', () => {
    expect(shouldRunAsync({ ids: makeIds(BULK_ASYNC_THRESHOLD) })).toBe(false);
    expect(shouldRunAsync({ ids: makeIds(BULK_ASYNC_THRESHOLD + 1) })).toBe(true);
  });

  it('honours async:true and counts distinct records', () => {
    expect(shouldRunAsync({ ids: [uid(1)], async: true })).toBe(true);
    expect(countRecords({ ids: [uid(1), uid(1), uid(2)] })).toBe(2);
    expect(countRecords({ items: [{ id: uid(1), changes: {} }, { id: uid(2), changes: {} }] })).toBe(2);
  });
});

describe('executeBulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDefaultQuery();
  });

  it('commits a bulk update in one transaction with audit rows', async () => {
    const result = await executeBulk(actor, 'issues', 'update', { ids: [uid(1), uid(2)], changes: { priority: 'high' } });
    expect(result).toEqual({ entity: 'issues', operation: 'update', requested: 2, affected: 2 });
    const sqls = mockClientQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls).toContain('UPDATE');
    expect(sqls).toContain('INSERT');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
    const update = mockClientQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE'))!;
    expect(update[0]).toContain('tenant_test.issues');
    expect(update[0]).toContain('priority = $2');
    expect(update[1]).toEqual([[uid(1), uid(2)], 'high']);
    const audit = mockClientQuery.mock.calls.find((c) => String(c[0]).includes('audit_logs'))!;
    expect(audit[1][1]).toBe('update');
    expect(JSON.parse(audit[1][3])).toMatchObject({ bulk: true, operation: 'update' });
  });

  it('rolls everything back when a statement fails', async () => {
    mockClientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT 1')) return { rows: [{ x: 1 }], rowCount: 1 };
      if (sql.startsWith('SELECT')) {
        const ids = params![0] as string[];
        return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
      }
      if (sql.startsWith('UPDATE')) throw Object.assign(new Error('fk'), { code: '23503' });
      return { rows: [], rowCount: 0 };
    });
    await expect(
      executeBulk(actor, 'issues', 'assign', { ids: [uid(1)], assignedTo: uid(9) })
    ).rejects.toMatchObject({ statusCode: 409 });
    const sqls = mockClientQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing assignee with 400 and rolls back', async () => {
    mockClientQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SELECT 1')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT')) {
        const ids = params![0] as string[];
        return { rows: ids.map((id) => ({ id })), rowCount: ids.length };
      }
      return { rows: [], rowCount: 0 };
    });
    await expect(
      executeBulk(actor, 'issues', 'assign', { ids: [uid(1)], assignedTo: uid(9) })
    ).rejects.toMatchObject({ statusCode: 400 });
    const sqls = mockClientQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('UPDATE');
  });

  it('rolls back and reports 404 when any id is missing', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT')) return { rows: [{ id: uid(1) }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await expect(
      executeBulk(actor, 'issues', 'delete', { ids: [uid(1), uid(2)] })
    ).rejects.toMatchObject({ statusCode: 404 });
    const sqls = mockClientQuery.mock.calls.map((c) => String(c[0]).trim().split(/\s+/)[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('DELETE');
  });

  it('status change to resolved stamps resolution columns', async () => {
    await executeBulk(actor, 'issues', 'status', { ids: [uid(1)], status: 'resolved' });
    const update = mockClientQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE'))!;
    expect(update[0]).toContain('resolved_at = NOW()');
    expect(update[0]).toContain('resolved_by = $3::uuid');
  });

  it('delete snapshots old values into the audit log', async () => {
    await executeBulk(actor, 'issues', 'delete', { ids: [uid(1)] });
    const audit = mockClientQuery.mock.calls.find((c) => String(c[0]).includes('audit_logs'))!;
    expect(audit[1][1]).toBe('delete');
    expect(JSON.parse(audit[1][5][0])).toMatchObject({ issue_number: 'ISS-1' });
  });

  it('processes 10,000 records in chunks and reports progress', async () => {
    const ids = makeIds(10000);
    const progress: Array<[number, number]> = [];
    const result = await executeBulk(
      actor, 'issues', 'update', { ids, changes: { priority: 'low' } },
      (p, t) => { progress.push([p, t]); }
    );
    expect(result.affected).toBe(10000);
    expect(progress).toHaveLength(10000 / BULK_CHUNK_SIZE);
    expect(progress[progress.length - 1]).toEqual([10000, 10000]);
    const commits = mockClientQuery.mock.calls.filter((c) => c[0] === 'COMMIT');
    expect(commits).toHaveLength(1);
  });

  it('groups per-record updates that share identical values', async () => {
    await executeBulk(actor, 'issues', 'update', {
      items: [
        { id: uid(1), changes: { priority: 'high' } },
        { id: uid(2), changes: { priority: 'high' } },
        { id: uid(3), changes: { priority: 'low' } },
      ],
    });
    const updates = mockClientQuery.mock.calls.filter((c) => String(c[0]).startsWith('UPDATE'));
    expect(updates).toHaveLength(2);
  });

  it('uses the entity column mapping for assignment', async () => {
    await executeBulk(actor, 'changes', 'assign', { ids: [uid(1)], assignedTo: uid(9) });
    const update = mockClientQuery.mock.calls.find((c) => String(c[0]).startsWith('UPDATE'))!;
    expect(update[0]).toContain('tenant_test.change_requests');
    expect(update[0]).toContain('implementer_id = $2');
  });
});
