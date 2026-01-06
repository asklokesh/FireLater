import { EC2Client, DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { ClientSecretCredential } from '@azure/identity';
import { ResourceManagementClient } from '@azure/arm-resources';
import { InstancesClient } from '@google-cloud/compute';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { getOffset } from '../utils/pagination.js';
import { encryptCredentials, decryptCredentials } from '../jobs/processors/cloudSync.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../utils/cache.js';
import type { PaginationParams } from '../types/index.js';

// ============================================
// CLOUD ACCOUNT SERVICE
// ============================================

interface CloudAccountData {
  provider: string;
  accountId: string;
  name: string;
  description?: string;
  credentialType: string;
  credentials?: Record<string, unknown>;
  roleArn?: string;
  externalId?: string;
  syncEnabled?: boolean;
  syncInterval?: number;
  syncResources?: boolean;
  syncCosts?: boolean;
  syncMetrics?: boolean;
  regions?: string[];
}

class CloudAccountService {
  /**
   * List cloud accounts
   * Caches results for 10 minutes - cloud accounts are admin-configured
   */
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: { provider?: string; status?: string }
  ): Promise<{ accounts: unknown[]; total: number }> {
    const cacheKey = `${tenantSlug}:cloud:accounts:list:${JSON.stringify({ pagination, filters })}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(pagination);

        let whereClause = '';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (filters?.provider) {
          whereClause += ` AND provider = $${paramIndex++}`;
          values.push(filters.provider);
        }
        if (filters?.status) {
          whereClause += ` AND status = $${paramIndex++}`;
          values.push(filters.status);
        }

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.cloud_accounts WHERE 1=1 ${whereClause}`,
          values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        values.push(pagination.perPage, offset);
        const result = await pool.query(
          `SELECT * FROM ${schema}.cloud_accounts
           WHERE 1=1 ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          values
        );

        return { accounts: result.rows, total };
      },
      { ttl: 600 } // 10 minutes - cloud accounts rarely change
    );
  }

  /**
   * Find cloud account by ID
   * Caches results for 10 minutes
   */
  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const cacheKey = `${tenantSlug}:cloud:account:${id}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const result = await pool.query(
          `SELECT * FROM ${schema}.cloud_accounts WHERE id = $1`,
          [id]
        );
        return result.rows[0] || null;
      },
      { ttl: 600 } // 10 minutes
    );
  }

  async create(tenantSlug: string, data: CloudAccountData): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Check for duplicate
    const existing = await pool.query(
      `SELECT id FROM ${schema}.cloud_accounts WHERE provider = $1 AND account_id = $2`,
      [data.provider, data.accountId]
    );

    if (existing.rows.length > 0) {
      throw new BadRequestError(`Cloud account ${data.provider}:${data.accountId} already exists`);
    }

    // Encrypt credentials before storing
    const encryptedCredentials = data.credentials
      ? encryptCredentials(data.credentials)
      : '';

    const result = await pool.query(
      `INSERT INTO ${schema}.cloud_accounts (
        provider, account_id, name, description,
        credential_type, credentials_encrypted, role_arn, external_id,
        sync_enabled, sync_interval, sync_resources, sync_costs, sync_metrics,
        regions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        data.provider,
        data.accountId,
        data.name,
        data.description || null,
        data.credentialType,
        encryptedCredentials,
        data.roleArn || null,
        data.externalId || null,
        data.syncEnabled ?? true,
        data.syncInterval ?? 3600,
        data.syncResources ?? true,
        data.syncCosts ?? true,
        data.syncMetrics ?? false,
        data.regions || null,
      ]
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cloud');

    // Remove encrypted credentials from response
    const account = result.rows[0];
    delete account.credentials_encrypted;
    return account;
  }

  async update(
    tenantSlug: string,
    id: string,
    data: Partial<CloudAccountData>
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Cloud account', id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      credentialType: 'credential_type',
      credentials: 'credentials',
      roleArn: 'role_arn',
      externalId: 'external_id',
      syncEnabled: 'sync_enabled',
      syncInterval: 'sync_interval',
      syncResources: 'sync_resources',
      syncCosts: 'sync_costs',
      syncMetrics: 'sync_metrics',
      regions: 'regions',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key as keyof typeof data] !== undefined) {
        fields.push(`${column} = $${paramIndex++}`);
        const value = data[key as keyof typeof data];
        // Encrypt credentials before storing
        if (key === 'credentials') {
          values.push(encryptCredentials(value as Record<string, unknown>));
        } else {
          values.push(value);
        }
      }
    }

    if (fields.length === 0) {
      return existing;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.cloud_accounts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cloud');

    return result.rows[0];
  }

  async delete(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Cloud account', id);
    }

    await pool.query(`DELETE FROM ${schema}.cloud_accounts WHERE id = $1`, [id]);

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cloud');
  }

  async updateSyncStatus(
    tenantSlug: string,
    id: string,
    status: string,
    error?: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `UPDATE ${schema}.cloud_accounts
       SET last_sync_at = NOW(),
           last_sync_status = $2,
           last_sync_error = $3,
           next_sync_at = NOW() + (sync_interval * INTERVAL '1 second'),
           updated_at = NOW()
       WHERE id = $1`,
      [id, status, error || null]
    );
  }

  async testConnection(tenantSlug: string, id: string): Promise<{ success: boolean; message: string }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get account with encrypted credentials
    const result = await pool.query(
      `SELECT * FROM ${schema}.cloud_accounts WHERE id = $1`,
      [id]
    );

    const account = result.rows[0];
    if (!account) {
      throw new NotFoundError('Cloud account', id);
    }

    try {
      // Decrypt credentials
      const credentials = await decryptCredentials(account.credentials_encrypted || '{}');

      switch (account.provider) {
        case 'aws': {
          const awsCreds = credentials as { accessKeyId?: string; secretAccessKey?: string; region?: string };
          if (!awsCreds.accessKeyId || !awsCreds.secretAccessKey) {
            return { success: false, message: 'AWS credentials not configured' };
          }

          const ec2Client = new EC2Client({
            region: awsCreds.region || 'us-east-1',
            credentials: {
              accessKeyId: awsCreds.accessKeyId,
              secretAccessKey: awsCreds.secretAccessKey,
            },
          });

          // Test by listing regions - a simple, read-only operation
          await ec2Client.send(new DescribeRegionsCommand({}));
          return { success: true, message: 'AWS connection successful' };
        }

        case 'azure': {
          const azureCreds = credentials as { tenantId?: string; clientId?: string; clientSecret?: string; subscriptionId?: string };
          if (!azureCreds.tenantId || !azureCreds.clientId || !azureCreds.clientSecret) {
            return { success: false, message: 'Azure credentials not configured (tenantId, clientId, clientSecret required)' };
          }
          if (!azureCreds.subscriptionId) {
            return { success: false, message: 'Azure subscriptionId is required' };
          }

          // Test Azure connection by listing resource groups
          const credential = new ClientSecretCredential(
            azureCreds.tenantId,
            azureCreds.clientId,
            azureCreds.clientSecret
          );
          const resourceClient = new ResourceManagementClient(credential, azureCreds.subscriptionId);
          // Try to list resource groups (a simple read operation)
          const groups = resourceClient.resourceGroups.list();
          await groups.next(); // Fetch at least one to test auth
          return { success: true, message: 'Azure connection successful' };
        }

        case 'gcp': {
          const gcpCreds = credentials as { projectId?: string; clientEmail?: string; privateKey?: string };
          if (!gcpCreds.projectId || !gcpCreds.clientEmail || !gcpCreds.privateKey) {
            return { success: false, message: 'GCP credentials not configured (projectId, clientEmail, privateKey required)' };
          }

          // Test GCP connection by listing zones
          const instancesClient = new InstancesClient({
            projectId: gcpCreds.projectId,
            credentials: {
              client_email: gcpCreds.clientEmail,
              private_key: gcpCreds.privateKey.replace(/\\n/g, '\n'),
            },
          });
          // Try to list instances (will return empty if none exist, but validates auth)
          const aggList = instancesClient.aggregatedListAsync({ project: gcpCreds.projectId, maxResults: 1 });
          // Iterate to fetch at least one result to test auth
          for await (const _item of aggList) {
            break; // Just need to test auth, not fetch all
          }
          return { success: true, message: 'GCP connection successful' };
        }

        default:
          return { success: false, message: `Unsupported provider: ${account.provider}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      logger.error({ error, accountId: id, provider: account.provider }, 'Cloud connection test failed');
      return { success: false, message };
    }
  }
}

