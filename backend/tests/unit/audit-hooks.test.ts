import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const mockPoolQuery = vi.hoisted(() => vi.fn());

vi.mock('../../src/config/database.js', () => ({
  pool: { query: mockPoolQuery, connect: vi.fn() },
}));
vi.mock('../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (slug: string) => `tenant_${slug}` },
}));
vi.mock('../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn((_k: string, fn: () => Promise<unknown>) => fn()),
    invalidateTenant: vi.fn().mockResolvedValue(0),
  },
}));
vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { auditService } from '../../src/services/audit.js';
import {
  registerAuditHooks,
  resolveAuditTarget,
  classifyRequest,
} from '../../src/middleware/auditHooks.js';

const ID = '3f2b8f1e-5c1a-4d63-9a77-0d9f1c1b2a10';
const SUB_ID = '7a1d2c3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d';

const classify = (method: string, url: string) => classifyRequest(method, resolveAuditTarget(url)!);

describe('sub-resource requests are not parent deletes (reviewer finding 1)', () => {
  it.each([
    [`/v1/groups/${ID}/members/${SUB_ID}`],
    [`/v1/issues/${ID}/problem`],
    [`/v1/applications/${ID}/environments/${SUB_ID}`],
  ])('DELETE %s is an update of the parent, not a delete', (url) => {
    expect(classify('DELETE', url).action).toBe('update');
  });

  it('a top-level DELETE is still a delete', () => {
    expect(classify('DELETE', `/v1/groups/${ID}`).action).toBe('delete');
    expect(classify('DELETE', `/v1/kb/${ID}`).action).toBe('delete');
  });
});

describe('knowledge base URLs resolve to the article table (reviewer finding 2)', () => {
  it('maps the real mount /v1/kb/:articleId', () => {
    const t = resolveAuditTarget(`/v1/kb/${ID}`)!;
    expect(t.entityType).toBe('kb_article');
    expect(t.entity?.table).toBe('kb_articles');
    expect(t.entityId).toBe(ID);
  });
});

