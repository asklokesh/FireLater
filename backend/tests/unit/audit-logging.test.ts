import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockClientQuery = vi.hoisted(() => vi.fn());
const mockClientRelease = vi.hoisted(() => vi.fn());

vi.mock('../../src/config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
    connect: vi.fn(async () => ({ query: mockClientQuery, release: mockClientRelease })),
  },
}));

vi.mock('../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug.replace(/-/g, '_')}`,
  },
}));

vi.mock('../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn((_key: string, fn: () => Promise<unknown>) => fn()),
    invalidateTenant: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  auditService,
  maskSensitiveFields,
  diffValues,
  csvCell,
  toCsv,
} from '../../src/services/audit.js';
import { auditChainService } from '../../src/services/audit-chain.js';
import { groupKeyFor, ruleMatches, type AuditAlertRule } from '../../src/services/audit-alerts.js';
import { auditAlertService } from '../../src/services/audit-alerts.js';
import { auditRetentionService } from '../../src/services/audit-retention.js';
import { controlFor } from '../../src/services/audit-reports.js';
import {
  resolveAuditTarget,
  classifyRequest,
  registerAuditHooks,
} from '../../src/middleware/auditHooks.js';

const ISSUE = '3f2b8f1e-5c1a-4d63-9a77-0d9f1c1b2a10';

