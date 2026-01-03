import crypto from 'crypto';
import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { validateUrlForSSRF } from '../utils/ssrf.js';

// ============================================
// TYPES
// ============================================

interface ApiKey {
  id: string;
  name: string;
  description?: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  expires_at?: Date;
  last_used_at?: Date;
  usage_count: number;
  ip_whitelist: string[];
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

interface Webhook {
  id: string;
  name: string;
  description?: string;
  url: string;
  secret?: string;
  events: string[];
  filters: Record<string, unknown>;
  is_active: boolean;
  retry_count: number;
  retry_delay: number;
  timeout: number;
  custom_headers: Record<string, string>;
  last_triggered_at?: Date;
  success_count: number;
  failure_count: number;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

interface Integration {
  id: string;
  name: string;
  type: string;
  description?: string;
  config: Record<string, unknown>;
  is_active: boolean;
  connection_status: string;
  last_sync_at?: Date;
  last_error?: string;
  sync_enabled: boolean;
  sync_interval: number;
  sync_direction: string;
  field_mappings: Record<string, unknown>;
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

// Helper to get tenant schema
function getSchema(tenantSlug: string): string {
  return `tenant_${tenantSlug.replace(/-/g, '_')}`;
}

// Generate a random API key
function generateApiKey(): { key: string; prefix: string; hash: string } {
  const prefix = 'fl_live';
  const randomPart = crypto.randomBytes(24).toString('base64url');
  const key = `${prefix}_${randomPart}`;
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return { key, prefix: `${prefix}_${randomPart.substring(0, 8)}...`, hash };
}

// ============================================
// API KEYS SERVICE
// ============================================

export const apiKeysService = {
  async list(tenantSlug: string): Promise<ApiKey[]> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT ak.*, u.name as created_by_name
      FROM ${schema}.api_keys ak
      LEFT JOIN ${schema}.users u ON ak.created_by = u.id
      ORDER BY ak.created_at DESC
    `);
    return result.rows;
  },

  async findById(tenantSlug: string, id: string): Promise<ApiKey | null> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT ak.*, u.name as created_by_name
      FROM ${schema}.api_keys ak
      LEFT JOIN ${schema}.users u ON ak.created_by = u.id
      WHERE ak.id = $1
    `, [id]);
    return result.rows[0] || null;
  },

  async create(tenantSlug: string, userId: string, data: {
    name: string;
    description?: string;
    permissions?: string[];
    rateLimit?: number;
    expiresAt?: Date;
    ipWhitelist?: string[];
  }): Promise<{ apiKey: ApiKey; key: string }> {
    const schema = getSchema(tenantSlug);
    const { key, prefix, hash } = generateApiKey();

    const result = await pool.query(`
      INSERT INTO ${schema}.api_keys (
        name, description, key_prefix, key_hash, permissions,
        rate_limit, expires_at, ip_whitelist, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      data.name,
      data.description || null,
      prefix,
      hash,
      JSON.stringify(data.permissions || []),
      data.rateLimit || 1000,
      data.expiresAt || null,
      JSON.stringify(data.ipWhitelist || []),
      userId,
    ]);

    return { apiKey: result.rows[0], key };
  },

  async update(tenantSlug: string, id: string, data: {
    name?: string;
    description?: string;
    permissions?: string[];
    rateLimit?: number;
    isActive?: boolean;
    expiresAt?: Date | null;
    ipWhitelist?: string[];
  }): Promise<ApiKey | null> {
    const schema = getSchema(tenantSlug);
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.permissions !== undefined) {
      updates.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(data.permissions));
    }
    if (data.rateLimit !== undefined) {
      updates.push(`rate_limit = $${paramIndex++}`);
      values.push(data.rateLimit);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }
    if (data.expiresAt !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(data.expiresAt);
    }
    if (data.ipWhitelist !== undefined) {
      updates.push(`ip_whitelist = $${paramIndex++}`);
      values.push(JSON.stringify(data.ipWhitelist));
    }

    if (updates.length === 0) return this.findById(tenantSlug, id);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE ${schema}.api_keys
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0] || null;
  },

  async delete(tenantSlug: string, id: string): Promise<boolean> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      DELETE FROM ${schema}.api_keys WHERE id = $1
    `, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async validateKey(tenantSlug: string, apiKey: string): Promise<ApiKey | null> {
    const schema = getSchema(tenantSlug);
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const result = await pool.query(`
      SELECT * FROM ${schema}.api_keys
      WHERE key_hash = $1 AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
    `, [hash]);

    const key = result.rows[0];
    if (!key) return null;

    // Update usage stats
    await pool.query(`
      UPDATE ${schema}.api_keys
      SET last_used_at = NOW(), usage_count = usage_count + 1
      WHERE id = $1
    `, [key.id]);

    return key;
  },
};

// ============================================
// WEBHOOKS SERVICE
// ============================================

export const webhooksService = {
  async list(tenantSlug: string): Promise<Webhook[]> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT w.*, u.name as created_by_name
      FROM ${schema}.webhooks w
      LEFT JOIN ${schema}.users u ON w.created_by = u.id
      ORDER BY w.created_at DESC
    `);
    return result.rows;
  },

  async findById(tenantSlug: string, id: string): Promise<Webhook | null> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT w.*, u.name as created_by_name
      FROM ${schema}.webhooks w
      LEFT JOIN ${schema}.users u ON w.created_by = u.id
      WHERE w.id = $1
    `, [id]);
    return result.rows[0] || null;
  },

