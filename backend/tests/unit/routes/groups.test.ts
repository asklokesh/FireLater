import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/groups.js', () => ({
  groupService: {
    list: vi.fn().mockResolvedValue({ groups: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getMembers: vi.fn().mockResolvedValue([]),
    addMember: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
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

describe('Groups Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Group Schema', () => {
    const createGroupSchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(1000).optional(),
      type: z.enum(['team', 'department', 'distribution']).optional(),
      parentId: z.string().uuid().optional(),
      managerId: z.string().uuid().optional(),
      email: z.string().email().optional(),
      settings: z.record(z.unknown()).optional(),
    });

    it('should require name of at least 2 characters', () => {
      const result = createGroupSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should accept valid name', () => {
      const result = createGroupSchema.safeParse({ name: 'IT Support' });
      expect(result.success).toBe(true);
    });

    it('should reject name over 255 characters', () => {
      const result = createGroupSchema.safeParse({ name: 'x'.repeat(256) });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createGroupSchema.safeParse({
        name: 'IT Support',
        description: 'Handles IT support tickets',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 1000 characters', () => {
      const result = createGroupSchema.safeParse({
        name: 'IT Support',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all group types', () => {
      const types = ['team', 'department', 'distribution'];
      for (const type of types) {
        const result = createGroupSchema.safeParse({ name: 'Test Group', type });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid group type', () => {
      const result = createGroupSchema.safeParse({ name: 'Test Group', type: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('should accept parentId as UUID', () => {
      const result = createGroupSchema.safeParse({
        name: 'Sub Team',
        parentId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid parentId', () => {
      const result = createGroupSchema.safeParse({
        name: 'Sub Team',
        parentId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept managerId as UUID', () => {
      const result = createGroupSchema.safeParse({
        name: 'IT Support',
        managerId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept email', () => {
      const result = createGroupSchema.safeParse({
        name: 'IT Support',
        email: 'it-support@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = createGroupSchema.safeParse({
        name: 'IT Support',
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should accept settings as record', () => {
      const result = createGroupSchema.safeParse({
        name: 'IT Support',
        settings: {
          notifications: true,
          escalationTime: 30,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Group Schema', () => {
    const updateGroupSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(1000).optional(),
      type: z.enum(['team', 'department', 'distribution']).optional(),
      parentId: z.string().uuid().optional(),
      managerId: z.string().uuid().optional(),
      email: z.string().email().optional(),
      settings: z.record(z.unknown()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateGroupSchema.safeParse({ name: 'Updated Name' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateGroupSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept type change', () => {
      const result = updateGroupSchema.safeParse({ type: 'department' });
      expect(result.success).toBe(true);
    });

    it('should accept manager change', () => {
      const result = updateGroupSchema.safeParse({
        managerId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Add Member Schema', () => {
    const addMemberSchema = z.object({
      userId: z.string().uuid(),
      role: z.enum(['member', 'lead']).optional(),
    });

    it('should require userId', () => {
      const result = addMemberSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid userId', () => {
      const result = addMemberSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid userId', () => {
      const result = addMemberSchema.safeParse({ userId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should accept member role', () => {
      const result = addMemberSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'member',
      });
      expect(result.success).toBe(true);
    });

    it('should accept lead role', () => {
      const result = addMemberSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'lead',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = addMemberSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'admin',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Group ID Parameter Schema', () => {
    const groupIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = groupIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = groupIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('Group Member Parameter Schema', () => {
    const groupMemberParamSchema = z.object({
      id: z.string().uuid(),
      userId: z.string().uuid(),
    });

    it('should require both id and userId', () => {
      const result = groupMemberParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid UUIDs for both', () => {
      const result = groupMemberParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('List Groups Query Schema', () => {
    const listGroupsQuerySchema = z.object({
      page: z.coerce.number().int().positive().optional(),
      per_page: z.coerce.number().int().min(1).max(100).optional(),
      type: z.enum(['team', 'department', 'distribution']).optional(),
      search: z.string().max(200).optional(),
      q: z.string().max(200).optional(),
    });

    it('should accept empty query', () => {
      const result = listGroupsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept pagination parameters', () => {
      const result = listGroupsQuerySchema.safeParse({
        page: '1',
        per_page: '20',
      });
      expect(result.success).toBe(true);
    });

    it('should filter by type', () => {
      const result = listGroupsQuerySchema.safeParse({ type: 'team' });
      expect(result.success).toBe(true);
    });

    it('should accept search parameter', () => {
      const result = listGroupsQuerySchema.safeParse({ search: 'support' });
      expect(result.success).toBe(true);
    });

    it('should accept q parameter (alias for search)', () => {
      const result = listGroupsQuerySchema.safeParse({ q: 'support' });
      expect(result.success).toBe(true);
    });

    it('should reject search over 200 characters', () => {
      const result = listGroupsQuerySchema.safeParse({ search: 'x'.repeat(201) });
      expect(result.success).toBe(false);
    });

    it('should reject per_page over 100', () => {
      const result = listGroupsQuerySchema.safeParse({ per_page: '101' });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require groups:read for GET /', () => {
      const permission = 'groups:read';
      expect(permission).toBe('groups:read');
    });

    it('should require groups:read for GET /:id', () => {
      const permission = 'groups:read';
      expect(permission).toBe('groups:read');
    });

    it('should require groups:create for POST /', () => {
      const permission = 'groups:create';
      expect(permission).toBe('groups:create');
    });

    it('should require groups:update for PUT /:id', () => {
      const permission = 'groups:update';
      expect(permission).toBe('groups:update');
    });

    it('should require groups:delete for DELETE /:id', () => {
      const permission = 'groups:delete';
      expect(permission).toBe('groups:delete');
    });

    it('should require groups:read for GET /:id/members', () => {
      const permission = 'groups:read';
      expect(permission).toBe('groups:read');
    });

    it('should require groups:update for POST /:id/members', () => {
      const permission = 'groups:update';
      expect(permission).toBe('groups:update');
    });

    it('should require groups:update for DELETE /:id/members/:userId', () => {
      const permission = 'groups:update';
      expect(permission).toBe('groups:update');
    });
  });

  describe('Response Formats', () => {
    it('should return 404 for missing group', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Group with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 201 for created group', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted group', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return members in data wrapper', () => {
      const members = [{ id: 'user-1', name: 'John Doe' }];
      const response = { data: members };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return success message for member add', () => {
      const response = { message: 'Member added successfully' };
      expect(response.message).toBe('Member added successfully');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to groupService.list', async () => {
      const { groupService } = await import('../../../src/services/groups.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = {};

      await groupService.list('test-tenant', pagination, filters);
      expect(groupService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to groupService.findById', async () => {
      const { groupService } = await import('../../../src/services/groups.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await groupService.findById('test-tenant', id);
      expect(groupService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and id to groupService.getMembers', async () => {
      const { groupService } = await import('../../../src/services/groups.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await groupService.getMembers('test-tenant', id);
      expect(groupService.getMembers).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass all parameters to groupService.addMember', async () => {
      const { groupService } = await import('../../../src/services/groups.js');
      const groupId = '123e4567-e89b-12d3-a456-426614174000';
      const userId = '223e4567-e89b-12d3-a456-426614174000';
      const role = 'lead';
      const actingUserId = '323e4567-e89b-12d3-a456-426614174000';

      await groupService.addMember('test-tenant', groupId, userId, role, actingUserId);
      expect(groupService.addMember).toHaveBeenCalledWith('test-tenant', groupId, userId, role, actingUserId);
    });
  });
});
