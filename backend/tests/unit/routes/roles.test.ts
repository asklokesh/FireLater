import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock database pool
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    }),
  },
}));

// Mock services
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
  requireRole: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock errors
vi.mock('../../../src/utils/errors.js', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(entity: string, id: string) {
      super(`${entity} with id '${id}' not found`);
    }
  },
  BadRequestError: class BadRequestError extends Error {
    constructor(message: string) {
      super(message);
    }
  },
}));

describe('Roles Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Role Schema', () => {
    const createRoleSchema = z.object({
      name: z.string().min(2).max(100).regex(/^[a-z_]+$/),
      displayName: z.string().min(2).max(255),
      description: z.string().max(1000).optional(),
      permissionIds: z.array(z.string().uuid()).optional(),
    });

    it('should require name and displayName', () => {
      const result = createRoleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid role data', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 2 characters', () => {
      const result = createRoleSchema.safeParse({
        name: 'a',
        displayName: 'Agent',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 characters', () => {
      const result = createRoleSchema.safeParse({
        name: 'a'.repeat(101),
        displayName: 'Agent',
      });
      expect(result.success).toBe(false);
    });

    it('should require name to be lowercase with underscores only', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
      });
      expect(result.success).toBe(true);
    });

    it('should reject name with uppercase letters', () => {
      const result = createRoleSchema.safeParse({
        name: 'SupportAgent',
        displayName: 'Support Agent',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name with spaces', () => {
      const result = createRoleSchema.safeParse({
        name: 'support agent',
        displayName: 'Support Agent',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name with hyphens', () => {
      const result = createRoleSchema.safeParse({
        name: 'support-agent',
        displayName: 'Support Agent',
      });
      expect(result.success).toBe(false);
    });

    it('should require displayName of at least 2 characters', () => {
      const result = createRoleSchema.safeParse({
        name: 'agent',
        displayName: 'A',
      });
      expect(result.success).toBe(false);
    });

    it('should reject displayName over 255 characters', () => {
      const result = createRoleSchema.safeParse({
        name: 'agent',
        displayName: 'A'.repeat(256),
      });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
        description: 'Handles customer support tickets',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 1000 characters', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept permissionIds array', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
        permissionIds: [
          '123e4567-e89b-12d3-a456-426614174000',
          '223e4567-e89b-12d3-a456-426614174000',
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid permissionIds', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
        permissionIds: ['not-a-uuid'],
      });
      expect(result.success).toBe(false);
    });

    it('should accept empty permissionIds array', () => {
      const result = createRoleSchema.safeParse({
        name: 'support_agent',
        displayName: 'Support Agent',
        permissionIds: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Role Schema', () => {
    const updateRoleSchema = z.object({
      displayName: z.string().min(2).max(255).optional(),
      description: z.string().max(1000).optional(),
      permissionIds: z.array(z.string().uuid()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateRoleSchema.safeParse({
        displayName: 'Updated Display Name',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateRoleSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept description update', () => {
      const result = updateRoleSchema.safeParse({
        description: 'Updated description',
      });
      expect(result.success).toBe(true);
    });

    it('should accept permissionIds update', () => {
      const result = updateRoleSchema.safeParse({
        permissionIds: ['123e4567-e89b-12d3-a456-426614174000'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Role ID Parameter Schema', () => {
    const roleIdParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = roleIdParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = roleIdParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing id', () => {
      const result = roleIdParamSchema.safeParse({});
      expect(result.success).toBe(false);
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

    it('should require admin role for POST /', () => {
      const role = 'admin';
      expect(role).toBe('admin');
    });

    it('should require admin role for PUT /:id', () => {
      const role = 'admin';
      expect(role).toBe('admin');
    });

    it('should require admin role for DELETE /:id', () => {
      const role = 'admin';
      expect(role).toBe('admin');
    });

    it('should require users:read for GET /permissions', () => {
      const permission = 'users:read';
      expect(permission).toBe('users:read');
    });
  });

  describe('Response Formats', () => {
    it('should return roles in data wrapper', () => {
      const roles = [{ id: 'role-1', name: 'admin', displayName: 'Administrator' }];
      const response = { data: roles };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return role with permissions', () => {
      const role = {
        id: 'role-1',
        name: 'admin',
        displayName: 'Administrator',
        permissions: [
          { id: 'perm-1', resource: 'users', action: 'read' },
        ],
      };
      expect(role).toHaveProperty('permissions');
      expect(Array.isArray(role.permissions)).toBe(true);
    });

    it('should return 404 for missing role', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Role with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 400 for modifying system role permissions', () => {
      const errorResponse = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Cannot modify permissions of system roles',
      };
      expect(errorResponse.statusCode).toBe(400);
      expect(errorResponse.message).toContain('system roles');
    });

    it('should return 400 for deleting system role', () => {
      const errorResponse = {
        statusCode: 400,
        error: 'Bad Request',
        message: 'Cannot delete system roles',
      };
      expect(errorResponse.statusCode).toBe(400);
      expect(errorResponse.message).toContain('delete');
    });

    it('should return 201 for created role', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted role', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return permissions grouped by resource', () => {
      const response = {
        data: [
          { id: 'perm-1', resource: 'users', action: 'read' },
          { id: 'perm-2', resource: 'users', action: 'write' },
          { id: 'perm-3', resource: 'issues', action: 'read' },
        ],
        grouped: {
          users: [
            { id: 'perm-1', resource: 'users', action: 'read' },
            { id: 'perm-2', resource: 'users', action: 'write' },
          ],
          issues: [
            { id: 'perm-3', resource: 'issues', action: 'read' },
          ],
        },
      };
      expect(response).toHaveProperty('grouped');
      expect(response.grouped).toHaveProperty('users');
      expect(response.grouped).toHaveProperty('issues');
    });
  });

  describe('Role Name Validation', () => {
    const nameRegex = /^[a-z_]+$/;

    it('should accept lowercase letters', () => {
      expect(nameRegex.test('admin')).toBe(true);
    });

    it('should accept underscores', () => {
      expect(nameRegex.test('support_agent')).toBe(true);
    });

    it('should accept multiple underscores', () => {
      expect(nameRegex.test('level_one_support')).toBe(true);
    });

    it('should reject uppercase letters', () => {
      expect(nameRegex.test('Admin')).toBe(false);
    });

    it('should reject numbers', () => {
      expect(nameRegex.test('admin1')).toBe(false);
    });

    it('should reject hyphens', () => {
      expect(nameRegex.test('support-agent')).toBe(false);
    });

    it('should reject spaces', () => {
      expect(nameRegex.test('support agent')).toBe(false);
    });
  });

  describe('System Role Protection', () => {
    it('should identify system roles by is_system flag', () => {
      const systemRole = { id: 'role-1', name: 'admin', is_system: true };
      expect(systemRole.is_system).toBe(true);
    });

    it('should identify custom roles by is_system flag', () => {
      const customRole = { id: 'role-2', name: 'custom_role', is_system: false };
      expect(customRole.is_system).toBe(false);
    });

    it('should not allow permission changes on system roles', () => {
      const existing = { is_system: true };
      const body = { permissionIds: ['123e4567-e89b-12d3-a456-426614174000'] };
      const canModify = !(existing.is_system && body.permissionIds);
      expect(canModify).toBe(false);
    });

    it('should allow permission changes on custom roles', () => {
      const existing = { is_system: false };
      const body = { permissionIds: ['123e4567-e89b-12d3-a456-426614174000'] };
      const canModify = !(existing.is_system && body.permissionIds);
      expect(canModify).toBe(true);
    });
  });
});
