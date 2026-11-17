import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import Fastify from 'fastify';

const permCheck = vi.fn();
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (...perms: string[]) => async (request: { user?: unknown }) => {
    permCheck(...perms);
    request.user = { userId: 'u1', tenantSlug: 'acme', roles: ['agent'] };
  },
}));

const executeBulk = vi.fn();
vi.mock('../../../src/services/bulk.js', async (orig) => {
  const actual = await orig<typeof import('../../../src/services/bulk.js')>();
  return { ...actual, executeBulk: (...a: unknown[]) => executeBulk(...a) };
});

const queueAdd = vi.fn();
const queueGetJob = vi.fn();
vi.mock('../../../src/jobs/bulkQueue.js', () => ({
  bulkQueue: { add: (...a: unknown[]) => queueAdd(...a), getJob: (...a: unknown[]) => queueGetJob(...a) },
}));

vi.mock('../../../src/utils/ssrf.js', () => ({
  validateUrlForSSRF: vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('internal')) {
      const { BadRequestError } = await import('../../../src/utils/errors.js');
      throw new BadRequestError('blocked');
    }
  }),
}));

import bulkRoutes from '../../../src/routes/bulk.js';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function build() {
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) => {
    const e = error as { statusCode?: number; name?: string; issues?: unknown };
    if (e.name === 'ZodError') return reply.status(400).send({ error: 'Validation Error', details: e.issues });
    return reply.status(e.statusCode || 500).send({ message: (error as Error).message });
  });
  await app.register(bulkRoutes, { prefix: '/v1/bulk' });
  await app.ready();
  return app;
}

describe('bulk routes', () => {
  beforeEach(() => { vi.clearAllMocks(); delete process.env.BULK_WEBHOOK_ALLOW_PRIVATE; });
  let app: Awaited<ReturnType<typeof build>>;
  beforeEach(async () => { app = await build(); });
  afterAll(async () => { await app?.close(); });

  it('runs small updates synchronously and checks entity permission', async () => {
    executeBulk.mockResolvedValue({ entity: 'issues', operation: 'update', requested: 2, affected: 2 });
    const res = await app.inject({
      method: 'POST', url: '/v1/bulk/issues/update',
      payload: { ids: [uid(1), uid(2)], changes: { priority: 'high' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ affected: 2, mode: 'sync' });
    expect(permCheck).toHaveBeenCalledWith('issues:update');
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('queues payloads above 1000 records and returns 202 with a job id', async () => {
    queueAdd.mockResolvedValue({ id: '7' });
    const ids = Array.from({ length: 1001 }, (_, i) => uid(i + 1));
    const res = await app.inject({ method: 'POST', url: '/v1/bulk/problems/assign', payload: { ids, assignedTo: uid(9999) } });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ jobId: '7', status: 'queued', total: 1001, statusUrl: '/v1/bulk/jobs/7' });
    expect(permCheck).toHaveBeenCalledWith('problems:assign');
    expect(executeBulk).not.toHaveBeenCalled();
  });

  it('uses changes:update for bulk assign of changes (no changes:assign permission exists)', async () => {
    executeBulk.mockResolvedValue({ entity: 'changes', operation: 'assign', requested: 1, affected: 1 });
    await app.inject({ method: 'POST', url: '/v1/bulk/changes/assign', payload: { ids: [uid(1)], assignedTo: uid(9) } });
    expect(permCheck).toHaveBeenCalledWith('changes:update');
    expect(permCheck).not.toHaveBeenCalledWith('changes:assign');
    await app.inject({ method: 'POST', url: '/v1/bulk/requests/assign', payload: { ids: [uid(1)], assignedTo: uid(9) } });
    expect(permCheck).toHaveBeenCalledWith('requests:assign');
  });

  it('rejects invalid payloads with 400 and unknown entities with 404', async () => {
    let res = await app.inject({ method: 'POST', url: '/v1/bulk/issues/status', payload: { ids: [uid(1)], status: 'bogus' } });
    expect(res.statusCode).toBe(400);
    res = await app.inject({ method: 'POST', url: '/v1/bulk/widgets/delete', payload: { ids: [uid(1)] } });
    expect(res.statusCode).toBe(404);
  });

  it('rejects a webhook url that fails the SSRF check', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/bulk/issues/delete',
      payload: { ids: [uid(1)], webhookUrl: 'http://internal.local/hook' },
    });
    expect(res.statusCode).toBe(400);
    expect(executeBulk).not.toHaveBeenCalled();
  });

  it('reports job progress and hides jobs of other tenants', async () => {
    queueGetJob.mockResolvedValue({
      id: '7', timestamp: Date.now(), data: { tenantSlug: 'acme', userId: 'u1', entity: 'issues', operation: 'update', payload: { ids: [uid(1)] } },
      progress: { processed: 500, total: 2000 }, getState: async () => 'active',
    });
    let res = await app.inject({ method: 'GET', url: '/v1/bulk/jobs/7' });
    expect(res.json()).toMatchObject({ status: 'running', processed: 500, total: 2000, percent: 25 });
    expect(permCheck).toHaveBeenCalledWith('issues:read');
    queueGetJob.mockResolvedValue({ id: '8', timestamp: 0, data: { tenantSlug: 'other', userId: 'u1', payload: {} }, getState: async () => 'active' });
    res = await app.inject({ method: 'GET', url: '/v1/bulk/jobs/8' });
    expect(res.statusCode).toBe(404);
  });
});
