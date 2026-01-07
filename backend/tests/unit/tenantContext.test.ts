import { describe, it, expect, vi } from 'vitest';
import { FastifyRequest } from 'fastify';
import { getTenantContext } from '../../src/utils/tenantContext.js';
import { getTenantSlug } from '../../src/utils/tenant.js';
import { UnauthorizedError } from '../../src/utils/errors.js';

/**
 * Unit tests for tenant context utilities
 * Testing tenant extraction from request objects
 */

describe('Tenant Context Utilities', () => {
  describe('getTenantContext', () => {
    it('should extract tenantSlug from user object', () => {
      const mockRequest = {
        user: { tenantSlug: 'acme-corp' },
        headers: {},
      } as unknown as FastifyRequest;

      const result = getTenantContext(mockRequest);

      expect(result.tenantSlug).toBe('acme-corp');
    });

    it('should extract tenantSlug from x-tenant-slug header if no user', () => {
      const mockRequest = {
        user: undefined,
        headers: { 'x-tenant-slug': 'header-tenant' },
      } as unknown as FastifyRequest;

      const result = getTenantContext(mockRequest);

      expect(result.tenantSlug).toBe('header-tenant');
    });

    it('should prefer user.tenantSlug over header', () => {
      const mockRequest = {
        user: { tenantSlug: 'user-tenant' },
        headers: { 'x-tenant-slug': 'header-tenant' },
      } as unknown as FastifyRequest;

      const result = getTenantContext(mockRequest);

      expect(result.tenantSlug).toBe('user-tenant');
    });

    it('should throw UnauthorizedError when no tenant context available', () => {
      const mockRequest = {
        user: undefined,
        headers: {},
      } as unknown as FastifyRequest;

      expect(() => getTenantContext(mockRequest)).toThrow(UnauthorizedError);
      expect(() => getTenantContext(mockRequest)).toThrow('Tenant context required');
    });

    it('should throw UnauthorizedError when user exists but no tenantSlug', () => {
      const mockRequest = {
        user: { email: 'test@example.com' },
        headers: {},
      } as unknown as FastifyRequest;

      expect(() => getTenantContext(mockRequest)).toThrow(UnauthorizedError);
    });

    it('should handle null user', () => {
      const mockRequest = {
        user: null,
        headers: {},
      } as unknown as FastifyRequest;

      expect(() => getTenantContext(mockRequest)).toThrow(UnauthorizedError);
    });

    it('should handle empty x-tenant-slug header', () => {
      const mockRequest = {
        user: undefined,
        headers: { 'x-tenant-slug': '' },
      } as unknown as FastifyRequest;

      expect(() => getTenantContext(mockRequest)).toThrow(UnauthorizedError);
    });
  });

  describe('getTenantSlug', () => {
    it('should return tenantSlug from user object', () => {
      const mockRequest = {
        user: { tenantSlug: 'test-tenant' },
      } as unknown as FastifyRequest;

      const result = getTenantSlug(mockRequest);

      expect(result).toBe('test-tenant');
    });

    it('should throw error when user is undefined', () => {
      const mockRequest = {
        user: undefined,
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when user is null', () => {
      const mockRequest = {
        user: null,
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when tenantSlug is missing from user', () => {
      const mockRequest = {
        user: { email: 'test@example.com' },
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when tenantSlug is empty string', () => {
      const mockRequest = {
        user: { tenantSlug: '' },
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should throw error when tenantSlug is null', () => {
      const mockRequest = {
        user: { tenantSlug: null },
      } as unknown as FastifyRequest;

      expect(() => getTenantSlug(mockRequest)).toThrow('Tenant information not available in request');
    });

    it('should return valid tenantSlug when present', () => {
      const mockRequest = {
        user: {
          tenantSlug: 'production-tenant',
          email: 'admin@example.com',
          userId: '123',
        },
      } as unknown as FastifyRequest;

      expect(getTenantSlug(mockRequest)).toBe('production-tenant');
    });
  });

  describe('Edge Cases', () => {
    it('getTenantContext should handle undefined headers', () => {
      const mockRequest = {
        user: { tenantSlug: 'test' },
        headers: undefined as unknown as Record<string, string>,
      } as unknown as FastifyRequest;

      // Should not throw when user has tenantSlug
      const result = getTenantContext(mockRequest);
      expect(result.tenantSlug).toBe('test');
    });

    it('getTenantContext should handle array header value', () => {
      const mockRequest = {
        user: undefined,
        headers: { 'x-tenant-slug': ['tenant1', 'tenant2'] },
      } as unknown as FastifyRequest;

      // Array is truthy, so it should be used
      const result = getTenantContext(mockRequest);
      expect(result.tenantSlug).toBeDefined();
    });

    it('should handle special characters in tenantSlug', () => {
      const mockRequest = {
        user: { tenantSlug: 'test-tenant_123' },
      } as unknown as FastifyRequest;

      expect(getTenantSlug(mockRequest)).toBe('test-tenant_123');
      expect(getTenantContext(mockRequest).tenantSlug).toBe('test-tenant_123');
    });
  });
});
