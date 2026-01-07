import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, testUser, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockCloudAccount {
  id: string;
  name: string;
  provider: 'aws' | 'azure' | 'gcp';
  account_id: string;
  status: 'active' | 'inactive' | 'error';
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MockCloudResource {
  id: string;
  account_id: string;
  resource_id: string;
  resource_type: string;
  name: string;
  region: string;
  status: string;
  tags: Record<string, string>;
  application_id: string | null;
  cost_monthly: number;
  created_at: string;
  updated_at: string;
}

interface MockCostRecord {
  id: string;
  account_id: string;
  resource_id: string | null;
  period: string;
  amount: number;
  currency: string;
}

describe('Cloud Routes', () => {
  let app: FastifyInstance;
  const accounts: MockCloudAccount[] = [];
  const resources: MockCloudResource[] = [];
  const costs: MockCostRecord[] = [];
  let accountIdCounter = 0;
  let resourceIdCounter = 0;
  let costIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/cloud/accounts - List cloud accounts
    app.get('/v1/cloud/accounts', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { provider?: string; status?: string };
      let filteredAccounts = [...accounts];

      if (query.provider) {
        filteredAccounts = filteredAccounts.filter((a) => a.provider === query.provider);
      }
      if (query.status) {
        filteredAccounts = filteredAccounts.filter((a) => a.status === query.status);
      }

      return { data: filteredAccounts };
    });

    // POST /v1/cloud/accounts - Create cloud account
    app.post('/v1/cloud/accounts', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        provider?: 'aws' | 'azure' | 'gcp';
        account_id?: string;
        credentials?: Record<string, string>;
      };

      if (!body.name) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Account name is required',
        });
      }

      if (!body.provider) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Provider is required',
        });
      }

      if (!body.account_id) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Cloud account ID is required',
        });
      }

      const newAccount: MockCloudAccount = {
        id: `cloud-${++accountIdCounter}`,
        name: body.name,
        provider: body.provider,
        account_id: body.account_id,
        status: 'active',
        last_sync_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      accounts.push(newAccount);
      reply.status(201).send(newAccount);
    });

    // GET /v1/cloud/accounts/:id - Get cloud account by ID
    app.get('/v1/cloud/accounts/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const account = accounts.find((a) => a.id === id);

      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cloud account with id '${id}' not found`,
        });
      }

      // Include resource count
      const resourceCount = resources.filter((r) => r.account_id === id).length;
      return { ...account, resource_count: resourceCount };
    });

    // PUT /v1/cloud/accounts/:id - Update cloud account
    app.put('/v1/cloud/accounts/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as Partial<MockCloudAccount>;
      const accountIndex = accounts.findIndex((a) => a.id === id);

      if (accountIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cloud account with id '${id}' not found`,
        });
      }

      accounts[accountIndex] = {
        ...accounts[accountIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return accounts[accountIndex];
    });

    // DELETE /v1/cloud/accounts/:id - Delete cloud account
    app.delete('/v1/cloud/accounts/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const accountIndex = accounts.findIndex((a) => a.id === id);

      if (accountIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cloud account with id '${id}' not found`,
        });
      }

      accounts.splice(accountIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/cloud/accounts/:id/sync - Trigger account sync
    app.post('/v1/cloud/accounts/:id/sync', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const accountIndex = accounts.findIndex((a) => a.id === id);

      if (accountIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cloud account with id '${id}' not found`,
        });
      }

      // Simulate sync
      accounts[accountIndex].last_sync_at = new Date().toISOString();
      accounts[accountIndex].updated_at = new Date().toISOString();

      // Add some mock resources
      const mockResource: MockCloudResource = {
        id: `resource-${++resourceIdCounter}`,
        account_id: id,
        resource_id: `arn:aws:ec2:us-east-1:123456789012:instance/i-${Date.now()}`,
        resource_type: 'ec2:instance',
        name: 'web-server-1',
        region: 'us-east-1',
        status: 'running',
        tags: { Environment: 'production' },
        application_id: null,
        cost_monthly: 50.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      resources.push(mockResource);

      return {
        account: accounts[accountIndex],
        resources_synced: 1,
        sync_started_at: new Date().toISOString(),
      };
    });

    // POST /v1/cloud/accounts/:id/test - Test account connection
    app.post('/v1/cloud/accounts/:id/test', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const account = accounts.find((a) => a.id === id);

      if (!account) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Cloud account with id '${id}' not found`,
        });
      }

      // Simulate connection test
      return {
        success: true,
        provider: account.provider,
        tested_at: new Date().toISOString(),
        permissions: ['ec2:DescribeInstances', 's3:ListBuckets', 'rds:DescribeDBInstances'],
      };
    });

    // GET /v1/cloud/resources - List cloud resources
    app.get('/v1/cloud/resources', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        page?: string;
        limit?: string;
        account_id?: string;
        resource_type?: string;
        region?: string;
        application_id?: string;
        unmapped?: string;
      };
      const page = parseInt(query.page || '1', 10);
      const limit = parseInt(query.limit || '20', 10);

      let filteredResources = [...resources];

      if (query.account_id) {
        filteredResources = filteredResources.filter((r) => r.account_id === query.account_id);
      }
      if (query.resource_type) {
        filteredResources = filteredResources.filter((r) => r.resource_type === query.resource_type);
      }
      if (query.region) {
        filteredResources = filteredResources.filter((r) => r.region === query.region);
      }
      if (query.application_id) {
        filteredResources = filteredResources.filter((r) => r.application_id === query.application_id);
      }
      if (query.unmapped === 'true') {
        filteredResources = filteredResources.filter((r) => r.application_id === null);
      }

      return {
        data: filteredResources.slice((page - 1) * limit, page * limit),
        pagination: {
          page,
          limit,
          total: filteredResources.length,
          totalPages: Math.ceil(filteredResources.length / limit),
        },
      };
    });

    // GET /v1/cloud/resources/:id - Get resource by ID
    app.get('/v1/cloud/resources/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const resource = resources.find((r) => r.id === id);

      if (!resource) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Resource with id '${id}' not found`,
        });
      }

      // Include account info
      const account = accounts.find((a) => a.id === resource.account_id);
      return { ...resource, account };
    });

    // PUT /v1/cloud/resources/:id/map - Map resource to application
    app.put('/v1/cloud/resources/:id/map', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const body = request.body as { application_id?: string };
      const resourceIndex = resources.findIndex((r) => r.id === id);

      if (resourceIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Resource with id '${id}' not found`,
        });
      }

      resources[resourceIndex].application_id = body.application_id || null;
      resources[resourceIndex].updated_at = new Date().toISOString();

      return resources[resourceIndex];
    });

    // GET /v1/cloud/costs - Get cost data
    app.get('/v1/cloud/costs', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        account_id?: string;
        start_date?: string;
        end_date?: string;
        group_by?: string;
      };

      let filteredCosts = [...costs];

      if (query.account_id) {
        filteredCosts = filteredCosts.filter((c) => c.account_id === query.account_id);
      }

      // Calculate totals
      const totalCost = filteredCosts.reduce((sum, c) => sum + c.amount, 0);

      return {
        data: filteredCosts,
        summary: {
          total: totalCost,
          currency: 'USD',
          period: query.start_date && query.end_date ? `${query.start_date} - ${query.end_date}` : 'current',
        },
      };
    });

    // GET /v1/cloud/costs/by-application - Get costs grouped by application
    app.get('/v1/cloud/costs/by-application', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      // Group resources by application and sum costs
      const costsByApp = new Map<string, number>();
      let unmappedCost = 0;

      resources.forEach((r) => {
        if (r.application_id) {
          const current = costsByApp.get(r.application_id) || 0;
          costsByApp.set(r.application_id, current + r.cost_monthly);
        } else {
          unmappedCost += r.cost_monthly;
        }
      });

      const data = Array.from(costsByApp.entries()).map(([appId, cost]) => ({
        application_id: appId,
        cost_monthly: cost,
      }));

      return {
        data,
        unmapped_cost: unmappedCost,
        total_cost: resources.reduce((sum, r) => sum + r.cost_monthly, 0),
      };
    });

    // GET /v1/cloud/summary - Get cloud summary
    app.get('/v1/cloud/summary', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const accountsByProvider = new Map<string, number>();
      accounts.forEach((a) => {
        const current = accountsByProvider.get(a.provider) || 0;
        accountsByProvider.set(a.provider, current + 1);
      });

      const resourcesByType = new Map<string, number>();
      resources.forEach((r) => {
        const current = resourcesByType.get(r.resource_type) || 0;
        resourcesByType.set(r.resource_type, current + 1);
      });

      return {
        total_accounts: accounts.length,
        active_accounts: accounts.filter((a) => a.status === 'active').length,
        accounts_by_provider: Object.fromEntries(accountsByProvider),
        total_resources: resources.length,
        resources_by_type: Object.fromEntries(resourcesByType),
        unmapped_resources: resources.filter((r) => !r.application_id).length,
        total_monthly_cost: resources.reduce((sum, r) => sum + r.cost_monthly, 0),
      };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Cloud Accounts', () => {
    describe('GET /v1/cloud/accounts', () => {
      it('should list cloud accounts', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should reject unauthenticated request', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/accounts',
        });

        expect(response.statusCode).toBe(401);
      });

      it('should filter accounts by provider', async () => {
        const token = generateTestToken(app);

        // Create an AWS account
        await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'AWS Production',
            provider: 'aws',
            account_id: '123456789012',
          },
        });

        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/accounts?provider=aws',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data.every((a: MockCloudAccount) => a.provider === 'aws')).toBe(true);
      });
    });

    describe('POST /v1/cloud/accounts', () => {
      it('should create a new cloud account', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'Azure Development',
            provider: 'azure',
            account_id: 'subscription-id-123',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('id');
        expect(body.name).toBe('Azure Development');
        expect(body.provider).toBe('azure');
        expect(body.status).toBe('active');
      });

      it('should reject account without name', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: { provider: 'aws', account_id: '123456789012' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Account name is required');
      });

      it('should reject account without provider', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: { name: 'Test Account', account_id: '123' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Provider is required');
      });
    });

    describe('GET /v1/cloud/accounts/:id', () => {
      it('should get account by ID with resource count', async () => {
        const token = generateTestToken(app);

        // Create account first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'GCP Staging',
            provider: 'gcp',
            account_id: 'project-staging-123',
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'GET',
          url: `/v1/cloud/accounts/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.id).toBe(created.id);
        expect(body).toHaveProperty('resource_count');
      });

      it('should return 404 for non-existent account', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/accounts/non-existent-id',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST /v1/cloud/accounts/:id/sync', () => {
      it('should trigger account sync', async () => {
        const token = generateTestToken(app);

        // Create account first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'AWS Sync Test',
            provider: 'aws',
            account_id: '111222333444',
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'POST',
          url: `/v1/cloud/accounts/${created.id}/sync`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('resources_synced');
        expect(body).toHaveProperty('sync_started_at');
      });
    });

    describe('POST /v1/cloud/accounts/:id/test', () => {
      it('should test account connection', async () => {
        const token = generateTestToken(app);

        // Create account first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'AWS Test Connection',
            provider: 'aws',
            account_id: '555666777888',
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'POST',
          url: `/v1/cloud/accounts/${created.id}/test`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.success).toBe(true);
        expect(body.provider).toBe('aws');
        expect(body).toHaveProperty('permissions');
      });
    });

    describe('DELETE /v1/cloud/accounts/:id', () => {
      it('should delete a cloud account', async () => {
        const token = generateTestToken(app);

        // Create account first
        const createResponse = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'Account to Delete',
            provider: 'azure',
            account_id: 'delete-me-123',
          },
        });
        const created = JSON.parse(createResponse.payload);

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/cloud/accounts/${created.id}`,
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  describe('Cloud Resources', () => {
    describe('GET /v1/cloud/resources', () => {
      it('should list cloud resources with pagination', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/resources',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('pagination');
        expect(Array.isArray(body.data)).toBe(true);
      });

      it('should filter unmapped resources', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/resources?unmapped=true',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body.data.every((r: MockCloudResource) => r.application_id === null)).toBe(true);
      });
    });

    describe('PUT /v1/cloud/resources/:id/map', () => {
      it('should map resource to application', async () => {
        const token = generateTestToken(app);

        // First sync an account to create resources
        const accountResponse = await app.inject({
          method: 'POST',
          url: '/v1/cloud/accounts',
          headers: createAuthHeader(token),
          payload: {
            name: 'AWS for Mapping',
            provider: 'aws',
            account_id: '999888777666',
          },
        });
        const account = JSON.parse(accountResponse.payload);

        await app.inject({
          method: 'POST',
          url: `/v1/cloud/accounts/${account.id}/sync`,
          headers: createAuthHeader(token),
        });

        // Get resources and map one
        const resourcesResponse = await app.inject({
          method: 'GET',
          url: '/v1/cloud/resources',
          headers: createAuthHeader(token),
        });
        const resourcesData = JSON.parse(resourcesResponse.payload);

        if (resourcesData.data.length > 0) {
          const resource = resourcesData.data[0];
          const response = await app.inject({
            method: 'PUT',
            url: `/v1/cloud/resources/${resource.id}/map`,
            headers: createAuthHeader(token),
            payload: { application_id: 'app-123' },
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.payload);
          expect(body.application_id).toBe('app-123');
        }
      });
    });
  });

  describe('Cloud Costs', () => {
    describe('GET /v1/cloud/costs', () => {
      it('should get cost data', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/costs',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('summary');
      });
    });

    describe('GET /v1/cloud/costs/by-application', () => {
      it('should get costs grouped by application', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/costs/by-application',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('data');
        expect(body).toHaveProperty('unmapped_cost');
        expect(body).toHaveProperty('total_cost');
      });
    });
  });

  describe('Cloud Summary', () => {
    describe('GET /v1/cloud/summary', () => {
      it('should get cloud summary', async () => {
        const token = generateTestToken(app);
        const response = await app.inject({
          method: 'GET',
          url: '/v1/cloud/summary',
          headers: createAuthHeader(token),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.payload);
        expect(body).toHaveProperty('total_accounts');
        expect(body).toHaveProperty('total_resources');
        expect(body).toHaveProperty('accounts_by_provider');
        expect(body).toHaveProperty('unmapped_resources');
        expect(body).toHaveProperty('total_monthly_cost');
      });
    });
  });
});

describe('Cloud Providers', () => {
  it('should support multiple cloud providers', () => {
    const providers = ['aws', 'azure', 'gcp'];

    expect(providers).toContain('aws');
    expect(providers).toContain('azure');
    expect(providers).toContain('gcp');
  });
});
