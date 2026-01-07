import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApiKeySchema, createWebhookSchema } from '../../../src/routes/integrations.js';

// Use vi.hoisted for mocks that need to be available before module loads
const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockCacheGetOrSet = vi.hoisted(() => vi.fn());
const mockCacheInvalidate = vi.hoisted(() => vi.fn());
const mockEncrypt = vi.hoisted(() => vi.fn());
const mockDecrypt = vi.hoisted(() => vi.fn());
const mockValidateUrlForSSRF = vi.hoisted(() => vi.fn());

// Mock database pool
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: mockPoolQuery,
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock cache service
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: mockCacheGetOrSet,
    invalidateTenant: mockCacheInvalidate,
  },
}));

// Mock encryption
vi.mock('../../../src/utils/encryption.js', () => ({
  encrypt: mockEncrypt,
  decrypt: mockDecrypt,
}));

// Mock SSRF validation
vi.mock('../../../src/utils/ssrf.js', () => ({
  validateUrlForSSRF: mockValidateUrlForSSRF,
}));

// Mock tenant service
vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn((slug: string) => `tenant_${slug.replace(/-/g, '_')}`),
  },
}));

// Import after mocks
import { apiKeysService, webhooksService, integrationsService, WEBHOOK_EVENTS } from '../../../src/services/integrations.js';

