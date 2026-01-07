import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest } from 'fastify';

describe('Tenant Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTenantSlug', () => {
    it('should return tenant slug from request user', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: {
          tenantSlug: 'test-tenant',
          userId: 'user-1',
          roles: ['admin'],
        },
      } as unknown as FastifyRequest;

      const result = getTenantSlug(mockRequest);
      expect(result).toBe('test-tenant');
    });

    it('should throw error when user is undefined', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {} as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when tenantSlug is undefined', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: {
          userId: 'user-1',
          roles: ['admin'],
        },
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when user is null', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: null,
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when tenantSlug is empty string', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: {
          tenantSlug: '',
          userId: 'user-1',
        },
      } as unknown as FastifyRequest;

      // Empty string is falsy, so should throw
      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should handle valid tenant slug with hyphens', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: {
          tenantSlug: 'my-test-tenant',
          userId: 'user-1',
        },
      } as unknown as FastifyRequest;

      const result = getTenantSlug(mockRequest);
      expect(result).toBe('my-test-tenant');
    });

    it('should handle valid tenant slug with numbers', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: {
          tenantSlug: 'tenant-123',
          userId: 'user-1',
        },
      } as unknown as FastifyRequest;

      const result = getTenantSlug(mockRequest);
      expect(result).toBe('tenant-123');
    });

    it('should preserve case of tenant slug', async () => {
      const { getTenantSlug } = await import('../../src/utils/tenant.js');

      const mockRequest = {
        user: {
          tenantSlug: 'TestTenant',
          userId: 'user-1',
        },
      } as unknown as FastifyRequest;

      const result = getTenantSlug(mockRequest);
      expect(result).toBe('TestTenant');
    });
  });
});
