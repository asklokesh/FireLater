import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

// Mock data stores
interface MockApiKey {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  rateLimit: number | null;
  isActive: boolean;
  expiresAt: Date | null;
  ipWhitelist: string[];
  keyPrefix: string;
  lastUsedAt: Date | null;
  usageCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockWebhook {
  id: string;
  name: string;
  description: string | null;
  url: string;
  secret: string | null;
  events: string[];
  filters: Record<string, any> | null;
  isActive: boolean;
  retryCount: number;
  retryDelay: number;
  timeout: number;
  customHeaders: Record<string, string> | null;
  lastTriggeredAt: Date | null;
  successCount: number;
  failureCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockIntegration {
  id: string;
  name: string;
  type: string;
  description: string | null;
  config: Record<string, any> | null;
  credentials: Record<string, any> | null;
  isActive: boolean;
  syncEnabled: boolean;
  syncInterval: number | null;
  syncDirection: 'inbound' | 'outbound' | 'both' | null;
  fieldMappings: Record<string, any> | null;
  lastSyncAt: Date | null;
  syncStatus: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, any>;
  status: 'success' | 'failure' | 'pending';
  statusCode: number | null;
  responseTime: number | null;
  attemptCount: number;
  createdAt: Date;
}

interface MockSyncLog {
  id: string;
  integrationId: string;
  direction: 'inbound' | 'outbound';
  status: 'success' | 'failure' | 'partial';
  recordsProcessed: number;
  recordsFailed: number;
  errorMessage: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

const WEBHOOK_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.resolved',
  'ticket.assigned',
  'change.created',
  'change.approved',
  'change.rejected',
  'incident.created',
  'incident.resolved',
  'problem.created',
  'problem.resolved',
];

const INTEGRATION_TYPES = [
  { id: 'slack', name: 'Slack', category: 'communication' },
  { id: 'jira', name: 'Jira', category: 'ticketing' },
  { id: 'servicenow', name: 'ServiceNow', category: 'itsm' },
  { id: 'pagerduty', name: 'PagerDuty', category: 'alerting' },
  { id: 'aws', name: 'AWS', category: 'cloud' },
  { id: 'azure', name: 'Azure', category: 'cloud' },
  { id: 'github', name: 'GitHub', category: 'devops' },
  { id: 'gitlab', name: 'GitLab', category: 'devops' },
];

const apiKeys: MockApiKey[] = [];
const webhooks: MockWebhook[] = [];
const integrations: MockIntegration[] = [];
const deliveries: MockDelivery[] = [];
const syncLogs: MockSyncLog[] = [];

let apiKeyCounter = 0;
let webhookCounter = 0;
let integrationCounter = 0;

function resetMockData() {
  apiKeys.length = 0;
  webhooks.length = 0;
  integrations.length = 0;
  deliveries.length = 0;
  syncLogs.length = 0;
  apiKeyCounter = 0;
  webhookCounter = 0;
  integrationCounter = 0;
}

describe('Integrations Routes', () => {
  let app: FastifyInstance;
  let token: string;
  let authHeader: { authorization: string };
  const tenantSlug = 'test-tenant';
  const userId = 'user-123';

  beforeAll(async () => {
    app = await createTestApp();
    token = generateTestToken(app, { tenantSlug, userId, role: 'admin' });
    authHeader = createAuthHeader(token);

    // ============================================
    // METADATA ENDPOINTS (No Auth)
    // ============================================

    app.get('/v1/integrations/webhooks/events', async () => {
      return { data: WEBHOOK_EVENTS };
    });

    app.get('/v1/integrations/types', async () => {
      return { data: INTEGRATION_TYPES };
    });

    // ============================================
    // API KEYS ROUTES
    // ============================================

    app.get('/v1/integrations/api-keys', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      return { data: apiKeys };
    });

    app.get<{ Params: { id: string } }>('/v1/integrations/api-keys/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const key = apiKeys.find(k => k.id === id);
      if (!key) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'API key not found' });
      }
      return { data: key };
    });

    app.post('/v1/integrations/api-keys', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const body = request.body as any;
      if (!body.name) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Name is required' });
      }

