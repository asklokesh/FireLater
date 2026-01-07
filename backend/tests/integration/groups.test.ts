import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockGroup {
  id: string;
  name: string;
  description: string | null;
  type: 'team' | 'department' | 'distribution';
  parent_id: string | null;
  manager_id: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface MockMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'member' | 'lead';
}

describe('Groups Routes', () => {
  let app: FastifyInstance;
  const groups: MockGroup[] = [];
  const members: Map<string, MockMember[]> = new Map();
  let groupIdCounter = 0;
  let memberIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/groups - List groups
    app.get('/v1/groups', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { type?: string; search?: string; page?: string; per_page?: string };
      let filteredGroups = [...groups];

      if (query.type) {
        if (!['team', 'department', 'distribution'].includes(query.type)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Invalid type value',
          });
        }
        filteredGroups = filteredGroups.filter(g => g.type === query.type);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        filteredGroups = filteredGroups.filter(g =>
          g.name.toLowerCase().includes(q) || (g.description && g.description.toLowerCase().includes(q))
        );
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');
      const start = (page - 1) * perPage;
      const end = start + perPage;

      return {
        data: filteredGroups.slice(start, end),
        meta: {
          page,
          per_page: perPage,
          total: filteredGroups.length,
          total_pages: Math.ceil(filteredGroups.length / perPage),
        },
      };
    });

    // GET /v1/groups/:id - Get group by ID
    app.get('/v1/groups/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const group = groups.find(g => g.id === id);

      if (!group) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Group with id '${id}' not found`,
        });
      }

      return group;
    });

    // POST /v1/groups - Create group
    app.post('/v1/groups', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        description?: string;
        type?: string;
        email?: string;
      };

      if (!body.name || body.name.length < 2) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name must be at least 2 characters',
        });
      }

      if (body.type && !['team', 'department', 'distribution'].includes(body.type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid type value',
        });
      }

      const newGroup: MockGroup = {
        id: `grp-${++groupIdCounter}`,
        name: body.name,
        description: body.description || null,
        type: (body.type as 'team' | 'department' | 'distribution') || 'team',
        parent_id: null,
        manager_id: null,
        email: body.email || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      groups.push(newGroup);
      members.set(newGroup.id, []);
      reply.status(201).send(newGroup);
    });

    // PUT /v1/groups/:id - Update group
    app.put('/v1/groups/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        description?: string;
        type?: string;
      };

      const groupIndex = groups.findIndex(g => g.id === id);
      if (groupIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Group with id '${id}' not found`,
        });
      }

      if (body.type && !['team', 'department', 'distribution'].includes(body.type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid type value',
        });
      }

      groups[groupIndex] = {
        ...groups[groupIndex],
        ...body,
        updated_at: new Date().toISOString(),
      } as MockGroup;

      return groups[groupIndex];
    });

    // DELETE /v1/groups/:id - Delete group
    app.delete('/v1/groups/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const groupIndex = groups.findIndex(g => g.id === id);

      if (groupIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Group with id '${id}' not found`,
        });
      }

      groups.splice(groupIndex, 1);
      members.delete(id);
      reply.status(204).send();
    });

    // GET /v1/groups/:id/members - Get group members
    app.get('/v1/groups/:id/members', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const group = groups.find(g => g.id === id);

      if (!group) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Group with id '${id}' not found`,
        });
      }

      return { data: members.get(id) || [] };
    });

    // POST /v1/groups/:id/members - Add member to group
    app.post('/v1/groups/:id/members', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { userId?: string; role?: string };

      const group = groups.find(g => g.id === id);
      if (!group) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Group with id '${id}' not found`,
        });
      }

      if (!body.userId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'userId is required',
        });
      }

      if (body.role && !['member', 'lead'].includes(body.role)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid role value',
        });
      }

      const newMember: MockMember = {
        id: `mem-${++memberIdCounter}`,
        user_id: body.userId,
        name: 'Test User',
        email: 'test@example.com',
        role: (body.role as 'member' | 'lead') || 'member',
      };

      const groupMembers = members.get(id) || [];
      groupMembers.push(newMember);
      members.set(id, groupMembers);

      reply.status(201).send({ message: 'Member added successfully' });
    });

    // DELETE /v1/groups/:id/members/:userId - Remove member from group
    app.delete('/v1/groups/:id/members/:userId', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id, userId } = request.params as { id: string; userId: string };

      const group = groups.find(g => g.id === id);
      if (!group) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Group with id '${id}' not found`,
        });
      }

      const groupMembers = members.get(id) || [];
      const memberIndex = groupMembers.findIndex(m => m.user_id === userId);

      if (memberIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Member with userId '${userId}' not found in group`,
        });
      }

      groupMembers.splice(memberIndex, 1);
      members.set(id, groupMembers);
      reply.status(204).send();
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/groups', () => {
    it('should return empty list initially', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups',
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
        url: '/v1/groups',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups?type=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/groups', () => {
    it('should create a group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/groups',
        headers: createAuthHeader(token),
        payload: {
          name: 'Engineering Team',
          description: 'The engineering team',
          type: 'team',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Engineering Team');
      expect(body.type).toBe('team');
      expect(body.id).toBeDefined();
    });

    it('should return 400 for name too short', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/groups',
        headers: createAuthHeader(token),
        payload: {
          name: 'A',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/groups',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Group',
          type: 'invalid-type',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/groups/:id', () => {
    it('should get a group by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups/grp-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('grp-1');
      expect(body.name).toBe('Engineering Team');
    });

    it('should return 404 for non-existent group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/groups/:id', () => {
    it('should update a group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/groups/grp-1',
        headers: createAuthHeader(token),
        payload: {
          name: 'Engineering Team Updated',
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Engineering Team Updated');
    });

    it('should return 400 for invalid type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/groups/grp-1',
        headers: createAuthHeader(token),
        payload: {
          type: 'invalid-type',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 404 for non-existent group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/groups/non-existent',
        headers: createAuthHeader(token),
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/groups/:id/members', () => {
    it('should get group members', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups/grp-1/members',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 404 for non-existent group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups/non-existent/members',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /v1/groups/:id/members', () => {
    it('should add a member to group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/groups/grp-1/members',
        headers: createAuthHeader(token),
        payload: {
          userId: 'usr-001',
          role: 'member',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.message).toBe('Member added successfully');
    });

    it('should return 400 for missing userId', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/groups/grp-1/members',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid role', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/groups/grp-1/members',
        headers: createAuthHeader(token),
        payload: {
          userId: 'usr-002',
          role: 'invalid-role',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /v1/groups/:id/members/:userId', () => {
    it('should remove a member from group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/groups/grp-1/members/usr-001',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent member', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/groups/grp-1/members/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /v1/groups/:id', () => {
    it('should delete a group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/groups/grp-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 when deleting non-existent group', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/groups/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Filtering', () => {
    beforeAll(async () => {
      const token = generateTestToken(app);
      // Add test groups
      for (const groupData of [
        { name: 'IT Department', type: 'department' },
        { name: 'Support Team', type: 'team' },
        { name: 'All Employees', type: 'distribution' },
      ]) {
        await app.inject({
          method: 'POST',
          url: '/v1/groups',
          headers: createAuthHeader(token),
          payload: groupData,
        });
      }
    });

    it('should filter by type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups?type=team',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((g: MockGroup) => g.type === 'team')).toBe(true);
    });

    it('should search by name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/groups?search=Department',
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
        url: '/v1/groups?page=1&per_page=2',
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