// ============================================
// CLOUD RESOURCE SERVICE
// ============================================

interface CloudResourceData {
  cloudAccountId: string;
  resourceId: string;
  resourceType: string;
  name?: string;
  region?: string;
  availabilityZone?: string;
  status?: string;
  tags?: Record<string, string>;
  metadata?: Record<string, unknown>;
  configuration?: Record<string, unknown>;
  applicationId?: string;
  environmentId?: string;
}

class CloudResourceService {
  async list(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: {
      cloudAccountId?: string;
      resourceType?: string;
      applicationId?: string;
      environmentId?: string;
      region?: string;
      isDeleted?: boolean;
    }
  ): Promise<{ resources: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = '';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.cloudAccountId) {
      whereClause += ` AND r.cloud_account_id = $${paramIndex++}`;
      values.push(filters.cloudAccountId);
    }
    if (filters?.resourceType) {
      whereClause += ` AND r.resource_type = $${paramIndex++}`;
      values.push(filters.resourceType);
    }
    if (filters?.applicationId) {
      whereClause += ` AND r.application_id = $${paramIndex++}`;
      values.push(filters.applicationId);
    }
    if (filters?.environmentId) {
      whereClause += ` AND r.environment_id = $${paramIndex++}`;
      values.push(filters.environmentId);
    }
    if (filters?.region) {
      whereClause += ` AND r.region = $${paramIndex++}`;
      values.push(filters.region);
    }
    if (filters?.isDeleted !== undefined) {
      whereClause += ` AND r.is_deleted = $${paramIndex++}`;
      values.push(filters.isDeleted);
    } else {
      whereClause += ` AND r.is_deleted = false`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.cloud_resources r WHERE 1=1 ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    values.push(pagination.perPage, offset);
    const result = await pool.query(
      `SELECT r.*, ca.provider, ca.name as account_name, a.name as application_name
       FROM ${schema}.cloud_resources r
       LEFT JOIN ${schema}.cloud_accounts ca ON r.cloud_account_id = ca.id
       LEFT JOIN ${schema}.applications a ON r.application_id = a.id
       WHERE 1=1 ${whereClause}
       ORDER BY r.last_seen DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return { resources: result.rows, total };
  }

  async findById(tenantSlug: string, id: string): Promise<unknown | null> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT r.*, ca.provider, ca.name as account_name, a.name as application_name
       FROM ${schema}.cloud_resources r
       LEFT JOIN ${schema}.cloud_accounts ca ON r.cloud_account_id = ca.id
       LEFT JOIN ${schema}.applications a ON r.application_id = a.id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async upsert(tenantSlug: string, data: CloudResourceData): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.cloud_resources (
        cloud_account_id, resource_id, resource_type, name,
        region, availability_zone, status,
        tags, metadata, configuration,
        application_id, environment_id,
        last_seen
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (cloud_account_id, resource_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        region = EXCLUDED.region,
        availability_zone = EXCLUDED.availability_zone,
        status = EXCLUDED.status,
        tags = EXCLUDED.tags,
        metadata = EXCLUDED.metadata,
        configuration = EXCLUDED.configuration,
        last_seen = NOW(),
        is_deleted = false,
        deleted_at = NULL,
        updated_at = NOW()
      RETURNING *`,
      [
        data.cloudAccountId,
        data.resourceId,
        data.resourceType,
        data.name || null,
        data.region || null,
        data.availabilityZone || null,
        data.status || null,
        JSON.stringify(data.tags || {}),
        JSON.stringify(data.metadata || {}),
        JSON.stringify(data.configuration || {}),
        data.applicationId || null,
        data.environmentId || null,
      ]
    );

    return result.rows[0];
  }