beforeEach(() => {
  mockPoolQuery.mockReset();
  mockClientQuery.mockReset();
  mockClientRelease.mockReset();
  mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('maskSensitiveFields', () => {
  it('keeps arrays as arrays and masks inside them', () => {
    const masked = maskSensitiveFields({
      tags: ['a', 'b'],
      items: [{ name: 'x', password: 'p' }],
    });
    expect(masked?.tags).toEqual(['a', 'b']);
    expect(masked?.items).toEqual([{ name: 'x', password: '[REDACTED]' }]);
  });

  it('matches camelCase / prefixed variants of sensitive names', () => {
    const masked = maskSensitiveFields({
      newPassword: 'a',
      accessToken: 'b',
      client_secret: 'c',
      apiKey: 'd',
      classname: 'ok',
    });
    expect(masked).toEqual({
      newPassword: '[REDACTED]',
      accessToken: '[REDACTED]',
      client_secret: '[REDACTED]',
      apiKey: '[REDACTED]',
      classname: 'ok',
    });
  });

  it('truncates very long strings', () => {
    const masked = maskSensitiveFields({ description: 'x'.repeat(10000) });
    expect((masked?.description as string).length).toBeLessThan(5000);
    expect(masked?.description as string).toContain('[truncated]');
  });
});

describe('diffValues (field-level changes)', () => {
  it('returns only changed fields with old and new values', () => {
    const diff = diffValues(
      { title: 'a', priority: 'low', status: 'new', updated_at: '1' },
      { title: 'a', priority: 'high', status: 'new', updated_at: '2' },
      ['updated_at']
    );
    expect(diff.changedFields).toEqual(['priority']);
    expect(diff.oldValues).toEqual({ priority: 'low' });
    expect(diff.newValues).toEqual({ priority: 'high' });
  });

  it('reports added and removed fields', () => {
    const diff = diffValues({ a: 1 }, { b: 2 });
    expect(diff.changedFields.sort()).toEqual(['a', 'b']);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formulas and escapes quotes', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('builds a header and rows', () => {
    expect(toCsv([{ a: 1, b: 'x' }], ['a', 'b'])).toBe('a,b\n1,x\n');
  });
});

describe('auditService.log (hash chain)', () => {
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('inserts the record first, with retention derived from the tenant settings', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'log-1' }], rowCount: 1 });
    mockClientQuery.mockResolvedValue({ rows: [] });

    const id = await auditService.log('acme', {
      userId: 'u1',
      userEmail: 'a@b.c',
      action: 'update',
      entityType: 'issue',
      entityId: ISSUE,
      oldValues: { priority: 'low', password: 'x' },
      newValues: { priority: 'high', password: 'y' },
      ipAddress: '10.0.0.1',
      severity: 'medium',
      outcome: 'success',
      httpMethod: 'PUT',
      requestPath: '/v1/issues/x',
      statusCode: 200,
    });
    expect(id).toBe('log-1');

    const [sql, p] = mockPoolQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO tenant_acme.audit_logs');
    expect(sql).toContain('FROM tenant_acme.audit_settings');
    expect(p[7]).toBe(JSON.stringify({ priority: 'low', password: '[REDACTED]' }));
    expect(p[9]).toEqual(['priority', 'password']);
    expect(p[10]).toBe('10.0.0.1');
    expect(p.slice(15)).toEqual(['medium', 'success', 'PUT', '/v1/issues/x', 200]);
    await settle();
  });

  it('ignores an invalid IP address instead of failing the insert', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'log-2' }], rowCount: 1 });
    mockClientQuery.mockResolvedValue({ rows: [] });
    await auditService.log('acme', { action: 'login', entityType: 'auth', ipAddress: 'not-an-ip' });
    expect(mockPoolQuery.mock.calls[0][1][10]).toBeNull();
    await settle();
  });

  it('seals pending records under an advisory lock with the hash the verifier re-derives', async () => {
    const createdAt = new Date('2026-01-02T03:04:05.678Z');
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT record_hash')) return { rows: [{ record_hash: 'a'.repeat(64) }] };
      if (sql.includes('record_hash IS NULL')) {
        return {
          rows: [
            {
              id: 'row-1',
              sequence: '7',
              created_at: createdAt,
              action: 'update',
              entity_type: 'issue',
              entity_id: ISSUE,
              user_id: 'u1',
              ip_address: '10.0.0.1',
              metadata: {},
            },
          ],
        };
      }
      return { rows: [] };
    });

    const sealed = await auditService.sealPending('acme');
    expect(sealed).toBe(1);

    const calls = mockClientQuery.mock.calls;
    expect(calls[0][0]).toBe('BEGIN');
    expect(calls[1][0]).toContain('pg_advisory_xact_lock');
    expect(calls[calls.length - 1][0]).toBe('COMMIT');
    expect(mockClientRelease).toHaveBeenCalled();

    const update = calls.find((c) => (c[0] as string).startsWith('UPDATE'))!;
    const digest = auditChainService.computeContentDigest({}, 2);
    const expected = auditChainService.computeHash(
      {
        action: 'update',
        chain_position: 1,
        content: digest,
        created_at: createdAt.toISOString(),
        digest_version: 2,
        entity_id: ISSUE,
        entity_type: 'issue',
        ip_address: '10.0.0.1',
        metadata: {},
        sequence: 7,
        user_id: 'u1',
      },
      'a'.repeat(64)
    );
    expect(update[1]).toEqual(['a'.repeat(64), expected, digest, 1, 2, 'row-1']);
  });

  it('chains several pending records in sequence order', async () => {
    const mk = (id: string, seq: string) => ({
      id, sequence: seq, created_at: new Date('2026-01-01T00:00:00.000Z'), action: 'create',
      entity_type: 'issue', entity_id: null, user_id: null, ip_address: null, metadata: {},
    });
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT record_hash')) return { rows: [] };
      if (sql.includes('record_hash IS NULL')) return { rows: [mk('a', '1'), mk('b', '2')] };
      return { rows: [] };
    });
    await auditService.sealPending('acme');
    const updates = mockClientQuery.mock.calls.filter((c) => (c[0] as string).startsWith('UPDATE'));
    expect(updates).toHaveLength(2);
    expect(updates[0][1][0]).toBeNull(); // genesis
    expect(updates[1][1][0]).toBe(updates[0][1][1]); // second links to first
  });

  it('rolls back and releases the connection when sealing fails', async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT record_hash')) throw new Error('boom');
      return { rows: [] };
    });
    await expect(auditService.sealPending('acme')).rejects.toThrow('boom');
    expect(mockClientQuery.mock.calls.map((c) => c[0])).toContain('ROLLBACK');
    expect(mockClientRelease).toHaveBeenCalled();
  });

  it('logSafe never throws', async () => {
    mockPoolQuery.mockRejectedValue(new Error('db down'));
    await expect(auditService.logSafe('acme', { action: 'login', entityType: 'auth' })).resolves.toBeNull();
  });
});