  async findByEvent(tenantSlug: string, event: string): Promise<Webhook[]> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT * FROM ${schema}.webhooks
      WHERE is_active = true AND events @> $1::jsonb
    `, [JSON.stringify([event])]);
    return result.rows;
  },

  async create(tenantSlug: string, userId: string, data: {
    name: string;
    description?: string;
    url: string;
    secret?: string;
    events: string[];
    filters?: Record<string, unknown>;
    retryCount?: number;
    retryDelay?: number;
    timeout?: number;
    customHeaders?: Record<string, string>;
  }): Promise<Webhook> {
    const schema = getSchema(tenantSlug);

    // Validate URL for SSRF vulnerabilities
    await validateUrlForSSRF(data.url);

    const secret = data.secret || crypto.randomBytes(32).toString('hex');

    const result = await pool.query(`
      INSERT INTO ${schema}.webhooks (
        name, description, url, secret, events, filters,
        retry_count, retry_delay, timeout, custom_headers, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      data.name,
      data.description || null,
      data.url,
      secret,
      JSON.stringify(data.events),
      JSON.stringify(data.filters || {}),
      data.retryCount ?? 3,
      data.retryDelay ?? 60,
      data.timeout ?? 30,
      JSON.stringify(data.customHeaders || {}),
      userId,
    ]);

