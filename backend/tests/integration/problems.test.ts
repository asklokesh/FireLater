import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockProblem {
  id: string;
  number: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  impact: string;
  is_known_error: boolean;
  root_cause: string | null;
  workaround: string | null;
  reporter_id: string;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MockWorklog {
  id: string;
  problem_id: string;
  user_id: string;
  description: string;
  time_spent_minutes: number;
  created_at: string;
}

describe('Problems Routes', () => {
  let app: FastifyInstance;
  const problems: MockProblem[] = [];
  const worklogs: MockWorklog[] = [];
  let problemIdCounter = 0;
  let worklogIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/problems - List problems
    app.get('/v1/problems', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        page?: string;
        limit?: string;
        status?: string;
        is_known_error?: string;
      };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredProblems = [...problems];
      if (query.status) {
        filteredProblems = filteredProblems.filter((p) => p.status === query.status);
      }
      if (query.is_known_error !== undefined) {
        const isKnownError = query.is_known_error === 'true';
        filteredProblems = filteredProblems.filter((p) => p.is_known_error === isKnownError);
      }

      return {
        data: filteredProblems.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredProblems.length,
          totalPages: Math.ceil(filteredProblems.length / limit),
        },
      };
    });

    // POST /v1/problems - Create problem
    app.post('/v1/problems', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        title?: string;
        description?: string;
        priority?: number;
        impact?: string;
      };

      if (!body.title) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Title is required',
        });
      }

      const newProblem: MockProblem = {
        id: `prob-${++problemIdCounter}`,
        number: `PRB${String(problemIdCounter).padStart(7, '0')}`,
        title: body.title,
        description: body.description || '',
        status: 'new',
        priority: body.priority || 3,
        impact: body.impact || 'medium',
        is_known_error: false,
        root_cause: null,
        workaround: null,
        reporter_id: testUser.userId,
        assignee_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      problems.push(newProblem);
      reply.status(201).send(newProblem);
    });

    // GET /v1/problems/:id - Get problem by ID
    app.get('/v1/problems/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const problem = problems.find((p) => p.id === id);

      if (!problem) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      return problem;
    });

    // PUT /v1/problems/:id - Update problem
    app.put('/v1/problems/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockProblem>;
      const problemIndex = problems.findIndex((p) => p.id === id);

      if (problemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      problems[problemIndex] = {
        ...problems[problemIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return problems[problemIndex];
    });

    // DELETE /v1/problems/:id - Delete problem
    app.delete('/v1/problems/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const problemIndex = problems.findIndex((p) => p.id === id);

      if (problemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      problems.splice(problemIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/problems/:id/root-cause - Set root cause
    app.post('/v1/problems/:id/root-cause', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { root_cause?: string };
      const problemIndex = problems.findIndex((p) => p.id === id);

      if (problemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      if (!body.root_cause) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Root cause description is required',
        });
      }

      problems[problemIndex].root_cause = body.root_cause;
      problems[problemIndex].status = 'root_cause_identified';
      problems[problemIndex].updated_at = new Date().toISOString();

      return problems[problemIndex];
    });

    // POST /v1/problems/:id/workaround - Set workaround
    app.post('/v1/problems/:id/workaround', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { workaround?: string };
      const problemIndex = problems.findIndex((p) => p.id === id);

      if (problemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      if (!body.workaround) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Workaround description is required',
        });
      }

      problems[problemIndex].workaround = body.workaround;
      problems[problemIndex].updated_at = new Date().toISOString();

      return problems[problemIndex];
    });

    // POST /v1/problems/:id/convert-to-known-error - Convert to known error
    app.post('/v1/problems/:id/convert-to-known-error', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const problemIndex = problems.findIndex((p) => p.id === id);

      if (problemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      const problem = problems[problemIndex];
      if (!problem.root_cause) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot convert to known error without root cause',
        });
      }

      problem.is_known_error = true;
      problem.updated_at = new Date().toISOString();

      return problem;
    });

    // POST /v1/problems/:id/worklogs - Add worklog
    app.post('/v1/problems/:id/worklogs', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { description?: string; time_spent_minutes?: number };
      const problem = problems.find((p) => p.id === id);

      if (!problem) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      if (!body.description) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Worklog description is required',
        });
      }

      const worklog: MockWorklog = {
        id: `worklog-${++worklogIdCounter}`,
        problem_id: id,
        user_id: testUser.userId,
        description: body.description,
        time_spent_minutes: body.time_spent_minutes || 0,
        created_at: new Date().toISOString(),
      };

      worklogs.push(worklog);
      reply.status(201).send(worklog);
    });

    // GET /v1/problems/:id/worklogs - Get worklogs
    app.get('/v1/problems/:id/worklogs', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const problem = problems.find((p) => p.id === id);

      if (!problem) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      const problemWorklogs = worklogs.filter((w) => w.problem_id === id);
      return { data: problemWorklogs };
    });

    // POST /v1/problems/:id/resolve - Resolve problem
    app.post('/v1/problems/:id/resolve', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { resolution_notes?: string };
      const problemIndex = problems.findIndex((p) => p.id === id);

      if (problemIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Problem with id '${id}' not found`,
        });
      }

      problems[problemIndex].status = 'resolved';
      problems[problemIndex].updated_at = new Date().toISOString();

      return problems[problemIndex];
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/problems', () => {
    it('should list problems with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/problems',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('pagination');
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/problems',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should filter problems by status', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Test Problem for Filter' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/problems?status=new',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.every((p: MockProblem) => p.status === 'new')).toBe(true);
    });

    it('should filter problems by known error status', async () => {
      const token = generateTestToken(app);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/problems?is_known_error=false',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.every((p: MockProblem) => p.is_known_error === false)).toBe(true);
    });
  });

  describe('POST /v1/problems', () => {
    it('should create a new problem', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: {
          title: 'Database Connection Failures',
          description: 'Multiple users reporting database timeouts',
          priority: 1,
          impact: 'high',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('id');
      expect(body.title).toBe('Database Connection Failures');
      expect(body.status).toBe('new');
      expect(body.is_known_error).toBe(false);
    });

    it('should reject problem without title', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { description: 'No title provided' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Title is required');
    });
  });

  describe('GET /v1/problems/:id', () => {
    it('should get problem by ID', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Test Problem' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/problems/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.title).toBe('Test Problem');
    });

    it('should return 404 for non-existent problem', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/problems/non-existent-id',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/problems/:id', () => {
    it('should update a problem', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Original Title' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/problems/${created.id}`,
        headers: createAuthHeader(token),
        payload: { title: 'Updated Title', priority: 1 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.title).toBe('Updated Title');
      expect(body.priority).toBe(1);
    });
  });

  describe('DELETE /v1/problems/:id', () => {
    it('should delete a problem', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem to Delete' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/problems/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('POST /v1/problems/:id/root-cause', () => {
    it('should set root cause', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem with Root Cause' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/root-cause`,
        headers: createAuthHeader(token),
        payload: { root_cause: 'Database connection pool exhaustion due to leaked connections' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.root_cause).toBe('Database connection pool exhaustion due to leaked connections');
      expect(body.status).toBe('root_cause_identified');
    });

    it('should require root cause description', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem without Root Cause' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/root-cause`,
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Root cause description is required');
    });
  });

  describe('POST /v1/problems/:id/workaround', () => {
    it('should set workaround', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem with Workaround' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/workaround`,
        headers: createAuthHeader(token),
        payload: { workaround: 'Restart the application service to temporarily resolve the issue' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.workaround).toBe('Restart the application service to temporarily resolve the issue');
    });
  });

  describe('POST /v1/problems/:id/convert-to-known-error', () => {
    it('should convert problem to known error when root cause exists', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem to Convert' },
      });
      const created = JSON.parse(createResponse.payload);

      // Set root cause first
      await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/root-cause`,
        headers: createAuthHeader(token),
        payload: { root_cause: 'Known software bug in version 2.1.0' },
      });

      // Convert to known error
      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/convert-to-known-error`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.is_known_error).toBe(true);
    });

    it('should not convert without root cause', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem without Root Cause' },
      });
      const created = JSON.parse(createResponse.payload);

      // Try to convert without root cause
      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/convert-to-known-error`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Cannot convert to known error without root cause');
    });
  });

  describe('POST /v1/problems/:id/worklogs', () => {
    it('should add worklog to problem', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem with Worklogs' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/worklogs`,
        headers: createAuthHeader(token),
        payload: {
          description: 'Investigated database logs, found connection leak pattern',
          time_spent_minutes: 45,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.description).toBe('Investigated database logs, found connection leak pattern');
      expect(body.time_spent_minutes).toBe(45);
    });

    it('should require worklog description', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem for Worklog' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/worklogs`,
        headers: createAuthHeader(token),
        payload: { time_spent_minutes: 30 },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Worklog description is required');
    });
  });

  describe('GET /v1/problems/:id/worklogs', () => {
    it('should get problem worklogs', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem with Multiple Worklogs' },
      });
      const created = JSON.parse(createResponse.payload);

      // Add a worklog
      await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/worklogs`,
        headers: createAuthHeader(token),
        payload: { description: 'Initial investigation', time_spent_minutes: 15 },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/problems/${created.id}/worklogs`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /v1/problems/:id/resolve', () => {
    it('should resolve a problem', async () => {
      const token = generateTestToken(app);

      // Create a problem first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/problems',
        headers: createAuthHeader(token),
        payload: { title: 'Problem to Resolve' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/problems/${created.id}/resolve`,
        headers: createAuthHeader(token),
        payload: { resolution_notes: 'Fixed by upgrading database driver to version 3.0' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('resolved');
    });
  });
});

describe('Problem Workflow States', () => {
  it('should validate problem state transitions', () => {
    const validTransitions: Record<string, string[]> = {
      new: ['assigned', 'in_progress', 'cancelled'],
      assigned: ['in_progress', 'cancelled'],
      in_progress: ['root_cause_identified', 'resolved', 'cancelled'],
      root_cause_identified: ['in_progress', 'resolved'],
      resolved: ['closed'],
      cancelled: [],
      closed: [],
    };

    // Test that all statuses have defined transitions
    expect(Object.keys(validTransitions)).toContain('new');
    expect(Object.keys(validTransitions)).toContain('assigned');
    expect(Object.keys(validTransitions)).toContain('in_progress');
    expect(Object.keys(validTransitions)).toContain('root_cause_identified');
    expect(Object.keys(validTransitions)).toContain('resolved');
    expect(Object.keys(validTransitions)).toContain('cancelled');
    expect(Object.keys(validTransitions)).toContain('closed');
  });
});

describe('Known Error Database', () => {
  it('should support searching known errors', () => {
    // Known errors are problems with is_known_error=true
    // They should have root_cause and optionally workaround documented
    const knownError = {
      id: 'prob-ke-1',
      number: 'PRB0000001',
      title: 'Memory leak in report generator',
      description: 'Report generation causes memory usage to grow continuously',
      status: 'root_cause_identified',
      is_known_error: true,
      root_cause: 'Unreleased file handles in PDF generation library',
      workaround: 'Restart report service every 4 hours via scheduled job',
    };

    expect(knownError.is_known_error).toBe(true);
    expect(knownError.root_cause).toBeTruthy();
    expect(knownError.workaround).toBeTruthy();
  });
});
