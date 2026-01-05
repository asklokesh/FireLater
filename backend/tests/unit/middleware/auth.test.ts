import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requirePermission, requireRole, optionalAuth } from '../../../src/middleware/auth.js';
import { UnauthorizedError, ForbiddenError } from '../../../src/utils/errors.js';
import { authService } from '../../../src/services/auth.js';
import { tenantService } from '../../../src/services/tenant.js';

// Mock the services
vi.mock('../../../src/services/auth.js');
vi.mock('../../../src/services/tenant.js');

describe('Authentication Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRequest = {
      jwtVerify: vi.fn(),
      user: {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'test@example.com',
        roles: ['user'],
      },
    };

    mockReply = {};
  });

  describe('authenticate()', () => {
    it('should authenticate successfully with valid JWT token', async () => {
      const jwtVerifyMock = vi.fn().mockResolvedValue(undefined);
      mockRequest.jwtVerify = jwtVerifyMock;

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwtVerifyMock).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when token verification fails', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Token verification failed'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Invalid or expired token');
    });

    it('should throw UnauthorizedError when token is missing', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('No Authorization was found'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when token is expired', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Token expired'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when token has invalid signature', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Invalid signature'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await expect(
        authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('requirePermission()', () => {
    beforeEach(() => {
      const jwtVerifyMock = vi.fn().mockResolvedValue(undefined);
      mockRequest.jwtVerify = jwtVerifyMock;
    });

    it('should allow request when user has required permission', async () => {
      const permissions = ['issues:read', 'issues:write'];
      vi.mocked(authService.getCachedPermissions).mockResolvedValue(permissions);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('test_org');

      const middleware = requirePermission('issues:read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(authService.getCachedPermissions).toHaveBeenCalledWith('user-123', 'test-org');
    });

    it('should allow request when user has any of the required permissions', async () => {
      const permissions = ['issues:read', 'changes:read'];
      vi.mocked(authService.getCachedPermissions).mockResolvedValue(permissions);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('test_org');

      const middleware = requirePermission('issues:write', 'changes:read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should succeed because user has changes:read
      expect(authService.getCachedPermissions).toHaveBeenCalledWith('user-123', 'test-org');
    });

    it('should throw ForbiddenError when user lacks required permission', async () => {
      const permissions = ['issues:read'];
      vi.mocked(authService.getCachedPermissions).mockResolvedValue(permissions);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('test_org');

      const middleware = requirePermission('issues:write');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('You do not have permission to perform this action');
    });

    it('should allow request when user has admin role (bypass permission check)', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'admin@example.com',
        roles: ['admin'],
      };

      const permissions: string[] = [];
      vi.mocked(authService.getCachedPermissions).mockResolvedValue(permissions);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('test_org');

      const middleware = requirePermission('issues:delete');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Admin should bypass permission check
      expect(authService.getCachedPermissions).toHaveBeenCalled();
    });

    it('should fetch permissions from database when not cached', async () => {
      const permissions = ['issues:read'];
      vi.mocked(authService.getCachedPermissions).mockResolvedValue(null);
      vi.mocked(authService.getUserPermissions).mockResolvedValue(permissions);
      vi.mocked(authService.cacheUserPermissions).mockResolvedValue(undefined);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('test_org');

      const middleware = requirePermission('issues:read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(authService.getCachedPermissions).toHaveBeenCalledWith('user-123', 'test-org');
      expect(authService.getUserPermissions).toHaveBeenCalledWith('user-123', 'test_org');
      expect(authService.cacheUserPermissions).toHaveBeenCalledWith('user-123', 'test-org', permissions);
    });

    it('should cache permissions after fetching from database', async () => {
      const permissions = ['issues:read', 'changes:read'];
      vi.mocked(authService.getCachedPermissions).mockResolvedValue(null);
      vi.mocked(authService.getUserPermissions).mockResolvedValue(permissions);
      vi.mocked(authService.cacheUserPermissions).mockResolvedValue(undefined);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('test_org');

      const middleware = requirePermission('issues:read');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(authService.cacheUserPermissions).toHaveBeenCalledWith('user-123', 'test-org', permissions);
    });

    it('should throw UnauthorizedError when authentication fails', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Token expired'));
      mockRequest.jwtVerify = jwtVerifyMock;

      const middleware = requirePermission('issues:read');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('requireRole()', () => {
    beforeEach(() => {
      const jwtVerifyMock = vi.fn().mockResolvedValue(undefined);
      mockRequest.jwtVerify = jwtVerifyMock;
    });

    it('should allow request when user has required role', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'admin@example.com',
        roles: ['admin'],
      };

      const middleware = requireRole('admin');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should succeed without throwing
    });

    it('should allow request when user has any of the required roles', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'manager@example.com',
        roles: ['manager', 'user'],
      };

      const middleware = requireRole('admin', 'manager');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should succeed because user has manager role
    });

    it('should throw ForbiddenError when user lacks required role', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'user@example.com',
        roles: ['user'],
      };

      const middleware = requireRole('admin');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('You do not have the required role');
    });

    it('should throw ForbiddenError when user has no roles', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'user@example.com',
        roles: [],
      };

      const middleware = requireRole('user');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should throw UnauthorizedError when authentication fails', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Invalid token'));
      mockRequest.jwtVerify = jwtVerifyMock;

      const middleware = requireRole('admin');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should work with multiple role checks', async () => {
      mockRequest.user = {
        userId: 'user-123',
        tenantId: 'tenant-123',
        tenantSlug: 'test-org',
        email: 'support@example.com',
        roles: ['support', 'user'],
      };

      const middleware = requireRole('admin', 'manager', 'support');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should succeed because user has support role
    });
  });

  describe('optionalAuth()', () => {
    it('should authenticate successfully with valid token', async () => {
      const jwtVerifyMock = vi.fn().mockResolvedValue(undefined);
      mockRequest.jwtVerify = jwtVerifyMock;

      await optionalAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(jwtVerifyMock).toHaveBeenCalled();
    });

    it('should not throw error when token is missing', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('No Authorization was found'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await optionalAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw, just continue without user
      expect(jwtVerifyMock).toHaveBeenCalled();
    });

    it('should not throw error when token is invalid', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Invalid token'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await optionalAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw, just continue without user
      expect(jwtVerifyMock).toHaveBeenCalled();
    });

    it('should not throw error when token is expired', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Token expired'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await optionalAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw, just continue without user
      expect(jwtVerifyMock).toHaveBeenCalled();
    });

    it('should not throw error when token has invalid signature', async () => {
      const jwtVerifyMock = vi.fn().mockRejectedValue(new Error('Invalid signature'));
      mockRequest.jwtVerify = jwtVerifyMock;

      await optionalAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw, just continue without user
      expect(jwtVerifyMock).toHaveBeenCalled();
    });
  });
});