      const id = `apikey-${++apiKeyCounter}`;
      const fullKey = `flk_${Buffer.from(`${id}-${Date.now()}`).toString('base64').slice(0, 32)}`;
      const apiKey: MockApiKey = {
        id,
        name: body.name,
        description: body.description || null,
        permissions: body.permissions || [],
        rateLimit: body.rateLimit || null,
        isActive: true,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        ipWhitelist: body.ipWhitelist || [],
        keyPrefix: fullKey.slice(0, 8),
        lastUsedAt: null,
        usageCount: 0,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      apiKeys.push(apiKey);

      return reply.status(201).send({
        data: apiKey,
        key: fullKey,
        message: 'Store this key securely - it will not be shown again',
      });
    });

    app.patch<{ Params: { id: string } }>('/v1/integrations/api-keys/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const body = request.body as any;
      const index = apiKeys.findIndex(k => k.id === id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'API key not found' });
      }

      apiKeys[index] = {
        ...apiKeys[index],
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.permissions && { permissions: body.permissions }),
        ...(body.rateLimit !== undefined && { rateLimit: body.rateLimit }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
        ...(body.ipWhitelist && { ipWhitelist: body.ipWhitelist }),
        updatedAt: new Date(),
      };
      return { data: apiKeys[index] };
    });

    app.delete<{ Params: { id: string } }>('/v1/integrations/api-keys/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const index = apiKeys.findIndex(k => k.id === id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'API key not found' });
      }
      apiKeys.splice(index, 1);
      return reply.status(204).send();
    });

    app.post('/v1/integrations/api-keys/validate', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const body = request.body as { key?: string };
      if (!body.key) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'API key is required' });
      }
      const keyPrefix = body.key.slice(0, 8);
      const apiKey = apiKeys.find(k => k.keyPrefix === keyPrefix && k.isActive);
      return { data: { valid: !!apiKey, apiKey } };
    });

    // ============================================
    // WEBHOOKS ROUTES
    // ============================================

    app.get('/v1/integrations/webhooks', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      return { data: webhooks };
    });

    app.get<{ Params: { id: string } }>('/v1/integrations/webhooks/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const webhook = webhooks.find(w => w.id === id);
      if (!webhook) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' });
      }
      return { data: webhook };
    });

    app.post('/v1/integrations/webhooks', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const body = request.body as any;
      if (!body.name) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Name is required' });
      }
      if (!body.url || !body.url.startsWith('http')) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Valid URL is required' });
      }
      if (!body.events || body.events.length === 0) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'At least one event is required' });
      }

      const webhook: MockWebhook = {
        id: `webhook-${++webhookCounter}`,
        name: body.name,
        description: body.description || null,
        url: body.url,
        secret: body.secret || null,
        events: body.events,
        filters: body.filters || null,
        isActive: true,
        retryCount: body.retryCount ?? 3,
        retryDelay: body.retryDelay ?? 60,
        timeout: body.timeout ?? 30,
        customHeaders: body.customHeaders || null,
        lastTriggeredAt: null,
        successCount: 0,
        failureCount: 0,
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      webhooks.push(webhook);

      return reply.status(201).send({ data: webhook });
    });

    app.patch<{ Params: { id: string } }>('/v1/integrations/webhooks/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const body = request.body as any;
      const index = webhooks.findIndex(w => w.id === id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' });
      }

      webhooks[index] = {
        ...webhooks[index],
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.url && { url: body.url }),
        ...(body.events && { events: body.events }),
        ...(body.filters !== undefined && { filters: body.filters }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.retryCount !== undefined && { retryCount: body.retryCount }),
        ...(body.retryDelay !== undefined && { retryDelay: body.retryDelay }),
        ...(body.timeout !== undefined && { timeout: body.timeout }),
        ...(body.customHeaders !== undefined && { customHeaders: body.customHeaders }),
        updatedAt: new Date(),
      };
      return { data: webhooks[index] };
    });

    app.delete<{ Params: { id: string } }>('/v1/integrations/webhooks/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const index = webhooks.findIndex(w => w.id === id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' });
      }
      webhooks.splice(index, 1);
      return reply.status(204).send();
    });

    app.post<{ Params: { id: string } }>('/v1/integrations/webhooks/:id/test', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const webhook = webhooks.find(w => w.id === id);
      if (!webhook) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' });
      }
      return {
        data: {
          success: true,
          statusCode: 200,
          responseTime: 150,
          message: 'Test payload delivered successfully',
        },
      };
    });

    app.get<{ Params: { id: string } }>('/v1/integrations/webhooks/:id/deliveries', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const webhook = webhooks.find(w => w.id === id);
      if (!webhook) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Webhook not found' });
      }
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit) : 50;
      const webhookDeliveries = deliveries.filter(d => d.webhookId === id).slice(0, limit);
      return { data: webhookDeliveries, meta: { total: webhookDeliveries.length, limit } };
    });

    // ============================================
    // INTEGRATIONS ROUTES
    // ============================================

    app.get('/v1/integrations', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      return { data: integrations };
    });

    app.get<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const integration = integrations.find(i => i.id === id);
      if (!integration) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      }
      return { data: integration };
    });

    app.post('/v1/integrations', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const body = request.body as any;
      if (!body.name || !body.type) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Name and type are required' });
      }

      const integration: MockIntegration = {
        id: `integration-${++integrationCounter}`,
        name: body.name,
        type: body.type,
        description: body.description || null,
        config: body.config || null,
        credentials: body.credentials || null,
        isActive: true,
        syncEnabled: body.syncEnabled ?? false,
        syncInterval: body.syncInterval || null,
        syncDirection: body.syncDirection || null,
        fieldMappings: body.fieldMappings || null,
        lastSyncAt: null,
        syncStatus: 'idle',
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      integrations.push(integration);

      return reply.status(201).send({ data: integration });
    });

    app.patch<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const body = request.body as any;
      const index = integrations.findIndex(i => i.id === id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      }

      integrations[index] = {
        ...integrations[index],
        ...(body.name && { name: body.name }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.config !== undefined && { config: body.config }),
        ...(body.credentials !== undefined && { credentials: body.credentials }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.syncEnabled !== undefined && { syncEnabled: body.syncEnabled }),
        ...(body.syncInterval !== undefined && { syncInterval: body.syncInterval }),
        ...(body.syncDirection !== undefined && { syncDirection: body.syncDirection }),
        ...(body.fieldMappings !== undefined && { fieldMappings: body.fieldMappings }),
        updatedAt: new Date(),
      };
      return { data: integrations[index] };
    });

    app.delete<{ Params: { id: string } }>('/v1/integrations/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const index = integrations.findIndex(i => i.id === id);
      if (index === -1) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      }
      integrations.splice(index, 1);
      return reply.status(204).send();
    });

    app.post<{ Params: { id: string } }>('/v1/integrations/:id/test', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const integration = integrations.find(i => i.id === id);
      if (!integration) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      }
      return {
        data: {
          success: true,
          responseTime: 200,
          message: 'Connection test successful',
          details: { version: '1.0.0', status: 'healthy' },
        },
      };
    });

    app.get<{ Params: { id: string } }>('/v1/integrations/:id/logs', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }
      const { id } = request.params;
      const integration = integrations.find(i => i.id === id);
      if (!integration) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Integration not found' });
      }
      const query = request.query as { limit?: string };
      const limit = query.limit ? parseInt(query.limit) : 50;
      const integrationLogs = syncLogs.filter(l => l.integrationId === id).slice(0, limit);
      return { data: integrationLogs, meta: { total: integrationLogs.length, limit } };
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetMockData();
  });

  // ============================================
  // METADATA ENDPOINTS
  // ============================================

  describe('GET /v1/integrations/webhooks/events', () => {
    it('should return available webhook events without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/integrations/webhooks/events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data).toContain('ticket.created');
      expect(body.data).toContain('change.approved');
    });
  });

  describe('GET /v1/integrations/types', () => {
    it('should return available integration types without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/integrations/types',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeInstanceOf(Array);
      expect(body.data.some((t: any) => t.id === 'slack')).toBe(true);
      expect(body.data.some((t: any) => t.id === 'jira')).toBe(true);
    });
  });

  // ============================================
  // API KEYS
  // ============================================

  describe('API Keys Management', () => {
    describe('POST /v1/integrations/api-keys', () => {
      it('should create an API key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: {
            name: 'Production API Key',
            description: 'Key for production environment',
            permissions: ['read:tickets', 'write:tickets'],
            rateLimit: 1000,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data).toBeDefined();
        expect(body.data.name).toBe('Production API Key');
        expect(body.key).toBeDefined();
        expect(body.message).toContain('Store this key securely');
      });

      it('should reject creation without required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('should require authentication', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          payload: { name: 'Test Key' },
        });

        expect(response.statusCode).toBe(401);
      });
    });

    describe('GET /v1/integrations/api-keys', () => {
      it('should list API keys', async () => {
        // Create a key first
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: { name: 'Test Key' },
        });

        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data.length).toBe(1);
      });
    });

    describe('GET /v1/integrations/api-keys/:id', () => {
      it('should get a specific API key', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: { name: 'Test Key' },
        });
        const keyId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'GET',
          url: `/v1/integrations/api-keys/${keyId}`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.id).toBe(keyId);
      });

      it('should return 404 for non-existent API key', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/api-keys/non-existent',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /v1/integrations/api-keys/:id', () => {
      it('should update an API key', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: { name: 'Original Name' },
        });
        const keyId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'PATCH',
          url: `/v1/integrations/api-keys/${keyId}`,
          headers: authHeader,
          payload: { name: 'Updated Name', isActive: false },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe('Updated Name');
        expect(body.data.isActive).toBe(false);
      });

      it('should return 404 for non-existent API key', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/v1/integrations/api-keys/non-existent',
          headers: authHeader,
          payload: { name: 'Test' },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST /v1/integrations/api-keys/validate', () => {
      it('should validate an API key', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: { name: 'Test Key' },
        });
        const fullKey = JSON.parse(createRes.body).key;

        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys/validate',
          headers: authHeader,
          payload: { key: fullKey },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.valid).toBe(true);
      });

      it('should require key parameter', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys/validate',
          headers: authHeader,
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('DELETE /v1/integrations/api-keys/:id', () => {
      it('should delete an API key', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/api-keys',
          headers: authHeader,
          payload: { name: 'Key to Delete' },
        });
        const keyId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/integrations/api-keys/${keyId}`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(204);
      });

      it('should return 404 for non-existent API key', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/integrations/api-keys/non-existent',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });

  // ============================================
  // WEBHOOKS
  // ============================================

  describe('Webhooks Management', () => {
    describe('POST /v1/integrations/webhooks', () => {
      it('should create a webhook', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: {
            name: 'Slack Notifications',
            description: 'Send ticket updates to Slack',
            url: 'https://hooks.slack.com/services/xxx',
            events: ['ticket.created', 'ticket.resolved'],
            retryCount: 3,
            timeout: 30,
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data).toBeDefined();
        expect(body.data.name).toBe('Slack Notifications');
        expect(body.data.events).toContain('ticket.created');
      });

      it('should reject webhook without events', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: {
            name: 'Test Webhook',
            url: 'https://example.com/webhook',
            events: [],
          },
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject webhook with invalid URL', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: {
            name: 'Test Webhook',
            url: 'not-a-valid-url',
            events: ['ticket.created'],
          },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /v1/integrations/webhooks', () => {
      it('should list webhooks', async () => {
        await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: { name: 'Test', url: 'https://example.com', events: ['ticket.created'] },
        });

        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data.length).toBe(1);
      });
    });

    describe('GET /v1/integrations/webhooks/:id', () => {
      it('should get a specific webhook', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: { name: 'Test', url: 'https://example.com', events: ['ticket.created'] },
        });
        const webhookId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'GET',
          url: `/v1/integrations/webhooks/${webhookId}`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.id).toBe(webhookId);
      });

      it('should return 404 for non-existent webhook', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/webhooks/non-existent',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /v1/integrations/webhooks/:id', () => {
      it('should update a webhook', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: { name: 'Original', url: 'https://example.com', events: ['ticket.created'] },
        });
        const webhookId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'PATCH',
          url: `/v1/integrations/webhooks/${webhookId}`,
          headers: authHeader,
          payload: { name: 'Updated Webhook', isActive: false },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe('Updated Webhook');
      });
    });

    describe('POST /v1/integrations/webhooks/:id/test', () => {
      it('should test a webhook', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: { name: 'Test', url: 'https://example.com', events: ['ticket.created'] },
        });
        const webhookId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'POST',
          url: `/v1/integrations/webhooks/${webhookId}/test`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.success).toBe(true);
        expect(body.data.statusCode).toBe(200);
      });
    });

    describe('GET /v1/integrations/webhooks/:id/deliveries', () => {
      it('should get webhook deliveries', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: { name: 'Test', url: 'https://example.com', events: ['ticket.created'] },
        });
        const webhookId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'GET',
          url: `/v1/integrations/webhooks/${webhookId}/deliveries`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.meta).toBeDefined();
      });

      it('should return 404 for non-existent webhook', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/webhooks/non-existent/deliveries',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /v1/integrations/webhooks/:id', () => {
      it('should delete a webhook', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations/webhooks',
          headers: authHeader,
          payload: { name: 'To Delete', url: 'https://example.com', events: ['ticket.created'] },
        });
        const webhookId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/integrations/webhooks/${webhookId}`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(204);
      });
    });
  });

  // ============================================
  // INTEGRATIONS
  // ============================================

  describe('Integrations Management', () => {
    describe('POST /v1/integrations', () => {
      it('should create an integration', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: {
            name: 'Jira Integration',
            type: 'jira',
            description: 'Sync tickets with Jira',
            config: { baseUrl: 'https://company.atlassian.net', projectKey: 'ITSM' },
            credentials: { apiToken: 'encrypted-token' },
            syncEnabled: true,
            syncInterval: 15,
            syncDirection: 'both',
          },
        });

        expect(response.statusCode).toBe(201);
        const body = JSON.parse(response.body);
        expect(body.data).toBeDefined();
        expect(body.data.name).toBe('Jira Integration');
        expect(body.data.type).toBe('jira');
        expect(body.data.syncEnabled).toBe(true);
      });

      it('should reject integration without required fields', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'Test' },
        });

        expect(response.statusCode).toBe(400);
      });
    });

    describe('GET /v1/integrations', () => {
      it('should list integrations', async () => {
        await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'Test', type: 'slack' },
        });

        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.data.length).toBe(1);
      });
    });

    describe('GET /v1/integrations/:id', () => {
      it('should get a specific integration', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'Test', type: 'slack' },
        });
        const integrationId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'GET',
          url: `/v1/integrations/${integrationId}`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.id).toBe(integrationId);
      });

      it('should return 404 for non-existent integration', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/non-existent',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('PATCH /v1/integrations/:id', () => {
      it('should update an integration', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'Original', type: 'jira' },
        });
        const integrationId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'PATCH',
          url: `/v1/integrations/${integrationId}`,
          headers: authHeader,
          payload: { name: 'Updated Jira Integration', syncEnabled: true },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.name).toBe('Updated Jira Integration');
      });

      it('should return 404 for non-existent integration', async () => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/v1/integrations/non-existent',
          headers: authHeader,
          payload: { name: 'Test' },
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('POST /v1/integrations/:id/test', () => {
      it('should test an integration connection', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'Test', type: 'slack' },
        });
        const integrationId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'POST',
          url: `/v1/integrations/${integrationId}/test`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.success).toBe(true);
        expect(body.data.message).toBe('Connection test successful');
      });
    });

    describe('GET /v1/integrations/:id/logs', () => {
      it('should get integration sync logs', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'Test', type: 'jira' },
        });
        const integrationId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'GET',
          url: `/v1/integrations/${integrationId}/logs`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data).toBeInstanceOf(Array);
        expect(body.meta).toBeDefined();
      });

      it('should return 404 for non-existent integration', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/v1/integrations/non-existent/logs',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });

    describe('DELETE /v1/integrations/:id', () => {
      it('should delete an integration', async () => {
        const createRes = await app.inject({
          method: 'POST',
          url: '/v1/integrations',
          headers: authHeader,
          payload: { name: 'To Delete', type: 'slack' },
        });
        const integrationId = JSON.parse(createRes.body).data.id;

        const response = await app.inject({
          method: 'DELETE',
          url: `/v1/integrations/${integrationId}`,
          headers: authHeader,
        });

        expect(response.statusCode).toBe(204);
      });

      it('should return 404 for non-existent integration', async () => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/v1/integrations/non-existent',
          headers: authHeader,
        });

        expect(response.statusCode).toBe(404);
      });
    });
  });
});
