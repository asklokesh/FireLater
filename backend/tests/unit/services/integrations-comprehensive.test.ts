import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiKeysService, webhooksService, integrationsService, WEBHOOK_EVENTS, INTEGRATION_TYPES } from '../../../src/services/integrations.js';
import { pool } from '../../../src/config/database.js';
import * as encryption from '../../../src/utils/encryption.js';
import * as ssrf from '../../../src/utils/ssrf.js';
import crypto from 'crypto';

// Mock dependencies
vi.mock('../../../src/config/database.js');
vi.mock('../../../src/utils/encryption.js');
vi.mock('../../../src/utils/ssrf.js');
vi.mock('../../../src/utils/logger.js');

describe('Integrations Service - Comprehensive Tests', () => {
  const mockTenantSlug = 'test-org';
  const mockUserId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Keys Service', () => {
    describe('list()', () => {
      it('should return all API keys for tenant', async () => {
        const mockApiKeys = [
          {
            id: '1',
            name: 'Test Key 1',
            key_prefix: 'fl_live_abc123...',
            is_active: true,
            created_at: new Date(),
          },
          {
            id: '2',
            name: 'Test Key 2',
            key_prefix: 'fl_live_def456...',
            is_active: true,
            created_at: new Date(),
          },
        ];

        vi.mocked(pool.query).mockResolvedValue({ rows: mockApiKeys } as any);

        const result = await apiKeysService.list(mockTenantSlug);

        expect(result).toEqual(mockApiKeys);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT ak.*')
        );
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('tenant_test_org.api_keys')
        );
      });

      it('should return empty array when no API keys exist', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await apiKeysService.list(mockTenantSlug);

        expect(result).toEqual([]);
      });
    });

    describe('findById()', () => {
      it('should return API key when found', async () => {
        const mockApiKey = {
          id: '1',
          name: 'Test Key',
          key_prefix: 'fl_live_abc123...',
          is_active: true,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        const result = await apiKeysService.findById(mockTenantSlug, '1');

        expect(result).toEqual(mockApiKey);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE ak.id = $1'),
          ['1']
        );
      });

      it('should return null when API key not found', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await apiKeysService.findById(mockTenantSlug, 'non-existent');

        expect(result).toBeNull();
      });
    });

    describe('create()', () => {
      it('should create API key with valid data', async () => {
        const mockApiKey = {
          id: '1',
          name: 'New Key',
          key_prefix: 'fl_live_abc123...',
          key_hash: 'hashed-value',
          permissions: ['read', 'write'],
          rate_limit: 1000,
          is_active: true,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        const result = await apiKeysService.create(mockTenantSlug, mockUserId, {
          name: 'New Key',
          description: 'Test description',
          permissions: ['read', 'write'],
          rateLimit: 1000,
        });

        expect(result).toHaveProperty('apiKey');
        expect(result).toHaveProperty('key');
        expect(result.key).toMatch(/^fl_live_/);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO'),
          expect.arrayContaining(['New Key', 'Test description'])
        );
      });

      it('should create API key with default rate limit when not provided', async () => {
        const mockApiKey = {
          id: '1',
          name: 'New Key',
          rate_limit: 1000,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        await apiKeysService.create(mockTenantSlug, mockUserId, {
          name: 'New Key',
        });

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([1000]) // Default rate limit
        );
      });

      it('should create API key with expiration date', async () => {
        const expiresAt = new Date('2025-12-31');
        const mockApiKey = {
          id: '1',
          name: 'Expiring Key',
          expires_at: expiresAt,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        await apiKeysService.create(mockTenantSlug, mockUserId, {
          name: 'Expiring Key',
          expiresAt,
        });

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([expiresAt])
        );
      });

      it('should create API key with IP whitelist', async () => {
        const ipWhitelist = ['192.168.1.1', '10.0.0.1'];
        const mockApiKey = {
          id: '1',
          name: 'Whitelisted Key',
          ip_whitelist: ipWhitelist,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        await apiKeysService.create(mockTenantSlug, mockUserId, {
          name: 'Whitelisted Key',
          ipWhitelist,
        });

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify(ipWhitelist)])
        );
      });
    });

    describe('update()', () => {
      it('should update API key with new data', async () => {
        const mockApiKey = {
          id: '1',
          name: 'Updated Key',
          description: 'Updated description',
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        const result = await apiKeysService.update(mockTenantSlug, '1', {
          name: 'Updated Key',
          description: 'Updated description',
        });

        expect(result).toEqual(mockApiKey);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.arrayContaining(['Updated Key', 'Updated description', '1'])
        );
      });

      it('should deactivate API key', async () => {
        const mockApiKey = {
          id: '1',
          is_active: false,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        const result = await apiKeysService.update(mockTenantSlug, '1', {
          isActive: false,
        });

        expect(result?.is_active).toBe(false);
      });

      it('should return null when API key not found', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await apiKeysService.update(mockTenantSlug, 'non-existent', {
          name: 'New Name',
        });

        expect(result).toBeNull();
      });

      it('should return existing key when no updates provided', async () => {
        const mockApiKey = {
          id: '1',
          name: 'Existing Key',
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockApiKey] } as any);

        const result = await apiKeysService.update(mockTenantSlug, '1', {});

        expect(result).toEqual(mockApiKey);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT'),
          ['1']
        );
      });
    });

    describe('delete()', () => {
      it('should delete API key successfully', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rowCount: 1 } as any);

        const result = await apiKeysService.delete(mockTenantSlug, '1');

        expect(result).toBe(true);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM'),
          ['1']
        );
      });

      it('should return false when API key not found', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rowCount: 0 } as any);

        const result = await apiKeysService.delete(mockTenantSlug, 'non-existent');

        expect(result).toBe(false);
      });
    });

    describe('validateKey()', () => {
      it('should validate and return API key for valid active key', async () => {
        const mockApiKey = {
          id: '1',
          name: 'Valid Key',
          is_active: true,
          expires_at: null,
        };

        vi.mocked(pool.query)
          .mockResolvedValueOnce({ rows: [mockApiKey] } as any) // SELECT
          .mockResolvedValueOnce({ rows: [] } as any); // UPDATE

        const result = await apiKeysService.validateKey(mockTenantSlug, 'fl_live_test123');

        expect(result).toEqual(mockApiKey);
        expect(pool.query).toHaveBeenNthCalledWith(
          1,
          expect.stringContaining('WHERE key_hash = $1'),
          [expect.any(String)] // SHA256 hash
        );
        expect(pool.query).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('UPDATE'),
          [mockApiKey.id]
        );
      });

      it('should return null for invalid key', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await apiKeysService.validateKey(mockTenantSlug, 'invalid-key');

        expect(result).toBeNull();
      });

      it('should update usage stats when key is validated', async () => {
        const mockApiKey = { id: '1', name: 'Key', is_active: true };

        vi.mocked(pool.query)
          .mockResolvedValueOnce({ rows: [mockApiKey] } as any)
          .mockResolvedValueOnce({ rows: [] } as any);

        await apiKeysService.validateKey(mockTenantSlug, 'fl_live_test123');

        expect(pool.query).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('last_used_at = NOW()'),
          [mockApiKey.id]
        );
        expect(pool.query).toHaveBeenNthCalledWith(
          2,
          expect.stringContaining('usage_count = usage_count + 1'),
          [mockApiKey.id]
        );
      });
    });
  });

  describe('Webhooks Service', () => {
    describe('list()', () => {
      it('should return all webhooks for tenant', async () => {
        const mockWebhooks = [
          {
            id: '1',
            name: 'Webhook 1',
            url: 'https://example.com/hook1',
            events: ['incident.created'],
            is_active: true,
          },
          {
            id: '2',
            name: 'Webhook 2',
            url: 'https://example.com/hook2',
            events: ['change.approved'],
            is_active: true,
          },
        ];

        vi.mocked(pool.query).mockResolvedValue({ rows: mockWebhooks } as any);

        const result = await webhooksService.list(mockTenantSlug);

        expect(result).toEqual(mockWebhooks);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('SELECT w.*')
        );
      });
    });

    describe('findById()', () => {
      it('should return webhook when found', async () => {
        const mockWebhook = {
          id: '1',
          name: 'Test Webhook',
          url: 'https://example.com/hook',
          events: ['incident.created'],
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockWebhook] } as any);

        const result = await webhooksService.findById(mockTenantSlug, '1');

        expect(result).toEqual(mockWebhook);
      });

      it('should return null when webhook not found', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await webhooksService.findById(mockTenantSlug, 'non-existent');

        expect(result).toBeNull();
      });
    });

    describe('findByEvent()', () => {
      it('should return active webhooks for specific event', async () => {
        const mockWebhooks = [
          {
            id: '1',
            name: 'Incident Webhook',
            events: ['incident.created', 'incident.updated'],
            is_active: true,
          },
        ];

        vi.mocked(pool.query).mockResolvedValue({ rows: mockWebhooks } as any);

        const result = await webhooksService.findByEvent(mockTenantSlug, 'incident.created');

        expect(result).toEqual(mockWebhooks);
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('WHERE is_active = true AND events @> $1::jsonb'),
          [JSON.stringify(['incident.created'])]
        );
      });

      it('should return empty array when no webhooks match event', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await webhooksService.findByEvent(mockTenantSlug, 'unknown.event');

        expect(result).toEqual([]);
      });
    });

    describe('create()', () => {
      beforeEach(() => {
        vi.mocked(ssrf.validateUrlForSSRF).mockResolvedValue(undefined);
      });

      it('should create webhook with valid data', async () => {
        const mockWebhook = {
          id: '1',
          name: 'New Webhook',
          url: 'https://example.com/hook',
          events: ['incident.created'],
          retry_count: 3,
          retry_delay: 60,
          timeout: 30,
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockWebhook] } as any);

        const result = await webhooksService.create(mockTenantSlug, mockUserId, {
          name: 'New Webhook',
          url: 'https://example.com/hook',
          events: ['incident.created'],
        });

        expect(result).toEqual(mockWebhook);
        expect(ssrf.validateUrlForSSRF).toHaveBeenCalledWith('https://example.com/hook');
        expect(pool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO'),
          expect.arrayContaining(['New Webhook', 'https://example.com/hook'])
        );
      });

      it('should create webhook with custom headers', async () => {
        const mockWebhook = { id: '1', custom_headers: { 'X-Custom': 'value' } };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockWebhook] } as any);

        await webhooksService.create(mockTenantSlug, mockUserId, {
          name: 'Webhook',
          url: 'https://example.com/hook',
          events: ['incident.created'],
          customHeaders: { 'X-Custom': 'value' },
        });

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([JSON.stringify({ 'X-Custom': 'value' })])
        );
      });

      it('should generate secret if not provided', async () => {
        const mockWebhook = { id: '1', secret: 'generated-secret' };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockWebhook] } as any);

        await webhooksService.create(mockTenantSlug, mockUserId, {
          name: 'Webhook',
          url: 'https://example.com/hook',
          events: ['incident.created'],
        });

        expect(pool.query).toHaveBeenCalledWith(
          expect.any(String),
          expect.arrayContaining([expect.any(String)]) // Secret is generated
        );
      });

      it('should validate URL for SSRF vulnerabilities', async () => {
        vi.mocked(ssrf.validateUrlForSSRF).mockRejectedValue(new Error('SSRF detected'));
        vi.mocked(pool.query).mockResolvedValue({ rows: [{}] } as any);

        await expect(
          webhooksService.create(mockTenantSlug, mockUserId, {
            name: 'Malicious Webhook',
            url: 'http://localhost/admin',
            events: ['incident.created'],
          })
        ).rejects.toThrow('SSRF detected');

        expect(ssrf.validateUrlForSSRF).toHaveBeenCalledWith('http://localhost/admin');
      });
    });

    describe('update()', () => {
      beforeEach(() => {
        vi.mocked(ssrf.validateUrlForSSRF).mockResolvedValue(undefined);
      });

      it('should update webhook with new data', async () => {
        const mockWebhook = {
          id: '1',
          name: 'Updated Webhook',
          url: 'https://example.com/new-hook',
        };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockWebhook] } as any);

        const result = await webhooksService.update(mockTenantSlug, '1', {
          name: 'Updated Webhook',
          url: 'https://example.com/new-hook',
        });

        expect(result).toEqual(mockWebhook);
        expect(ssrf.validateUrlForSSRF).toHaveBeenCalledWith('https://example.com/new-hook');
      });

      it('should deactivate webhook', async () => {
        const mockWebhook = { id: '1', is_active: false };

        vi.mocked(pool.query).mockResolvedValue({ rows: [mockWebhook] } as any);

        const result = await webhooksService.update(mockTenantSlug, '1', {
          isActive: false,
        });

        expect(result?.is_active).toBe(false);
      });

      it('should return null when webhook not found', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rows: [] } as any);

        const result = await webhooksService.update(mockTenantSlug, 'non-existent', {
          name: 'New Name',
        });

        expect(result).toBeNull();
      });
    });

    describe('delete()', () => {
      it('should delete webhook successfully', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rowCount: 1 } as any);

        const result = await webhooksService.delete(mockTenantSlug, '1');

        expect(result).toBe(true);
      });

      it('should return false when webhook not found', async () => {
        vi.mocked(pool.query).mockResolvedValue({ rowCount: 0 } as any);

        const result = await webhooksService.delete(mockTenantSlug, 'non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Constants', () => {
    it('should export WEBHOOK_EVENTS', () => {
      expect(WEBHOOK_EVENTS).toBeDefined();
      expect(Array.isArray(WEBHOOK_EVENTS)).toBe(true);
      expect(WEBHOOK_EVENTS).toContain('issue.created');
      expect(WEBHOOK_EVENTS).toContain('change.approved');
      expect(WEBHOOK_EVENTS).toContain('sla.breached');
    });

    it('should export INTEGRATION_TYPES', () => {
      expect(INTEGRATION_TYPES).toBeDefined();
      expect(Array.isArray(INTEGRATION_TYPES)).toBe(true);
      expect(INTEGRATION_TYPES.length).toBeGreaterThan(0);

      // Check for specific integrations
      const slackIntegration = INTEGRATION_TYPES.find(t => t.id === 'slack');
      expect(slackIntegration).toBeDefined();
      expect(slackIntegration?.name).toBe('Slack');

      const pagerdutyIntegration = INTEGRATION_TYPES.find(t => t.id === 'pagerduty');
      expect(pagerdutyIntegration).toBeDefined();
      expect(pagerdutyIntegration?.name).toBe('PagerDuty');

      const teamsIntegration = INTEGRATION_TYPES.find(t => t.id === 'teams');
      expect(teamsIntegration).toBeDefined();
      expect(teamsIntegration?.name).toBe('Microsoft Teams');
    });
  });
});
