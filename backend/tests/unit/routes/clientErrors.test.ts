import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../../../src/middleware/auth.js', () => ({
  authenticate: async (request: any) => {
    request.user = { userId: 'u1', tenantSlug: 'acme', tenantId: 't1', email: 'a@b.c', roles: [] };
  },
}));

import clientErrorRoutes from '../../../src/routes/clientErrors.js';
import errorHandlerPlugin from '../../../src/plugins/errorHandler.js';
import { setErrorTracker } from '../../../src/lib/errorTracking.js';

describe('POST /v1/client-errors', () => {
  const captured: any[] = [];
  beforeEach(() => {
    captured.length = 0;
    setErrorTracker({ name: 't', captureException: (e, c) => { captured.push([e, c]); } });
  });

  async function build() {
    const app = Fastify();
    await app.register(errorHandlerPlugin);
    await app.register(clientErrorRoutes, { prefix: '/v1/client-errors' });
    return app;
  }

  it('forwards frontend errors to the tracker with tenant and user context', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST', url: '/v1/client-errors',
      payload: { message: 'render failed', stack: 'Error: render failed\n at X', code: 'NOT_FOUND', url: '/issues/1' },
    });
    expect(res.statusCode).toBe(202);
    expect(captured).toHaveLength(1);
    expect(captured[0][0].message).toBe('render failed');
    expect(captured[0][1]).toMatchObject({ source: 'frontend', tenantSlug: 'acme', userId: 'u1', errorCode: 'NOT_FOUND' });
  });

  it('rejects an invalid body with VALIDATION_ERROR', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/v1/client-errors', payload: { stack: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
