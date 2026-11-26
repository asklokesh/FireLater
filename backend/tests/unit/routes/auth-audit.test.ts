import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';

const m = vi.hoisted(() => ({ login: vi.fn(), logSafe: vi.fn() }));

vi.mock('../../../src/services/auth.js', () => ({
  authService: { login: m.login, getCachedPermissions: vi.fn(), getUserPermissions: vi.fn(), cacheUserPermissions: vi.fn() },
}));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (s: string) => `tenant_${s}`, createTenant: vi.fn(), findBySlug: vi.fn() },
}));
vi.mock('../../../src/services/audit.js', () => ({ auditService: { logSafe: m.logSafe } }));
vi.mock('../../../src/config/database.js', () => ({ pool: { query: vi.fn() } }));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import authRoutes from '../../../src/routes/auth.js';

describe('login auditing', () => {
  async function build() {
    const app = Fastify();
    await app.register(cookie);
    (app as unknown as { jwt: unknown }).jwt = { sign: () => 'token' };
    app.setErrorHandler((error, _req, reply) => {
      reply.code((error as { statusCode?: number }).statusCode ?? 500).send({ message: error.message });
    });
    await app.register(authRoutes, { prefix: '/v1/auth' });
    return app;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    m.logSafe.mockResolvedValue('id');
  });

  it('records a successful login with user, IP and user agent', async () => {
    m.login.mockResolvedValue({
      accessToken: 'a', refreshToken: 'r', user: { id: 'u1', email: 'admin@acme.test', name: 'Admin' },
    });
    const app = await build();
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/login', headers: { 'x-tenant-slug': 'acme', 'user-agent': 'vitest' },
      payload: { email: 'admin@acme.test', password: 'x' },
    });
    expect(res.statusCode).toBe(200);
    expect(m.logSafe).toHaveBeenCalledWith('acme', expect.objectContaining({
      action: 'login', entityType: 'auth', userId: 'u1', userEmail: 'admin@acme.test', userAgent: 'vitest',
      ipAddress: expect.any(String), statusCode: 200,
    }));
    await app.close();
  });

  it('records a failed login (feeds the brute-force rule) and still returns the error', async () => {
    m.login.mockRejectedValue(Object.assign(new Error('Invalid credentials'), { statusCode: 401 }));
    const app = await build();
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/login', headers: { 'x-tenant-slug': 'acme' },
      payload: { email: 'viewer@acme.test', password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect(m.logSafe).toHaveBeenCalledWith('acme', expect.objectContaining({
      action: 'login_failed', userEmail: 'viewer@acme.test', outcome: 'failure', statusCode: 401,
    }));
    await app.close();
  });

  it('does not wait for the audit write before answering', async () => {
    m.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: { id: 'u1', email: 'a@acme.test', name: 'A' } });
    m.logSafe.mockReturnValue(new Promise(() => undefined)); // never resolves
    const app = await build();
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/login', headers: { 'x-tenant-slug': 'acme' },
      payload: { email: 'a@acme.test', password: 'x' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
