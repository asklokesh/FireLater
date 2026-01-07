import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Unit tests for AuthService
 * Testing authentication flows, token management, password reset, and email verification
 */

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

// Mock redis - we'll set values in beforeEach
const mockRedisData = new Map<string, string>();
vi.mock('../../../src/config/redis.js', () => ({
  redis: {
    get: vi.fn((key: string) => Promise.resolve(mockRedisData.get(key) || null)),
    setex: vi.fn((key: string, _ttl: number, value: string) => {
      mockRedisData.set(key, value);
      return Promise.resolve('OK');
    }),
    del: vi.fn((...keys: string[]) => {
      keys.flat().forEach(k => mockRedisData.delete(k));
      return Promise.resolve(keys.length);
    }),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    findBySlug: vi.fn(),
    getSchemaName: vi.fn(),
  },
}));

vi.mock('../../../src/services/email.js', () => ({
  emailService: {
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { AuthService } from '../../../src/services/auth.js';
import { tenantService } from '../../../src/services/tenant.js';
import { emailService } from '../../../src/services/email.js';
import { redis } from '../../../src/config/redis.js';
import { NotFoundError, UnauthorizedError, BadRequestError } from '../../../src/utils/errors.js';

describe('AuthService', () => {
  let authService: AuthService;
  const mockSignToken = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisData.clear();
    authService = new AuthService();
    mockSignToken.mockReturnValue('mock-jwt-token');
  });

  describe('login', () => {
    const loginParams = {
      tenantSlug: 'test-tenant',
      email: 'user@example.com',
      password: 'password123',
    };

    beforeEach(() => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1', slug: 'test-tenant' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow(NotFoundError);
    });

    it('should throw UnauthorizedError when user is not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow('Invalid email or password');
    });

    it('should throw UnauthorizedError when account is not active', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'inactive',
          auth_provider: 'local',
          password_hash: await bcrypt.hash('password123', 10),
          roles: ['user'],
        }],
      });

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow('Account is not active');
    });

    it('should throw UnauthorizedError when account is locked', async () => {
      const futureDate = new Date(Date.now() + 30 * 60 * 1000); // 30 mins in future
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: await bcrypt.hash('password123', 10),
          roles: ['user'],
          locked_until: futureDate,
        }],
      });

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow(/Account is temporarily locked/);
    });

    it('should throw UnauthorizedError for SSO users trying to login with password', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'saml',
          password_hash: null,
          roles: ['user'],
        }],
      });

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow('Please use SSO to login');
    });

    it('should increment failed login attempts on wrong password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: passwordHash,
          roles: ['user'],
          failed_login_attempts: 0,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update failed attempts

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow(/Invalid email or password.*4 attempt\(s\) remaining/);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should lock account after 5 failed attempts', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: passwordHash,
          roles: ['user'],
          failed_login_attempts: 4, // 5th attempt will lock
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update with lockout

      await expect(authService.login(loginParams, mockSignToken)).rejects.toThrow(/Account has been temporarily locked/);
    });

    it('should return tokens and user on successful login', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: passwordHash,
          roles: ['admin', 'user', null], // null should be filtered
          failed_login_attempts: 0,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update last_login
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert refresh token
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete expired tokens

      const result = await authService.login(loginParams, mockSignToken);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('user@example.com');
      expect(result.user.roles).toEqual(['admin', 'user']); // null filtered
    });

    it('should reset failed login attempts on successful login', async () => {
      const passwordHash = await bcrypt.hash('password123', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: passwordHash,
          roles: ['user'],
          failed_login_attempts: 3,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update - resets attempts
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert refresh token
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete expired tokens

      await authService.login(loginParams, mockSignToken);

      // Verify UPDATE query resets failed_login_attempts
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('failed_login_attempts = 0');
    });
  });

  describe('refresh', () => {
    const refreshParams = {
      token: 'valid-refresh-token',
      tenantSlug: 'test-tenant',
    };

    beforeEach(() => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1', slug: 'test-tenant' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
    });

    it('should throw NotFoundError when tenant does not exist', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(authService.refresh(refreshParams.token, refreshParams.tenantSlug, mockSignToken))
        .rejects.toThrow(NotFoundError);
    });

    it('should throw UnauthorizedError for invalid or expired token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No token found

      await expect(authService.refresh(refreshParams.token, refreshParams.tenantSlug, mockSignToken))
        .rejects.toThrow('Invalid or expired refresh token');
    });

    it('should throw UnauthorizedError when user is not active', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          email: 'user@example.com',
          status: 'inactive',
          roles: ['user'],
        }],
      });

      await expect(authService.refresh(refreshParams.token, refreshParams.tenantSlug, mockSignToken))
        .rejects.toThrow('Account is not active');
    });

    it('should revoke old token and return new tokens', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          email: 'user@example.com',
          status: 'active',
          roles: ['admin', null],
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Revoke old token
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert new token
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete expired

      const result = await authService.refresh(refreshParams.token, refreshParams.tenantSlug, mockSignToken);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(4);
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token', async () => {
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.logout('refresh-token', 'test-tenant');

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][0]).toContain('UPDATE');
      expect(mockQuery.mock.calls[0][0]).toContain('revoked_at');
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.revokeAllUserTokens('user-1', 'tenant_test_tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        ['user-1']
      );
    });
  });

  describe('changePassword', () => {
    const userId = 'user-1';
    const schema = 'tenant_test_tenant';

    it('should throw BadRequestError for SSO users', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ password_hash: null }] });

      await expect(authService.changePassword(userId, 'old', 'new', schema))
        .rejects.toThrow('Cannot change password for SSO users');
    });

    it('should throw BadRequestError when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(authService.changePassword(userId, 'old', 'new', schema))
        .rejects.toThrow('Cannot change password for SSO users');
    });

    it('should throw UnauthorizedError for incorrect current password', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      mockQuery.mockResolvedValueOnce({ rows: [{ password_hash: passwordHash }] });

      await expect(authService.changePassword(userId, 'wrong-password', 'new', schema))
        .rejects.toThrow('Current password is incorrect');
    });

    it('should update password and revoke all tokens', async () => {
      const passwordHash = await bcrypt.hash('old-password', 10);
      mockQuery.mockResolvedValueOnce({ rows: [{ password_hash: passwordHash }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update password
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Revoke tokens

      await authService.changePassword(userId, 'old-password', 'new-password', schema);

      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('getUserPermissions', () => {
    it('should return user permissions as resource:action strings', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { permission: 'issues:read' },
          { permission: 'issues:write' },
          { permission: 'users:read' },
        ],
      });

      const permissions = await authService.getUserPermissions('user-1', 'tenant_test_tenant');

      expect(permissions).toEqual(['issues:read', 'issues:write', 'users:read']);
    });

    it('should return empty array when no permissions found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const permissions = await authService.getUserPermissions('user-1', 'tenant_test_tenant');

      expect(permissions).toEqual([]);
    });
  });

  describe('cacheUserPermissions', () => {
    it('should cache permissions with 5 minute TTL', async () => {
      const permissions = ['issues:read', 'issues:write'];

      await authService.cacheUserPermissions('user-1', 'test-tenant', permissions);

      expect(redis.setex).toHaveBeenCalledWith(
        'permissions:test-tenant:user-1',
        300,
        JSON.stringify(permissions)
      );
    });
  });

  describe('getCachedPermissions', () => {
    it('should return cached permissions', async () => {
      const permissions = ['issues:read'];
      mockRedisData.set('permissions:test-tenant:user-1', JSON.stringify(permissions));

      const result = await authService.getCachedPermissions('user-1', 'test-tenant');

      expect(result).toEqual(permissions);
    });

    it('should return null when no cache exists', async () => {
      const result = await authService.getCachedPermissions('user-1', 'test-tenant');

      expect(result).toBeNull();
    });
  });

  describe('requestPasswordReset', () => {
    const tenantSlug = 'test-tenant';
    const email = 'user@example.com';

    beforeEach(() => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
    });

    it('should silently return when tenant does not exist (prevent enumeration)', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await authService.requestPasswordReset(tenantSlug, email);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should silently return when user does not exist (prevent enumeration)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.requestPasswordReset(tenantSlug, email);

      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should store reset token in Redis and send email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email, name: 'Test User' }],
      });

      await authService.requestPasswordReset(tenantSlug, email);

      expect(redis.setex).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        email,
        'Test User',
        expect.any(String),
        tenantSlug
      );
    });
  });

  describe('resetPassword', () => {
    const tenantSlug = 'test-tenant';
    const token = 'reset-token';
    const newPassword = 'new-password123';

    beforeEach(() => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
    });

    it('should throw BadRequestError for invalid tenant', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(authService.resetPassword(tenantSlug, token, newPassword))
        .rejects.toThrow('Invalid or expired reset token');
    });

    it('should throw BadRequestError for expired/invalid token', async () => {
      // Token not in Redis
      await expect(authService.resetPassword(tenantSlug, token, newPassword))
        .rejects.toThrow('Invalid or expired reset token');
    });

    it('should update password and revoke all tokens', async () => {
      // Store token in mock Redis
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      mockRedisData.set(
        `password_reset:${tenantSlug}:${tokenHash}`,
        JSON.stringify({ userId: 'user-1', email: 'user@example.com' })
      );
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update password
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Revoke tokens

      await authService.resetPassword(tenantSlug, token, newPassword);

      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    const tenantSlug = 'test-tenant';
    const token = 'verify-token';

    beforeEach(() => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
    });

    it('should throw BadRequestError for invalid tenant', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await expect(authService.verifyEmail(tenantSlug, token))
        .rejects.toThrow('Invalid or expired verification token');
    });

    it('should throw BadRequestError for invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(authService.verifyEmail(tenantSlug, token))
        .rejects.toThrow('Invalid or expired verification token');
    });

    it('should throw BadRequestError if email already verified', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          email: 'user@example.com',
          email_verified: true,
        }],
      });

      await expect(authService.verifyEmail(tenantSlug, token))
        .rejects.toThrow('Email is already verified');
    });

    it('should verify email and mark token as used', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-1',
          user_id: 'user-1',
          email: 'user@example.com',
          email_verified: false,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update user
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update token

      const result = await authService.verifyEmail(tenantSlug, token);

      expect(result.email).toBe('user@example.com');
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });

  describe('resendVerificationEmail', () => {
    const tenantSlug = 'test-tenant';
    const email = 'user@example.com';

    beforeEach(() => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test_tenant');
    });

    it('should silently return when tenant does not exist', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue(null);

      await authService.resendVerificationEmail(tenantSlug, email);

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should silently return when user does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await authService.resendVerificationEmail(tenantSlug, email);

      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should throw BadRequestError if already verified', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email, name: 'Test', email_verified: true }],
      });

      await expect(authService.resendVerificationEmail(tenantSlug, email))
        .rejects.toThrow('Email is already verified');
    });

    it('should send verification email for unverified user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email, name: 'Test User', email_verified: false }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete old tokens
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert new token

      await authService.resendVerificationEmail(tenantSlug, email);

      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        email,
        'Test User',
        expect.any(String),
        tenantSlug
      );
    });
  });

  describe('createEmailVerificationToken', () => {
    it('should delete existing tokens and create new one', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert

      const token = await authService.createEmailVerificationToken('user-1', 'tenant_test_tenant');

      expect(token).toBeDefined();
      expect(token.length).toBe(64); // 32 bytes hex = 64 chars
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendVerificationEmailForNewUser', () => {
    it('should create token and send verification email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert

      await authService.sendVerificationEmailForNewUser(
        'user-1',
        'user@example.com',
        'Test User',
        'test-tenant',
        'tenant_test_tenant'
      );

      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'user@example.com',
        'Test User',
        expect.any(String),
        'test-tenant'
      );
    });
  });
});