  async mapToApplication(
    tenantSlug: string,
    id: string,
    applicationId: string,
    environmentId?: string
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Cloud resource', id);
    }

    const result = await pool.query(
      `UPDATE ${schema}.cloud_resources
       SET application_id = $2, environment_id = $3, auto_mapped = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, applicationId, environmentId || null]
    );

    return result.rows[0];
  }

  async unmapFromApplication(tenantSlug: string, id: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, id);
    if (!existing) {
      throw new NotFoundError('Cloud resource', id);
    }

    const result = await pool.query(
      `UPDATE ${schema}.cloud_resources
       SET application_id = NULL, environment_id = NULL, auto_mapped = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows[0];
  }

  async markDeleted(tenantSlug: string, cloudAccountId: string, resourceIds: string[]): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    await pool.query(
      `UPDATE ${schema}.cloud_resources
       SET is_deleted = true, deleted_at = NOW(), updated_at = NOW()
       WHERE cloud_account_id = $1 AND resource_id = ANY($2)`,
      [cloudAccountId, resourceIds]
    );
  }

  async getResourceTypes(tenantSlug: string): Promise<{ type: string; count: number }[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT resource_type as type, COUNT(*) as count
       FROM ${schema}.cloud_resources
       WHERE is_deleted = false
       GROUP BY resource_type
       ORDER BY count DESC`
    );

    return result.rows.map(row => ({
      type: row.type,
      count: parseInt(row.count, 10)
    }));
  }

  async getResourcesByApplication(
    tenantSlug: string,
    applicationId: string
  ): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT r.*, ca.provider, ca.name as account_name
       FROM ${schema}.cloud_resources r
       LEFT JOIN ${schema}.cloud_accounts ca ON r.cloud_account_id = ca.id
       WHERE r.application_id = $1 AND r.is_deleted = false
       ORDER BY r.resource_type, r.name`,
      [applicationId]
    );

    return result.rows;
  }
}

