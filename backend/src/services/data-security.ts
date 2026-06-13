import { pool } from '../config/database.js';
import { cacheService } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { tenantService } from './tenant.js';

export interface DataSecuritySettings {
  id: string;
  data_residency_region: string;
  encryption_key_id: string | null;
  pii_masking_enabled: boolean;
  pci_tokenization_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateDataSecuritySettingsParams {
  data_residency_region?: string;
  encryption_key_id?: string | null;
  pii_masking_enabled?: boolean;
  pci_tokenization_enabled?: boolean;
}

export interface FieldClassification {
  id: string;
  table_name: string;
  field_name: string;
  classification: 'PII' | 'PCI' | 'NPI' | 'SENSITIVE';
  masking_strategy: 'full' | 'partial' | 'tokenize' | 'hash';
  unmask_permission: string;
  created_at: Date;
}

export interface AddClassificationParams {
  table_name: string;
  field_name: string;
  classification: 'PII' | 'PCI' | 'NPI' | 'SENSITIVE';
  masking_strategy: 'full' | 'partial' | 'tokenize' | 'hash';
  unmask_permission?: string;
}

export interface UnmaskEventParams {
  actor_id: string;
  actor_email?: string;
  table_name: string;
  field_name: string;
  entity_id: string;
  reason?: string;
}

export interface UnmaskEvent {
  id: string;
  actor_id: string;
  actor_email: string | null;
  table_name: string;
  field_name: string;
  entity_id: string;
  reason: string | null;
  created_at: Date;
}

export class DataSecurityService {
  /**
   * Get or lazily create the single data_security_settings row for a tenant.
   */
  async getSettings(tenantSlug: string): Promise<DataSecuritySettings> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const cacheKey = `${tenantSlug}:data-security:settings`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const existing = await pool.query(
          `SELECT * FROM ${schema}.data_security_settings LIMIT 1`
        );

        if (existing.rows.length > 0) {
          return existing.rows[0] as DataSecuritySettings;
        }

        // Auto-create default row on first access
        const created = await pool.query(
          `INSERT INTO ${schema}.data_security_settings
             (data_residency_region, pii_masking_enabled, pci_tokenization_enabled)
           VALUES ($1, $2, $3)
           RETURNING *`,
          ['us-east-1', true, false]
        );

        logger.info({ tenantSlug }, 'Created default data_security_settings row');
        return created.rows[0] as DataSecuritySettings;
      },
      { ttl: 600 }
    );
  }

  /**
   * Update data security settings for a tenant.
   */
  async updateSettings(
    tenantSlug: string,
    params: UpdateDataSecuritySettingsParams
  ): Promise<DataSecuritySettings> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Ensure row exists
    await this.getSettings(tenantSlug);

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let idx = 1;

    if (params.data_residency_region !== undefined) {
      setClauses.push(`data_residency_region = $${idx++}`);
      values.push(params.data_residency_region);
    }

    if (params.encryption_key_id !== undefined) {
      setClauses.push(`encryption_key_id = $${idx++}`);
      values.push(params.encryption_key_id);
    }

    if (params.pii_masking_enabled !== undefined) {
      setClauses.push(`pii_masking_enabled = $${idx++}`);
      values.push(params.pii_masking_enabled);
    }

    if (params.pci_tokenization_enabled !== undefined) {
      setClauses.push(`pci_tokenization_enabled = $${idx++}`);
      values.push(params.pci_tokenization_enabled);
    }

    const result = await pool.query(
      `UPDATE ${schema}.data_security_settings
       SET ${setClauses.join(', ')}
       RETURNING *`,
      values
    );

    await cacheService.invalidateTenant(tenantSlug, 'data-security');

    logger.info({ tenantSlug }, 'Updated data_security_settings');
    return result.rows[0] as DataSecuritySettings;
  }

  /**
   * List all field classifications for a tenant.
   */
  async listClassifications(tenantSlug: string): Promise<FieldClassification[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const cacheKey = `${tenantSlug}:data-security:classifications`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const result = await pool.query(
          `SELECT * FROM ${schema}.field_classifications ORDER BY table_name, field_name`
        );
        return result.rows as FieldClassification[];
      },
      { ttl: 300 }
    );
  }

  /**
   * Add or update a field classification (upsert by table_name + field_name).
   */
  async addClassification(
    tenantSlug: string,
    params: AddClassificationParams
  ): Promise<FieldClassification> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.field_classifications
         (table_name, field_name, classification, masking_strategy, unmask_permission)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (table_name, field_name) DO UPDATE
         SET classification = EXCLUDED.classification,
             masking_strategy = EXCLUDED.masking_strategy,
             unmask_permission = EXCLUDED.unmask_permission
       RETURNING *`,
      [
        params.table_name,
        params.field_name,
        params.classification,
        params.masking_strategy,
        params.unmask_permission ?? 'admin:write',
      ]
    );

    await cacheService.invalidateTenant(tenantSlug, 'data-security');

    logger.info(
      { tenantSlug, table_name: params.table_name, field_name: params.field_name },
      'Upserted field classification'
    );

    return result.rows[0] as FieldClassification;
  }

  /**
   * Record an unmask event for audit purposes.
   */
  async recordUnmaskEvent(
    tenantSlug: string,
    params: UnmaskEventParams
  ): Promise<UnmaskEvent> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.unmask_events
         (actor_id, actor_email, table_name, field_name, entity_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        params.actor_id,
        params.actor_email ?? null,
        params.table_name,
        params.field_name,
        params.entity_id,
        params.reason ?? null,
      ]
    );

    logger.info(
      {
        tenantSlug,
        actor_id: params.actor_id,
        table_name: params.table_name,
        field_name: params.field_name,
        entity_id: params.entity_id,
      },
      'Recorded unmask event'
    );

    return result.rows[0] as UnmaskEvent;
  }
}

export const dataSecurityService = new DataSecurityService();
