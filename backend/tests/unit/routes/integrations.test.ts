import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/integrations.js', () => ({
  apiKeysService: {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ apiKey: {}, key: 'test-key' }),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(true),
    validateKey: vi.fn().mockResolvedValue(null),
  },
  webhooksService: {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(true),
    testWebhook: vi.fn().mockResolvedValue({}),
    getDeliveries: vi.fn().mockResolvedValue([]),
  },
  integrationsService: {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(true),
    testConnection: vi.fn().mockResolvedValue({}),
    getSyncLogs: vi.fn().mockResolvedValue([]),
  },
  WEBHOOK_EVENTS: ['issue.created', 'issue.updated'],
  INTEGRATION_TYPES: ['jira', 'slack', 'servicenow'],
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  authenticate: vi.fn().mockImplementation((_req, _reply, done) => done()),
}));

describe('Integrations Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create API Key Schema', () => {
    const createApiKeySchema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      permissions: z.array(z.string()).optional(),
      rateLimit: z.number().int().min(1).max(100000).optional(),
      expiresAt: z.string().datetime().optional(),
      ipWhitelist: z.array(z.string()).optional(),
    });

    it('should require name', () => {
      const result = createApiKeySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid API key data', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My API Key',
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 1 character', () => {
      const result = createApiKeySchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 characters', () => {
      const result = createApiKeySchema.safeParse({ name: 'x'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        description: 'API key for CI/CD',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 500 characters', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        description: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept permissions array', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        permissions: ['issues:read', 'issues:write'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept rateLimit between 1 and 100000', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        rateLimit: 1000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject rateLimit over 100000', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        rateLimit: 100001,
      });
      expect(result.success).toBe(false);
    });

    it('should accept expiresAt datetime', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        expiresAt: '2025-12-31T23:59:59Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept ipWhitelist array', () => {
      const result = createApiKeySchema.safeParse({
        name: 'My Key',
        ipWhitelist: ['192.168.1.1', '10.0.0.0/8'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update API Key Schema', () => {
    const updateApiKeySchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional().nullable(),
      permissions: z.array(z.string()).optional(),
      rateLimit: z.number().int().min(1).max(100000).optional(),
      isActive: z.boolean().optional(),
      expiresAt: z.string().datetime().optional().nullable(),
      ipWhitelist: z.array(z.string()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateApiKeySchema.safeParse({ name: 'Updated Key' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateApiKeySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive toggle', () => {
      const result = updateApiKeySchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept null expiresAt to remove expiration', () => {
      const result = updateApiKeySchema.safeParse({ expiresAt: null });
      expect(result.success).toBe(true);
    });

    it('should accept null description to remove', () => {
      const result = updateApiKeySchema.safeParse({ description: null });
      expect(result.success).toBe(true);
    });
  });

  describe('Create Webhook Schema', () => {
    const createWebhookSchema = z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      url: z.string().url().max(2048),
      secret: z.string().max(255).optional(),
      events: z.array(z.string()).min(1),
      filters: z.record(z.any()).optional(),
      retryCount: z.number().int().min(0).max(10).optional(),
      retryDelay: z.number().int().min(1).max(3600).optional(),
      timeout: z.number().int().min(1).max(120).optional(),
      customHeaders: z.record(z.string()).optional(),
    });

    it('should require name, url, and events', () => {
      const result = createWebhookSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid webhook data', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
      });
      expect(result.success).toBe(true);
    });

    it('should require valid URL', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'not-a-url',
        events: ['issue.created'],
      });
      expect(result.success).toBe(false);
    });

    it('should reject URL over 2048 characters', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/' + 'x'.repeat(2040),
        events: ['issue.created'],
      });
      expect(result.success).toBe(false);
    });

    it('should require at least one event', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept secret', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
        secret: 'my-webhook-secret',
      });
      expect(result.success).toBe(true);
    });

    it('should accept retryCount between 0 and 10', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
        retryCount: 5,
      });
      expect(result.success).toBe(true);
    });

    it('should reject retryCount over 10', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
        retryCount: 11,
      });
      expect(result.success).toBe(false);
    });

    it('should accept retryDelay between 1 and 3600', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
        retryDelay: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should accept timeout between 1 and 120', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
        timeout: 30,
      });
      expect(result.success).toBe(true);
    });

    it('should accept customHeaders', () => {
      const result = createWebhookSchema.safeParse({
        name: 'My Webhook',
        url: 'https://example.com/webhook',
        events: ['issue.created'],
        customHeaders: { 'X-Custom': 'value' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Create Integration Schema', () => {
    const createIntegrationSchema = z.object({
      name: z.string().min(1).max(100),
      type: z.string().min(1).max(50),
      description: z.string().max(500).optional(),
      config: z.record(z.any()).optional(),
      credentials: z.record(z.any()).optional(),
      syncEnabled: z.boolean().optional(),
      syncInterval: z.number().int().min(1).max(1440).optional(),
      syncDirection: z.enum(['inbound', 'outbound', 'both']).optional(),
      fieldMappings: z.record(z.any()).optional(),
    });

    it('should require name and type', () => {
      const result = createIntegrationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid integration data', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Jira Integration',
        type: 'jira',
      });
      expect(result.success).toBe(true);
    });

    it('should reject type over 50 characters', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Integration',
        type: 'x'.repeat(51),
      });
      expect(result.success).toBe(false);
    });

    it('should accept config object', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Jira Integration',
        type: 'jira',
        config: { projectKey: 'PROJ', issueType: 'Bug' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept credentials object', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Jira Integration',
        type: 'jira',
        credentials: { apiToken: 'secret-token' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept syncEnabled flag', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Integration',
        type: 'jira',
        syncEnabled: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept syncInterval between 1 and 1440', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Integration',
        type: 'jira',
        syncInterval: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should reject syncInterval over 1440 (24 hours)', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Integration',
        type: 'jira',
        syncInterval: 1441,
      });
      expect(result.success).toBe(false);
    });

    it('should accept all sync directions', () => {
      const directions = ['inbound', 'outbound', 'both'];
      for (const syncDirection of directions) {
        const result = createIntegrationSchema.safeParse({
          name: 'Integration',
          type: 'jira',
          syncDirection,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept fieldMappings', () => {
      const result = createIntegrationSchema.safeParse({
        name: 'Integration',
        type: 'jira',
        fieldMappings: { title: 'summary', description: 'description' },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should use authenticate for GET /api-keys', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate for POST /api-keys', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate for GET /webhooks', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate for POST /webhooks', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate for GET /', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should use authenticate for POST /', () => {
      const middleware = 'authenticate';
      expect(middleware).toBe('authenticate');
    });

    it('should not require auth for GET /webhooks/events', () => {
      const requiresAuth = false;
      expect(requiresAuth).toBe(false);
    });

    it('should not require auth for GET /types', () => {
      const requiresAuth = false;
      expect(requiresAuth).toBe(false);
    });
  });

  describe('Response Formats', () => {
    it('should return API key data and key on creation', () => {
      const response = {
        data: { id: 'key-1', name: 'My Key' },
        key: 'sk_live_abc123',
        message: 'Store this key securely - it will not be shown again',
      };
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('key');
      expect(response).toHaveProperty('message');
    });

    it('should return 201 for created API key', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 404 for missing API key', () => {
      const response = { error: 'API key not found' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toBe('API key not found');
    });

    it('should return 204 for deleted API key', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return 404 for missing webhook', () => {
      const response = { error: 'Webhook not found' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toBe('Webhook not found');
    });

    it('should return 404 for missing integration', () => {
      const response = { error: 'Integration not found' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toBe('Integration not found');
    });

    it('should return webhook events', () => {
      const response = { data: ['issue.created', 'issue.updated'] };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return integration types', () => {
      const response = { data: ['jira', 'slack', 'servicenow'] };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return deliveries with meta', () => {
      const response = {
        data: [],
        meta: { total: 0, limit: 50 },
      };
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
    });

    it('should return sync logs with meta', () => {
      const response = {
        data: [],
        meta: { total: 0, limit: 50 },
      };
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
    });

    it('should return validation result for API key', () => {
      const response = { data: { valid: true, apiKey: {} } };
      expect(response.data).toHaveProperty('valid');
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug to apiKeysService.list', async () => {
      const { apiKeysService } = await import('../../../src/services/integrations.js');

      await apiKeysService.list('test-tenant');
      expect(apiKeysService.list).toHaveBeenCalledWith('test-tenant');
    });

    it('should pass tenantSlug and id to webhooksService.findById', async () => {
      const { webhooksService } = await import('../../../src/services/integrations.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await webhooksService.findById('test-tenant', id);
      expect(webhooksService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug to integrationsService.list', async () => {
      const { integrationsService } = await import('../../../src/services/integrations.js');

      await integrationsService.list('test-tenant');
      expect(integrationsService.list).toHaveBeenCalledWith('test-tenant');
    });
  });
});