describe('auditService.query (search)', () => {
  it('binds every filter as a parameter and uses the full-text expression', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: '1' }, { id: '2' }] });

    const res = await auditService.query('acme', {
      q: "o'brien; DROP TABLE x",
      userId: 'u1',
      severity: 'high',
      outcome: 'denied',
      limit: 10,
      offset: 5,
    });
    expect(res).toEqual({ logs: [{ id: '1' }, { id: '2' }], total: 2 });

    const [countSql, countParams] = mockPoolQuery.mock.calls[0];
    expect(countSql).toContain("websearch_to_tsquery('simple', $");
    expect(countSql).not.toContain('DROP TABLE');
    expect(countParams).toEqual(['u1', 'high', 'denied', "o'brien; DROP TABLE x"]);
    expect(countParams).toContain('denied');
    const [listSql, listParams] = mockPoolQuery.mock.calls[1];
    expect(listSql).toContain('LIMIT $5 OFFSET $6');
    expect(listParams.slice(-2)).toEqual([10, 5]);
  });

  it('can search the archive and both tables', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ count: '0' }] });
    await auditService.query('acme', { source: 'archive' });
    expect(mockPoolQuery.mock.calls[0][0]).toContain('tenant_acme.audit_logs_archive');
    mockPoolQuery.mockClear();
    await auditService.query('acme', { source: 'all' });
    expect(mockPoolQuery.mock.calls[0][0]).toContain('UNION ALL');
  });

  it('caps the total at 100000 and flags it', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ count: '100001' }] });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    const res = await auditService.query('acme', {});
    expect(res.total).toBe(100000);
    expect(res.totalCapped).toBe(true);
  });
});

describe('alert rules', () => {
  const rule: AuditAlertRule = {
    id: 'r1',
    name: 'Failed logins',
    description: null,
    actions: ['login_failed'],
    entity_types: [],
    outcome: null,
    threshold: 3,
    window_minutes: 15,
    group_by: 'user',
    severity: 'high',
    enabled: true,
    created_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('groups events by the actor named in the rule', () => {
    const event = { action: 'login_failed', entityType: 'auth', outcome: 'failure', userEmail: 'a@b.c', userId: 'u', ipAddress: '1.2.3.4' };
    expect(groupKeyFor('user', event)).toBe('a@b.c');
    expect(groupKeyFor('ip', event)).toBe('1.2.3.4');
    expect(groupKeyFor('none', event)).toBe('');
  });

  it('matches on action, entity type, outcome and enabled flag', () => {
    const ev = { action: 'login_failed', entityType: 'auth', outcome: 'failure' };
    expect(ruleMatches(rule, ev)).toBe(true);
    expect(ruleMatches({ ...rule, enabled: false }, ev)).toBe(false);
    expect(ruleMatches(rule, { ...ev, action: 'login' })).toBe(false);
    expect(ruleMatches({ ...rule, actions: [], outcome: 'denied' }, ev)).toBe(false);
    expect(ruleMatches({ ...rule, actions: [], outcome: 'failure', entity_types: ['issue'] }, ev)).toBe(false);
  });

  it('raises an alert once the threshold is reached and notifies admins', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [rule] }) // rules
      .mockResolvedValueOnce({ rows: [{ count: 3, first_at: new Date(), last_at: new Date() }] }) // count
      .mockResolvedValueOnce({ rows: [{ id: 'alert-1', rule_name: 'Failed logins', event_count: 3, group_key: 'a@b.c', severity: 'high', rule_id: 'r1' }] }) // insert
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // notifications

    const raised = await auditAlertService.evaluate('alerts-tenant-1', {
      action: 'login_failed',
      entityType: 'auth',
      outcome: 'failure',
      userEmail: 'a@b.c',
    });
    expect(raised).toHaveLength(1);
    expect(mockPoolQuery.mock.calls[3][0]).toContain('audit_alert');
  });

  it('does nothing below the threshold', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [rule] })
      .mockResolvedValueOnce({ rows: [{ count: 2, first_at: null, last_at: null }] });
    const raised = await auditAlertService.evaluate('alerts-tenant-2', {
      action: 'login_failed',
      entityType: 'auth',
      outcome: 'failure',
      userEmail: 'a@b.c',
    });
    expect(raised).toEqual([]);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
  });
});

