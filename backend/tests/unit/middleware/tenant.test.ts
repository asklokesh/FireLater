import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { extractTenantContext } from '../../../src/middleware/tenant.js';

describe('Tenant Middleware', () => {
  const createMockRequest = (tenant?: Record<string, unknown>): FastifyRequest =>
    ({
      tenant,
    }) as unknown as FastifyRequest;

  const createMockReply = () => {
    const reply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
    return reply;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractTenantContext', () => {
    it('should return tenant when tenant exists on request', async () => {
      const tenant = { id: 'tenant-123', slug: 'acme', name: 'Acme Corp' };
      const request = createMockRequest(tenant);
      const reply = createMockReply();

      const result = await extractTenantContext(request, reply);

      expect(result).toEqual(tenant);
      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should return 401 when tenant is undefined', async () => {
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      await extractTenantContext(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 401 when tenant is null', async () => {
      const request = createMockRequest(null as unknown as Record<string, unknown>);
      const reply = createMockReply();

      await extractTenantContext(request, reply);

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return tenant with minimal properties', async () => {
      const tenant = { id: 'min-tenant' };
      const request = createMockRequest(tenant);
      const reply = createMockReply();

      const result = await extractTenantContext(request, reply);

      expect(result).toEqual(tenant);
    });

    it('should return tenant with all properties', async () => {
      const tenant = {
        id: 'full-tenant',
        slug: 'enterprise',
        name: 'Enterprise Inc',
        schemaName: 'tenant_enterprise',
        createdAt: new Date('2024-01-01'),
        settings: { timezone: 'UTC', locale: 'en-US' },
      };
      const request = createMockRequest(tenant);
      const reply = createMockReply();

      const result = await extractTenantContext(request, reply);

      expect(result).toEqual(tenant);
    });

    it('should handle empty object tenant', async () => {
      const tenant = {};
      const request = createMockRequest(tenant);
      const reply = createMockReply();

      const result = await extractTenantContext(request, reply);

      expect(result).toEqual({});
      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should not modify the reply on success', async () => {
      const tenant = { id: 'test-tenant' };
      const request = createMockRequest(tenant);
      const reply = createMockReply();

      await extractTenantContext(request, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should return the reply chain on unauthorized', async () => {
      const request = createMockRequest(undefined);
      const reply = createMockReply();

      const result = await extractTenantContext(request, reply);

      // The function returns the result of reply.send() which returns `this`
      expect(result).toBe(reply);
    });
  });
});
