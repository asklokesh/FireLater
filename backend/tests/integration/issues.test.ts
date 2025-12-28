import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader, mockIssue } from '../helpers.js';

describe('Issues Routes', () => {
  let app: FastifyInstance;
  const issues: typeof mockIssue[] = [];
  let issueIdCounter = 1;

  beforeAll(async () => {
    app = await createTestApp();

    // Mock issues routes
    app.get('/v1/issues', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { page?: string; limit?: string; status?: string };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredIssues = [...issues];
      if (query.status) {
        filteredIssues = filteredIssues.filter((i) => i.status === query.status);
      }

      return {
        data: filteredIssues.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredIssues.length,
          totalPages: Math.ceil(filteredIssues.length / limit),
        },
      };
    });

    app.post('/v1/issues', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as { title?: string; description?: string; priority?: number; type?: string };

      if (!body.title) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Title is required',
        });
      }

      const newIssue = {
        id: `issue-${++issueIdCounter}`,
        number: `INC${String(issueIdCounter).padStart(7, '0')}`,
        title: body.title,
        description: body.description || '',
        status: 'new',
        priority: body.priority || 3,
        urgency: 3,
        impact: 3,
        type: body.type || 'incident',
        reporter_id: testUser.userId,
        assignee_id: null,
        application_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      issues.push(newIssue);

      reply.status(201).send(newIssue);
    });

    app.get('/v1/issues/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const issue = issues.find((i) => i.id === id);

      if (!issue) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Issue with id '${id}' not found`,
        });
      }

      return issue;
    });

    app.put('/v1/issues/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<typeof mockIssue>;
      const issueIndex = issues.findIndex((i) => i.id === id);

      if (issueIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Issue with id '${id}' not found`,
        });
      }

      issues[issueIndex] = {
        ...issues[issueIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return issues[issueIndex];
    });

    app.delete('/v1/issues/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const issueIndex = issues.findIndex((i) => i.id === id);

      if (issueIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Issue with id '${id}' not found`,
        });
      }

      issues.splice(issueIndex, 1);
      reply.status(204).send();
    });

    app.post('/v1/issues/:id/comments', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { content?: string; isInternal?: boolean };

      const issue = issues.find((i) => i.id === id);
      if (!issue) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Issue with id '${id}' not found`,
        });
      }

      if (!body.content) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Content is required',
        });
      }

      reply.status(201).send({
        id: 'comment-' + Date.now(),
        content: body.content,
        is_internal: body.isInternal || false,
        user_id: testUser.userId,
        user_name: 'Test User',
        created_at: new Date().toISOString(),
      });
    });

    app.get('/v1/issues/:id/comments', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const issue = issues.find((i) => i.id === id);

      if (!issue) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Issue with id '${id}' not found`,
        });
      }

      return [];
    });

    app.post('/v1/issues/:id/assign', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { assigneeId: string };
      const issueIndex = issues.findIndex((i) => i.id === id);

      if (issueIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Issue with id '${id}' not found`,
        });
      }

      if (!body.assigneeId) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Assignee ID is required',
        });
      }

      issues[issueIndex] = {
        ...issues[issueIndex],
        assignee_id: body.assigneeId,
        status: 'assigned',
        updated_at: new Date().toISOString(),
      };

      return issues[issueIndex];
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/issues', () => {
    it('should list issues with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/issues',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.pagination).toBeDefined();
      expect(body.pagination.page).toBe(1);
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/issues',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should filter issues by status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/issues?status=new',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /v1/issues', () => {
    it('should create a new issue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: {
          title: 'Test Issue',
          description: 'This is a test issue',
          priority: 2,
          type: 'incident',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.number).toMatch(/^INC\d{7}$/);
      expect(body.title).toBe('Test Issue');
      expect(body.status).toBe('new');
    });

    it('should reject issue without title', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: {
          description: 'Missing title',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Title');
    });
  });

  describe('GET /v1/issues/:id', () => {
    it('should get issue by ID', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue to retrieve' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/issues/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(created.id);
      expect(body.title).toBe('Issue to retrieve');
    });

    it('should return 404 for non-existent issue', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/issues/non-existent-id',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/issues/:id', () => {
    it('should update an issue', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue to update' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/issues/${created.id}`,
        headers: createAuthHeader(token),
        payload: {
          title: 'Updated Title',
          status: 'in_progress',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Title');
      expect(body.status).toBe('in_progress');
    });
  });

  describe('DELETE /v1/issues/:id', () => {
    it('should delete an issue', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue to delete' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/issues/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const getResponse = await app.inject({
        method: 'GET',
        url: `/v1/issues/${created.id}`,
        headers: createAuthHeader(token),
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('POST /v1/issues/:id/comments', () => {
    it('should add a comment to an issue', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue for comments' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/issues/${created.id}/comments`,
        headers: createAuthHeader(token),
        payload: {
          content: 'This is a test comment',
          isInternal: false,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.content).toBe('This is a test comment');
    });

    it('should reject comment without content', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue for comments' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/issues/${created.id}/comments`,
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/issues/:id/assign', () => {
    it('should assign an issue to a user', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue to assign' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/issues/${created.id}/assign`,
        headers: createAuthHeader(token),
        payload: {
          assigneeId: 'user-456',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.assignee_id).toBe('user-456');
      expect(body.status).toBe('assigned');
    });

    it('should reject assignment without assignee ID', async () => {
      const token = generateTestToken(app);

      // Create an issue first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/issues',
        headers: createAuthHeader(token),
        payload: { title: 'Issue to assign' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/issues/${created.id}/assign`,
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
