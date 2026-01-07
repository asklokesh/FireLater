import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock errors
vi.mock('../../../src/utils/errors.js', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {
    statusCode = 401;
    constructor(message: string) {
      super(message);
      this.name = 'UnauthorizedError';
    }
  },
}));

import { validateTenantSchema } from '../../../src/middleware/tenantValidation.js';
import { UnauthorizedError } from '../../../src/utils/errors.js';

describe('TenantValidation Middleware', () => {
  const createMockRequest = (tenantSlug?: string): FastifyRequest => ({
    tenantSlug,
  } as unknown as FastifyRequest);

  const mockReply = {} as FastifyReply;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateTenantSchema', () => {
    it('should pass with valid alphanumeric tenant slug', async () => {
      const request = createMockRequest('acme123');

      await expect(validateTenantSchema(request, mockReply)).resolves.not.toThrow();
    });

    it('should pass with tenant slug containing hyphens', async () => {
      const request = createMockRequest('acme-corp');

      await expect(validateTenantSchema(request, mockReply)).resolves.not.toThrow();
    });

    it('should pass with tenant slug containing underscores', async () => {
      const request = createMockRequest('acme_corp');

      await expect(validateTenantSchema(request, mockReply)).resolves.not.toThrow();
    });

    it('should pass with tenant slug containing mixed characters', async () => {
      const request = createMockRequest('Acme-Corp_123');

      await expect(validateTenantSchema(request, mockReply)).resolves.not.toThrow();
    });

    it('should throw UnauthorizedError when tenant slug is missing', async () => {
      const request = createMockRequest(undefined);

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow(UnauthorizedError);
      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Tenant context required');
    });

    it('should throw UnauthorizedError when tenant slug is empty string', async () => {
      const request = createMockRequest('');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for tenant slug with spaces', async () => {
      const request = createMockRequest('acme corp');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow(UnauthorizedError);
      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should throw UnauthorizedError for tenant slug with special characters', async () => {
      const request = createMockRequest('acme@corp');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should throw UnauthorizedError for tenant slug with dots', async () => {
      const request = createMockRequest('acme.corp');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should throw UnauthorizedError for tenant slug with slashes', async () => {
      const request = createMockRequest('acme/corp');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should throw UnauthorizedError for SQL injection attempts', async () => {
      const request = createMockRequest("acme'; DROP TABLE users;--");

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should throw UnauthorizedError for path traversal attempts', async () => {
      const request = createMockRequest('../../../etc/passwd');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should throw UnauthorizedError for tenant slug with unicode', async () => {
      const request = createMockRequest('acme\u0000corp');

      await expect(validateTenantSchema(request, mockReply)).rejects.toThrow('Invalid tenant identifier');
    });

    it('should return undefined on success', async () => {
      const request = createMockRequest('valid-tenant');

      const result = await validateTenantSchema(request, mockReply);

      expect(result).toBeUndefined();
    });
  });
});
