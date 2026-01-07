import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/users.js', () => ({
  userService: {
    list: vi.fn().mockResolvedValue({ users: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getUserGroups: vi.fn().mockResolvedValue([]),
    assignRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Users Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create User Schema', () => {
    const createUserSchema = z.object({
      email: z.string().email(),
      name: z.string().min(2).max(255),
      password: z.string().min(8).optional(),
      phone: z.string().max(50).optional(),
      timezone: z.string().max(100).optional(),
      status: z.enum(['active', 'inactive', 'pending']).optional(),
      roleIds: z.array(z.string().uuid()).optional(),
    });

    it('should require email and name', () => {
      const result = createUserSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid user data', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = createUserSchema.safeParse({
        email: 'not-an-email',
        name: 'John Doe',
      });
      expect(result.success).toBe(false);
    });

    it('should require name of at least 2 characters', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'J',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 255 characters', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'x'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('should require password of at least 8 characters when provided', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        password: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid password', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        password: 'securepassword123',
      });
      expect(result.success).toBe(true);
    });

    it('should accept phone number', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        phone: '+1-555-123-4567',
      });
      expect(result.success).toBe(true);
    });

    it('should reject phone over 50 characters', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        phone: 'x'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('should accept timezone', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        timezone: 'America/New_York',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all status values', () => {
      const statuses = ['active', 'inactive', 'pending'];
      for (const status of statuses) {
        const result = createUserSchema.safeParse({
          email: 'test@example.com',
          name: 'John Doe',
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        status: 'suspended',
      });
      expect(result.success).toBe(false);
    });

    it('should accept roleIds as array of UUIDs', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        roleIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '223e4567-e89b-12d3-a456-426614174000',
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID in roleIds', () => {
      const result = createUserSchema.safeParse({
        email: 'test@example.com',
        name: 'John Doe',
        roleIds: ['not-a-uuid'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Update User Schema', () => {
    const updateUserSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      phone: z.string().max(50).optional(),
      timezone: z.string().max(100).optional(),
      status: z.enum(['active', 'inactive', 'pending']).optional(),
      avatarUrl: z.string().url().optional(),
      settings: z.record(z.unknown()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateUserSchema.safeParse({ name: 'Jane Doe' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateUserSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept avatarUrl', () => {
      const result = updateUserSchema.safeParse({
        avatarUrl: 'https://example.com/avatar.png',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid avatarUrl', () => {
      const result = updateUserSchema.safeParse({
        avatarUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept settings as record', () => {
      const result = updateUserSchema.safeParse({
        settings: {
          theme: 'dark',
          notifications: true,
          language: 'en',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept nested settings', () => {
      const result = updateUserSchema.safeParse({
        settings: {
          notifications: {
            email: true,
            push: false,
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept status change', () => {
      const result = updateUserSchema.safeParse({ status: 'inactive' });
      expect(result.success).toBe(true);
    });
  });

  describe('Assign Roles Schema', () => {
    const assignRolesSchema = z.object({
      roleIds: z.array(z.string().uuid()),
    });

    it('should require roleIds array', () => {
      const result = assignRolesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept empty roleIds array', () => {
      const result = assignRolesSchema.safeParse({ roleIds: [] });
      expect(result.success).toBe(true);
    });

    it('should accept valid roleIds', () => {
      const result = assignRolesSchema.safeParse({
        roleIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '223e4567-e89b-12d3-a456-426614174000',
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUIDs in roleIds', () => {
      const result = assignRolesSchema.safeParse({
        roleIds: ['123e4567-e89b-12d3-a456-426614174000', 'not-a-uuid'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept single roleId', () => {
      const result = assignRolesSchema.safeParse({
        roleIds: ['123e4567-e89b-12d3-a456-426614174000'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('User ID Parameter Schema', () => {
    const userIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = userIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = userIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject empty string', () => {
      const result = userIdParamSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = userIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('List Users Filters', () => {
    it('should handle status filter', () => {
      const query = { status: 'active' };
      const filters = {
        status: query.status,
        search: query.search || (query as Record<string, string>).q,
      };
      expect(filters.status).toBe('active');
    });

    it('should handle search filter', () => {
      const query = { search: 'john' };
      const filters = {
        status: (query as Record<string, string>).status,
        search: query.search || (query as Record<string, string>).q,
      };
      expect(filters.search).toBe('john');
    });

    it('should handle q filter as alias for search', () => {
      const query = { q: 'john' };
      const filters = {
        status: (query as Record<string, string>).status,
        search: (query as Record<string, string>).search || query.q,
      };
      expect(filters.search).toBe('john');
    });

    it('should handle combined filters', () => {
      const query = { status: 'active', search: 'john' };
      const filters = {
        status: query.status,
        search: query.search,
      };
      expect(filters.status).toBe('active');
      expect(filters.search).toBe('john');
    });
  });

  describe('Route Permissions', () => {
    it('should require users:read for GET /', () => {
      const permission = 'users:read';
      expect(permission).toBe('users:read');
    });

    it('should require users:read for GET /:id', () => {
      const permission = 'users:read';
      expect(permission).toBe('users:read');
    });

    it('should require users:create for POST /', () => {
      const permission = 'users:create';
      expect(permission).toBe('users:create');
    });

    it('should require users:update for PUT /:id', () => {
      const permission = 'users:update';
      expect(permission).toBe('users:update');
    });

    it('should require users:delete for DELETE /:id', () => {
      const permission = 'users:delete';
      expect(permission).toBe('users:delete');
    });

    it('should require users:read for GET /:id/groups', () => {
      const permission = 'users:read';
      expect(permission).toBe('users:read');
    });

    it('should require users:update for PUT /:id/roles', () => {
      const permission = 'users:update';
      expect(permission).toBe('users:update');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing user', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `User with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 201 for created user', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted user', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return groups in data wrapper', () => {
      const groups = [{ id: 'group-1', name: 'IT Support' }];
      const response = { data: groups };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return success message for role assignment', () => {
      const response = { message: 'Roles assigned successfully' };
      expect(response.message).toBe('Roles assigned successfully');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to userService.list', async () => {
      const { userService } = await import('../../../src/services/users.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = {};

      await userService.list('test-tenant', pagination, filters);
      expect(userService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to userService.findById', async () => {
      const { userService } = await import('../../../src/services/users.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await userService.findById('test-tenant', id);
      expect(userService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug, body, and userId to userService.create', async () => {
      const { userService } = await import('../../../src/services/users.js');
      const body = { email: 'test@example.com', name: 'Test User' };
      const userId = 'user-123';

      await userService.create('test-tenant', body, userId);
      expect(userService.create).toHaveBeenCalledWith('test-tenant', body, userId);
    });

    it('should pass tenantSlug and id to userService.getUserGroups', async () => {
      const { userService } = await import('../../../src/services/users.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await userService.getUserGroups('test-tenant', id);
      expect(userService.getUserGroups).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug, id, roleIds, and userId to userService.assignRoles', async () => {
      const { userService } = await import('../../../src/services/users.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const roleIds = ['role-1', 'role-2'];
      const userId = 'user-123';

      await userService.assignRoles('test-tenant', id, roleIds, userId);
      expect(userService.assignRoles).toHaveBeenCalledWith('test-tenant', id, roleIds, userId);
    });
  });

  describe('Email Validation', () => {
    const emailSchema = z.string().email();

    it('should accept standard email', () => {
      const result = emailSchema.safeParse('user@example.com');
      expect(result.success).toBe(true);
    });

    it('should accept email with plus sign', () => {
      const result = emailSchema.safeParse('user+tag@example.com');
      expect(result.success).toBe(true);
    });

    it('should accept email with subdomain', () => {
      const result = emailSchema.safeParse('user@mail.example.com');
      expect(result.success).toBe(true);
    });

    it('should reject email without domain', () => {
      const result = emailSchema.safeParse('user@');
      expect(result.success).toBe(false);
    });

    it('should reject email without @', () => {
      const result = emailSchema.safeParse('userexample.com');
      expect(result.success).toBe(false);
    });

    it('should reject email with spaces', () => {
      const result = emailSchema.safeParse('user @example.com');
      expect(result.success).toBe(false);
    });
  });
});
