import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockClientQuery = vi.hoisted(() => vi.fn());
const mockClientRelease = vi.hoisted(() => vi.fn());
const mockInvalidate = vi.hoisted(() => vi.fn());

vi.mock('../../src/config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
    connect: vi.fn(async () => ({ query: mockClientQuery, release: mockClientRelease })),
  },
}));
vi.mock('../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (slug: string) => `tenant_${slug.replace(/-/g, '_')}` },
}));
vi.mock('../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn((_k: string, fn: () => Promise<unknown>) => fn()),
    invalidateTenant: mockInvalidate,
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '../../src/utils/logger.js';
import { auditService } from '../../src/services/audit.js';
import { auditChainService } from '../../src/services/audit-chain.js';
import { auditAlertService } from '../../src/services/audit-alerts.js';
import {
  auditRetentionService,
  recordRetentionRun,
  RANGES_PER_RECORD,
  validateRetentionPolicy,
} from '../../src/services/audit-retention.js';
import { generateAuditReport } from '../../src/services/audit-reports.js';
import { complianceReportsService } from '../../src/services/compliance-reports.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockReset();
  mockClientQuery.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// ---------------------------------------------------------------------------
describe('tamper evidence covers the whole record (reviewer finding 6)', () => {
  const base = {
    action: 'update',
    created_at: '2026-01-01T00:00:00.000Z',
    entity_id: null,
    entity_type: 'issue',
    ip_address: null,
    metadata: {},
    sequence: 1,
    user_id: 'u1',
  };

  it('nested metadata is part of the hash', () => {
    const a = auditChainService.computeHash({ ...base, metadata: { reason: 'a' } }, null);
    const b = auditChainService.computeHash({ ...base, metadata: { reason: 'b' } }, null);
    expect(a).not.toBe(b);
  });

  const content = {
    user_email: 'a@b.c', user_name: null, entity_name: 'Printer', old_values: { priority: 'low' },
    new_values: { priority: 'high' }, changed_fields: ['priority'], outcome: 'success', severity: 'info',
    http_method: 'PUT', request_path: '/v1/issues/x', status_code: 200, user_agent: null, request_id: null,
    changes: { title: 'Printer', issueNumber: 'ISS-00001' },
  };

  function sealed(overrides: Record<string, unknown> = {}, position = 1, prev: string | null = null) {
    const digest = auditChainService.computeContentDigest(content, 2);
    const payload = { ...base, sequence: position, chain_position: position, content: digest, digest_version: 2 };
    const hash = auditChainService.computeHash(payload, prev);
    return {
      sequence: position, chain_position: position, prev_hash: prev, record_hash: hash, content_digest: digest,
      digest_version: 2,
      action: 'update', entity_type: 'issue', entity_id: null, user_id: 'u1', ip_address: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'), metadata: {}, ...content, ...overrides,
    };
  }

  /** A record sealed before digest_version existed (version 1: `changes` not covered). */
  function sealedV1(overrides: Record<string, unknown> = {}) {
    const digest = auditChainService.computeContentDigest(content, 1);
    const payload = { ...base, sequence: 1, chain_position: 1, content: digest };
    const hash = auditChainService.computeHash(payload, null);
    return {
      sequence: 1, chain_position: 1, prev_hash: null, record_hash: hash, content_digest: digest,
      digest_version: null,
      action: 'update', entity_type: 'issue', entity_id: null, user_id: 'u1', ip_address: null,
      created_at: new Date('2026-01-01T00:00:00.000Z'), metadata: {}, ...content, ...overrides,
    };
  }

  it('still accepts records sealed with the version 1 digest', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [sealedV1()] });
    expect(await auditChainService.verifyChain('acme')).toMatchObject({ valid: true, checkedCount: 1 });
  });

  it('detects a version 1 record whose old values were edited', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [sealedV1({ old_values: { priority: 'critical' } })] });
    expect((await auditChainService.verifyChain('acme')).valid).toBe(false);
  });

  it('detects a version 2 record relabelled as version 1 (no downgrade)', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [sealed({ digest_version: null, changes: { title: 'x' } })] });
    expect((await auditChainService.verifyChain('acme')).valid).toBe(false);
  });

  it('accepts an untouched sealed chain', async () => {
    const r1 = sealed();
    const r2 = sealed({}, 2, r1.record_hash);
    mockPoolQuery.mockResolvedValueOnce({ rows: [r1, r2] });
    expect(await auditChainService.verifyChain('acme')).toMatchObject({ valid: true, checkedCount: 2 });
  });

  it.each([
    ['new_values', { new_values: { priority: 'low' } }],
    ['old_values', { old_values: { priority: 'critical' } }],
    ['changed_fields', { changed_fields: ['title'] }],
    ['user_email', { user_email: 'mallory@evil.test' }],
    ['outcome', { outcome: 'denied' }],
    ['entity_name', { entity_name: 'Other' }],
    ['changes (legacy service payload)', { changes: { title: 'Rewritten' } }],
  ])('detects an edit of %s', async (_name, change) => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [sealed(change)] });
    const result = await auditChainService.verifyChain('acme');
    expect(result.valid).toBe(false);
    expect(result.firstBrokenSequence).toBe(1);
  });

  it('detects a broken link between consecutive records', async () => {
    const r1 = sealed();
    const r2 = sealed({}, 2, 'f'.repeat(64)); // consistent on its own, but not linked to r1
    mockPoolQuery.mockResolvedValueOnce({ rows: [r1, r2] });
    const result = await auditChainService.verifyChain('acme');
    expect(result.valid).toBe(false);
    expect(result.firstBrokenSequence).toBe(2);
  });

  it('detects a deleted record (gap in chain positions) unless a retention run accounts for it', async () => {
    const r1 = sealed();
    const r2 = sealed({}, 2, r1.record_hash);
    const r3 = sealed({}, 3, r2.record_hash);
    mockPoolQuery.mockResolvedValueOnce({ rows: [r1, r3] }).mockResolvedValueOnce({ rows: [] });
    const missing = await auditChainService.verifyChain('acme');
    expect(missing.valid).toBe(false);

    mockPoolQuery.mockReset();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [r1, r3] })
      .mockResolvedValueOnce({ rows: [{ ranges: [[2, 2]] }] });
    const explained = await auditChainService.verifyChain('acme');
    expect(explained.valid).toBe(true);
  });

  it('accepts gaps recorded across several retention_run records and still names an unrecorded position', async () => {
    const r1 = sealed();
    const r2 = sealed({}, 2, r1.record_hash);
    const r3 = sealed({}, 3, r2.record_hash);
    const r9 = sealed({}, 9, 'a'.repeat(64));
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [r1, r3, r9] })
      .mockResolvedValueOnce({ rows: [{ ranges: [[6, 8]] }, { ranges: [[2, 2], [4, 5]] }] });
    expect(await auditChainService.verifyChain('acme')).toMatchObject({ valid: true, checkedCount: 3 });

    mockPoolQuery.mockReset();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [r1, r3, r9] })
      .mockResolvedValueOnce({ rows: [{ ranges: [[6, 8]] }, { ranges: [[2, 2], [4, 4]] }] });
    const result = await auditChainService.verifyChain('acme');
    expect(result).toMatchObject({ valid: false, firstBrokenSequence: 9 });
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'chain position 5 is missing' }),
      expect.any(String)
    );
  });

  it('verifies the archive as well as the live table', async () => {
    await auditChainService.verifyChain('acme');
    expect(mockPoolQuery.mock.calls[0][0]).toContain('tenant_acme.audit_logs_archive');
  });
});

