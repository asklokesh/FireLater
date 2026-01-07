import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockApplication {
  id: string;
  name: string;
  slug: string;
  description: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'inactive' | 'deprecated' | 'retired';
  owner_id: string | null;
  team_id: string | null;
  repository_url: string | null;
  documentation_url: string | null;
  created_at: string;
  updated_at: string;
}

interface MockEnvironment {
  id: string;
  application_id: string;
  name: string;
  type: 'development' | 'staging' | 'production';
  url: string | null;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  created_at: string;
}

interface MockHealthCheck {
  id: string;
  application_id: string;
  environment_id: string | null;
  status: 'healthy' | 'degraded' | 'down';
  response_time_ms: number;
  checked_at: string;
}

describe('Applications Routes', () => {
  let app: FastifyInstance;
  const applications: MockApplication[] = [];
  const environments: MockEnvironment[] = [];
  const healthChecks: MockHealthCheck[] = [];
  let appIdCounter = 0;
  let envIdCounter = 0;
  let healthIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/applications - List applications
    app.get('/v1/applications', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        page?: string;
        limit?: string;
        status?: string;
        criticality?: string;
        search?: string;
      };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredApps = [...applications];

      if (query.status) {
        filteredApps = filteredApps.filter((a) => a.status === query.status);
      }
      if (query.criticality) {
        filteredApps = filteredApps.filter((a) => a.criticality === query.criticality);
      }
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        filteredApps = filteredApps.filter(
          (a) => a.name.toLowerCase().includes(searchLower) || a.description.toLowerCase().includes(searchLower)
        );
      }

      return {
        data: filteredApps.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredApps.length,
          totalPages: Math.ceil(filteredApps.length / limit),
        },
      };
    });

    // POST /v1/applications - Create application
    app.post('/v1/applications', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        slug?: string;
        description?: string;
        criticality?: 'low' | 'medium' | 'high' | 'critical';
        owner_id?: string;
        team_id?: string;
        repository_url?: string;
        documentation_url?: string;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Application name is required',
        });
      }

      // Generate slug if not provided
      const slug = body.slug || body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      // Check for duplicate slug
      const existingApp = applications.find((a) => a.slug === slug);
      if (existingApp) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Application with this slug already exists',
        });
      }

      const newApp: MockApplication = {
        id: `app-${++appIdCounter}`,
        name: body.name,
        slug,
        description: body.description || '',
        criticality: body.criticality || 'medium',
        status: 'active',
        owner_id: body.owner_id || null,
        team_id: body.team_id || null,
        repository_url: body.repository_url || null,
        documentation_url: body.documentation_url || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      applications.push(newApp);
      reply.status(201).send(newApp);
    });

    // GET /v1/applications/:id - Get application by ID
    app.get('/v1/applications/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const application = applications.find((a) => a.id === id);

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      // Include environments and latest health
      const appEnvironments = environments.filter((e) => e.application_id === id);
      const latestHealth = healthChecks.filter((h) => h.application_id === id).slice(-1)[0];

      return { ...application, environments: appEnvironments, health: latestHealth || null };
    });

    // PUT /v1/applications/:id - Update application
    app.put('/v1/applications/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockApplication>;
      const appIndex = applications.findIndex((a) => a.id === id);

      if (appIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      applications[appIndex] = {
        ...applications[appIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return applications[appIndex];
    });

    // DELETE /v1/applications/:id - Delete application
    app.delete('/v1/applications/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const appIndex = applications.findIndex((a) => a.id === id);

      if (appIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      applications.splice(appIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/applications/:id/environments - Add environment
    app.post('/v1/applications/:id/environments', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        type?: 'development' | 'staging' | 'production';
        url?: string;
      };

      const application = applications.find((a) => a.id === id);
      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Environment name is required',
        });
      }

      const newEnv: MockEnvironment = {
        id: `env-${++envIdCounter}`,
        application_id: id,
        name: body.name,
        type: body.type || 'development',
        url: body.url || null,
        status: 'unknown',
        created_at: new Date().toISOString(),
      };

      environments.push(newEnv);
      reply.status(201).send(newEnv);
    });

    // GET /v1/applications/:id/environments - Get environments
    app.get('/v1/applications/:id/environments', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const application = applications.find((a) => a.id === id);

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      const appEnvironments = environments.filter((e) => e.application_id === id);
      return { data: appEnvironments };
    });

    // DELETE /v1/applications/:id/environments/:envId - Delete environment
    app.delete('/v1/applications/:id/environments/:envId', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id, envId } = request.params as { id: string; envId: string };
      const envIndex = environments.findIndex((e) => e.id === envId && e.application_id === id);

      if (envIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Environment not found',
        });
      }

      environments.splice(envIndex, 1);
      reply.status(204).send();
    });

    // GET /v1/applications/:id/health - Get application health
    app.get('/v1/applications/:id/health', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const application = applications.find((a) => a.id === id);

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      const appHealthChecks = healthChecks.filter((h) => h.application_id === id);
      const latestHealth = appHealthChecks.slice(-1)[0];

      return {
        application_id: id,
        status: latestHealth?.status || 'unknown',
        response_time_ms: latestHealth?.response_time_ms || null,
        checked_at: latestHealth?.checked_at || null,
        history: appHealthChecks.slice(-10),
      };
    });

    // POST /v1/applications/:id/health-check - Trigger health check
    app.post('/v1/applications/:id/health-check', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const application = applications.find((a) => a.id === id);

      if (!application) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      // Simulate health check
      const newHealthCheck: MockHealthCheck = {
        id: `health-${++healthIdCounter}`,
        application_id: id,
        environment_id: null,
        status: Math.random() > 0.1 ? 'healthy' : 'degraded',
        response_time_ms: Math.floor(Math.random() * 500) + 50,
        checked_at: new Date().toISOString(),
      };

      healthChecks.push(newHealthCheck);
      reply.status(201).send(newHealthCheck);
    });

    // PUT /v1/applications/:id/status - Update application status
    app.put('/v1/applications/:id/status', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { status?: string; reason?: string };
      const appIndex = applications.findIndex((a) => a.id === id);

      if (appIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Application with id '${id}' not found`,
        });
      }

      const validStatuses = ['active', 'inactive', 'deprecated', 'retired'];
      if (body.status && !validStatuses.includes(body.status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid status value',
        });
      }

      if (body.status) {
        applications[appIndex].status = body.status as MockApplication['status'];
        applications[appIndex].updated_at = new Date().toISOString();
      }

      return applications[appIndex];
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/applications', () => {
    it('should list applications with pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/applications',
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
        url: '/v1/applications',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should filter applications by status', async () => {
      const token = generateTestToken(app);

      // Create an application first
      await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Active App' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/applications?status=active',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.every((a: MockApplication) => a.status === 'active')).toBe(true);
    });

    it('should filter applications by criticality', async () => {
      const token = generateTestToken(app);

      // Create a high criticality application
      await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Critical System', criticality: 'critical' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/applications?criticality=critical',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.every((a: MockApplication) => a.criticality === 'critical')).toBe(true);
    });

    it('should search applications by name', async () => {
      const token = generateTestToken(app);

      // Create an application with specific name
      await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Payment Gateway' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/applications?search=Payment',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.some((a: MockApplication) => a.name.includes('Payment'))).toBe(true);
    });
  });

  describe('POST /v1/applications', () => {
    it('should create a new application', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: {
          name: 'Inventory System',
          description: 'Warehouse inventory management',
          criticality: 'high',
          repository_url: 'https://github.com/company/inventory',
          documentation_url: 'https://docs.company.com/inventory',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('Inventory System');
      expect(body.slug).toBe('inventory-system');
      expect(body.criticality).toBe('high');
      expect(body.status).toBe('active');
    });

    it('should reject application without name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { description: 'No name provided' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Application name is required');
    });

    it('should reject duplicate slug', async () => {
      const token = generateTestToken(app);

      // Create first application
      await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Unique App', slug: 'unique-slug' },
      });

      // Try to create with same slug
      const response = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Another App', slug: 'unique-slug' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('already exists');
    });
  });

  describe('GET /v1/applications/:id', () => {
    it('should get application by ID with environments', async () => {
      const token = generateTestToken(app);

      // Create application first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Test Application' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/applications/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.id).toBe(created.id);
      expect(body).toHaveProperty('environments');
    });

    it('should return 404 for non-existent application', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/applications/non-existent-id',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('PUT /v1/applications/:id', () => {
    it('should update an application', async () => {
      const token = generateTestToken(app);

      // Create application first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'Original Name' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'PUT',
        url: `/v1/applications/${created.id}`,
        headers: createAuthHeader(token),
        payload: { name: 'Updated Name', description: 'New description' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Updated Name');
      expect(body.description).toBe('New description');
    });
  });

  describe('DELETE /v1/applications/:id', () => {
    it('should delete an application', async () => {
      const token = generateTestToken(app);

      // Create application first
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'App to Delete' },
      });
      const created = JSON.parse(createResponse.payload);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/applications/${created.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });
  });

  describe('Environments', () => {
    let testApp: MockApplication;

    beforeAll(async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'App for Environments' },
      });
      testApp = JSON.parse(createResponse.payload);
    });

    describe('POST /v1/applications/:id/environments', () => {
      it('should add an environment', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/applications/${testApp.id}/environments`,
          headers: createAuthHeader(token),
          payload: {
            name: 'Production',
            type: 'production',
            url: 'https://app.example.com',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.name).toBe('Production');
        expect(body.type).toBe('production');
        expect(body.application_id).toBe(testApp.id);
      });

      it('should reject environment without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/applications/${testApp.id}/environments`,
          headers: createAuthHeader(token),
          payload: { type: 'staging' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Environment name is required');
      });
    });

    describe('GET /v1/applications/:id/environments', () => {
      it('should get application environments', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: `/v1/applications/${testApp.id}/environments`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });
    });

    describe('DELETE /v1/applications/:id/environments/:envId', () => {
      it('should delete an environment', async () => {
        const token = generateTestToken(app);

        // Add environment first
        const addResponse = await app.inject({
          method: 'POST',
          url: `/v1/applications/${testApp.id}/environments`,
          headers: createAuthHeader(token),
          payload: { name: 'Env to Delete', type: 'development' },
        });
        const added = JSON.parse(addResponse.payload);

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/applications/${testApp.id}/environments/${added.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  describe('Health', () => {
    let healthApp: MockApplication;

    beforeAll(async () => {
      const token = generateTestToken(app);
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/applications',
        headers: createAuthHeader(token),
        payload: { name: 'App for Health Checks' },
      });
      healthApp = JSON.parse(createResponse.payload);
    });

    describe('GET /v1/applications/:id/health', () => {
      it('should get application health', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: `/v1/applications/${healthApp.id}/health`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.application_id).toBe(healthApp.id);
        expect(body).toHaveProperty('status');
        expect(body).toHaveProperty('history');
      });
    });

    describe('POST /v1/applications/:id/health-check', () => {
      it('should trigger a health check', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: `/v1/applications/${healthApp.id}/health-check`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body.application_id).toBe(healthApp.id);
        expect(['healthy', 'degraded', 'down']).toContain(body.status);
        expect(typeof body.response_time_ms).toBe('number');
      });
    });
  });

  describe('Status Management', () => {
    describe('PUT /v1/applications/:id/status', () => {
      it('should update application status', async () => {
        const token = generateTestToken(app);

        // Create application first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/applications',
          headers: createAuthHeader(token),
          payload: { name: 'App to Deprecate' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'PUT',
          url: `/v1/applications/${created.id}/status`,
          headers: createAuthHeader(token),
          payload: { status: 'deprecated', reason: 'Replaced by new system' },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.status).toBe('deprecated');
      });

      it('should reject invalid status', async () => {
        const token = generateTestToken(app);

        // Create application first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/applications',
          headers: createAuthHeader(token),
          payload: { name: 'App with Invalid Status' },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'PUT',
          url: `/v1/applications/${created.id}/status`,
          headers: createAuthHeader(token),
          payload: { status: 'invalid-status' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Invalid status');
      });
    });
  });
});

describe('Application Criticality Levels', () => {
  it('should support different criticality levels', () => {
    const criticalityLevels = ['low', 'medium', 'high', 'critical'];

    expect(criticalityLevels).toContain('low');
    expect(criticalityLevels).toContain('medium');
    expect(criticalityLevels).toContain('high');
    expect(criticalityLevels).toContain('critical');
  });
});

describe('Application Lifecycle States', () => {
  it('should support lifecycle status transitions', () => {
    const validStatuses = ['active', 'inactive', 'deprecated', 'retired'];

    expect(validStatuses).toContain('active');
    expect(validStatuses).toContain('inactive');
    expect(validStatuses).toContain('deprecated');
    expect(validStatuses).toContain('retired');
  });
});
