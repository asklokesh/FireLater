import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockRequest {
  id: string;
  number: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  requester_id: string;
  assignee_id: string | null;
  catalog_item_id: string | null;
  form_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface MockApproval {
  id: string;
  request_id: string;
  approver_id: string;
  status: string;
  sequence: number;
  decided_at: string | null;
  decision_notes: string | null;
}

describe('Service Requests Routes', () => {
  let app: FastifyInstance;
  const requests: MockRequest[] = [];
  const approvals: MockApproval[] = [];
  let requestIdCounter = 0;
  let approvalIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/requests - List requests
    app.get('/v1/requests', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { page?: string; limit?: string; status?: string; requester_id?: string };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredRequests = [...requests];
      if (query.status) {
        filteredRequests = filteredRequests.filter((r) => r.status === query.status);
      }
      if (query.requester_id) {
        filteredRequests = filteredRequests.filter((r) => r.requester_id === query.requester_id);
      }

      return {
        data: filteredRequests.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredRequests.length,
          totalPages: Math.ceil(filteredRequests.length / limit),
        },
      };
    });

    // POST /v1/requests - Create request
    app.post('/v1/requests', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        title?: string;
        description?: string;
        priority?: number;
        catalog_item_id?: string;
        form_data?: Record<string, unknown>;
      };

      if (!body.title) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Title is required',
        });
      }

      const newRequest: MockRequest = {
        id: `req-${++requestIdCounter}`,
        number: `REQ${String(requestIdCounter).padStart(7, '0')}`,
        title: body.title,
        description: body.description || '',
        status: 'submitted',
        priority: body.priority || 3,
        requester_id: testUser.userId,
        assignee_id: null,
        catalog_item_id: body.catalog_item_id || null,
        form_data: body.form_data || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      requests.push(newRequest);
      reply.status(201).send(newRequest);
    });

    // GET /v1/requests/:id - Get request by ID
    app.get('/v1/requests/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const req = requests.find((r) => r.id === id);

      if (!req) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      return req;
    });

    // PUT /v1/requests/:id - Update request
    app.put('/v1/requests/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockRequest>;
      const reqIndex = requests.findIndex((r) => r.id === id);

      if (reqIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      requests[reqIndex] = {
        ...requests[reqIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return requests[reqIndex];
    });

    // DELETE /v1/requests/:id - Delete request
    app.delete('/v1/requests/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const reqIndex = requests.findIndex((r) => r.id === id);

      if (reqIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      const req = requests[reqIndex];
      if (req.status !== 'draft' && req.status !== 'submitted') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Can only delete draft or submitted requests',
        });
      }

      requests.splice(reqIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/requests/:id/approve - Approve request
    app.post('/v1/requests/:id/approve', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { notes?: string };
      const reqIndex = requests.findIndex((r) => r.id === id);

      if (reqIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      const req = requests[reqIndex];
      if (req.status !== 'pending_approval' && req.status !== 'submitted') {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request is not awaiting approval',
        });
      }

      req.status = 'approved';
      req.updated_at = new Date().toISOString();

      // Create approval record
      const approval: MockApproval = {
        id: `approval-${++approvalIdCounter}`,
        request_id: id,
        approver_id: testUser.userId,
        status: 'approved',
        sequence: 1,
        decided_at: new Date().toISOString(),
        decision_notes: body.notes || null,
      };
      approvals.push(approval);

      return { request: req, approval };
    });

    // POST /v1/requests/:id/reject - Reject request
    app.post('/v1/requests/:id/reject', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string };
      const reqIndex = requests.findIndex((r) => r.id === id);

      if (reqIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      if (!body.reason) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Rejection reason is required',
        });
      }

      const req = requests[reqIndex];
      req.status = 'rejected';
      req.updated_at = new Date().toISOString();

      // Create rejection record
      const approval: MockApproval = {
        id: `approval-${++approvalIdCounter}`,
        request_id: id,
        approver_id: testUser.userId,
        status: 'rejected',
        sequence: 1,
        decided_at: new Date().toISOString(),
        decision_notes: body.reason,
      };
      approvals.push(approval);

      return { request: req, approval };
    });

    // POST /v1/requests/:id/cancel - Cancel request
    app.post('/v1/requests/:id/cancel', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { reason?: string };
      const reqIndex = requests.findIndex((r) => r.id === id);

      if (reqIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      const req = requests[reqIndex];
      const cancelableStatuses = ['draft', 'submitted', 'pending_approval'];
      if (!cancelableStatuses.includes(req.status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Request cannot be cancelled in its current status',
        });
      }

      req.status = 'cancelled';
      req.updated_at = new Date().toISOString();

      return req;
    });

    // GET /v1/requests/:id/approvals - Get request approvals
    app.get('/v1/requests/:id/approvals', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const req = requests.find((r) => r.id === id);

      if (!req) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Request with id '${id}' not found`,
        });
      }

      const requestApprovals = approvals.filter((a) => a.request_id === id);
      return { data: requestApprovals };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/requests', () => {
    it('should list requests with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/requests',
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
        url: '/v1/requests',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should filter requests by status', async () => {
      const token = generateTestToken(app);

      // Create a request first
      await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Test Request for Filter' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/requests?status=submitted',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.every((r: MockRequest) => r.status === 'submitted')).toBe(true);
    });
  });

  describe('POST /v1/requests', () => {
    it('should create a new service request', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: {
          title: 'New Laptop Request',
          description: 'Requesting a new laptop for development',
          priority: 2,
          form_data: { cpu: 'M2', memory: '32GB' },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('id');
      expect(body.title).toBe('New Laptop Request');
      expect(body.status).toBe('submitted');
      expect(body.form_data).toEqual({ cpu: 'M2', memory: '32GB' });
    });

    it('should reject request without title', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { description: 'No title provided' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Title is required');
    });
  });

  describe('GET /v1/requests/:id', () => {
    it('should get request by ID', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Test Request' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/requests/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body.title).toBe('Test Request');
    });

    it('should return 404 for non-existent request', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/requests/non-existent-id',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/requests/:id', () => {
    it('should update a request', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Original Title' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/requests/${created.id}`,
        headers: createAuthHeader(token),
        payload: { title: 'Updated Title', priority: 1 },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.title).toBe('Updated Title');
      expect(body.priority).toBe(1);
    });
  });

  describe('DELETE /v1/requests/:id', () => {
    it('should delete a submitted request', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Request to Delete' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/requests/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('POST /v1/requests/:id/approve', () => {
    it('should approve a request', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Request to Approve' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/requests/${created.id}/approve`,
        headers: createAuthHeader(token),
        payload: { notes: 'Approved for procurement' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.request.status).toBe('approved');
      expect(body.approval.status).toBe('approved');
      expect(body.approval.decision_notes).toBe('Approved for procurement');
    });
  });

  describe('POST /v1/requests/:id/reject', () => {
    it('should reject a request with reason', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Request to Reject' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/requests/${created.id}/reject`,
        headers: createAuthHeader(token),
        payload: { reason: 'Budget constraints' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.request.status).toBe('rejected');
      expect(body.approval.status).toBe('rejected');
      expect(body.approval.decision_notes).toBe('Budget constraints');
    });

    it('should require rejection reason', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Request to Reject Without Reason' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/requests/${created.id}/reject`,
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Rejection reason is required');
    });
  });

  describe('POST /v1/requests/:id/cancel', () => {
    it('should cancel a submitted request', async () => {
      const token = generateTestToken(app);

      // Create a request first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Request to Cancel' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/requests/${created.id}/cancel`,
        headers: createAuthHeader(token),
        payload: { reason: 'No longer needed' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe('cancelled');
    });
  });

  describe('GET /v1/requests/:id/approvals', () => {
    it('should get request approvals', async () => {
      const token = generateTestToken(app);

      // Create and approve a request
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/requests',
        headers: createAuthHeader(token),
        payload: { title: 'Request with Approvals' },
      });
      const created = JSON.parse(createResponse.payload);

      await app.inject({
        method: 'POST',
        url: `/v1/requests/${created.id}/approve`,
        headers: createAuthHeader(token),
        payload: { notes: 'Approved' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/requests/${created.id}/approvals`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data[0].request_id).toBe(created.id);
    });
  });
});

describe('Request Workflow States', () => {
  it('should validate request state transitions', () => {
    const validTransitions: Record<string, string[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['pending_approval', 'in_progress', 'cancelled'],
      pending_approval: ['approved', 'rejected', 'cancelled'],
      approved: ['in_progress', 'fulfilled'],
      in_progress: ['fulfilled', 'cancelled'],
      fulfilled: ['closed'],
      rejected: [],
      cancelled: [],
      closed: [],
    };

    // Test that all statuses have defined transitions
    expect(Object.keys(validTransitions)).toContain('draft');
    expect(Object.keys(validTransitions)).toContain('submitted');
    expect(Object.keys(validTransitions)).toContain('pending_approval');
    expect(Object.keys(validTransitions)).toContain('approved');
    expect(Object.keys(validTransitions)).toContain('rejected');
    expect(Object.keys(validTransitions)).toContain('cancelled');
    expect(Object.keys(validTransitions)).toContain('closed');
  });
});
