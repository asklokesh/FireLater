import { pool } from '../config/database.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import format from 'pg-format';

interface CreateTenantParams {
  name: string;
  slug: string;
  planId?: string;
  billingEmail?: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: string;
  settings: Record<string, unknown>;
  billing_email: string | null;
  trial_ends_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class TenantService {
  async findBySlug(slug: string): Promise<Tenant | null> {
    const result = await pool.query(
      'SELECT * FROM tenants WHERE slug = $1',
      [slug]
    );
    return result.rows[0] || null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const result = await pool.query(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async create(params: CreateTenantParams): Promise<Tenant> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if slug already exists
      const existing = await client.query(
        'SELECT id FROM tenants WHERE slug = $1',
        [params.slug]
      );

      if (existing.rows.length > 0) {
        throw new ConflictError(`Tenant with slug '${params.slug}' already exists`);
      }

      // Get default plan if not specified
      let planId = params.planId;
      if (!planId) {
        const defaultPlan = await client.query(
          "SELECT id FROM plans WHERE name = 'starter' LIMIT 1"
        );
        planId = defaultPlan.rows[0]?.id;
      }

      // Create tenant in public schema
      const tenantResult = await client.query(
        `INSERT INTO tenants (name, slug, plan_id, billing_email, trial_ends_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '14 days')
         RETURNING *`,
        [params.name, params.slug, planId, params.billingEmail]
      );

      const tenant = tenantResult.rows[0];
      const schemaName = this.getSchemaName(params.slug);

      // Create tenant schema by cloning template
      await client.query(format('CREATE SCHEMA %I', schemaName));

      // Copy all tables from template
      const tables = await client.query(`
        SELECT tablename FROM pg_tables WHERE schemaname = 'tenant_template'
      `);

      for (const row of tables.rows) {
        await client.query(
          format(
            'CREATE TABLE %I.%I (LIKE tenant_template.%I INCLUDING ALL)',
            schemaName,
            row.tablename,
            row.tablename
          )
        );
      }

      // Copy data from template tables
      for (const row of tables.rows) {
        await client.query(
          format(
            'INSERT INTO %I.%I SELECT * FROM tenant_template.%I',
            schemaName,
            row.tablename,
            row.tablename
          )
        );
      }

      // Copy functions
      await client.query(
        format(
          `CREATE OR REPLACE FUNCTION %I.next_id(p_entity_type VARCHAR(50))
          RETURNS VARCHAR(50) AS $func$
          DECLARE
              v_prefix VARCHAR(10);
              v_next BIGINT;
          BEGIN
              UPDATE %I.id_sequences
              SET current_value = current_value + 1, updated_at = NOW()
              WHERE entity_type = p_entity_type
              RETURNING prefix, current_value INTO v_prefix, v_next;

              RETURN v_prefix || '-' || LPAD(v_next::TEXT, 5, '0');
          END;
          $func$ LANGUAGE plpgsql`,
          schemaName,
          schemaName
        )
      );

      // Create admin user for this tenant
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(params.adminPassword, 12);

      await client.query(
        format(
          'INSERT INTO %I.users (email, name, password_hash, status) VALUES ($1, $2, $3, $4)',
          schemaName
        ),
        [params.adminEmail, params.adminName, passwordHash, 'active']
      );

      // Assign admin role to the user
      await client.query(
        format(
          `INSERT INTO %I.user_roles (user_id, role_id)
          SELECT u.id, r.id
          FROM %I.users u, %I.roles r
          WHERE u.email = $1 AND r.name = $2`,
          schemaName,
          schemaName,
          schemaName
        ),
        [params.adminEmail, 'admin']
      );

      await client.query('COMMIT');

      logger.info({ tenantId: tenant.id, slug: params.slug }, 'Tenant created');
      return tenant;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(slug: string): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const tenant = await this.findBySlug(slug);
      if (!tenant) {
        throw new NotFoundError('Tenant', slug);
      }

      const schemaName = this.getSchemaName(slug);
      await client.query(format('DROP SCHEMA IF EXISTS %I CASCADE', schemaName));
      await client.query('DELETE FROM tenants WHERE slug = $1', [slug]);

      await client.query('COMMIT');
      logger.info({ slug }, 'Tenant deleted');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getSchemaName(slug: string): string {
    // Sanitize slug: remove all non-alphanumeric except hyphens, then replace hyphens with underscores
    const sanitizedSlug = slug.replace(/[^a-z0-9-]/gi, '').replace(/-/g, '_');
    return `tenant_${sanitizedSlug}`;
  }

  /**
   * Validate that a tenant schema exists in the database.
   * This adds defense-in-depth to prevent SQL injection or data corruption
   * from race conditions or manual database modifications.
   *
   * @param slug - The tenant slug
   * @returns The validated schema name
   * @throws NotFoundError if tenant or schema doesn't exist
   */
  async validateAndGetSchema(slug: string): Promise<string> {
    // First verify tenant exists in public.tenants table
    const tenant = await this.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundError('Tenant', slug);
    }

    const schemaName = this.getSchemaName(slug);

    // Verify schema actually exists in PostgreSQL
    const schemaExists = await pool.query(
      'SELECT 1 FROM pg_namespace WHERE nspname = $1',
      [schemaName]
    );

    if (schemaExists.rows.length === 0) {
      logger.error(
        { slug, schemaName },
        'Tenant exists in database but schema does not exist'
      );
      throw new NotFoundError(
        'Tenant schema',
        `${slug} (expected schema: ${schemaName})`
      );
    }

    return schemaName;
  }

  async getSettings(slug: string): Promise<{ tenant: Tenant; settings: Record<string, unknown> }> {
    const tenant = await this.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundError('Tenant', slug);
    }

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan_id: tenant.plan_id,
        status: tenant.status,
        settings: tenant.settings,
        billing_email: tenant.billing_email,
        trial_ends_at: tenant.trial_ends_at,
        created_at: tenant.created_at,
        updated_at: tenant.updated_at,
      },
      settings: tenant.settings || {},
    };
  }

  async updateSettings(
    slug: string,
    updates: {
      name?: string;
      billingEmail?: string;
      settings?: Record<string, unknown>;
    }
  ): Promise<Tenant> {
    const tenant = await this.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundError('Tenant', slug);
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.billingEmail !== undefined) {
      setClauses.push(`billing_email = $${paramIndex++}`);
      values.push(updates.billingEmail);
    }

    if (updates.settings !== undefined) {
      // Merge with existing settings
      const mergedSettings = { ...tenant.settings, ...updates.settings };
      setClauses.push(`settings = $${paramIndex++}`);
      values.push(JSON.stringify(mergedSettings));
    }

    values.push(slug);

    const result = await pool.query(
      `UPDATE tenants SET ${setClauses.join(', ')} WHERE slug = $${paramIndex} RETURNING *`,
      values
    );

    logger.info({ slug }, 'Tenant settings updated');
    return result.rows[0];
  }
}

export const tenantService = new TenantService();