describe('retention', () => {
  it('refuses a legal hold without a scope', async () => {
    await expect(auditRetentionService.setLegalHold('acme', {}, true)).rejects.toThrow(/scope/);
  });

  it('keeps legal-hold records and the newest record when purging', async () => {
    mockPoolQuery.mockResolvedValue({ rowCount: 3, rows: [] });
    await auditRetentionService.purgeLive('acme');
    const sql = mockPoolQuery.mock.calls[0][0] as string;
    expect(sql).toContain('legal_hold IS NULL OR legal_hold = false');
    expect(sql).toContain('sequence < (SELECT MAX(sequence)');
  });

  const catalog = (archiveColumns: string[]) => ({
    rows: [
      ...['id', 'action', 'changes', 'created_at'].map((c) => ({ table_name: 'audit_logs', column_name: c })),
      ...archiveColumns.map((c) => ({ table_name: 'audit_logs_archive', column_name: c })),
    ],
  });

  it('archives in batches until a short batch comes back', async () => {
    mockPoolQuery
      .mockResolvedValueOnce(catalog(['id', 'action', 'changes', 'created_at', 'archived_at']))
      .mockResolvedValueOnce({ rowCount: 5000 })
      .mockResolvedValueOnce({ rowCount: 12 });
    const moved = await auditRetentionService.archiveOld('acme', 30);
    expect(moved).toBe(5012);
    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
  });

  it('moves every live column, including the legacy changes payload', async () => {
    mockPoolQuery
      .mockResolvedValueOnce(catalog(['id', 'action', 'changes', 'created_at', 'archived_at']))
      .mockResolvedValueOnce({ rowCount: 1 });
    await auditRetentionService.archiveOld('acme', 30);
    const sql = mockPoolQuery.mock.calls[1][0] as string;
    expect(sql).toContain('INSERT INTO tenant_acme.audit_logs_archive ("id", "action", "changes", "created_at", archived_at)');
  });

  it('refuses to archive when the archive table lacks a live column', async () => {
    mockPoolQuery.mockResolvedValueOnce(catalog(['id', 'action', 'created_at', 'archived_at']));
    await expect(auditRetentionService.archiveOld('acme', 30)).rejects.toThrow(/missing columns: changes/);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
  });
});

describe('compliance control mapping', () => {
  it('maps events to SOC 2 controls', () => {
    expect(controlFor('audit_trail_soc2', 'login_failed', 'failure').id).toBe('CC6.1');
    expect(controlFor('audit_trail_soc2', 'permission_granted', 'success').id).toBe('CC6.3');
    expect(controlFor('audit_trail_soc2', 'update', 'success').id).toBe('CC8.1');
    expect(controlFor('audit_trail_soc2', 'update', 'denied').id).toBe('CC6.6');
  });

  it('maps events to ISO 27001 controls', () => {
    expect(controlFor('audit_trail_iso27001', 'login', 'success').id).toBe('A.8.5');
    expect(controlFor('audit_trail_iso27001', 'export', 'success').id).toBe('A.8.12');
    expect(controlFor('audit_trail_iso27001', 'delete', 'success').id).toBe('A.8.32');
    expect(controlFor('audit_trail_iso27001', 'view', 'denied').id).toBe('A.8.16');
  });
});

