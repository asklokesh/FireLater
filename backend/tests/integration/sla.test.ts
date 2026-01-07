import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockSlaPolicy {
  id: string;
  name: string;
  description: string | null;
  entity_type: 'issue' | 'problem' | 'change';
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  targets: MockSlaTarget[];
}

interface MockSlaTarget {
  id: string;
  policy_id: string;
  metric_type: 'response_time' | 'resolution_time';
  priority: 'critical' | 'high' | 'medium' | 'low';
  target_minutes: number;
  warning_threshold_percent: number;
  created_at: string;
  updated_at: string;
}

const validEntityTypes = ['issue', 'problem', 'change'];
const validMetricTypes = ['response_time', 'resolution_time'];
const validPriorities = ['critical', 'high', 'medium', 'low'];

describe('SLA Routes', () => {
  let app: FastifyInstance;
  const policies: MockSlaPolicy[] = [];
  const targets: MockSlaTarget[] = [];
  let policyIdCounter = 0;
  let targetIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/sla/policies - List SLA policies
    app.get('/v1/sla/policies', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        entity_type?: string;
        is_active?: string;
        page?: string;
        per_page?: string;
      };

      // Validate entity_type
      if (query.entity_type && !validEntityTypes.includes(query.entity_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid entity_type value',
        });
      }

      let filteredPolicies = [...policies];

      if (query.entity_type) {
        filteredPolicies = filteredPolicies.filter(p => p.entity_type === query.entity_type);
      }
      if (query.is_active !== undefined) {
        const isActive = query.is_active === 'true';
        filteredPolicies = filteredPolicies.filter(p => p.is_active === isActive);
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');
      const start = (page - 1) * perPage;
      const end = start + perPage;

      return {
        data: filteredPolicies.slice(start, end),
        meta: {
          page,
          per_page: perPage,
          total: filteredPolicies.length,
          total_pages: Math.ceil(filteredPolicies.length / perPage),
        },
      };
    });

    // GET /v1/sla/policies/:id - Get policy by ID
    app.get('/v1/sla/policies/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const policy = policies.find(p => p.id === id);

      if (!policy) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA policy with id '${id}' not found`,
        });
      }

      // Include targets
      const policyWithTargets = {
        ...policy,
        targets: targets.filter(t => t.policy_id === id),
      };

      return policyWithTargets;
    });

    // POST /v1/sla/policies - Create policy
    app.post('/v1/sla/policies', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        description?: string;
        entity_type?: string;
        is_default?: boolean;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name is required',
        });
      }

      if (!body.entity_type) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'entity_type is required',
        });
      }

      if (!validEntityTypes.includes(body.entity_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid entity_type value',
        });
      }

      const newPolicy: MockSlaPolicy = {
        id: `pol-${++policyIdCounter}`,
        name: body.name,
        description: body.description || null,
        entity_type: body.entity_type as 'issue' | 'problem' | 'change',
        is_default: body.is_default || false,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        targets: [],
      };

      policies.push(newPolicy);
      reply.status(201).send(newPolicy);
    });

    // PUT /v1/sla/policies/:id - Update policy
    app.put('/v1/sla/policies/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const policyIndex = policies.findIndex(p => p.id === id);

      if (policyIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA policy with id '${id}' not found`,
        });
      }

      const body = request.body as Partial<MockSlaPolicy>;

      if (body.entity_type && !validEntityTypes.includes(body.entity_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid entity_type value',
        });
      }

      policies[policyIndex] = {
        ...policies[policyIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return policies[policyIndex];
    });

    // DELETE /v1/sla/policies/:id - Delete policy
    app.delete('/v1/sla/policies/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const policyIndex = policies.findIndex(p => p.id === id);

      if (policyIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA policy with id '${id}' not found`,
        });
      }

      // Cannot delete default policies
      if (policies[policyIndex].is_default) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          message: 'Cannot delete default SLA policy',
        });
      }

      // Delete associated targets
      const policyTargets = targets.filter(t => t.policy_id === id);
      policyTargets.forEach(t => {
        const idx = targets.findIndex(tgt => tgt.id === t.id);
        if (idx !== -1) targets.splice(idx, 1);
      });

      policies.splice(policyIndex, 1);
      reply.status(204).send();
    });

    // GET /v1/sla/policies/:policyId/targets - List targets for a policy
    app.get('/v1/sla/policies/:policyId/targets', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { policyId } = request.params as { policyId: string };
      const policy = policies.find(p => p.id === policyId);

      if (!policy) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA policy with id '${policyId}' not found`,
        });
      }

      const policyTargets = targets.filter(t => t.policy_id === policyId);
      return { data: policyTargets };
    });

    // POST /v1/sla/policies/:policyId/targets - Create target
    app.post('/v1/sla/policies/:policyId/targets', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { policyId } = request.params as { policyId: string };
      const policy = policies.find(p => p.id === policyId);

      if (!policy) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA policy with id '${policyId}' not found`,
        });
      }

      const body = request.body as {
        metric_type?: string;
        priority?: string;
        target_minutes?: number;
        warning_threshold_percent?: number;
      };

      if (!body.metric_type) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'metric_type is required',
        });
      }

      if (!validMetricTypes.includes(body.metric_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid metric_type value',
        });
      }

      if (!body.priority) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'priority is required',
        });
      }

      if (!validPriorities.includes(body.priority)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid priority value',
        });
      }

      if (!body.target_minutes || body.target_minutes <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'target_minutes must be a positive number',
        });
      }

      const newTarget: MockSlaTarget = {
        id: `tgt-${++targetIdCounter}`,
        policy_id: policyId,
        metric_type: body.metric_type as 'response_time' | 'resolution_time',
        priority: body.priority as 'critical' | 'high' | 'medium' | 'low',
        target_minutes: body.target_minutes,
        warning_threshold_percent: body.warning_threshold_percent || 75,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      targets.push(newTarget);
      reply.status(201).send(newTarget);
    });

    // GET /v1/sla/targets/:id - Get target by ID
    app.get('/v1/sla/targets/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const target = targets.find(t => t.id === id);

      if (!target) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA target with id '${id}' not found`,
        });
      }

      return target;
    });

    // PUT /v1/sla/targets/:id - Update target
    app.put('/v1/sla/targets/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const targetIndex = targets.findIndex(t => t.id === id);

      if (targetIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA target with id '${id}' not found`,
        });
      }

      const body = request.body as Partial<MockSlaTarget>;

      if (body.metric_type && !validMetricTypes.includes(body.metric_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid metric_type value',
        });
      }

      if (body.priority && !validPriorities.includes(body.priority)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid priority value',
        });
      }

      if (body.target_minutes !== undefined && body.target_minutes <= 0) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'target_minutes must be a positive number',
        });
      }

      targets[targetIndex] = {
        ...targets[targetIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return targets[targetIndex];
    });

    // DELETE /v1/sla/targets/:id - Delete target
    app.delete('/v1/sla/targets/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const targetIndex = targets.findIndex(t => t.id === id);

      if (targetIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `SLA target with id '${id}' not found`,
        });
      }

      targets.splice(targetIndex, 1);
      reply.status(204).send();
    });

    // GET /v1/sla/stats - Get SLA statistics
    app.get('/v1/sla/stats', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        entity_type?: string;
        start_date?: string;
        end_date?: string;
      };

      if (query.entity_type && !validEntityTypes.includes(query.entity_type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid entity_type value',
        });
      }

      return {
        total_tracked: 100,
        met: 85,
        breached: 10,
        at_risk: 5,
        compliance_rate: 85.0,
        average_response_minutes: 12,
        average_resolution_minutes: 180,
      };
    });

    // GET /v1/sla/metrics - Get SLA metrics
    app.get('/v1/sla/metrics', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return {
        response_time: { critical: 15, high: 30, medium: 60, low: 120 },
        resolution_time: { critical: 240, high: 480, medium: 960, low: 1920 },
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/sla/policies', () => {
    it('should return empty list initially', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies',
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
        url: '/v1/sla/policies',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid entity_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies?entity_type=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/sla/policies', () => {
    it('should create a policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies',
        headers: createAuthHeader(token),
        payload: {
          name: 'Standard Issue SLA',
          description: 'Default SLA for issues',
          entity_type: 'issue',
          is_default: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('Standard Issue SLA');
      expect(body.entity_type).toBe('issue');
      expect(body.id).toBeDefined();
    });

    it('should return 400 for missing name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies',
        headers: createAuthHeader(token),
        payload: {
          entity_type: 'issue',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing entity_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Policy',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid entity_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Policy',
          entity_type: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/sla/policies - with data', () => {
    beforeAll(async () => {
      const token = generateTestToken(app);
      // Add more test policies
      for (const policyData of [
        { name: 'Problem SLA', entity_type: 'problem', is_default: true },
        { name: 'Change SLA', entity_type: 'change' },
        { name: 'VIP Issue SLA', entity_type: 'issue', is_default: false },
      ]) {
        await app.inject({
          method: 'POST',
          url: '/v1/sla/policies',
          headers: createAuthHeader(token),
          payload: policyData,
        });
      }
    });

    it('should list policies with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies?page=1&per_page=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.meta.page).toBe(1);
    });

    it('should filter by entity_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies?entity_type=issue',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((p: MockSlaPolicy) => p.entity_type === 'issue')).toBe(true);
    });

    it('should filter by is_active', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies?is_active=true',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((p: MockSlaPolicy) => p.is_active === true)).toBe(true);
    });
  });

  describe('GET /v1/sla/policies/:id', () => {
    it('should get a policy by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies/pol-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('pol-1');
    });

    it('should return 404 for non-existent policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/sla/policies/:id', () => {
    it('should update a policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/policies/pol-4',
        headers: createAuthHeader(token),
        payload: {
          name: 'VIP Issue SLA Updated',
          description: 'Updated description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe('VIP Issue SLA Updated');
    });

    it('should return 404 for non-existent policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/policies/non-existent',
        headers: createAuthHeader(token),
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid entity_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/policies/pol-1',
        headers: createAuthHeader(token),
        payload: { entity_type: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('SLA Targets - POST /v1/sla/policies/:policyId/targets', () => {
    it('should create a target', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies/pol-1/targets',
        headers: createAuthHeader(token),
        payload: {
          metric_type: 'response_time',
          priority: 'critical',
          target_minutes: 15,
          warning_threshold_percent: 75,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.metric_type).toBe('response_time');
      expect(body.priority).toBe('critical');
      expect(body.target_minutes).toBe(15);
    });

    it('should return 404 for non-existent policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies/non-existent/targets',
        headers: createAuthHeader(token),
        payload: {
          metric_type: 'response_time',
          priority: 'high',
          target_minutes: 30,
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid metric_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies/pol-1/targets',
        headers: createAuthHeader(token),
        payload: {
          metric_type: 'invalid',
          priority: 'high',
          target_minutes: 30,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid priority', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies/pol-1/targets',
        headers: createAuthHeader(token),
        payload: {
          metric_type: 'response_time',
          priority: 'invalid',
          target_minutes: 30,
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for non-positive target_minutes', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies/pol-1/targets',
        headers: createAuthHeader(token),
        payload: {
          metric_type: 'response_time',
          priority: 'high',
          target_minutes: 0,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/sla/policies/:policyId/targets', () => {
    it('should list targets for a policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies/pol-1/targets',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should return 404 for non-existent policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/policies/non-existent/targets',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/sla/targets/:id', () => {
    it('should get a target by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/targets/tgt-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('tgt-1');
    });

    it('should return 404 for non-existent target', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/targets/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/sla/targets/:id', () => {
    it('should update a target', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/targets/tgt-1',
        headers: createAuthHeader(token),
        payload: {
          target_minutes: 20,
          warning_threshold_percent: 80,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.target_minutes).toBe(20);
      expect(body.warning_threshold_percent).toBe(80);
    });

    it('should return 404 for non-existent target', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/targets/non-existent',
        headers: createAuthHeader(token),
        payload: { target_minutes: 30 },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid metric_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/targets/tgt-1',
        headers: createAuthHeader(token),
        payload: { metric_type: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for non-positive target_minutes', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/sla/targets/tgt-1',
        headers: createAuthHeader(token),
        payload: { target_minutes: -5 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /v1/sla/targets/:id', () => {
    it('should delete a target', async () => {
      const token = generateTestToken(app);
      // First create a target to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies/pol-1/targets',
        headers: createAuthHeader(token),
        payload: {
          metric_type: 'resolution_time',
          priority: 'low',
          target_minutes: 480,
        },
      });

      const target = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/sla/targets/${target.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent target', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/sla/targets/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /v1/sla/policies/:id', () => {
    it('should return 400 when deleting default policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/sla/policies/pol-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should delete a non-default policy', async () => {
      const token = generateTestToken(app);
      // Create a non-default policy
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/sla/policies',
        headers: createAuthHeader(token),
        payload: {
          name: 'Temporary Policy',
          entity_type: 'issue',
          is_default: false,
        },
      });

      const policy = JSON.parse(createResponse.body);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/sla/policies/${policy.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent policy', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/sla/policies/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/sla/stats', () => {
    it('should get SLA statistics', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/stats',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.total_tracked).toBeDefined();
      expect(body.compliance_rate).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/stats',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid entity_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/stats?entity_type=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/sla/metrics', () => {
    it('should get SLA metrics', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/metrics',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.response_time).toBeDefined();
      expect(body.resolution_time).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/sla/metrics',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
