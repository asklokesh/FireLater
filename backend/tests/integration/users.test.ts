import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  timezone: string;
  status: 'active' | 'inactive' | 'pending';
  avatar_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MockGroup {
  id: string;
  name: string;
}

describe('Users Routes', () => {
  let app: FastifyInstance;
  const users: MockUser[] = [];
  const groups: MockGroup[] = [
    { id: 'grp-001', name: 'Engineering' },
    { id: 'grp-002', name: 'Support' },
  ];
  let userIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/users - List users
    app.get('/v1/users', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { status?: string; search?: string; page?: string; per_page?: string };
      let filteredUsers = [...users];

      if (query.status) {
        filteredUsers = filteredUsers.filter(u => u.status === query.status);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        filteredUsers = filteredUsers.filter(u =>
          u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
        );
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');
      const start = (page - 1) * perPage;
      const end = start + perPage;

      return {
        data: filteredUsers.slice(start, end),
        meta: {
          page,
          per_page: perPage,
          total: filteredUsers.length,
          total_pages: Math.ceil(filteredUsers.length / perPage),
        },
      };
    });

    // GET /v1/users/:id - Get user by ID
    app.get('/v1/users/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const user = users.find(u => u.id === id);

      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `User with id '${id}' not found`,
        });
      }

      return user;
    });

    // POST /v1/users - Create user
    app.post('/v1/users', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        email?: string;
        name?: string;
        phone?: string;
        timezone?: string;
        status?: string;
      };

      if (!body.email || !body.email.includes('@')) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Valid email is required',
        });
      }

      if (!body.name || body.name.length < 2) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name must be at least 2 characters',
        });
      }

      const newUser: MockUser = {
        id: `usr-${++userIdCounter}`,
        email: body.email,
        name: body.name,
        phone: body.phone || null,
        timezone: body.timezone || 'UTC',
        status: (body.status as 'active' | 'inactive' | 'pending') || 'pending',
        avatar_url: null,
        settings: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      users.push(newUser);
      reply.status(201).send(newUser);
    });

    // PUT /v1/users/:id - Update user
    app.put('/v1/users/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        phone?: string;
        timezone?: string;
        status?: string;
      };

      const userIndex = users.findIndex(u => u.id === id);
      if (userIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `User with id '${id}' not found`,
        });
      }

      if (body.status && !['active', 'inactive', 'pending'].includes(body.status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid status value',
        });
      }

      users[userIndex] = {
        ...users[userIndex],
        ...body,
        updated_at: new Date().toISOString(),
      } as MockUser;

      return users[userIndex];
    });

    // DELETE /v1/users/:id - Delete user
    app.delete('/v1/users/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const userIndex = users.findIndex(u => u.id === id);

      if (userIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `User with id '${id}' not found`,
        });
      }

      users.splice(userIndex, 1);
      reply.status(204).send();
    });

    // GET /v1/users/:id/groups - Get user's groups
    app.get('/v1/users/:id/groups', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const user = users.find(u => u.id === id);

      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `User with id '${id}' not found`,
        });
      }

      return { data: groups };
    });

    // PUT /v1/users/:id/roles - Assign roles to user
    app.put('/v1/users/:id/roles', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { roleIds?: string[] };

      const user = users.find(u => u.id === id);
      if (!user) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `User with id '${id}' not found`,
        });
      }

      if (!body.roleIds || !Array.isArray(body.roleIds)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'roleIds array is required',
        });
      }

      return { message: 'Roles assigned successfully' };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/users', () => {
    it('should return empty list initially', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/users', () => {
    it('should create a user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/users',
        headers: createAuthHeader(token),
        payload: {
          email: 'john@example.com',
          name: 'John Doe',
          phone: '+1234567890',
          timezone: 'America/New_York',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.email).toBe('john@example.com');
      expect(body.name).toBe('John Doe');
      expect(body.id).toBeDefined();
    });

    it('should return 400 for invalid email', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/users',
        headers: createAuthHeader(token),
        payload: {
          email: 'invalid-email',
          name: 'Test User',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for name too short', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/users',
        headers: createAuthHeader(token),
        payload: {
          email: 'test@example.com',
          name: 'A',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/users/:id', () => {
    it('should get a user by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/usr-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('usr-1');
      expect(body.email).toBe('john@example.com');
    });

    it('should return 404 for non-existent user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/users/:id', () => {
    it('should update a user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/users/usr-1',
        headers: createAuthHeader(token),
        payload: {
          name: 'John Doe Updated',
          status: 'active',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('John Doe Updated');
      expect(body.status).toBe('active');
    });

    it('should return 400 for invalid status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/users/usr-1',
        headers: createAuthHeader(token),
        payload: {
          status: 'invalid-status',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/users/non-existent',
        headers: createAuthHeader(token),
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/users/:id/groups', () => {
    it('should get user groups', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/usr-1/groups',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 404 for non-existent user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/non-existent/groups',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/users/:id/roles', () => {
    it('should assign roles to user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/users/usr-1/roles',
        headers: createAuthHeader(token),
        payload: {
          roleIds: ['role-1', 'role-2'],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Roles assigned successfully');
    });

    it('should return 400 for missing roleIds', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/users/usr-1/roles',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /v1/users/:id', () => {
    it('should delete a user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/users/usr-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 when deleting non-existent user', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/users/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Filtering', () => {
    beforeAll(async () => {
      const token = generateTestToken(app);
      // Add test users
      for (const userData of [
        { email: 'active1@example.com', name: 'Active User 1', status: 'active' },
        { email: 'active2@example.com', name: 'Active User 2', status: 'active' },
        { email: 'inactive@example.com', name: 'Inactive User', status: 'inactive' },
      ]) {
        await app.inject({
          method: 'POST',
          url: '/v1/users',
          headers: createAuthHeader(token),
          payload: userData,
        });
      }
    });

    it('should filter by status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users?status=active',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((u: MockUser) => u.status === 'active')).toBe(true);
    });

    it('should search by name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users?search=Active',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should paginate results', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users?page=1&per_page=2',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta.page).toBe(1);
      expect(body.meta.per_page).toBe(2);
    });
  });
});
