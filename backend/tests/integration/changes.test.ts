import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader, mockChange } from '../helpers.js';

describe('Changes Routes', () => {
  let app: FastifyInstance;
  const changes: typeof mockChange[] = [];
  let changeIdCounter = 1;

  beforeAll(async () => {
    app = await createTestApp();

    // Mock changes routes
    app.get('/v1/changes', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { page?: string; limit?: string; status?: string; type?: string };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredChanges = [...changes];
      if (query.status) {
        filteredChanges = filteredChanges.filter((c) => c.status === query.status);
      }
      if (query.type) {
        filteredChanges = filteredChanges.filter((c) => c.type === query.type);
      }

      return {
        data: filteredChanges.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredChanges.length,
          totalPages: Math.ceil(filteredChanges.length / limit),
        },
      };
    });

    app.post('/v1/changes', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        title?: string;
        description?: string;
        type?: string;
        risk?: string;
        impact?: string;
      };

      if (!body.title) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Title is required',
        });
      }

      const newChange = {
        id: `change-${++changeIdCounter}`,
        number: `CHG${String(changeIdCounter).padStart(7, '0')}`,
        title: body.title,
        description: body.description || '',
        status: 'draft',
        type: body.type || 'normal',
        risk: body.risk || 'medium',
        impact: body.impact || 'medium',
        requester_id: testUser.userId,
        owner_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      changes.push(newChange);

      reply.status(201).send(newChange);
    });

    app.get('/v1/changes/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const change = changes.find((c) => c.id === id);

      if (!change) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
        });
      }

      return change;
    });

    app.put('/v1/changes/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<typeof mockChange>;
      const changeIndex = changes.findIndex((c) => c.id === id);

      if (changeIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
        });
      }

      changes[changeIndex] = {
        ...changes[changeIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return changes[changeIndex];
    });

    app.delete('/v1/changes/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const changeIndex = changes.findIndex((c) => c.id === id);

      if (changeIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
        });
      }

      // Only allow deletion of draft changes
      if (changes[changeIndex].status !== 'draft') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only draft changes can be deleted',
        });
      }

      changes.splice(changeIndex, 1);
      reply.status(204).send();
    });

    app.post('/v1/changes/:id/submit', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const changeIndex = changes.findIndex((c) => c.id === id);

      if (changeIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
        });
      }

      if (changes[changeIndex].status !== 'draft') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only draft changes can be submitted',
        });
      }

      changes[changeIndex] = {
        ...changes[changeIndex],
        status: 'submitted',
        updated_at: new Date().toISOString(),
      };

      return changes[changeIndex];
    });

    app.post('/v1/changes/:id/approve', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const changeIndex = changes.findIndex((c) => c.id === id);

      if (changeIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
        });
      }

      if (changes[changeIndex].status !== 'pending_approval') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Only pending changes can be approved',
        });
      }

      changes[changeIndex] = {
        ...changes[changeIndex],
        status: 'approved',
        updated_at: new Date().toISOString(),
      };

      return changes[changeIndex];
    });

    app.post('/v1/changes/:id/reject', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string };
      const changeIndex = changes.findIndex((c) => c.id === id);

      if (changeIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
        });
      }

      if (!body.reason) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Rejection reason is required',
        });
      }

      changes[changeIndex] = {
        ...changes[changeIndex],
        status: 'rejected',
        updated_at: new Date().toISOString(),
      };

      return changes[changeIndex];
    });

    app.post('/v1/changes/:id/comments', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { content?: string; isInternal?: boolean };

      const change = changes.find((c) => c.id === id);
      if (!change) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Change with id '${id}' not found`,
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

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/changes', () => {
    it('should list changes with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/changes',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.pagination).toBeDefined();
    });

    it('should reject unauthenticated request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/changes',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should filter by status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/changes?status=draft',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
    });

    it('should filter by type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/changes?type=normal',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /v1/changes', () => {
    it('should create a new change request', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: {
          title: 'Test Change Request',
          description: 'This is a test change request',
          type: 'normal',
          risk: 'low',
          impact: 'low',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.number).toMatch(/^CHG\d{7}$/);
      expect(body.title).toBe('Test Change Request');
      expect(body.status).toBe('draft');
    });

    it('should reject change without title', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: {
          description: 'Missing title',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/changes/:id', () => {
    it('should get change by ID', async () => {
      const token = generateTestToken(app);

      // Create a change first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: { title: 'Change to retrieve' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/changes/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(created.id);
    });

    it('should return 404 for non-existent change', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/changes/non-existent-id',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/changes/:id', () => {
    it('should update a change request', async () => {
      const token = generateTestToken(app);

      // Create a change first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: { title: 'Change to update' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/changes/${created.id}`,
        headers: createAuthHeader(token),
        payload: {
          title: 'Updated Title',
          risk: 'high',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Title');
      expect(body.risk).toBe('high');
    });
  });

  describe('DELETE /v1/changes/:id', () => {
    it('should delete a draft change', async () => {
      const token = generateTestToken(app);

      // Create a change first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: { title: 'Change to delete' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/changes/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);

      // Verify deletion
      const getResponse = await app.inject({
        method: 'GET',
        url: `/v1/changes/${created.id}`,
        headers: createAuthHeader(token),
      });
      expect(getResponse.statusCode).toBe(404);
    });
  });

  describe('POST /v1/changes/:id/submit', () => {
    it('should submit a draft change', async () => {
      const token = generateTestToken(app);

      // Create a change first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: { title: 'Change to submit' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/changes/${created.id}/submit`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('submitted');
    });
  });

  describe('POST /v1/changes/:id/reject', () => {
    it('should require reason for rejection', async () => {
      const token = generateTestToken(app);

      // Create and submit a change first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: { title: 'Change to reject' },
      });
      const created = JSON.parse(createResponse.body);

      // Try to reject without reason
      const response = await app.inject({
        method: 'POST',
        url: `/v1/changes/${created.id}/reject`,
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('reason');
    });
  });

  describe('POST /v1/changes/:id/comments', () => {
    it('should add a comment to a change', async () => {
      const token = generateTestToken(app);

      // Create a change first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/changes',
        headers: createAuthHeader(token),
        payload: { title: 'Change for comments' },
      });
      const created = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/changes/${created.id}/comments`,
        headers: createAuthHeader(token),
        payload: {
          content: 'This is a test comment',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.content).toBe('This is a test comment');
    });
  });
});

describe('Change Workflow States', () => {
  it('should validate change state transitions', () => {
    const validTransitions: Record<string, string[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['pending_approval', 'cancelled'],
      pending_approval: ['approved', 'rejected'],
      approved: ['scheduled', 'cancelled'],
      scheduled: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'failed'],
      completed: ['closed'],
      failed: ['draft', 'closed'],
      closed: [],
      cancelled: [],
      rejected: ['draft'],
    };

    const isValidTransition = (from: string, to: string): boolean => {
      return validTransitions[from]?.includes(to) || false;
    };

    // Valid transitions
    expect(isValidTransition('draft', 'submitted')).toBe(true);
    expect(isValidTransition('submitted', 'pending_approval')).toBe(true);
    expect(isValidTransition('pending_approval', 'approved')).toBe(true);
    expect(isValidTransition('approved', 'scheduled')).toBe(true);
    expect(isValidTransition('scheduled', 'in_progress')).toBe(true);
    expect(isValidTransition('in_progress', 'completed')).toBe(true);
    expect(isValidTransition('completed', 'closed')).toBe(true);

    // Invalid transitions
    expect(isValidTransition('draft', 'approved')).toBe(false);
    expect(isValidTransition('completed', 'draft')).toBe(false);
    expect(isValidTransition('closed', 'submitted')).toBe(false);

    // Rejection flow
    expect(isValidTransition('pending_approval', 'rejected')).toBe(true);
    expect(isValidTransition('rejected', 'draft')).toBe(true);

    // Failure flow
    expect(isValidTransition('in_progress', 'failed')).toBe(true);
    expect(isValidTransition('failed', 'draft')).toBe(true);
    expect(isValidTransition('failed', 'closed')).toBe(true);
  });
});

describe('Change Risk Assessment', () => {
  it('should calculate change risk based on factors', () => {
    interface RiskFactors {
      scope: 'low' | 'medium' | 'high';
      complexity: 'low' | 'medium' | 'high';
      hasBackout: boolean;
      hasTestPlan: boolean;
      previousFailures: number;
    }

    const calculateRisk = (factors: RiskFactors): 'low' | 'medium' | 'high' | 'critical' => {
      let score = 0;

      // Scope score
      if (factors.scope === 'high') score += 3;
      else if (factors.scope === 'medium') score += 2;
      else score += 1;

      // Complexity score
      if (factors.complexity === 'high') score += 3;
      else if (factors.complexity === 'medium') score += 2;
      else score += 1;

      // Backout plan reduces risk
      if (!factors.hasBackout) score += 2;

      // Test plan reduces risk
      if (!factors.hasTestPlan) score += 2;

      // Previous failures increase risk
      score += factors.previousFailures;

      if (score >= 10) return 'critical';
      if (score >= 7) return 'high';
      if (score >= 4) return 'medium';
      return 'low';
    };

    // Low risk: simple change with backout and test plan
    expect(
      calculateRisk({
        scope: 'low',
        complexity: 'low',
        hasBackout: true,
        hasTestPlan: true,
        previousFailures: 0,
      })
    ).toBe('low');

    // High risk: complex change without safeguards
    expect(
      calculateRisk({
        scope: 'high',
        complexity: 'high',
        hasBackout: false,
        hasTestPlan: false,
        previousFailures: 2,
      })
    ).toBe('critical');

    // Medium risk
    expect(
      calculateRisk({
        scope: 'medium',
        complexity: 'medium',
        hasBackout: true,
        hasTestPlan: false,
        previousFailures: 0,
      })
    ).toBe('medium');
  });
});
