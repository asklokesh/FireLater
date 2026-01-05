import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { cacheService } from '../utils/cache.js';
import type { PaginationParams, ApplicationTier, ApplicationStatus, LifecycleStage, Criticality } from '../types/index.js';
import { getOffset } from '../utils/pagination.js';

interface CreateApplicationParams {
  name: string;
  description?: string;
  tier: ApplicationTier;
  status?: ApplicationStatus;
  lifecycleStage?: LifecycleStage;
  ownerUserId?: string;
  ownerGroupId?: string;
  supportGroupId?: string;
  businessUnit?: string;
  criticality?: Criticality;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface UpdateApplicationParams {
  name?: string;
  description?: string;
  tier?: ApplicationTier;
  status?: ApplicationStatus;
  lifecycleStage?: LifecycleStage;
  ownerUserId?: string | null;
  ownerGroupId?: string | null;
  supportGroupId?: string | null;
  businessUnit?: string;
  criticality?: Criticality;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface Application {
  id: string;
  app_id: string;
  name: string;
  description: string | null;
  tier: ApplicationTier;
  status: ApplicationStatus;
  lifecycle_stage: LifecycleStage;
  owner_user_id: string | null;
  owner_group_id: string | null;
  support_group_id: string | null;
  business_unit: string | null;
  criticality: Criticality | null;
  tags: string[] | null;
  metadata: Record<string, unknown>;
  health_score: number | null;
  health_score_updated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CreateEnvironmentParams {
  name: string;
  type: string;
  url?: string;
  cloudProvider?: string;
  cloudAccount?: string;
  cloudRegion?: string;
  resourceIds?: string[];
  metadata?: Record<string, unknown>;
}

export class ApplicationService {
  async list(tenantSlug: string, params: PaginationParams, filters?: {
    tier?: string;
    status?: string;
    search?: string;
    ownerId?: string;
    supportGroupId?: string;
  }): Promise<{ applications: Application[]; total: number }> {
    const cacheKey = `${tenantSlug}:applications:list:${JSON.stringify({ params, filters })}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);
        const offset = getOffset(params);

        let whereClause = 'WHERE 1=1';
        const values: unknown[] = [];
        let paramIndex = 1;

        if (filters?.tier) {
          whereClause += ` AND a.tier = $${paramIndex++}`;
          values.push(filters.tier);
        }
        if (filters?.status) {
          whereClause += ` AND a.status = $${paramIndex++}`;
          values.push(filters.status);
        }
        if (filters?.ownerId) {
          whereClause += ` AND (a.owner_user_id = $${paramIndex} OR a.owner_group_id = $${paramIndex})`;
          values.push(filters.ownerId);
          paramIndex++;
        }
        if (filters?.supportGroupId) {
          whereClause += ` AND a.support_group_id = $${paramIndex++}`;
          values.push(filters.supportGroupId);
        }
        if (filters?.search) {
          whereClause += ` AND (a.name ILIKE $${paramIndex} OR a.app_id ILIKE $${paramIndex} OR a.description ILIKE $${paramIndex})`;
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        // Validate sort column against allowed columns to prevent SQL injection
        const allowedSortColumns = ['name', 'app_id', 'tier', 'status', 'created_at', 'updated_at', 'health_score'];
        const sortColumn = allowedSortColumns.includes(params.sort || '') ? params.sort : 'name';
        const sortOrder = params.order === 'desc' ? 'desc' : 'asc';

        const countResult = await pool.query(
          `SELECT COUNT(*) FROM ${schema}.applications a ${whereClause}`,
          values
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await pool.query(
          `SELECT a.*,
                  ou.name as owner_user_name,
                  og.name as owner_group_name,
                  sg.name as support_group_name,
                  (SELECT COUNT(*) FROM ${schema}.environments WHERE application_id = a.id) as environment_count
           FROM ${schema}.applications a
           LEFT JOIN ${schema}.users ou ON a.owner_user_id = ou.id
           LEFT JOIN ${schema}.groups og ON a.owner_group_id = og.id
           LEFT JOIN ${schema}.groups sg ON a.support_group_id = sg.id
           ${whereClause}
           ORDER BY a.${sortColumn} ${sortOrder}
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, params.perPage, offset]
        );

        return { applications: result.rows, total };
      },
      { ttl: 600 } // 10 minutes - CMDB data accessed frequently, changes moderately
    );
  }

  async findById(tenantSlug: string, appId: string): Promise<Application | null> {
    const cacheKey = `${tenantSlug}:applications:app:${appId}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        // Check if it's a UUID or app_id format
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(appId);
        const whereClause = isUuid ? 'WHERE a.id = $1' : 'WHERE a.app_id = $1';

        const result = await pool.query(
          `SELECT a.*,
                  ou.name as owner_user_name, ou.email as owner_user_email,
                  og.name as owner_group_name,
                  sg.name as support_group_name
           FROM ${schema}.applications a
           LEFT JOIN ${schema}.users ou ON a.owner_user_id = ou.id
           LEFT JOIN ${schema}.groups og ON a.owner_group_id = og.id
           LEFT JOIN ${schema}.groups sg ON a.support_group_id = sg.id
           ${whereClause}`,
          [appId]
        );

        return result.rows[0] || null;
      },
      { ttl: 600 } // 10 minutes - individual app lookups for CMDB detail pages
    );
  }

  async create(tenantSlug: string, params: CreateApplicationParams, createdBy: string): Promise<Application> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Generate app_id using the next_id function
    const appIdResult = await pool.query(
      `SELECT ${schema}.next_id('application') as app_id`
    );
    const appId = appIdResult.rows[0].app_id;

    const result = await pool.query(
      `INSERT INTO ${schema}.applications
       (app_id, name, description, tier, status, lifecycle_stage, owner_user_id, owner_group_id,
        support_group_id, business_unit, criticality, tags, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        appId,
        params.name,
        params.description || null,
        params.tier,
        params.status || 'active',
        params.lifecycleStage || 'production',
        params.ownerUserId || null,
        params.ownerGroupId || null,
        params.supportGroupId || null,
        params.businessUnit || null,
        params.criticality || null,
        params.tags || null,
        JSON.stringify(params.metadata || {}),
      ]
    );

    const app = result.rows[0];

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'create', 'application', $2, $3)`,
      [createdBy, app.id, JSON.stringify({ name: params.name, appId })]
    );

    // Invalidate application cache
    await cacheService.invalidateTenant(tenantSlug, 'applications');

    logger.info({ applicationId: app.id, appId }, 'Application created');
    return this.findById(tenantSlug, app.id) as Promise<Application>;
  }

  async update(tenantSlug: string, appId: string, params: UpdateApplicationParams, updatedBy: string): Promise<Application> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, appId);
    if (!existing) {
      throw new NotFoundError('Application', appId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(params.description);
    }
    if (params.tier !== undefined) {
      updates.push(`tier = $${paramIndex++}`);
      values.push(params.tier);
    }
    if (params.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.lifecycleStage !== undefined) {
      updates.push(`lifecycle_stage = $${paramIndex++}`);
      values.push(params.lifecycleStage);
    }
    if (params.ownerUserId !== undefined) {
      updates.push(`owner_user_id = $${paramIndex++}`);
      values.push(params.ownerUserId);
    }
    if (params.ownerGroupId !== undefined) {
      updates.push(`owner_group_id = $${paramIndex++}`);
      values.push(params.ownerGroupId);
    }
    if (params.supportGroupId !== undefined) {
      updates.push(`support_group_id = $${paramIndex++}`);
      values.push(params.supportGroupId);
    }
    if (params.businessUnit !== undefined) {
      updates.push(`business_unit = $${paramIndex++}`);
      values.push(params.businessUnit);
    }
    if (params.criticality !== undefined) {
      updates.push(`criticality = $${paramIndex++}`);
      values.push(params.criticality);
    }
    if (params.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(params.tags);
    }
    if (params.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push(`updated_at = NOW()`);
    values.push(existing.id);

    await pool.query(
      `UPDATE ${schema}.applications SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id, changes)
       VALUES ($1, 'update', 'application', $2, $3)`,
      [updatedBy, existing.id, JSON.stringify(params)]
    );

    // Invalidate application cache
    await cacheService.invalidateTenant(tenantSlug, 'applications');

    logger.info({ applicationId: existing.id }, 'Application updated');
    return this.findById(tenantSlug, existing.id) as Promise<Application>;
  }

  async delete(tenantSlug: string, appId: string, deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.findById(tenantSlug, appId);
    if (!existing) {
      throw new NotFoundError('Application', appId);
    }

    // Soft delete
    await pool.query(
      `UPDATE ${schema}.applications SET status = 'deprecated', updated_at = NOW() WHERE id = $1`,
      [existing.id]
    );

    // Log audit
    await pool.query(
      `INSERT INTO ${schema}.audit_logs (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'application', $2)`,
      [deletedBy, existing.id]
    );

    // Invalidate application cache
    await cacheService.invalidateTenant(tenantSlug, 'applications');

    logger.info({ applicationId: existing.id }, 'Application deleted');
  }

  // Environment methods
  async listEnvironments(tenantSlug: string, appId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const app = await this.findById(tenantSlug, appId);
    if (!app) {
      throw new NotFoundError('Application', appId);
    }

    const result = await pool.query(
      `SELECT * FROM ${schema}.environments WHERE application_id = $1 ORDER BY type`,
      [app.id]
    );

    return result.rows;
  }

  async createEnvironment(tenantSlug: string, appId: string, params: CreateEnvironmentParams, _createdBy: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const app = await this.findById(tenantSlug, appId);
    if (!app) {
      throw new NotFoundError('Application', appId);
    }

    // Check for duplicate environment name
    const existing = await pool.query(
      `SELECT id FROM ${schema}.environments WHERE application_id = $1 AND name = $2`,
      [app.id, params.name]
    );

    if (existing.rows.length > 0) {
      throw new ConflictError(`Environment '${params.name}' already exists for this application`);
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.environments
       (application_id, name, type, url, cloud_provider, cloud_account, cloud_region, resource_ids, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        app.id,
        params.name,
        params.type,
        params.url || null,
        params.cloudProvider || null,
        params.cloudAccount || null,
        params.cloudRegion || null,
        JSON.stringify(params.resourceIds || []),
        JSON.stringify(params.metadata || {}),
      ]
    );

    // Invalidate application cache (environment_count changes)
    await cacheService.invalidateTenant(tenantSlug, 'applications');

    logger.info({ applicationId: app.id, environmentId: result.rows[0].id }, 'Environment created');
    return result.rows[0];
  }

  async updateEnvironment(tenantSlug: string, appId: string, envId: string, params: Partial<CreateEnvironmentParams>, _updatedBy: string): Promise<unknown> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const app = await this.findById(tenantSlug, appId);
    if (!app) {
      throw new NotFoundError('Application', appId);
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(params.name);
    }
    if (params.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(params.type);
    }
    if (params.url !== undefined) {
      updates.push(`url = $${paramIndex++}`);
      values.push(params.url);
    }
    if (params.cloudProvider !== undefined) {
      updates.push(`cloud_provider = $${paramIndex++}`);
      values.push(params.cloudProvider);
    }
    if (params.cloudAccount !== undefined) {
      updates.push(`cloud_account = $${paramIndex++}`);
      values.push(params.cloudAccount);
    }
    if (params.cloudRegion !== undefined) {
      updates.push(`cloud_region = $${paramIndex++}`);
      values.push(params.cloudRegion);
    }
    if (params.resourceIds !== undefined) {
      updates.push(`resource_ids = $${paramIndex++}`);
      values.push(JSON.stringify(params.resourceIds));
    }
    if (params.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(params.metadata));
    }

    if (updates.length === 0) {
      const existing = await pool.query(
        `SELECT * FROM ${schema}.environments WHERE id = $1 AND application_id = $2`,
        [envId, app.id]
      );
      return existing.rows[0];
    }

    updates.push(`updated_at = NOW()`);
    values.push(envId, app.id);

    const result = await pool.query(
      `UPDATE ${schema}.environments SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND application_id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Environment', envId);
    }

    logger.info({ applicationId: app.id, environmentId: envId }, 'Environment updated');
    return result.rows[0];
  }

  async deleteEnvironment(tenantSlug: string, appId: string, envId: string, _deletedBy: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const app = await this.findById(tenantSlug, appId);
    if (!app) {
      throw new NotFoundError('Application', appId);
    }

    const result = await pool.query(
      `DELETE FROM ${schema}.environments WHERE id = $1 AND application_id = $2`,
      [envId, app.id]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Environment', envId);
    }

    // Invalidate application cache (environment_count changes)
    await cacheService.invalidateTenant(tenantSlug, 'applications');

    logger.info({ applicationId: app.id, environmentId: envId }, 'Environment deleted');
  }

  async getHealthScore(tenantSlug: string, appId: string): Promise<unknown> {
    const _schema = tenantService.getSchemaName(tenantSlug);

    const app = await this.findById(tenantSlug, appId);
    if (!app) {
      throw new NotFoundError('Application', appId);
    }

    return {
      applicationId: app.id,
      appId: app.app_id,
      name: app.name,
      tier: app.tier,
      healthScore: app.health_score,
      healthScoreUpdatedAt: app.health_score_updated_at,
      status: app.health_score === null ? 'not_calculated' :
              app.health_score >= 90 ? 'excellent' :
              app.health_score >= 75 ? 'good' :
              app.health_score >= 50 ? 'warning' : 'critical',
    };
  }
}

export const applicationService = new ApplicationService();