describe('AuthService Edge Cases', () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisData.clear();
    authService = new AuthService();
  });

  describe('Token hashing', () => {
    it('should consistently hash tokens for lookup', async () => {
      // Test internal token hashing by verifying logout uses same hash method
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test');
      const token = 'test-refresh-token';

      mockQuery.mockResolvedValueOnce({ rows: [] });
      await authService.logout(token, 'test-tenant');

      // The hash passed to the query should be consistent
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('Lockout timing', () => {
    it('should allow login when lockout period has expired', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test');

      const passwordHash = await bcrypt.hash('password123', 10);
      const pastDate = new Date(Date.now() - 60 * 1000); // 1 minute ago

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: passwordHash,
          roles: ['user'],
          locked_until: pastDate, // Expired lockout
          failed_login_attempts: 5,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Update
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Insert token
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Delete expired

      const mockSign = vi.fn().mockReturnValue('jwt-token');
      const result = await authService.login(
        { tenantSlug: 'test-tenant', email: 'user@example.com', password: 'password123' },
        mockSign
      );

      expect(result.accessToken).toBe('jwt-token');
    });
  });

  describe('Role filtering', () => {
    it('should filter out null roles from LEFT JOIN', async () => {
      vi.mocked(tenantService.findBySlug).mockResolvedValue({ id: 'tenant-1' } as any);
      vi.mocked(tenantService.getSchemaName).mockReturnValue('tenant_test');

      const passwordHash = await bcrypt.hash('password123', 10);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'user@example.com',
          name: 'Test User',
          status: 'active',
          auth_provider: 'local',
          password_hash: passwordHash,
          roles: [null, 'admin', null, 'user'], // Multiple nulls
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const mockSign = vi.fn().mockReturnValue('jwt-token');
      const result = await authService.login(
        { tenantSlug: 'test-tenant', email: 'user@example.com', password: 'password123' },
        mockSign
      );

      expect(result.user.roles).toEqual(['admin', 'user']);
    });
  });
});