describe('request classification', () => {
  it('resolves entity, id and verb from the URL', () => {
    const t = resolveAuditTarget(`/v1/issues/${ISSUE}/assign?x=1`)!;
    expect(t.entityType).toBe('issue');
    expect(t.entityId).toBe(ISSUE);
    expect(t.verb).toBe('assign');
    expect(resolveAuditTarget('/v1/kb/articles/' + ISSUE)!.entityType).toBe('kb_article');
    expect(resolveAuditTarget('/v1/some-thing')!.entityType).toBe('some_thing');
    expect(resolveAuditTarget('/health')).toBeNull();
  });

  it('classifies methods and special routes', () => {
    const c = (method: string, url: string) => classifyRequest(method, resolveAuditTarget(url)!);
    expect(c('POST', '/v1/issues').action).toBe('create');
    expect(c('POST', `/v1/issues/${ISSUE}/status`).action).toBe('update');
    expect(c('PUT', `/v1/issues/${ISSUE}`).action).toBe('update');
    expect(c('DELETE', `/v1/issues/${ISSUE}`)).toEqual({ action: 'delete', severity: 'medium' });
    expect(c('POST', `/v1/issues/${ISSUE}/assign`).action).toBe('assign');
    expect(c('POST', `/v1/issues/${ISSUE}/escalate`).action).toBe('escalate');
    expect(c('PUT', `/v1/users/${ISSUE}/roles`)).toEqual({ action: 'permission_granted', severity: 'high' });
    expect(c('DELETE', `/v1/roles/${ISSUE}`).action).toBe('permission_revoked');
    expect(c('PATCH', '/v1/settings/general').action).toBe('config_change');
    expect(c('POST', '/v1/auth/logout').action).toBe('logout');
    expect(c('GET', '/v1/issues').action).toBe('view');
  });
});