describe('hooks through a real Fastify app', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  async function buildApp() {
    const app = Fastify();
    await app.register(jwt, { secret: 'test-secret-test-secret-test-secret' });
    registerAuditHooks(app);
    const auth = async (request: import('fastify').FastifyRequest) => {
      await request.jwtVerify();
    };
    app.delete('/v1/groups/:id/members/:userId', { preHandler: [auth] }, async () => ({ ok: true }));
    app.put('/v1/users/:id/roles', { preHandler: [auth] }, async () => ({ ok: true }));
    app.put('/v1/kb/:articleId', { preHandler: [auth] }, async () => ({ ok: true }));
    app.post('/v1/issues/:id/comments', { preHandler: [auth] }, async () => ({ ok: true }));
    return app;
  }
  const token = (app: Awaited<ReturnType<typeof buildApp>>) =>
    app.jwt.sign({ userId: 'u1', email: 'admin@acme.test', tenantSlug: 'acme', roles: ['admin'] });
  const settle = () => new Promise((r) => setTimeout(r, 30));

  beforeEach(() => {
    mockPoolQuery.mockReset();
    logSpy = vi.spyOn(auditService, 'log').mockResolvedValue('id');
    // No service-written row to merge into: the hook writes its own record.
    vi.spyOn(auditService, 'currentSequence').mockResolvedValue(null);
    vi.spyOn(auditService, 'getCachedSettings').mockResolvedValue({
      retention_days: 365, log_reads: false, log_exports: true, sensitive_fields: [], archive_after_days: null, alerts_enabled: true,
    });
  });

  it('DELETE /v1/groups/:id/members/:userId is logged as an update without the parent row as old values', async () => {
    const app = await buildApp();
    mockPoolQuery.mockImplementation(async (sql: string) =>
      sql.includes('group_members')
        ? { rows: [{ v: [SUB_ID] }] }
        : { rows: [{ id: ID, name: 'Service Desk' }] }
    );
    await app.inject({
      method: 'DELETE',
      url: `/v1/groups/${ID}/members/${SUB_ID}`,
      headers: { authorization: `Bearer ${token(app)}` },
    });
    await settle();
    const entry = logSpy.mock.calls[0][1];
    expect(entry.action).toBe('update');
    expect(entry.entityType).toBe('group');
    expect(entry.entityId).toBe(ID);
    expect(entry.oldValues).not.toHaveProperty('name');
    expect(entry.metadata).toMatchObject({ subResource: `members/${SUB_ID}` });
    await app.close();
  });

  it('PUT /v1/kb/:articleId records the article field-level change', async () => {
    const app = await buildApp();
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: ID, title: 'How to reset', status: 'draft' }] })
      .mockResolvedValueOnce({ rows: [{ id: ID, title: 'How to reset', status: 'published' }] });
    await app.inject({
      method: 'PUT',
      url: `/v1/kb/${ID}`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { status: 'published' },
    });
    await settle();
    expect(mockPoolQuery.mock.calls[0][0]).toContain('tenant_acme.kb_articles');
    expect(logSpy.mock.calls[0][1]).toMatchObject({
      entityType: 'kb_article',
      oldValues: { status: 'draft' },
      newValues: { status: 'published' },
    });
    await app.close();
  });

  it('PUT /v1/users/:id/roles says which roles were granted', async () => {
    const app = await buildApp();
    let roleReads = 0;
    mockPoolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('user_roles')) {
        roleReads += 1;
        return { rows: [{ v: roleReads === 1 ? ['viewer'] : ['admin', 'viewer'] }] };
      }
      return { rows: [{ id: ID, name: 'Vic', email: 'v@acme.test' }] };
    });
    await app.inject({
      method: 'PUT',
      url: `/v1/users/${ID}/roles`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { roleIds: ['role-admin'] },
    });
    await settle();
    const entry = logSpy.mock.calls[0][1];
    expect(entry.action).toBe('permission_granted');
    expect(entry.oldValues).toMatchObject({ roles: ['viewer'] });
    expect(entry.newValues).toMatchObject({ roles: ['admin', 'viewer'], roleIds: ['role-admin'] });
    expect(entry.changedFields).toEqual(expect.arrayContaining(['roles', 'roleIds']));
    await app.close();
  });

  it('a comment on an issue records what was posted', async () => {
    const app = await buildApp();
    mockPoolQuery.mockResolvedValue({ rows: [{ id: ID, title: 'Printer' }] });
    await app.inject({
      method: 'POST',
      url: `/v1/issues/${ID}/comments`,
      headers: { authorization: `Bearer ${token(app)}` },
      payload: { content: 'rebooted the printer' },
    });
    await settle();
    expect(logSpy.mock.calls[0][1].newValues).toMatchObject({ content: 'rebooted the printer' });
    await app.close();
  });
});

describe('the hooks never make a route send twice', () => {
  it('a route that calls reply.send() without returning it answers once, with no unhandled rejection', async () => {
    const { errorHandlerPlugin } = await import('../../src/plugins/errorHandler.js');
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    const app = Fastify();
    await app.register(jwt, { secret: 'test-secret-test-secret-test-secret' });
    await app.register(errorHandlerPlugin);
    registerAuditHooks(app);
    app.post('/v1/things', async (_request, reply) => {
      await new Promise((r) => setTimeout(r, 5));
      reply.send({ id: ID }); // not returned, like several existing routes
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await fetch(`http://127.0.0.1:${port}/v1/things`, { method: 'POST' })).status);
    }
    await new Promise((r) => setTimeout(r, 100));
    await app.close();
    process.off('unhandledRejection', onRejection);
    expect(statuses).toEqual([200, 200, 200]);
    expect(rejections).toEqual([]);
  });
});