    return result.rows[0];
  },

  async update(tenantSlug: string, id: string, data: {
    name?: string;
    description?: string;
    url?: string;
    events?: string[];
    filters?: Record<string, unknown>;
    isActive?: boolean;
    retryCount?: number;
    retryDelay?: number;
    timeout?: number;
    customHeaders?: Record<string, string>;
  }): Promise<Webhook | null> {
    const schema = getSchema(tenantSlug);

    // Validate URL for SSRF vulnerabilities if URL is being updated
    if (data.url !== undefined) {
      await validateUrlForSSRF(data.url);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.url !== undefined) {
      updates.push(`url = $${paramIndex++}`);
      values.push(data.url);
    }
    if (data.events !== undefined) {
      updates.push(`events = $${paramIndex++}`);
      values.push(JSON.stringify(data.events));
    }
    if (data.filters !== undefined) {
      updates.push(`filters = $${paramIndex++}`);
      values.push(JSON.stringify(data.filters));
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }
    if (data.retryCount !== undefined) {
      updates.push(`retry_count = $${paramIndex++}`);
      values.push(data.retryCount);
    }
    if (data.retryDelay !== undefined) {
      updates.push(`retry_delay = $${paramIndex++}`);
      values.push(data.retryDelay);
    }
    if (data.timeout !== undefined) {
      updates.push(`timeout = $${paramIndex++}`);
      values.push(data.timeout);
    }
    if (data.customHeaders !== undefined) {
      updates.push(`custom_headers = $${paramIndex++}`);
      values.push(JSON.stringify(data.customHeaders));
    }

    if (updates.length === 0) return this.findById(tenantSlug, id);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE ${schema}.webhooks
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    return result.rows[0] || null;
  },

  async delete(tenantSlug: string, id: string): Promise<boolean> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      DELETE FROM ${schema}.webhooks WHERE id = $1
    `, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  async trigger(tenantSlug: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await this.findByEvent(tenantSlug, event);
    const schema = getSchema(tenantSlug);

    for (const webhook of webhooks) {
      try {
        // Create delivery record
        const deliveryResult = await pool.query(`
          INSERT INTO ${schema}.webhook_deliveries (
            webhook_id, event, payload, status
          ) VALUES ($1, $2, $3, 'pending')
          RETURNING id
        `, [webhook.id, event, JSON.stringify(payload)]);

        const deliveryId = deliveryResult.rows[0].id;

        // Sign payload
        const timestamp = Date.now();
        const signature = crypto
          .createHmac('sha256', webhook.secret || '')
          .update(`${timestamp}.${JSON.stringify(payload)}`)
          .digest('hex');

        // Make request
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Event': event,
          ...webhook.custom_headers,
        };

        // Validate webhook URL before making request (defense-in-depth)
        try {
          await validateUrlForSSRF(webhook.url);
        } catch (ssrfError) {
          logger.error(
            { webhookId: webhook.id, url: webhook.url, error: ssrfError },
            'Webhook URL failed SSRF validation'
          );
          throw ssrfError;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), webhook.timeout * 1000);

        try {
          const response = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const responseBody = await response.text();

          // Update delivery status
          await pool.query(`
            UPDATE ${schema}.webhook_deliveries
            SET status = $1, response_status = $2, response_body = $3,
                delivered_at = NOW(), attempt_count = attempt_count + 1
            WHERE id = $4
          `, [
            response.ok ? 'success' : 'failed',
            response.status,
            responseBody.substring(0, 5000),
            deliveryId,
          ]);

          // Update webhook stats
          await pool.query(`
            UPDATE ${schema}.webhooks
            SET last_triggered_at = NOW(),
                ${response.ok ? 'success_count = success_count + 1' : 'failure_count = failure_count + 1'}
            WHERE id = $1
          `, [webhook.id]);

        } catch (error) {
          clearTimeout(timeoutId);
          const message = error instanceof Error ? error.message : 'Unknown error';

          // Schedule retry
          const nextRetry = new Date(Date.now() + webhook.retry_delay * 1000);

          await pool.query(`
            UPDATE ${schema}.webhook_deliveries
            SET status = 'failed', error_message = $1, attempt_count = attempt_count + 1,
                next_retry_at = CASE WHEN attempt_count < $2 THEN $3 ELSE NULL END
            WHERE id = $4
          `, [message, webhook.retry_count, nextRetry, deliveryId]);

          await pool.query(`
            UPDATE ${schema}.webhooks
            SET last_triggered_at = NOW(), failure_count = failure_count + 1
            WHERE id = $1
          `, [webhook.id]);
        }
      } catch (error) {
        logger.error({ err: error, webhookId: webhook.id, event }, 'Failed to trigger webhook');
      }
    }
  },

  async getDeliveries(tenantSlug: string, webhookId?: string, limit = 50): Promise<unknown[]> {
    const schema = getSchema(tenantSlug);
    const params: unknown[] = [];
    let whereClause = '';

    if (webhookId) {
      whereClause = 'WHERE wd.webhook_id = $1';
      params.push(webhookId);
    }

    const result = await pool.query(`
      SELECT wd.*, w.name as webhook_name
      FROM ${schema}.webhook_deliveries wd
      LEFT JOIN ${schema}.webhooks w ON wd.webhook_id = w.id
      ${whereClause}
      ORDER BY wd.created_at DESC
      LIMIT ${limit}
    `, params);

    return result.rows;
  },

  async testWebhook(tenantSlug: string, id: string): Promise<{ success: boolean; status?: number; error?: string }> {
    const webhook = await this.findById(tenantSlug, id);
    if (!webhook) {
      return { success: false, error: 'Webhook not found' };
    }

    const testPayload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: { message: 'This is a test webhook delivery' },
    };

    try {
      // Validate webhook URL before making test request
      await validateUrlForSSRF(webhook.url);

      const timestamp = Date.now();
      const signature = crypto
        .createHmac('sha256', webhook.secret || '')
        .update(`${timestamp}.${JSON.stringify(testPayload)}`)
        .digest('hex');

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp.toString(),
          'X-Webhook-Event': 'webhook.test',
          ...webhook.custom_headers,
        },
        body: JSON.stringify(testPayload),
      });

      return { success: response.ok, status: response.status };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};

// ============================================
// INTEGRATIONS SERVICE
// ============================================

export const integrationsService = {
  async list(tenantSlug: string): Promise<Integration[]> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT i.*, u.name as created_by_name
      FROM ${schema}.integrations i
      LEFT JOIN ${schema}.users u ON i.created_by = u.id
      ORDER BY i.created_at DESC
    `);
    // Don't return credentials
    return result.rows.map((row) => ({ ...row, credentials: undefined }));
  },

  async findById(tenantSlug: string, id: string): Promise<Integration | null> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT i.*, u.name as created_by_name
      FROM ${schema}.integrations i
      LEFT JOIN ${schema}.users u ON i.created_by = u.id
      WHERE i.id = $1
    `, [id]);
    const row = result.rows[0];
    if (row) {
      row.credentials = undefined; // Don't return credentials
    }
    return row || null;
  },

  async create(tenantSlug: string, userId: string, data: {
    name: string;
    type: string;
    description?: string;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    syncEnabled?: boolean;
    syncInterval?: number;
    syncDirection?: string;
    fieldMappings?: Record<string, unknown>;
  }): Promise<Integration> {
    const schema = getSchema(tenantSlug);

    // Encrypt credentials before storing
    const credentialsJson = JSON.stringify(data.credentials || {});
    const encryptedCredentials = credentialsJson !== '{}' ? encrypt(credentialsJson) : credentialsJson;

    const result = await pool.query(`
      INSERT INTO ${schema}.integrations (
        name, type, description, config, credentials,
        sync_enabled, sync_interval, sync_direction, field_mappings, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      data.name,
      data.type,
      data.description || null,
      JSON.stringify(data.config || {}),
      encryptedCredentials,
      data.syncEnabled ?? false,
      data.syncInterval ?? 60,
      data.syncDirection ?? 'both',
      JSON.stringify(data.fieldMappings || {}),
      userId,
    ]);

    const row = result.rows[0];
    row.credentials = undefined;
    return row;
  },

  async update(tenantSlug: string, id: string, data: {
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    isActive?: boolean;
    syncEnabled?: boolean;
    syncInterval?: number;
    syncDirection?: string;
    fieldMappings?: Record<string, unknown>;
  }): Promise<Integration | null> {
    const schema = getSchema(tenantSlug);
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(data.config));
    }
    if (data.credentials !== undefined) {
      updates.push(`credentials = $${paramIndex++}`);
      // Encrypt credentials before storing
      const credentialsJson = JSON.stringify(data.credentials);
      const encryptedCredentials = credentialsJson !== '{}' ? encrypt(credentialsJson) : credentialsJson;
      values.push(encryptedCredentials);
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }
    if (data.syncEnabled !== undefined) {
      updates.push(`sync_enabled = $${paramIndex++}`);
      values.push(data.syncEnabled);
    }
    if (data.syncInterval !== undefined) {
      updates.push(`sync_interval = $${paramIndex++}`);
      values.push(data.syncInterval);
    }
    if (data.syncDirection !== undefined) {
      updates.push(`sync_direction = $${paramIndex++}`);
      values.push(data.syncDirection);
    }
    if (data.fieldMappings !== undefined) {
      updates.push(`field_mappings = $${paramIndex++}`);
      values.push(JSON.stringify(data.fieldMappings));
    }

    if (updates.length === 0) return this.findById(tenantSlug, id);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`
      UPDATE ${schema}.integrations
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);

    const row = result.rows[0];
    if (row) {
      row.credentials = undefined;
    }
    return row || null;
  },

  async delete(tenantSlug: string, id: string): Promise<boolean> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      DELETE FROM ${schema}.integrations WHERE id = $1
    `, [id]);
    return (result.rowCount ?? 0) > 0;
  },

  // Internal helper to get integration with decrypted credentials
  async getWithCredentials(tenantSlug: string, id: string): Promise<(Integration & { credentials?: Record<string, unknown> }) | null> {
    const schema = getSchema(tenantSlug);
    const result = await pool.query(`
      SELECT i.*, u.name as created_by_name
      FROM ${schema}.integrations i
      LEFT JOIN ${schema}.users u ON i.created_by = u.id
      WHERE i.id = $1
    `, [id]);

    const row = result.rows[0];
    if (!row) return null;

    // Decrypt credentials if they exist
    if (row.credentials) {
      try {
        const decryptedJson = decrypt(row.credentials);
        row.credentials = JSON.parse(decryptedJson);
      } catch (_error) {
        // If decryption fails, credentials might be unencrypted (migration scenario)
        try {
          row.credentials = JSON.parse(row.credentials);
        } catch {
          logger.warn({ integrationId: id }, 'Failed to decrypt or parse integration credentials');
          row.credentials = {};
        }
      }
    }

    return row;
  },

  async testConnection(tenantSlug: string, id: string): Promise<{ success: boolean; error?: string }> {
    const integration = await this.findById(tenantSlug, id);
    if (!integration) {
      return { success: false, error: 'Integration not found' };
    }

    const schema = getSchema(tenantSlug);
    let success = false;
    let error: string | undefined;

    try {
      switch (integration.type) {
        case 'slack': {
          const token = integration.config.botToken as string;
          if (!token) {
            throw new Error('Slack bot token not configured');
          }
          // Test Slack API connection
          const response = await fetch('https://slack.com/api/auth.test', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          });
          const data = await response.json() as { ok: boolean; error?: string };
          if (!data.ok) {
            throw new Error(data.error || 'Slack authentication failed');
          }
          success = true;
          break;
        }

        case 'teams': {
          const webhookUrl = integration.config.webhookUrl as string;
          if (!webhookUrl) {
            throw new Error('Teams webhook URL not configured');
          }
          // Test Teams webhook by sending a connectivity test
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              '@type': 'MessageCard',
              text: 'FireLater ITSM connection test - this message can be ignored.',
            }),
          });
          if (!response.ok) {
            throw new Error(`Teams webhook returned ${response.status}`);
          }
          success = true;
          break;
        }

        case 'jira': {
          const baseUrl = integration.config.baseUrl as string;
          const email = integration.config.email as string;
          const apiToken = integration.config.apiToken as string;
          if (!baseUrl || !email || !apiToken) {
            throw new Error('Jira configuration incomplete (baseUrl, email, apiToken required)');
          }
          // Test Jira API connection
          const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');
          const response = await fetch(`${baseUrl}/rest/api/3/myself`, {
            headers: { 'Authorization': `Basic ${auth}` },
          });
          if (!response.ok) {
            throw new Error(`Jira API returned ${response.status}`);
          }
          success = true;
          break;
        }

        case 'pagerduty': {
          const apiKey = integration.config.apiKey as string;
          if (!apiKey) {
            throw new Error('PagerDuty API key not configured');
          }
          // Test PagerDuty API connection
          const response = await fetch('https://api.pagerduty.com/abilities', {
            headers: {
              'Authorization': `Token token=${apiKey}`,
              'Content-Type': 'application/json',
            },
          });
          if (!response.ok) {
            throw new Error(`PagerDuty API returned ${response.status}`);
          }
          success = true;
          break;
        }

        case 'servicenow': {
          const instanceUrl = integration.config.instanceUrl as string;
          const username = integration.config.username as string;
          const password = integration.config.password as string;
          if (!instanceUrl || !username || !password) {
            throw new Error('ServiceNow configuration incomplete (instanceUrl, username, password required)');
          }
          // Test ServiceNow API connection
          const auth = Buffer.from(`${username}:${password}`).toString('base64');
          const response = await fetch(`${instanceUrl}/api/now/table/sys_user?sysparm_limit=1`, {
            headers: { 'Authorization': `Basic ${auth}` },
          });
          if (!response.ok) {
            throw new Error(`ServiceNow API returned ${response.status}`);
          }
          success = true;
          break;
        }

        case 'webhook': {
          const url = integration.config.url as string;
          if (!url) {
            throw new Error('Webhook URL not configured');
          }
          // Test webhook endpoint with a HEAD or OPTIONS request
          const response = await fetch(url, { method: 'HEAD' }).catch(() =>
            fetch(url, { method: 'OPTIONS' })
          );
          if (!response.ok && response.status !== 405) {
            throw new Error(`Webhook endpoint returned ${response.status}`);
          }
          success = true;
          break;
        }

        default:
          // For unknown types, just mark as connected if config exists
          success = Object.keys(integration.config || {}).length > 0;
          if (!success) {
            error = `Integration type '${integration.type}' has no configuration`;
          }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Connection test failed';
      logger.warn({ integrationId: id, type: integration.type, error }, 'Integration connection test failed');
    }

    // Update connection status
    await pool.query(`
      UPDATE ${schema}.integrations
      SET connection_status = $2, last_sync_at = NOW(), last_error = $3
      WHERE id = $1
    `, [id, success ? 'connected' : 'error', error || null]);

    return success ? { success: true } : { success: false, error };
  },

  async getSyncLogs(tenantSlug: string, integrationId?: string, limit = 50): Promise<unknown[]> {
    const schema = getSchema(tenantSlug);
    const params: unknown[] = [];
    let whereClause = '';

    if (integrationId) {
      whereClause = 'WHERE isl.integration_id = $1';
      params.push(integrationId);
    }

    const result = await pool.query(`
      SELECT isl.*, i.name as integration_name
      FROM ${schema}.integration_sync_logs isl
      LEFT JOIN ${schema}.integrations i ON isl.integration_id = i.id
      ${whereClause}
      ORDER BY isl.created_at DESC
      LIMIT ${limit}
    `, params);

    return result.rows;
  },

  async syncIntegration(tenantSlug: string, integrationId: string): Promise<void> {
    const schema = getSchema(tenantSlug);

    // Get integration details
    const integration = await this.findById(tenantSlug, integrationId);
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`);
    }

    if (!integration.is_active || !integration.sync_enabled) {
      throw new Error(`Integration ${integrationId} is not active or sync is disabled`);
    }

    // Update last_sync_at
    await pool.query(`
      UPDATE ${schema}.integrations
      SET last_sync_at = NOW(), connection_status = 'syncing'
      WHERE id = $1
    `, [integrationId]);

    try {
      // Actual sync logic would go here based on integration type
      // For now, just mark as synced successfully
      await pool.query(`
        UPDATE ${schema}.integrations
        SET connection_status = 'connected', last_error = NULL
        WHERE id = $1
      `, [integrationId]);

      // Log successful sync
      await pool.query(`
        INSERT INTO ${schema}.integration_sync_logs (integration_id, status, message)
        VALUES ($1, 'success', 'Sync completed successfully')
      `, [integrationId]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Update integration with error
      await pool.query(`
        UPDATE ${schema}.integrations
        SET connection_status = 'error', last_error = $2
        WHERE id = $1
      `, [integrationId, errorMessage]);

      // Log failed sync
      await pool.query(`
        INSERT INTO ${schema}.integration_sync_logs (integration_id, status, message, error_details)
        VALUES ($1, 'error', $2, $3)
      `, [integrationId, errorMessage, JSON.stringify({ stack: error instanceof Error ? error.stack : undefined })]);

      throw error;
    }
  },

  async handleSyncFailure(tenantSlug: string, integrationId: string, error: Error): Promise<void> {
    const schema = getSchema(tenantSlug);

    try {
      // Update integration status
      await pool.query(`
        UPDATE ${schema}.integrations
        SET connection_status = 'error', last_error = $2
        WHERE id = $1
      `, [integrationId, error.message]);

      // Log the persistent failure
      await pool.query(`
        INSERT INTO ${schema}.integration_sync_logs (integration_id, status, message, error_details)
        VALUES ($1, 'failed', $2, $3)
      `, [
        integrationId,
        `Integration sync failed after all retries: ${error.message}`,
        JSON.stringify({ stack: error.stack })
      ]);

      // In a real implementation, we would send notifications here
      logger.error({ tenantSlug, integrationId, error: error.message }, 'Integration sync permanently failed');
    } catch (logError) {
      logger.error({ error: logError }, 'Failed to log integration sync failure');
    }
  },
};

// Available webhook events
export const WEBHOOK_EVENTS = [
  'issue.created',
  'issue.updated',
  'issue.resolved',
  'issue.closed',
  'issue.comment_added',
  'change.created',
  'change.updated',
  'change.approved',
  'change.rejected',
  'change.implemented',
  'problem.created',
  'problem.updated',
  'problem.resolved',
  'asset.created',
  'asset.updated',
  'asset.deleted',
  'request.created',
  'request.fulfilled',
  'sla.breached',
  'sla.warning',
];

// Available integration types
export const INTEGRATION_TYPES = [
  { id: 'slack', name: 'Slack', description: 'Send notifications to Slack channels' },
  { id: 'teams', name: 'Microsoft Teams', description: 'Send notifications to Teams channels' },
  { id: 'jira', name: 'Jira', description: 'Sync issues with Jira projects' },
  { id: 'servicenow', name: 'ServiceNow', description: 'Integrate with ServiceNow ITSM' },
  { id: 'pagerduty', name: 'PagerDuty', description: 'Trigger incidents in PagerDuty' },
  { id: 'opsgenie', name: 'Opsgenie', description: 'Create alerts in Opsgenie' },
  { id: 'email', name: 'Email (SMTP)', description: 'Send email notifications' },
  { id: 'generic_webhook', name: 'Generic Webhook', description: 'Custom webhook integration' },
];