describe('audit hooks (field-level change tracking through a real Fastify app)', () => {
  async function buildApp() {
    const app = Fastify();
    await app.register(jwt, { secret: 'test-secret-test-secret-test-secret' });
    registerAuditHooks(app);
    const auth = async (request: import('fastify').FastifyRequest) => {
      await request.jwtVerify();
      if (!request.user.roles.includes('admin')) {
        const err = new Error('nope') as Error & { statusCode: number };
        err.statusCode = 403;
        throw err;
      }
    };
    app.put('/v1/issues/:id', { preHandler: [auth] }, async () => ({ ok: true }));
    app.post('/v1/issues', { preHandler: [auth] }, async (_req, reply) => reply.code(201).send({ id: ISSUE, title: 'New one' }));
    app.delete('/v1/issues/:id', { preHandler: [auth] }, async () => ({ ok: true }));
    app.get('/v1/issues', { preHandler: [auth] }, async () => ({ items: [] }));
    app.get('/v1/audit', { preHandler: [auth] }, async () => ({ logs: [] }));
    return app;
  }

  const token = (app: Awaited<ReturnType<typeof buildApp>>, roles = ['admin']) =>
    app.jwt.sign({ userId: 'u1', email: 'admin@acme.test', tenantSlug: 'acme', roles });

  /** Wait for the fire-and-forget onResponse work. */
  const settle = () => new Promise((r) => setTimeout(r, 30));

  let logSpy: ReturnType<typeof vi.spyOn>;
  let settingsSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(auditService, 'log').mockResolvedValue('id');
    vi.spyOn(auditService, 'currentSequence').mockResolvedValue(null);
    settingsSpy = vi.spyOn(auditService, 'getCachedSettings').mockResolvedValue({
      retention_days: 365, log_reads: false, log_exports: true, sensitive_fields: [], archive_after_days: null, alerts_enabled: true,
    });
  });

  it('records old and new values of an update, excluding updated_at', async () => {
    const app = await buildApp();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: ISSUE, title: 'Printer', priority: 'low', updated_at: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: ISSUE, title: 'Printer', priority: 'high', updated_at: 2 }] });

    const res = await app.inject({
      method: 'PUT',
      url: `/v1/issues/${ISSUE}`,
      headers: { authorization: `Bearer ${token(app)}`, 'user-agent': 'vitest' },
      payload: { priority: 'high' },
    });
    expect(res.statusCode).toBe(200);
    await settle();

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [tenant, entry] = logSpy.mock.calls[0];
    expect(tenant).toBe('acme');
    expect(entry).toMatchObject({
      action: 'update',
      entityType: 'issue',
      entityId: ISSUE,
      entityName: 'Printer',
      oldValues: { priority: 'low' },
      newValues: { priority: 'high' },
      changedFields: ['priority'],
      userId: 'u1',
      userEmail: 'admin@acme.test',
      userAgent: 'vitest',
      outcome: 'success',
      httpMethod: 'PUT',
      statusCode: 200,
    });
    expect(entry.ipAddress).toBeTruthy();
    await app.close();
  });

  it('records the id of a created entity and the (masked later) request body', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/issues',
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { title: 'New one', password: 'x' },
    });
    expect(res.statusCode).toBe(201);
    await settle();
    expect(logSpy.mock.calls[0][1]).toMatchObject({
      action: 'create',
      entityType: 'issue',
      entityId: ISSUE,
      entityName: 'New one',
      newValues: { title: 'New one', password: 'x' },
    });
    await app.close();
  });

  it('records the snapshot as old values on delete', async () => {
    const app = await buildApp();
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: ISSUE, title: 'Gone' }] });
    await app.inject({ method: 'DELETE', url: `/v1/issues/${ISSUE}`, headers: { authorization: `Bearer ${token(app)}` } });
    await settle();
    expect(logSpy.mock.calls[0][1]).toMatchObject({
      action: 'delete',
      severity: 'medium',
      oldValues: { id: ISSUE, title: 'Gone' },
    });
    await app.close();
  });

  it('logs denied access, and reads only when enabled', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/v1/issues',
      headers: { authorization: `Bearer ${token(app, ['viewer'])}` },
    });
    expect(res.statusCode).toBe(403);
    await settle();
    expect(logSpy.mock.calls[0][1]).toMatchObject({ outcome: 'denied', severity: 'medium', statusCode: 403 });

    logSpy.mockClear();
    await app.inject({ method: 'GET', url: '/v1/issues', headers: { authorization: `Bearer ${token(app)}` } });
    await settle();
    expect(logSpy).not.toHaveBeenCalled(); // log_reads is off

    settingsSpy.mockResolvedValue({
      retention_days: 365, log_reads: true, log_exports: true, sensitive_fields: [], archive_after_days: null, alerts_enabled: true,
    });
    await app.inject({ method: 'GET', url: '/v1/issues', headers: { authorization: `Bearer ${token(app)}` } });
    await settle();
    expect(logSpy.mock.calls[0][1]).toMatchObject({ action: 'view', entityType: 'issue' });
    await app.close();
  });

  it('never audits the audit API itself or unauthenticated requests', async () => {
    const app = await buildApp();
    await app.inject({ method: 'GET', url: '/v1/audit', headers: { authorization: `Bearer ${token(app)}` } });
    await app.inject({ method: 'PUT', url: `/v1/issues/${ISSUE}`, payload: {} });
    await settle();
    expect(logSpy).not.toHaveBeenCalled();
    await app.close();
  });

  it('does not fail the request when writing the audit record fails', async () => {
    const app = await buildApp();
    logSpy.mockRejectedValue(new Error('db down'));
    mockPoolQuery.mockResolvedValue({ rows: [] });
    const res = await app.inject({
      method: 'PUT',
      url: `/v1/issues/${ISSUE}`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    await settle();
    await app.close();
  });
});

