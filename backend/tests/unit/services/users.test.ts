import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for User Service
 * Testing user management operations
 *
 * Key coverage areas:
 * - User CRUD operations with caching
 * - Password hashing with bcrypt
 * - User role management
 * - User groups lookup
 * - Filtering and pagination
 * - Cache invalidation
 * - Transaction handling
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
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

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$12$hashedPassword'),
  },
}));

// Import after mocks
import { userService } from '../../../src/services/users.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../../src/utils/errors.js';
import bcrypt from 'bcrypt';

describe('UserService', () => {
  const tenantSlug = 'test-tenant';
  const adminUserId = 'admin-user-123';

  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // USER LIST OPERATIONS
  // ============================================
  describe('list', () => {
    it('should list all users with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ count: '50' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'user-1',
              email: 'john@example.com',
              name: 'John Doe',
              avatar_url: null,
              phone: '+1234567890',
              timezone: 'America/New_York',
              status: 'active',
              auth_provider: 'local',
              last_login_at: new Date('2026-01-01'),
              roles: ['admin', 'agent'],
            },
            {
              id: 'user-2',
              email: 'jane@example.com',
              name: 'Jane Smith',
              avatar_url: 'https://example.com/avatar.png',
              phone: null,
              timezone: 'UTC',
              status: 'active',
              auth_provider: 'google',
              last_login_at: null,
              roles: ['agent'],
            },
          ],
        });

      const result = await userService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(50);
      expect(result.users).toHaveLength(2);
      expect(result.users[0].name).toBe('John Doe');
      expect(result.users[0].roles).toContain('admin');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should filter users by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '20' }] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.list(tenantSlug, { page: 1, perPage: 10 }, { status: 'active' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND u.status = $1'),
        expect.arrayContaining(['active'])
      );
    });

    it('should search users by email or name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.list(tenantSlug, { page: 1, perPage: 10 }, { search: 'john' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('u.email ILIKE $1 OR u.name ILIKE $1'),
        expect.arrayContaining(['%john%'])
      );
    });

    it('should use default sorting by created_at descending', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY u.created_at desc'),
        expect.any(Array)
      );
    });

    it('should sort by valid column in ascending order', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.list(tenantSlug, { page: 1, perPage: 10, sort: 'name', order: 'asc' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY u.name asc'),
        expect.any(Array)
      );
    });

    it('should prevent SQL injection by ignoring invalid sort columns', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '10' }] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.list(tenantSlug, { page: 1, perPage: 10, sort: 'DROP TABLE; --' as any });

      // Should fall back to default 'created_at' column
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY u.created_at desc'),
        expect.any(Array)
      );
    });

    it('should use caching for list operations', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining(`${tenantSlug}:users:list`),
        expect.any(Function),
        { ttl: 600 }
      );
    });

    it('should include user roles in list response', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-1',
            email: 'test@example.com',
            name: 'Test User',
            roles: ['admin', 'agent', 'manager'],
          }],
        });

      const result = await userService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.users[0].roles).toEqual(['admin', 'agent', 'manager']);
    });
  });

  // ============================================
  // USER FIND BY ID
  // ============================================
  describe('findById', () => {
    const mockUser = {
      id: 'user-uuid',
      email: 'john@example.com',
      name: 'John Doe',
      avatar_url: 'https://example.com/avatar.png',
      phone: '+1234567890',
      timezone: 'America/New_York',
      status: 'active',
      auth_provider: 'local',
      last_login_at: new Date('2026-01-01'),
      settings: {},
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-12-01'),
      roles: ['admin'],
    };

    it('should find user by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await userService.findById(tenantSlug, 'user-uuid');

      expect(result).toBeDefined();
      expect(result?.email).toBe('john@example.com');
      expect(result?.name).toBe('John Doe');
    });

    it('should return null for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await userService.findById(tenantSlug, 'non-existent');

      expect(result).toBeNull();
    });

    it('should include roles in user data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

      const result = await userService.findById(tenantSlug, 'user-uuid');

      expect(result?.roles).toContain('admin');
    });

    it('should use caching for findById operations', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser] });

      await userService.findById(tenantSlug, 'user-uuid');

      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        `${tenantSlug}:users:user:user-uuid`,
        expect.any(Function),
        { ttl: 600 }
      );
    });
  });

  // ============================================
  // USER FIND BY EMAIL
  // ============================================
  describe('findByEmail', () => {
    it('should find user by email', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'john@example.com', name: 'John Doe' }],
      });

      const result = await userService.findByEmail(tenantSlug, 'john@example.com');

      expect(result).toBeDefined();
      expect(result?.email).toBe('john@example.com');
    });

    it('should return null for non-existent email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await userService.findByEmail(tenantSlug, 'nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should query by email parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await userService.findByEmail(tenantSlug, 'test@example.com');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE email = $1'),
        ['test@example.com']
      );
    });
  });

  // ============================================
  // USER CREATE
  // ============================================
  describe('create', () => {
    beforeEach(() => {
      mockClientQuery.mockReset();
    });

    it('should create user with required fields', async () => {
      const newUser = {
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'New User',
        status: 'active',
        timezone: 'UTC',
        auth_provider: 'local',
      };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // check existing
        .mockResolvedValueOnce({ rows: [newUser] }) // insert user
        .mockResolvedValueOnce({ rows: [] }) // assign default role
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({ rows: [newUser] }); // findById

      const result = await userService.create(
        tenantSlug,
        { email: 'new@example.com', name: 'New User' },
        adminUserId
      );

      expect(result.email).toBe('new@example.com');
      expect(result.name).toBe('New User');
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should hash password when provided', async () => {
      const newUser = {
        id: 'new-user-id',
        email: 'new@example.com',
        name: 'New User',
      };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockQuery.mockResolvedValueOnce({ rows: [newUser] });

      await userService.create(
        tenantSlug,
        { email: 'new@example.com', name: 'New User', password: 'secret123' },
        adminUserId
      );

      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 12);
    });

    it('should throw ConflictError if email already exists', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'existing' }] }) // check existing - found
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        userService.create(
          tenantSlug,
          { email: 'existing@example.com', name: 'New User' },
          adminUserId
        )
      ).rejects.toThrow(ConflictError);

      expect(mockRelease).toHaveBeenCalled();
    });

    it('should assign specified roles when provided', async () => {
      const newUser = { id: 'new-user-id', email: 'new@example.com', name: 'New User' };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // check existing
        .mockResolvedValueOnce({ rows: [newUser] }) // insert user
        .mockResolvedValueOnce({ rows: [{ id: 'role-1' }, { id: 'role-2' }] }) // validate roles
        .mockResolvedValueOnce({ rows: [] }) // batch insert roles
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockQuery.mockResolvedValueOnce({ rows: [newUser] });

      await userService.create(
        tenantSlug,
        { email: 'new@example.com', name: 'New User', roleIds: ['role-1', 'role-2'] },
        adminUserId
      );

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.user_roles'),
        expect.any(Array)
      );
    });

    it('should throw BadRequestError for invalid role IDs', async () => {
      const newUser = { id: 'new-user-id', email: 'new@example.com', name: 'New User' };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // check existing
        .mockResolvedValueOnce({ rows: [newUser] }) // insert user
        .mockResolvedValueOnce({ rows: [{ id: 'role-1' }] }) // validate roles - only 1 valid
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        userService.create(
          tenantSlug,
          { email: 'new@example.com', name: 'New User', roleIds: ['role-1', 'invalid-role'] },
          adminUserId
        )
      ).rejects.toThrow(BadRequestError);
    });

    it('should assign default requester role when no roles specified', async () => {
      const newUser = { id: 'new-user-id', email: 'new@example.com', name: 'New User' };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newUser] })
        .mockResolvedValueOnce({ rows: [] }) // assign default role
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockQuery.mockResolvedValueOnce({ rows: [newUser] });

      await userService.create(
        tenantSlug,
        { email: 'new@example.com', name: 'New User' },
        adminUserId
      );

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE name = 'requester'"),
        expect.any(Array)
      );
    });

    it('should use default timezone when not provided', async () => {
      const newUser = { id: 'new-user-id', email: 'new@example.com', name: 'New User', timezone: 'UTC' };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockQuery.mockResolvedValueOnce({ rows: [newUser] });

      await userService.create(
        tenantSlug,
        { email: 'new@example.com', name: 'New User' },
        adminUserId
      );

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.users'),
        expect.arrayContaining(['UTC'])
      );
    });

    it('should invalidate cache after creation', async () => {
      const newUser = { id: 'new-user-id', email: 'new@example.com', name: 'New User' };

      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [newUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      mockQuery.mockResolvedValueOnce({ rows: [newUser] });

      await userService.create(
        tenantSlug,
        { email: 'new@example.com', name: 'New User' },
        adminUserId
      );

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'users');
    });

    it('should rollback transaction on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // check existing fails

      await expect(
        userService.create(
          tenantSlug,
          { email: 'new@example.com', name: 'New User' },
          adminUserId
        )
      ).rejects.toThrow('Database error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================
  // USER UPDATE
  // ============================================
  describe('update', () => {
    const existingUser = {
      id: 'user-uuid',
      email: 'existing@example.com',
      name: 'Existing User',
      status: 'active',
    };

    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({ rows: [existingUser] });
    });

    it('should update user name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // update
        .mockResolvedValueOnce({ rows: [] }) // audit log
        .mockResolvedValueOnce({ rows: [{ ...existingUser, name: 'Updated Name' }] });

      const result = await userService.update(
        tenantSlug,
        'user-uuid',
        { name: 'Updated Name' },
        adminUserId
      );

      expect(result.name).toBe('Updated Name');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenant_test.users SET name = $1'),
        expect.arrayContaining(['Updated Name', 'user-uuid'])
      );
    });

    it('should update multiple fields at once', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingUser, status: 'inactive', phone: '+1234' }] });

      await userService.update(
        tenantSlug,
        'user-uuid',
        {
          status: 'inactive',
          phone: '+1234',
          timezone: 'Europe/London',
        },
        adminUserId
      );

      expect(mockQuery).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE tenant_test.users SET'),
        expect.any(Array)
      );
    });

    it('should return existing user when no updates provided', async () => {
      const result = await userService.update(tenantSlug, 'user-uuid', {}, adminUserId);

      expect(result).toEqual(existingUser);
      // Should only call findById, not update
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        userService.update(tenantSlug, 'non-existent', { name: 'New' }, adminUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should update avatar URL', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingUser, avatar_url: 'https://new-avatar.png' }] });

      await userService.update(
        tenantSlug,
        'user-uuid',
        { avatarUrl: 'https://new-avatar.png' },
        adminUserId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('avatar_url = $1'),
        expect.arrayContaining(['https://new-avatar.png'])
      );
    });

    it('should update settings as JSON', async () => {
      const settings = { theme: 'dark', notifications: true };
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ ...existingUser, settings }] });

      await userService.update(
        tenantSlug,
        'user-uuid',
        { settings },
        adminUserId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('settings = $1'),
        expect.arrayContaining([JSON.stringify(settings)])
      );
    });

    it('should create audit log on update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingUser] });

      await userService.update(
        tenantSlug,
        'user-uuid',
        { name: 'Updated' },
        adminUserId
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'update', 'user'"),
        expect.arrayContaining([adminUserId, 'user-uuid'])
      );
    });

    it('should invalidate cache after update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [existingUser] });

      await userService.update(
        tenantSlug,
        'user-uuid',
        { name: 'Updated' },
        adminUserId
      );

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'users');
    });
  });

  // ============================================
  // USER DELETE (SOFT DELETE)
  // ============================================
  describe('delete', () => {
    const existingUser = { id: 'user-uuid', email: 'user@example.com', name: 'User to Delete' };

    it('should soft delete user by setting status to inactive', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingUser] }) // findById
        .mockResolvedValueOnce({ rows: [] }) // update status
        .mockResolvedValueOnce({ rows: [] }); // audit log

      await userService.delete(tenantSlug, 'user-uuid', adminUserId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'inactive'"),
        ['user-uuid']
      );
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        userService.delete(tenantSlug, 'non-existent', adminUserId)
      ).rejects.toThrow(NotFoundError);
    });

    it('should create audit log on delete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.delete(tenantSlug, 'user-uuid', adminUserId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("'delete', 'user'"),
        expect.arrayContaining([adminUserId, 'user-uuid'])
      );
    });

    it('should invalidate cache after delete', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [existingUser] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.delete(tenantSlug, 'user-uuid', adminUserId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'users');
    });
  });

  // ============================================
  // USER ROLE ASSIGNMENT
  // ============================================
  describe('assignRoles', () => {
    beforeEach(() => {
      mockClientQuery.mockReset();
    });

    it('should remove existing roles and assign new ones', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // delete existing roles
        .mockResolvedValueOnce({ rows: [] }) // batch insert new roles
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await userService.assignRoles(tenantSlug, 'user-uuid', ['role-1', 'role-2'], adminUserId);

      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.user_roles WHERE user_id = $1'),
        ['user-uuid']
      );
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.user_roles'),
        expect.any(Array)
      );
      expect(mockRelease).toHaveBeenCalled();
    });

    it('should handle empty role array', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // delete existing roles
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      await userService.assignRoles(tenantSlug, 'user-uuid', [], adminUserId);

      // Should delete roles but not insert any new ones
      expect(mockClientQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.user_roles'),
        ['user-uuid']
      );
      expect(mockClientQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.user_roles'),
        expect.any(Array)
      );
    });

    it('should invalidate cache after role assignment', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await userService.assignRoles(tenantSlug, 'user-uuid', ['role-1'], adminUserId);

      expect(cacheService.invalidateTenant).toHaveBeenCalledWith(tenantSlug, 'users');
    });

    it('should rollback transaction on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error')); // delete fails

      await expect(
        userService.assignRoles(tenantSlug, 'user-uuid', ['role-1'], adminUserId)
      ).rejects.toThrow('Database error');

      expect(mockClientQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(mockRelease).toHaveBeenCalled();
    });
  });

  // ============================================
  // USER GROUPS
  // ============================================
  describe('getUserGroups', () => {
    it('should return all groups a user belongs to', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'group-1', name: 'Engineering', member_role: 'member', joined_at: new Date() },
          { id: 'group-2', name: 'Platform', member_role: 'lead', joined_at: new Date() },
        ],
      });

      const result = await userService.getUserGroups(tenantSlug, 'user-uuid');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Engineering');
      expect(result[1].member_role).toBe('lead');
    });

    it('should return empty array when user has no groups', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await userService.getUserGroups(tenantSlug, 'user-uuid');

      expect(result).toEqual([]);
    });

    it('should query by user ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await userService.getUserGroups(tenantSlug, 'user-uuid');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE gm.user_id = $1'),
        ['user-uuid']
      );
    });
  });
});