// ---------------------------------------------------------------------------
describe('sealing covers every record and feeds alerts (reviewer findings 9, 10)', () => {
  const row = (id: string, seq: string, action = 'delete') => ({
    id, sequence: seq, created_at: new Date('2026-01-01T00:00:00.000Z'), action, entity_type: 'issue',
    entity_id: null, user_id: 'u1', ip_address: null, metadata: {}, user_email: null, user_name: null,
    entity_name: null, old_values: null, new_values: null, changed_fields: null, outcome: 'success',
    severity: 'info', http_method: null, request_path: null, status_code: null, user_agent: null, request_id: null,
  });

  it('seals rows of any age, not only the last day', async () => {
    await auditService.sealPending('acme');
    const pendingSql = mockClientQuery.mock.calls.map((c) => c[0] as string).find((s) => s.includes('record_hash IS NULL'))!;
    expect(pendingSql).not.toMatch(/INTERVAL '1 day'/);
  });

  it('assigns consecutive chain positions after the last sealed one', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT record_hash')) return { rows: [{ record_hash: 'a'.repeat(64), chain_position: '41' }] };
      if (sql.includes('record_hash IS NULL')) return { rows: [row('a', '9'), row('b', '10')] };
      return { rows: [] };
    });
    await auditService.sealPending('acme');
    const updates = mockClientQuery.mock.calls.filter((c) => (c[0] as string).startsWith('UPDATE'));
    expect(updates.map((u) => (u[1] as unknown[])[3])).toEqual([42, 43]);
    expect((updates[1][1] as unknown[])[0]).toBe((updates[0][1] as unknown[])[1]);
  });

  it('evaluates alert rules for rows inserted without auditService.log (bulk deletes)', async () => {
    const evaluate = vi.spyOn(auditAlertService, 'evaluate').mockResolvedValue([]);
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('record_hash IS NULL')) return { rows: [row('a', '1'), row('b', '2'), row('c', '3')] };
      return { rows: [] };
    });
    await auditService.sealPending('acme');
    expect(evaluate).toHaveBeenCalledTimes(1); // three identical events are one evaluation
    expect(evaluate.mock.calls[0][1]).toMatchObject({ action: 'delete', entityType: 'issue', userId: 'u1' });
  });
});