describe('one record per action: the request merges into the service-written row', () => {
  const entry = {
    userId: 'u1', userEmail: 'admin@acme.test', action: 'update' as const, entityType: 'issue', entityId: ISSUE,
    oldValues: { title: 'Printer', priority: 'low' }, newValues: { title: 'Printer!', priority: 'high' },
    changedFields: ['title', 'priority'], ipAddress: '10.0.0.1', userAgent: 'vitest', requestId: 'req-1',
    httpMethod: 'PUT', requestPath: `/v1/issues/${ISSUE}`, statusCode: 200,
  };
  let logSpy: ReturnType<typeof vi.spyOn>;
  let sealSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    logSpy = vi.spyOn(auditService, 'log').mockResolvedValue('new-row');
    sealSpy = vi.spyOn(auditService, 'sealPending').mockResolvedValue(0);
  });
  afterEach(() => {
    logSpy.mockRestore();
    sealSpy.mockRestore();
  });

  it('merges the request context into an unsealed service row under the chain lock', async () => {
    mockClientQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT id, record_hash') ? { rows: [{ id: 'svc-row', record_hash: null }] } : { rows: [], rowCount: 1 }
    );
    const id = await auditService.logRequest('acme', entry, 41);
    expect(id).toBe('svc-row');
    expect(logSpy).not.toHaveBeenCalled();
    const sqls = mockClientQuery.mock.calls.map((c) => c[0] as string);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('pg_advisory_xact_lock');
    const select = mockClientQuery.mock.calls[2];
    expect(select[0]).toContain('sequence > $1');
    expect(select[1]).toEqual([41, ISSUE, 'u1']);
    const update = mockClientQuery.mock.calls.find((c) => (c[0] as string).startsWith('UPDATE'))!;
    expect(update[0]).toContain('WHERE id = $1 AND record_hash IS NULL');
    expect(update[0]).not.toContain('changes =');
    expect(update[1].slice(0, 1)).toEqual(['svc-row']);
    expect(update[1]).toEqual(expect.arrayContaining(['10.0.0.1', 'vitest', 'req-1', 'PUT', 200, ['title', 'priority']]));
    expect(sqls[sqls.length - 1]).toBe('COMMIT');
  });

  it('writes nothing more when the service row was already sealed', async () => {
    mockClientQuery.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT id, record_hash') ? { rows: [{ id: 'svc-row', record_hash: 'h' }] } : { rows: [] }
    );
    expect(await auditService.logRequest('acme', entry, 41)).toBe('svc-row');
    expect(logSpy).not.toHaveBeenCalled();
    expect(mockClientQuery.mock.calls.some((c) => (c[0] as string).startsWith('UPDATE'))).toBe(false);
  });

  it('writes its own record when the service wrote none', async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });
    expect(await auditService.logRequest('acme', entry, 41)).toBe('new-row');
    expect(logSpy).toHaveBeenCalledWith('acme', entry);
  });

  it('writes its own record when no sequence watermark was taken', async () => {
    expect(await auditService.logRequest('acme', entry, null)).toBe('new-row');
    expect(mockClientQuery).not.toHaveBeenCalled();
  });
});

describe('error recovery replays are not audited twice', () => {
  it('a GET replayed after a transient failure writes one view record', async () => {
    const { errorHandlerPlugin } = await import('../../src/plugins/errorHandler.js');
    const { ServiceUnavailableError } = await import('../../src/lib/errors.js');
    const { clearRecoveryHandlers, registerDefaultRecoveryHandlers } = await import('../../src/lib/errorRecovery.js');
    clearRecoveryHandlers();
    registerDefaultRecoveryHandlers();
    const logSpy = vi.spyOn(auditService, 'log').mockResolvedValue('id');
    const settingsSpy = vi.spyOn(auditService, 'getCachedSettings').mockResolvedValue({
      retention_days: 365, log_reads: true, log_exports: true, sensitive_fields: [], archive_after_days: null, alerts_enabled: true,
    });
    const app = Fastify();
    await app.register(jwt, { secret: 'test-secret-test-secret-test-secret' });
    await app.register(errorHandlerPlugin);
    registerAuditHooks(app);
    let calls = 0;
    app.get('/v1/issues/:id', {
      config: { replayOnTransientError: true },
      preHandler: [async (request) => { await request.jwtVerify(); }],
    }, async () => {
      if (calls++ === 0) throw new ServiceUnavailableError();
      return { id: ISSUE };
    });
    const token = app.jwt.sign({ userId: 'u1', email: 'admin@acme.test', tenantSlug: 'acme', roles: ['admin'] });
    const res = await app.inject({ method: 'GET', url: `/v1/issues/${ISSUE}`, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(calls).toBe(2);
    await new Promise((r) => setTimeout(r, 30));
    const views = logSpy.mock.calls.filter((c) => c[1].action === 'view');
    expect(views).toHaveLength(1);
    await app.close();
    logSpy.mockRestore();
    settingsSpy.mockRestore();
  });
});
