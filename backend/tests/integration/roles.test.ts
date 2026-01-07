import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockPermission {
  id: string;
  resource: string;
  action: string;
  description: string;
}

interface MockRole {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  user_count: number;
  created_at: string;
  updated_at: string;
  permissions?: MockPermission[];
}

describe('Roles Routes', () => {
  let app: FastifyInstance;
  const roles: MockRole[] = [];
  const permissions: MockPermission[] = [];
  const rolePermissions: Map<string, string[]> = new Map();
  let roleIdCounter = 0;
  let permissionIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // Initialize system roles
    roles.push(
      {
        id: 'role-1',
        name: 'admin',
        display_name: 'Administrator',
        description: 'Full access to all features',
        is_system: true,
        user_count: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'role-2',
        name: 'agent',
        display_name: 'Support Agent',
        description: 'Standard support agent role',
        is_system: true,
        user_count: 10,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'role-3',
        name: 'user',
        display_name: 'End User',
        description: 'Basic end user access',
        is_system: true,
        user_count: 100,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    );

    // Initialize permissions
    const resources = ['issues', 'changes', 'requests', 'problems', 'users', 'settings'];
    const actions = ['read', 'write', 'delete', 'admin'];
    for (const resource of resources) {
      for (const action of actions) {
        permissions.push({
          id: `perm-${++permissionIdCounter}`,
          resource,
          action,
          description: `${action} permission for ${resource}`,
        });
      }
    }

    // Initialize role permissions
    rolePermissions.set('role-1', permissions.map(p => p.id)); // Admin has all
    rolePermissions.set('role-2', permissions.filter(p => p.action === 'read' || p.action === 'write').map(p => p.id));
    rolePermissions.set('role-3', permissions.filter(p => p.action === 'read').map(p => p.id));

    // GET /v1/roles - List roles
    app.get('/v1/roles', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return { data: roles };
    });

    // GET /v1/roles/permissions - List all permissions
    app.get('/v1/roles/permissions', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      // Group by resource
      const grouped = permissions.reduce((acc, p) => {
        if (!acc[p.resource]) {
          acc[p.resource] = [];
        }
        acc[p.resource].push(p);
        return acc;
      }, {} as Record<string, MockPermission[]>);

      return { data: permissions, grouped };
    });

    // GET /v1/roles/:id - Get role with permissions
    app.get('/v1/roles/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id) && !id.startsWith('role-')) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid role ID format',
        });
      }

      const role = roles.find(r => r.id === id);
      if (!role) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Role with id '${id}' not found`,
        });
      }

      const rolePermIds = rolePermissions.get(id) || [];
      const rolePerms = permissions.filter(p => rolePermIds.includes(p.id));

      return {
        ...role,
        permissions: rolePerms,
      };
    });

    // POST /v1/roles - Create role
    app.post('/v1/roles', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        displayName?: string;
        description?: string;
        permissionIds?: string[];
      };

      // Validate name
      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name is required',
        });
      }

      if (body.name.length < 2) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name must be at least 2 characters',
        });
      }

      if (body.name.length > 100) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name must be at most 100 characters',
        });
      }

      const nameRegex = /^[a-z_]+$/;
      if (!nameRegex.test(body.name)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name must only contain lowercase letters and underscores',
        });
      }

      // Check for duplicate name
      if (roles.some(r => r.name === body.name)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Role with this name already exists',
        });
      }

      // Validate displayName
      if (!body.displayName) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Display name is required',
        });
      }

      if (body.displayName.length < 2 || body.displayName.length > 255) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Display name must be between 2 and 255 characters',
        });
      }

      // Validate permissionIds
      if (body.permissionIds) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        for (const permId of body.permissionIds) {
          if (!uuidRegex.test(permId) && !permId.startsWith('perm-')) {
            return reply.status(400).send({
              statusCode: 400,
              error: 'Validation Error',
              message: 'Invalid permission ID format',
            });
          }
        }
      }

      const newRole: MockRole = {
        id: `role-${++roleIdCounter + 3}`,
        name: body.name,
        display_name: body.displayName,
        description: body.description || null,
        is_system: false,
        user_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      roles.push(newRole);
      if (body.permissionIds) {
        rolePermissions.set(newRole.id, body.permissionIds);
      }

      reply.status(201).send(newRole);
    });

    // PUT /v1/roles/:id - Update role
    app.put('/v1/roles/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const roleIndex = roles.findIndex(r => r.id === id);

      if (roleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Role with id '${id}' not found`,
        });
      }

      const role = roles[roleIndex];

      const body = request.body as {
        displayName?: string;
        description?: string;
        permissionIds?: string[];
      };

      // Cannot modify permissions of system roles
      if (role.is_system && body.permissionIds) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot modify permissions of system roles',
        });
      }

      // Validate displayName
      if (body.displayName !== undefined) {
        if (body.displayName.length < 2 || body.displayName.length > 255) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Display name must be between 2 and 255 characters',
          });
        }
        roles[roleIndex].display_name = body.displayName;
      }

      // Update description
      if (body.description !== undefined) {
        roles[roleIndex].description = body.description;
      }

      // Update permissions (only for non-system roles)
      if (body.permissionIds && !role.is_system) {
        rolePermissions.set(id, body.permissionIds);
      }

      roles[roleIndex].updated_at = new Date().toISOString();

      return roles[roleIndex];
    });

    // DELETE /v1/roles/:id - Delete role
    app.delete('/v1/roles/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const roleIndex = roles.findIndex(r => r.id === id);

      if (roleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Role with id '${id}' not found`,
        });
      }

      const role = roles[roleIndex];

      // Cannot delete system roles
      if (role.is_system) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot delete system roles',
        });
      }

      roles.splice(roleIndex, 1);
      rolePermissions.delete(id);

      reply.status(204).send();
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/roles', () => {
    it('should list all roles', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should include system roles', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.some((r: MockRole) => r.name === 'admin')).toBe(true);
      expect(body.data.some((r: MockRole) => r.name === 'agent')).toBe(true);
      expect(body.data.some((r: MockRole) => r.name === 'user')).toBe(true);
    });

    it('should include user count', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data[0].user_count).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/roles/permissions', () => {
    it('should list all permissions', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/permissions',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should group permissions by resource', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/permissions',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.grouped).toBeDefined();
      expect(body.grouped.issues).toBeDefined();
      expect(body.grouped.users).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/permissions',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/roles/:id', () => {
    it('should get role by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/role-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('role-1');
      expect(body.name).toBe('admin');
    });

    it('should include role permissions', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/role-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.permissions).toBeDefined();
      expect(Array.isArray(body.permissions)).toBe(true);
    });

    it('should return 404 for non-existent role', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/role-999',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/roles/role-1',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/roles', () => {
    it('should create a custom role', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'custom_role',
          displayName: 'Custom Role',
          description: 'A custom role for testing',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('custom_role');
      expect(body.display_name).toBe('Custom Role');
      expect(body.is_system).toBe(false);
    });

    it('should create role with permissions', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'role_with_perms',
          displayName: 'Role with Permissions',
          permissionIds: ['perm-1', 'perm-2'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('role_with_perms');
    });

    it('should return 400 for missing name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          displayName: 'Test Role',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for name too short', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'a',
          displayName: 'Test Role',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid name format', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'Invalid-Name',
          displayName: 'Test Role',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing displayName', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'valid_name',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for duplicate name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'admin',
          displayName: 'Another Admin',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        payload: {
          name: 'test_role',
          displayName: 'Test Role',
        },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PUT /v1/roles/:id', () => {
    it('should update role displayName', async () => {
      const token = generateTestToken(app);
      // First create a role to update
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'updatable_role',
          displayName: 'Original Name',
        },
      });
      const createdRole = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/roles/${createdRole.id}`,
        headers: createAuthHeader(token),
        payload: {
          displayName: 'Updated Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.display_name).toBe('Updated Name');
    });

    it('should update role description', async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'desc_update_role',
          displayName: 'Test Role',
        },
      });
      const createdRole = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/roles/${createdRole.id}`,
        headers: createAuthHeader(token),
        payload: {
          description: 'New description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.description).toBe('New description');
    });

    it('should update role permissions for custom role', async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'perm_update_role',
          displayName: 'Test Role',
        },
      });
      const createdRole = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/roles/${createdRole.id}`,
        headers: createAuthHeader(token),
        payload: {
          permissionIds: ['perm-1', 'perm-5'],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should return 400 when modifying system role permissions', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/roles/role-1',
        headers: createAuthHeader(token),
        payload: {
          permissionIds: ['perm-1'],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('system role');
    });

    it('should allow updating system role displayName', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/roles/role-1',
        headers: createAuthHeader(token),
        payload: {
          displayName: 'Super Administrator',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.display_name).toBe('Super Administrator');
    });

    it('should return 404 for non-existent role', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/roles/role-999',
        headers: createAuthHeader(token),
        payload: {
          displayName: 'Test',
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/roles/role-1',
        payload: { displayName: 'Test' },
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /v1/roles/:id', () => {
    it('should delete a custom role', async () => {
      const token = generateTestToken(app);
      // First create a role to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/roles',
        headers: createAuthHeader(token),
        payload: {
          name: 'deletable_role',
          displayName: 'To Delete',
        },
      });
      const createdRole = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/roles/${createdRole.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 400 when deleting system role', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/roles/role-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('system role');
    });

    it('should return 404 for non-existent role', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/roles/role-999',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/roles/role-1',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