// ---------------------------------------------------------------------------
describe('secrets never reach application logs (reviewer finding 8)', () => {
  it('a failed insert logs no request values', async () => {
    mockPoolQuery.mockRejectedValue(new Error('insert failed'));
    await expect(
      auditService.log('acme', {
        action: 'create',
        entityType: 'user',
        newValues: { email: 'x@y.z', password: 'hunter2' },
      })
    ).rejects.toThrow();
    const logged = JSON.stringify((logger.error as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).not.toContain('hunter2');
  });
});

// ---------------------------------------------------------------------------
describe("tenant sensitive_fields apply from the first write (reviewer finding 7)", () => {
  function tenantDb(sensitive: string[]) {
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tenant_cold.audit_settings') && sql.startsWith('SELECT *')) {
        return { rows: [{ retention_days: 365, log_reads: false, log_exports: true, sensitive_fields: sensitive, alerts_enabled: false }] };
      }
      if (sql.includes('INSERT INTO tenant_cold.audit_logs')) return { rows: [{ id: 'x' }] };
      if (sql.startsWith('UPDATE')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
  }
  const insertParams = () =>
    mockPoolQuery.mock.calls.find((c) => (c[0] as string).includes('INSERT INTO tenant_cold.audit_logs'))![1] as string[];

  it('masks the tenant list on the first write of a process', async () => {
    tenantDb(['internal_note']);
    await auditService.logSafe('cold', {
      action: 'update', entityType: 'issue', newValues: { internal_note: 'private', title: 'ok' },
    });
    expect(insertParams()[8]).toBe(JSON.stringify({ internal_note: '[REDACTED]', title: 'ok' }));
  });

  it('applies a changed list on the very next write', async () => {
    tenantDb([]);
    await auditService.logSafe('cold', { action: 'update', entityType: 'issue', newValues: { sauce: 'secret recipe' } });
    mockPoolQuery.mockClear();
    tenantDb(['sauce']);
    await auditService.updateSettings('cold', { sensitive_fields: ['sauce'] }, 'u1');
    mockPoolQuery.mockClear();
    tenantDb(['sauce']);
    await auditService.log('cold', { action: 'update', entityType: 'issue', newValues: { sauce: 'secret recipe' } });
    expect(insertParams()[8]).toBe(JSON.stringify({ sauce: '[REDACTED]' }));
  });
});

// ---------------------------------------------------------------------------
describe('retention policy (reviewer findings 4, 12, 13)', () => {
  it('recomputes retention_until of every record when the policy changes', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 4, rows: [] });
    await auditRetentionService.applyRetentionPolicy('acme', 730);
    const sqls = mockPoolQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls.some((s) => s.includes('tenant_acme.audit_logs') && /retention_until = created_at \+ INTERVAL/.test(s) && !/retention_until IS NULL/.test(s))).toBe(true);
    expect(sqls.some((s) => s.includes('tenant_acme.audit_logs_archive'))).toBe(true);
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([730]);
  });

  it('the daily run corrects records stamped under an older policy', async () => {
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT *')) return { rows: [{ retention_days: 730, archive_after_days: null }] };
      return { rows: [], rowCount: 0 };
    });
    await auditRetentionService.runForTenant('acme');
    const backfill = mockPoolQuery.mock.calls.map((c) => c[0] as string).find((s) => s.includes('UPDATE tenant_acme.audit_logs'))!;
    expect(backfill).toContain('IS DISTINCT FROM');
  });

  it('manual cleanup uses the retention purge: newest record kept, purged positions recorded', async () => {
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tenant_acme.audit_settings')) return { rows: [{ retention_days: 30, archive_after_days: 7 }] };
      if (sql.startsWith('DELETE FROM tenant_acme.audit_logs_archive')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('DELETE FROM tenant_acme.audit_logs')) {
        return { rowCount: 2, rows: [{ chain_position: '4' }, { chain_position: '5' }] };
      }
      return { rowCount: 0, rows: [] };
    });
    const logSpy = vi.spyOn(auditService, 'logSafe').mockResolvedValue('run-1');
    const result = await auditRetentionService.runForTenant('acme', {
      archive: false,
      mode: 'cleanup',
      actor: { userId: 'admin-1' },
    });
    expect(result).toMatchObject({ archived: 0, purgedLive: 2, purgedArchive: 0 });
    const deletes = mockPoolQuery.mock.calls.map((c) => c[0] as string).filter((s) => s.startsWith('DELETE'));
    expect(deletes[0]).toContain('sequence < (SELECT MAX(sequence)');
    expect(deletes[0]).toContain('RETURNING chain_position');
    expect(deletes.some((s) => s.includes('audit_logs_archive'))).toBe(true);
    // archive: false never moves records
    expect(mockPoolQuery.mock.calls.some((c) => (c[0] as string).includes('INSERT INTO tenant_acme.audit_logs_archive'))).toBe(false);
    expect(logSpy).toHaveBeenCalledWith('acme', expect.objectContaining({
      action: 'retention_run',
      userId: 'admin-1',
      metadata: expect.objectContaining({ mode: 'cleanup', deletedCount: 2, purgedPositions: [[4, 5]] }),
    }));
    expect(mockInvalidate).toHaveBeenCalledWith('acme', 'audit');
    logSpy.mockRestore();
  });

  it('rejects an archive window that is not shorter than the effective retention', () => {
    const current = { retention_days: 365, archive_after_days: null };
    expect(validateRetentionPolicy(current, { archive_after_days: 400 })).toMatch(/smaller than retention_days/);
    expect(validateRetentionPolicy({ retention_days: 365, archive_after_days: 300 }, { retention_days: 200 })).toMatch(/smaller than retention_days/);
    expect(validateRetentionPolicy(current, { archive_after_days: 90 })).toBeNull();
    expect(validateRetentionPolicy(current, { retention_days: 90 })).toBeNull();
  });

  it('records every purged range: more than RANGES_PER_RECORD ranges continue in further retention_run records', async () => {
    const logSpy = vi.spyOn(auditService, 'logSafe').mockResolvedValue('run-1');
    const total = RANGES_PER_RECORD * 2 + 500;
    const purged: Array<[number, number]> = Array.from({ length: total }, (_, i) => [i * 2 + 1, i * 2 + 1]);
    await recordRetentionRun('acme', { userId: 'admin-1', metadata: { mode: 'cleanup', deletedCount: total } }, purged);
    expect(logSpy).toHaveBeenCalledTimes(3);
    const metas = logSpy.mock.calls.map((c) => c[1].metadata as Record<string, unknown>);
    const recorded = metas.flatMap((m) => m.purgedPositions as Array<[number, number]>);
    expect(recorded).toEqual(purged);
    expect(metas.map((m) => [m.part, m.parts])).toEqual([[1, 3], [2, 3], [3, 3]]);
    expect(metas[0].deletedCount).toBe(total);
    expect(metas[1].deletedCount).toBeUndefined();
    expect(logSpy.mock.calls.every((c) => c[1].action === 'retention_run' && c[1].userId === 'admin-1')).toBe(true);
    logSpy.mockRestore();
  });

  it('logs the ranges a retention_run record could not carry', async () => {
    const logSpy = vi.spyOn(auditService, 'logSafe').mockResolvedValue(null);
    await recordRetentionRun('acme', { metadata: {} }, [[3, 4]]);
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ purgedPositions: [[3, 4]] }),
      expect.stringContaining('Could not record purged audit chain positions')
    );
    logSpy.mockRestore();
  });

  it('never purges retention_run records, on every delete path', async () => {
    await auditRetentionService.purgeLive('acme', 30);
    await auditRetentionService.purgeArchive('acme', 30);
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await auditChainService.purgeExpired('acme');
    const deletes = mockPoolQuery.mock.calls.map((c) => c[0] as string).filter((s) => s.trimStart().startsWith('DELETE'));
    expect(deletes).toHaveLength(3);
    for (const sql of deletes) expect(sql).toContain("action <> 'retention_run'");
  });

  it('the chain purge records its positions through the same recorder', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rowCount: 3, rows: [{ chain_position: '7' }, { chain_position: '8' }, { chain_position: '10' }] });
    const logSpy = vi.spyOn(auditService, 'logSafe').mockResolvedValue('run-1');
    expect(await auditChainService.purgeExpired('acme')).toBe(3);
    expect(logSpy).toHaveBeenCalledWith('acme', expect.objectContaining({
      action: 'retention_run',
      metadata: expect.objectContaining({ deletedCount: 3, purgedPositions: [[7, 8], [10, 10]] }),
    }));
    logSpy.mockRestore();
  });

  it('records which chain positions a purge removed', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 3, rows: [{ chain_position: '5' }, { chain_position: '6' }, { chain_position: '9' }] });
    const ranges = await auditRetentionService.purgeLive('acme');
    expect(ranges.count).toBe(3);
    expect(ranges.positions).toEqual([[5, 6], [9, 9]]);
  });
});