describe('Integrations Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    mockCacheGetOrSet.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn());
    mockCacheInvalidate.mockResolvedValue(undefined);
    mockEncrypt.mockImplementation((data: string) => `encrypted:${data}`);
    mockDecrypt.mockImplementation((data: string) => data.replace('encrypted:', ''));
    mockValidateUrlForSSRF.mockResolvedValue(undefined);
  });

  describe('Schema Validation', () => {
    describe('API Key Validation', () => {
      it('should validate API key creation data', () => {
        const validData = {
          name: 'Test API Key',
          description: 'Key for testing',
          permissions: ['read', 'write'],
          rateLimit: 1000
        };

        expect(() => createApiKeySchema.parse(validData)).not.toThrow();
      });

      it('should reject invalid API key data', () => {
        const invalidData = {
          name: '', // invalid - empty string
          rateLimit: 1000000 // invalid - too high
        };

        expect(() => createApiKeySchema.parse(invalidData)).toThrow();
      });
    });

    describe('Webhook Validation', () => {
      it('should validate webhook creation data', () => {
        const validData = {
          name: 'Test Webhook',
          url: 'https://example.com/webhook',
          events: ['incident.created', 'incident.updated']
        };

        expect(() => createWebhookSchema.parse(validData)).not.toThrow();
      });

      it('should reject invalid webhook data', () => {
        const invalidData = {
          name: 'Test Webhook',
          url: 'invalid-url', // invalid URL
          events: [] // invalid - empty array
        };

        expect(() => createWebhookSchema.parse(invalidData)).toThrow();
      });
    });
  });

  // ============================================
  // API KEYS SERVICE TESTS
  // ============================================

  describe('apiKeysService', () => {
    describe('list', () => {
      it('should list all API keys for a tenant', async () => {
        const mockKeys = [
          { id: 'key-1', name: 'Test Key 1', is_active: true },
          { id: 'key-2', name: 'Test Key 2', is_active: false },
        ];
        mockPoolQuery.mockResolvedValueOnce({ rows: mockKeys });

        const result = await apiKeysService.list('test-tenant');

        expect(result).toHaveLength(2);
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT ak.*')
        );
      });

      it('should use cache for listing API keys', async () => {
        const mockKeys = [{ id: 'key-1', name: 'Test Key' }];
        mockCacheGetOrSet.mockResolvedValueOnce(mockKeys);

        await apiKeysService.list('test-tenant');

        expect(mockCacheGetOrSet).toHaveBeenCalledWith(
          'test-tenant:integrations:api_keys:list',
          expect.any(Function),
          expect.objectContaining({ ttl: 900 })
        );
      });
    });

    describe('findById', () => {
      it('should find API key by ID', async () => {
        const mockKey = { id: 'key-1', name: 'Test Key', is_active: true };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockKey] });

        const result = await apiKeysService.findById('test-tenant', 'key-1');

        expect(result).toEqual(mockKey);
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE ak.id = $1'),
          ['key-1']
        );
      });

      it('should return null for non-existent key', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        const result = await apiKeysService.findById('test-tenant', 'non-existent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a new API key', async () => {
        const mockCreatedKey = { id: 'key-new', name: 'New Key', key_prefix: 'fl_live_abc...' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockCreatedKey] });

        const result = await apiKeysService.create('test-tenant', 'user-1', {
          name: 'New Key',
          description: 'Test description',
          permissions: ['read', 'write'],
          rateLimit: 1000,
        });

        expect(result.apiKey).toEqual(mockCreatedKey);
        expect(result.key).toBeDefined();
        expect(result.key).toMatch(/^fl_live_/);
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO'),
          expect.arrayContaining(['New Key', 'Test description'])
        );
      });

      it('should invalidate cache after creation', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'key-new' }] });

        await apiKeysService.create('test-tenant', 'user-1', { name: 'New Key' });

        expect(mockCacheInvalidate).toHaveBeenCalledWith('test-tenant', 'integrations');
      });

      it('should use default values for optional fields', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'key-new' }] });

        await apiKeysService.create('test-tenant', 'user-1', { name: 'Minimal Key' });

        // Check that defaults are applied
        const insertCall = mockPoolQuery.mock.calls[0];
        expect(insertCall[1]).toContain(1000); // default rate limit
        expect(insertCall[1]).toContain('[]'); // empty permissions
      });
    });

    describe('update', () => {
      it('should update API key properties', async () => {
        const mockUpdatedKey = { id: 'key-1', name: 'Updated Key', is_active: true };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockUpdatedKey] });

        const result = await apiKeysService.update('test-tenant', 'key-1', {
          name: 'Updated Key',
          isActive: true,
        });

        expect(result).toEqual(mockUpdatedKey);
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.arrayContaining(['Updated Key', true])
        );
      });

      it('should return existing key if no updates provided', async () => {
        const mockKey = { id: 'key-1', name: 'Existing Key' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockKey] });

        const result = await apiKeysService.update('test-tenant', 'key-1', {});

        expect(result).toEqual(mockKey);
      });

      it('should update permissions as JSON', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'key-1' }] });

        await apiKeysService.update('test-tenant', 'key-1', {
          permissions: ['read', 'write', 'delete'],
        });

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('permissions'),
          expect.arrayContaining(['["read","write","delete"]'])
        );
      });
    });

    describe('delete', () => {
      it('should delete API key', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await apiKeysService.delete('test-tenant', 'key-1');

        expect(result).toBe(true);
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM'),
          ['key-1']
        );
      });

      it('should return false if key not found', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 0 });

        const result = await apiKeysService.delete('test-tenant', 'non-existent');

        expect(result).toBe(false);
      });

      it('should invalidate cache after deletion', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        await apiKeysService.delete('test-tenant', 'key-1');

        expect(mockCacheInvalidate).toHaveBeenCalledWith('test-tenant', 'integrations');
      });
    });

    describe('validateKey', () => {
      it('should validate a valid API key', async () => {
        const mockKey = { id: 'key-1', key_hash: 'hash', is_active: true };
        mockPoolQuery
          .mockResolvedValueOnce({ rows: [mockKey] })
          .mockResolvedValueOnce({ rowCount: 1 }); // usage update

        const result = await apiKeysService.validateKey('test-tenant', 'fl_live_test_key');

        expect(result).toEqual(mockKey);
        expect(mockPoolQuery).toHaveBeenCalledTimes(2);
      });

      it('should return null for invalid API key', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        const result = await apiKeysService.validateKey('test-tenant', 'invalid_key');

        expect(result).toBeNull();
      });

      it('should update usage stats on successful validation', async () => {
        const mockKey = { id: 'key-1', key_hash: 'hash', is_active: true };
        mockPoolQuery
          .mockResolvedValueOnce({ rows: [mockKey] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await apiKeysService.validateKey('test-tenant', 'fl_live_test_key');

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('usage_count = usage_count + 1'),
          ['key-1']
        );
      });
    });
  });

  // ============================================
  // WEBHOOKS SERVICE TESTS
  // ============================================

  describe('webhooksService', () => {
    describe('list', () => {
      it('should list all webhooks for a tenant', async () => {
        const mockWebhooks = [
          { id: 'wh-1', name: 'Webhook 1', url: 'https://example.com/1' },
          { id: 'wh-2', name: 'Webhook 2', url: 'https://example.com/2' },
        ];
        mockPoolQuery.mockResolvedValueOnce({ rows: mockWebhooks });

        const result = await webhooksService.list('test-tenant');

        expect(result).toHaveLength(2);
      });
    });

    describe('findById', () => {
      it('should find webhook by ID', async () => {
        const mockWebhook = { id: 'wh-1', name: 'Test Webhook' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockWebhook] });

        const result = await webhooksService.findById('test-tenant', 'wh-1');

        expect(result).toEqual(mockWebhook);
      });
    });

    describe('findByEvent', () => {
      it('should find webhooks subscribed to an event', async () => {
        const mockWebhooks = [{ id: 'wh-1', events: ['issue.created'] }];
        mockPoolQuery.mockResolvedValueOnce({ rows: mockWebhooks });

        const result = await webhooksService.findByEvent('test-tenant', 'issue.created');

        expect(result).toHaveLength(1);
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('events @> $1::jsonb'),
          [JSON.stringify(['issue.created'])]
        );
      });
    });

    describe('create', () => {
      it('should create a new webhook', async () => {
        const mockCreatedWebhook = {
          id: 'wh-new',
          name: 'New Webhook',
          url: 'https://example.com/hook',
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockCreatedWebhook] });

        const result = await webhooksService.create('test-tenant', 'user-1', {
          name: 'New Webhook',
          url: 'https://example.com/hook',
          events: ['issue.created'],
        });

        expect(result).toEqual(mockCreatedWebhook);
      });

      it('should validate URL for SSRF', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'wh-new' }] });

        await webhooksService.create('test-tenant', 'user-1', {
          name: 'Test',
          url: 'https://example.com/hook',
          events: ['issue.created'],
        });

        expect(mockValidateUrlForSSRF).toHaveBeenCalledWith('https://example.com/hook');
      });

      it('should reject SSRF-vulnerable URLs', async () => {
        mockValidateUrlForSSRF.mockRejectedValueOnce(new Error('SSRF blocked'));

        await expect(
          webhooksService.create('test-tenant', 'user-1', {
            name: 'Test',
            url: 'http://localhost:8080',
            events: ['issue.created'],
          })
        ).rejects.toThrow('SSRF blocked');
      });

      it('should generate secret if not provided', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'wh-new' }] });

        await webhooksService.create('test-tenant', 'user-1', {
          name: 'Test',
          url: 'https://example.com/hook',
          events: ['issue.created'],
        });

        const insertCall = mockPoolQuery.mock.calls[0];
        // Secret should be generated (64 hex chars)
        expect(insertCall[1][3]).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    describe('update', () => {
      it('should update webhook properties', async () => {
        const mockUpdatedWebhook = { id: 'wh-1', name: 'Updated Webhook' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockUpdatedWebhook] });

        const result = await webhooksService.update('test-tenant', 'wh-1', {
          name: 'Updated Webhook',
          isActive: true,
        });

        expect(result).toEqual(mockUpdatedWebhook);
      });

      it('should validate URL when updating', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'wh-1' }] });

        await webhooksService.update('test-tenant', 'wh-1', {
          url: 'https://new-url.com/hook',
        });

        expect(mockValidateUrlForSSRF).toHaveBeenCalledWith('https://new-url.com/hook');
      });
    });

    describe('delete', () => {
      it('should delete webhook', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await webhooksService.delete('test-tenant', 'wh-1');

        expect(result).toBe(true);
      });
    });

    describe('getDeliveries', () => {
      it('should get all deliveries', async () => {
        const mockDeliveries = [
          { id: 'del-1', status: 'success' },
          { id: 'del-2', status: 'failed' },
        ];
        mockPoolQuery.mockResolvedValueOnce({ rows: mockDeliveries });

        const result = await webhooksService.getDeliveries('test-tenant');

        expect(result).toHaveLength(2);
      });

      it('should filter deliveries by webhook ID', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        await webhooksService.getDeliveries('test-tenant', 'wh-1');

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE wd.webhook_id = $1'),
          ['wh-1']
        );
      });
    });

    describe('testWebhook', () => {
      it('should test webhook successfully', async () => {
        const mockWebhook = {
          id: 'wh-1',
          url: 'https://example.com/hook',
          secret: 'test-secret',
          custom_headers: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockWebhook] });

        // Mock fetch
        const mockFetch = vi.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
        });
        global.fetch = mockFetch;

        const result = await webhooksService.testWebhook('test-tenant', 'wh-1');

        expect(result.success).toBe(true);
        expect(result.status).toBe(200);
      });

      it('should return error for non-existent webhook', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        const result = await webhooksService.testWebhook('test-tenant', 'non-existent');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook not found');
      });

      it('should handle test failure', async () => {
        const mockWebhook = {
          id: 'wh-1',
          url: 'https://example.com/hook',
          secret: 'test-secret',
          custom_headers: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockWebhook] });

        global.fetch = vi.fn().mockRejectedValueOnce(new Error('Connection refused'));

        const result = await webhooksService.testWebhook('test-tenant', 'wh-1');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Connection refused');
      });

      it('should return error when webhook has no secret', async () => {
        const mockWebhook = {
          id: 'wh-1',
          url: 'https://example.com/hook',
          secret: null, // No secret
          custom_headers: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockWebhook] });

        const result = await webhooksService.testWebhook('test-tenant', 'wh-1');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Webhook is missing a secret');
      });
    });
  });

  // ============================================
  // INTEGRATIONS SERVICE TESTS
  // ============================================

  describe('integrationsService', () => {
    describe('list', () => {
      it('should list all integrations', async () => {
        const mockIntegrations = [
          { id: 'int-1', name: 'Slack', type: 'slack' },
          { id: 'int-2', name: 'Jira', type: 'jira' },
        ];
        mockPoolQuery.mockResolvedValueOnce({ rows: mockIntegrations });

        const result = await integrationsService.list('test-tenant');

        expect(result).toHaveLength(2);
        expect(result[0].credentials).toBeUndefined();
      });
    });

    describe('findById', () => {
      it('should find integration by ID', async () => {
        const mockIntegration = { id: 'int-1', name: 'Slack', type: 'slack' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });

        const result = await integrationsService.findById('test-tenant', 'int-1');

        expect(result).toBeDefined();
        expect(result?.credentials).toBeUndefined();
      });
    });

    describe('create', () => {
      it('should create a new integration', async () => {
        const mockCreatedIntegration = { id: 'int-new', name: 'New Slack', type: 'slack' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockCreatedIntegration] });

        const result = await integrationsService.create('test-tenant', 'user-1', {
          name: 'New Slack',
          type: 'slack',
          config: { channel: '#alerts' },
        });

        expect(result.name).toBe('New Slack');
        expect(result.credentials).toBeUndefined();
      });

      it('should encrypt credentials before storing', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'int-new' }] });

        await integrationsService.create('test-tenant', 'user-1', {
          name: 'Test',
          type: 'slack',
          credentials: { token: 'secret-token' },
        });

        expect(mockEncrypt).toHaveBeenCalled();
      });
    });

    describe('update', () => {
      it('should update integration properties', async () => {
        const mockUpdatedIntegration = { id: 'int-1', name: 'Updated' };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockUpdatedIntegration] });

        const result = await integrationsService.update('test-tenant', 'int-1', {
          name: 'Updated',
        });

        expect(result?.name).toBe('Updated');
      });

      it('should encrypt credentials when updating', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'int-1' }] });

        await integrationsService.update('test-tenant', 'int-1', {
          credentials: { newToken: 'new-secret' },
        });

        expect(mockEncrypt).toHaveBeenCalled();
      });
    });

    describe('delete', () => {
      it('should delete integration', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await integrationsService.delete('test-tenant', 'int-1');

        expect(result).toBe(true);
      });
    });

    describe('getWithCredentials', () => {
      it('should return integration with decrypted credentials', async () => {
        const mockIntegration = {
          id: 'int-1',
          name: 'Test',
          credentials: 'encrypted:{"token":"secret"}',
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockDecrypt.mockReturnValueOnce('{"token":"secret"}');

        const result = await integrationsService.getWithCredentials('test-tenant', 'int-1');

        expect(result?.credentials).toEqual({ token: 'secret' });
      });

      it('should handle unencrypted credentials (migration scenario)', async () => {
        const mockIntegration = {
          id: 'int-1',
          name: 'Test',
          credentials: '{"token":"plaintext"}',
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockDecrypt.mockImplementationOnce(() => {
          throw new Error('Decryption failed');
        });

        const result = await integrationsService.getWithCredentials('test-tenant', 'int-1');

        expect(result?.credentials).toEqual({ token: 'plaintext' });
      });
    });

    describe('testConnection', () => {
      it('should return error for non-existent integration', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        const result = await integrationsService.testConnection('test-tenant', 'non-existent');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Integration not found');
      });

      it('should test Slack integration', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'slack',
          config: { botToken: 'xoxb-test-token' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: true }),
        });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
      });

      it('should test Teams integration', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'teams',
          config: { webhookUrl: 'https://outlook.office.com/webhook/...' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
      });

      it('should fail for Teams when webhook returns error', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'teams',
          config: { webhookUrl: 'https://outlook.office.com/webhook/...' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 400 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Teams webhook returned 400');
      });

      it('should fail for Teams without webhook URL', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'teams',
          config: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Teams webhook URL not configured');
      });

      it('should fail for Slack when auth returns error', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'slack',
          config: { botToken: 'xoxb-test-token' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        global.fetch = vi.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: false, error: 'invalid_auth' }),
        });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('invalid_auth');
      });

      it('should fail for Slack when auth.test returns generic error', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'slack',
          config: { botToken: 'xoxb-test-token' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        global.fetch = vi.fn().mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: false }),
        });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Slack authentication failed');
      });

      it('should handle missing configuration', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'slack',
          config: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('not configured');
      });

      it('should handle unknown integration type with config', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'unknown_custom_type',
          config: { apiKey: 'some-key' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        // Unknown types succeed if they have config
        expect(result.success).toBe(true);
      });

      it('should fail for unknown integration type without config', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'unknown_custom_type',
          config: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('has no configuration');
      });

      it('should fail for unknown integration type with null config', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'custom_integration',
          config: null,
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('has no configuration');
      });

      it('should test webhook integration successfully with HEAD request', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'webhook',
          config: { url: 'https://example.com/webhook' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith('https://example.com/webhook', { method: 'HEAD' });
      });

      it('should fall back to OPTIONS when HEAD returns 405', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'webhook',
          config: { url: 'https://example.com/webhook' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        // HEAD fails, OPTIONS succeeds
        global.fetch = vi.fn()
          .mockRejectedValueOnce(new Error('HEAD not supported'))
          .mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
      });

      it('should succeed when webhook returns 405 Method Not Allowed', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'webhook',
          config: { url: 'https://example.com/webhook' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        // 405 is allowed (method not allowed is expected for webhook endpoints)
        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 405 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
      });

      it('should fail when webhook endpoint returns error status', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'webhook',
          config: { url: 'https://example.com/webhook' },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('500');
      });

      it('should fail for webhook integration without URL', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'webhook',
          config: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Webhook URL not configured');
      });

      it('should test ServiceNow integration successfully', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'servicenow',
          config: {
            instanceUrl: 'https://dev12345.service-now.com',
            username: 'admin',
            password: 'password123',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
        expect(global.fetch).toHaveBeenCalledWith(
          'https://dev12345.service-now.com/api/now/table/sys_user?sysparm_limit=1',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Authorization': expect.stringContaining('Basic'),
            }),
          })
        );
      });

      it('should fail for ServiceNow when API returns error', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'servicenow',
          config: {
            instanceUrl: 'https://dev12345.service-now.com',
            username: 'admin',
            password: 'wrong-password',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('401');
      });

      it('should fail for ServiceNow without instanceUrl', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'servicenow',
          config: {
            username: 'admin',
            password: 'password123',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('ServiceNow configuration incomplete');
      });

      it('should test Jira integration successfully', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'jira',
          config: {
            baseUrl: 'https://mycompany.atlassian.net',
            email: 'user@example.com',
            apiToken: 'test-token',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
      });

      it('should fail for Jira without baseUrl', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'jira',
          config: {
            email: 'user@example.com',
            apiToken: 'test-token',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Jira configuration incomplete');
      });

      it('should fail for Jira when API returns error', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'jira',
          config: {
            baseUrl: 'https://mycompany.atlassian.net',
            email: 'user@example.com',
            apiToken: 'test-token',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Jira API returned 401');
      });

      it('should test PagerDuty integration successfully', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'pagerduty',
          config: {
            apiKey: 'test-api-key',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: true });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(true);
      });

      it('should fail for PagerDuty without API key', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'pagerduty',
          config: {},
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('PagerDuty API key not configured');
      });

      it('should fail for PagerDuty when API returns error', async () => {
        const mockIntegration = {
          id: 'int-1',
          type: 'pagerduty',
          config: {
            apiKey: 'test-api-key',
          },
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });
        mockPoolQuery.mockResolvedValueOnce({ rowCount: 1 }); // Update status

        global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 403 });

        const result = await integrationsService.testConnection('test-tenant', 'int-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('PagerDuty API returned 403');
      });
    });

    describe('getSyncLogs', () => {
      it('should get sync logs for all integrations', async () => {
        const mockLogs = [
          { id: 'log-1', status: 'success' },
          { id: 'log-2', status: 'error' },
        ];
        mockPoolQuery.mockResolvedValueOnce({ rows: mockLogs });

        const result = await integrationsService.getSyncLogs('test-tenant');

        expect(result).toHaveLength(2);
      });

      it('should filter sync logs by integration ID', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] });

        await integrationsService.getSyncLogs('test-tenant', 'int-1');

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('WHERE isl.integration_id = $1'),
          ['int-1']
        );
      });
    });

    describe('syncIntegration', () => {
      it('should sync integration successfully', async () => {
        const mockIntegration = {
          id: 'int-1',
          is_active: true,
          sync_enabled: true,
        };
        mockPoolQuery
          .mockResolvedValueOnce({ rows: [mockIntegration] }) // findById
          .mockResolvedValueOnce({ rowCount: 1 }) // update status to syncing
          .mockResolvedValueOnce({ rowCount: 1 }) // update status to connected
          .mockResolvedValueOnce({ rowCount: 1 }); // log success

        await integrationsService.syncIntegration('test-tenant', 'int-1');

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('connection_status = \'connected\''),
          ['int-1']
        );
      });

      it('should reject sync for inactive integration', async () => {
        const mockIntegration = {
          id: 'int-1',
          is_active: false,
          sync_enabled: true,
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });

        await expect(
          integrationsService.syncIntegration('test-tenant', 'int-1')
        ).rejects.toThrow('not active or sync is disabled');
      });

      it('should reject sync for disabled sync', async () => {
        const mockIntegration = {
          id: 'int-1',
          is_active: true,
          sync_enabled: false,
        };
        mockPoolQuery.mockResolvedValueOnce({ rows: [mockIntegration] });

        await expect(
          integrationsService.syncIntegration('test-tenant', 'int-1')
        ).rejects.toThrow('not active or sync is disabled');
      });

      it('should re-throw error after logging sync failure', async () => {
        const mockIntegration = {
          id: 'int-1',
          is_active: true,
          sync_enabled: true,
        };
        const syncError = new Error('Connection timeout');
        mockPoolQuery
          .mockResolvedValueOnce({ rows: [mockIntegration] }) // findById
          .mockResolvedValueOnce({ rowCount: 1 }) // update status to syncing
          .mockRejectedValueOnce(syncError) // sync fails during update
          .mockResolvedValueOnce({ rowCount: 1 }) // update error status
          .mockResolvedValueOnce({ rowCount: 1 }); // log error

        await expect(
          integrationsService.syncIntegration('test-tenant', 'int-1')
        ).rejects.toThrow('Connection timeout');

        // Verify error was logged
        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('connection_status = \'error\''),
          expect.anything()
        );
      });

      it('should throw error when integration not found', async () => {
        mockPoolQuery.mockResolvedValueOnce({ rows: [] }); // findById returns empty

        await expect(
          integrationsService.syncIntegration('test-tenant', 'non-existent-id')
        ).rejects.toThrow('Integration non-existent-id not found');
      });
    });

    describe('handleSyncFailure', () => {
      it('should log sync failure', async () => {
        mockPoolQuery
          .mockResolvedValueOnce({ rowCount: 1 }) // update status
          .mockResolvedValueOnce({ rowCount: 1 }); // log failure

        await integrationsService.handleSyncFailure(
          'test-tenant',
          'int-1',
          new Error('Connection timeout')
        );

        expect(mockPoolQuery).toHaveBeenCalledWith(
          expect.stringContaining('connection_status = \'error\''),
          ['int-1', 'Connection timeout']
        );
      });

      it('should log error if logging fails', async () => {
        const logError = new Error('Database connection failed');
        mockPoolQuery.mockRejectedValueOnce(logError);

        // Should not throw - the error is caught and logged
        await integrationsService.handleSyncFailure(
          'test-tenant',
          'int-1',
          new Error('Sync failed')
        );

        // The method catches the error and logs it
        expect(mockPoolQuery).toHaveBeenCalled();
      });
    });
  });

  // ============================================
  // WEBHOOK EVENTS
  // ============================================

  describe('WEBHOOK_EVENTS', () => {
    it('should include issue events', () => {
      expect(WEBHOOK_EVENTS).toContain('issue.created');
      expect(WEBHOOK_EVENTS).toContain('issue.updated');
      expect(WEBHOOK_EVENTS).toContain('issue.resolved');
      expect(WEBHOOK_EVENTS).toContain('issue.closed');
    });

    it('should include change events', () => {
      expect(WEBHOOK_EVENTS).toContain('change.created');
    });
  });
});