// ============================================
// CLOUD COST SERVICE
// ============================================

class CloudCostService {
  async getCostsByApplication(
    tenantSlug: string,
    applicationId: string,
    periodType: string = 'monthly'
  ): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT * FROM ${schema}.cloud_cost_reports
       WHERE application_id = $1 AND period_type = $2
       ORDER BY period_start DESC
       LIMIT 12`,
      [applicationId, periodType]
    );

    return result.rows;
  }

  async getCostSummary(
    tenantSlug: string,
    pagination: PaginationParams,
    filters?: { cloudAccountId?: string; periodType?: string }
  ): Promise<{ costs: unknown[]; total: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const offset = getOffset(pagination);

    let whereClause = '';
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters?.cloudAccountId) {
      whereClause += ` AND cloud_account_id = $${paramIndex++}`;
      values.push(filters.cloudAccountId);
    }
    if (filters?.periodType) {
      whereClause += ` AND period_type = $${paramIndex++}`;
      values.push(filters.periodType);
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${schema}.cloud_cost_reports WHERE 1=1 ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    values.push(pagination.perPage, offset);
    const result = await pool.query(
      `SELECT ccr.*, ca.provider, ca.name as account_name, a.name as application_name
       FROM ${schema}.cloud_cost_reports ccr
       LEFT JOIN ${schema}.cloud_accounts ca ON ccr.cloud_account_id = ca.id
       LEFT JOIN ${schema}.applications a ON ccr.application_id = a.id
       WHERE 1=1 ${whereClause}
       ORDER BY period_start DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return { costs: result.rows, total };
  }

  async recordCost(
    tenantSlug: string,
    data: {
      cloudAccountId: string;
      applicationId?: string;
      environmentId?: string;
      periodType: string;
      periodStart: Date;
      periodEnd: Date;
      totalCost: number;
      currency?: string;
      costByService?: Record<string, number>;
      costByRegion?: Record<string, number>;
      costByResourceType?: Record<string, number>;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get previous period cost for comparison
    const previousResult = await pool.query(
      `SELECT total_cost FROM ${schema}.cloud_cost_reports
       WHERE cloud_account_id = $1
       AND COALESCE(application_id::text, '') = COALESCE($2::text, '')
       AND period_type = $3
       AND period_start < $4
       ORDER BY period_start DESC
       LIMIT 1`,
      [data.cloudAccountId, data.applicationId || null, data.periodType, data.periodStart]
    );

    const previousCost = previousResult.rows[0]?.total_cost || null;
    const costChangePercent = previousCost
      ? ((data.totalCost - previousCost) / previousCost) * 100
      : null;

    const result = await pool.query(
      `INSERT INTO ${schema}.cloud_cost_reports (
        cloud_account_id, application_id, environment_id,
        period_type, period_start, period_end,
        total_cost, currency,
        cost_by_service, cost_by_region, cost_by_resource_type,
        previous_period_cost, cost_change_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (cloud_account_id, application_id, period_type, period_start)
      DO UPDATE SET
        total_cost = EXCLUDED.total_cost,
        cost_by_service = EXCLUDED.cost_by_service,
        cost_by_region = EXCLUDED.cost_by_region,
        cost_by_resource_type = EXCLUDED.cost_by_resource_type,
        previous_period_cost = EXCLUDED.previous_period_cost,
        cost_change_percent = EXCLUDED.cost_change_percent
      RETURNING *`,
      [
        data.cloudAccountId,
        data.applicationId || null,
        data.environmentId || null,
        data.periodType,
        data.periodStart,
        data.periodEnd,
        data.totalCost,
        data.currency || 'USD',
        JSON.stringify(data.costByService || {}),
        JSON.stringify(data.costByRegion || {}),
        JSON.stringify(data.costByResourceType || {}),
        previousCost,
        costChangePercent,
      ]
    );

    return result.rows[0];
  }
}