// ---------------------------------------------------------------------------
describe('compliance reports include archived records (reviewer finding 5)', () => {
  it('reads live and archive for events, totals, user activity and privileged changes', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ total: 0, users: 0, count: 0, held: 0, open: 0, failed_logins: 0, denied: 0 }] });
    await generateAuditReport('acme', 'audit_trail_soc2', { from: new Date('2025-01-01'), to: new Date('2025-02-01') });
    const sqls = mockPoolQuery.mock.calls.map((c) => c[0] as string).filter((s) => s.includes('audit_logs') && s.includes('created_at BETWEEN'));
    expect(sqls.length).toBeGreaterThanOrEqual(5);
    for (const sql of sqls) expect(sql).toContain('audit_logs_archive');
  });
});

// ---------------------------------------------------------------------------
describe('report CSV is safe for spreadsheets (reviewer finding 11)', () => {
  const result = (data: Array<Record<string, unknown>>) => ({
    reportType: 'audit_trail_soc2' as const,
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    params: { from: new Date('2026-01-01'), to: new Date('2026-01-31') },
    summary: {},
    data,
  });

  it('neutralises formulas in user-controlled fields', () => {
    const csv = complianceReportsService.exportToCsv(result([{ entity_name: '=HYPERLINK("http://evil","x")', n: -5 }]));
    const line = csv.split('\n')[1];
    expect(line.startsWith('"\'=HYPERLINK')).toBe(true);
    expect(line.endsWith(',-5')).toBe(true); // real numbers stay numbers
  });

  it('quotes carriage returns', () => {
    const csv = complianceReportsService.exportToCsv(result([{ entity_name: 'a\rb' }]));
    expect(csv).toContain('"a\rb"');
  });
});
