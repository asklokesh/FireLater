import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

const isAccessTokenRevoked = vi.fn();
vi.mock('../../../src/lib/tokenRevocation.js', () => ({
  tokenRevocation: { isAccessTokenRevoked: (...a: unknown[]) => isAccessTokenRevoked(...a) },
}));
vi.mock('../../../src/services/auth.js', () => ({ authService: {} }));
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: { getSchemaName: (slug: string) => `tenant_${slug}` },
}));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { authenticate, optionalAuth } from '../../../src/middleware/auth.js';
import { UnauthorizedError } from '../../../src/utils/errors.js';

describe('authentication middleware revocation check', () => {
  let request: Partial<FastifyRequest>;
  const reply = {} as FastifyReply;

  beforeEach(() => {
    vi.clearAllMocks();
    request = {
      jwtVerify: vi.fn().mockResolvedValue(undefined),
      user: { userId: 'u1', tenantId: 't1', tenantSlug: 'acme', email: 'a@b.c', roles: [], sid: 's1', rtv: 2 },
    };
  });

  it('passes the session and version claims to the revocation list', async () => {
    isAccessTokenRevoked.mockResolvedValue(false);
    await authenticate(request as FastifyRequest, reply);
    expect(isAccessTokenRevoked).toHaveBeenCalledWith('tenant_acme', { userId: 'u1', sid: 's1', rtv: 2 });
  });

  it('rejects a validly signed token whose session was revoked', async () => {
    isAccessTokenRevoked.mockResolvedValue(true);
    await expect(authenticate(request as FastifyRequest, reply)).rejects.toThrow(UnauthorizedError);
  });

  it('fails closed when the revocation list is unavailable', async () => {
    isAccessTokenRevoked.mockRejectedValue(new Error('redis down'));
    await expect(authenticate(request as FastifyRequest, reply)).rejects.toThrow(UnauthorizedError);
  });

  it('optionalAuth drops the user of a revoked token', async () => {
    isAccessTokenRevoked.mockResolvedValue(true);
    await optionalAuth(request as FastifyRequest, reply);
    expect(request.user).toBeUndefined();
  });
});