// ============================================
// CLOUD MAPPING RULES SERVICE
// ============================================

class CloudMappingRuleService {
  /**
   * List cloud mapping rules
   * Caches results for 15 minutes - rules are admin-configured and rarely change
   */
  async list(tenantSlug: string): Promise<unknown[]> {
    const cacheKey = `${tenantSlug}:cloud:mapping_rules:list`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const result = await pool.query(
          `SELECT cmr.*, a.name as application_name
           FROM ${schema}.cloud_resource_mapping_rules cmr
           LEFT JOIN ${schema}.applications a ON cmr.application_id = a.id
           ORDER BY priority ASC`
        );
        return result.rows;
      },
      { ttl: 900 } // 15 minutes - mapping rules rarely change
    );
  }

  async create(
    tenantSlug: string,
    data: {
      name: string;
      description?: string;
      priority?: number;
      provider?: string;
      resourceType?: string;
      tagKey: string;
      tagValuePattern?: string;
      applicationId: string;
      environmentType?: string;
    }
  ): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.cloud_resource_mapping_rules (
        name, description, priority,
        provider, resource_type, tag_key, tag_value_pattern,
        application_id, environment_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        data.name,
        data.description || null,
        data.priority || 100,
        data.provider || null,
        data.resourceType || null,
        data.tagKey,
        data.tagValuePattern || null,
        data.applicationId,
        data.environmentType || null,
      ]
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cloud');

    return result.rows[0];
  }

  async delete(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);
    await pool.query(
      `DELETE FROM ${schema}.cloud_resource_mapping_rules WHERE id = $1`,
      [id]
    );

    // Invalidate cache
    await cacheService.invalidateTenant(tenantSlug, 'cloud');
  }

  async applyRules(tenantSlug: string): Promise<{ mapped: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Get all active rules
    const rules = await pool.query(
      `SELECT * FROM ${schema}.cloud_resource_mapping_rules WHERE is_active = true ORDER BY priority ASC`
    );

    let mappedCount = 0;

    for (const rule of rules.rows) {
      // Build match conditions
      let whereClause = `WHERE r.application_id IS NULL AND r.is_deleted = false`;
      const values: unknown[] = [];
      let paramIndex = 1;

      if (rule.provider) {
        whereClause += ` AND ca.provider = $${paramIndex++}`;
        values.push(rule.provider);
      }
      if (rule.resource_type) {
        whereClause += ` AND r.resource_type = $${paramIndex++}`;
        values.push(rule.resource_type);
      }

      // Check tag match
      whereClause += ` AND r.tags->>'${rule.tag_key}' IS NOT NULL`;
      if (rule.tag_value_pattern) {
        whereClause += ` AND r.tags->>'${rule.tag_key}' ~ $${paramIndex++}`;
        values.push(rule.tag_value_pattern);
      }

      values.push(rule.application_id);

      const updateResult = await pool.query(
        `UPDATE ${schema}.cloud_resources r
         SET application_id = $${paramIndex}, auto_mapped = true, updated_at = NOW()
         FROM ${schema}.cloud_accounts ca
         ${whereClause}
         AND r.cloud_account_id = ca.id`,
        values
      );

      mappedCount += updateResult.rowCount || 0;
    }

    return { mapped: mappedCount };
  }
}

export const cloudAccountService = new CloudAccountService();
export const cloudResourceService = new CloudResourceService();
export const cloudCostService = new CloudCostService();
export const cloudMappingRuleService = new CloudMappingRuleService();
