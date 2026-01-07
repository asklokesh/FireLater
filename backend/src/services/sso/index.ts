/**
 * SSO Service
 * Main service for managing SSO authentication (SAML 2.0 and OIDC)
 */

import { pool } from '../../config/database.js';
import { tenantService } from '../tenant.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type {
  SSOProvider,
  AttributeMapping,
} from './types.js';
// Note: These types will be used when SAML/OIDC providers are fully implemented
// import type { SSOAuthResult, SAMLConfig, OIDCConfig } from './types.js';

export class SSOService {
  /**
   * Get SSO provider by ID
   */
  async getProviderById(tenantSlug: string, providerId: string): Promise<SSOProvider | null> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    const result = await pool.query(
      `SELECT * FROM ${schemaName}.sso_providers WHERE id = $1`,
      [providerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapProviderFromDB(result.rows[0]);
  }

  /**
   * Get default SSO provider for tenant
   */
  async getDefaultProvider(tenantSlug: string): Promise<SSOProvider | null> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    const result = await pool.query(
      `SELECT * FROM ${schemaName}.sso_providers
       WHERE enabled = true AND is_default = true
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapProviderFromDB(result.rows[0]);
  }

  /**
   * List all SSO providers for tenant
   */
  async listProviders(tenantSlug: string): Promise<SSOProvider[]> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    const result = await pool.query(
      `SELECT * FROM ${schemaName}.sso_providers
       ORDER BY is_default DESC, name ASC`
    );

    return result.rows.map(row => this.mapProviderFromDB(row));
  }

  /**
   * Create SSO provider configuration
   */
  async createProvider(
    tenantSlug: string,
    provider: Partial<SSOProvider>,
    userId: string
  ): Promise<SSOProvider> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    const result = await pool.query(
      `INSERT INTO ${schemaName}.sso_providers (
        name, provider_type, provider_name, enabled, is_default,
        configuration, attribute_mappings, jit_provisioning,
        auto_create_users, default_role, require_verified_email, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        provider.name,
        provider.providerType,
        provider.providerName,
        provider.enabled ?? true,
        provider.isDefault ?? false,
        JSON.stringify(provider.configuration),
        JSON.stringify(provider.attributeMappings),
        provider.jitProvisioning ?? true,
        provider.autoCreateUsers ?? true,
        provider.defaultRole ?? 'requester',
        provider.requireVerifiedEmail ?? true,
        userId,
      ]
    );

    logger.info({ providerId: result.rows[0].id }, 'SSO provider created');

    return this.mapProviderFromDB(result.rows[0]);
  }

  /**
   * Update SSO provider configuration
   */
  async updateProvider(
    tenantSlug: string,
    providerId: string,
    updates: Partial<SSOProvider>
  ): Promise<SSOProvider> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.enabled !== undefined) {
      updateFields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (updates.isDefault !== undefined) {
      updateFields.push(`is_default = $${paramIndex++}`);
      values.push(updates.isDefault);
    }

    if (updates.configuration !== undefined) {
      updateFields.push(`configuration = $${paramIndex++}`);
      values.push(JSON.stringify(updates.configuration));
    }

    if (updates.attributeMappings !== undefined) {
      updateFields.push(`attribute_mappings = $${paramIndex++}`);
      values.push(JSON.stringify(updates.attributeMappings));
    }

    if (updates.jitProvisioning !== undefined) {
      updateFields.push(`jit_provisioning = $${paramIndex++}`);
      values.push(updates.jitProvisioning);
    }

    if (updates.autoCreateUsers !== undefined) {
      updateFields.push(`auto_create_users = $${paramIndex++}`);
      values.push(updates.autoCreateUsers);
    }

    if (updateFields.length === 0) {
      throw new BadRequestError('No fields to update');
    }

    updateFields.push(`updated_at = NOW()`);

    values.push(providerId);

    const result = await pool.query(
      `UPDATE ${schemaName}.sso_providers
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('SSO Provider', providerId);
    }

    logger.info({ providerId }, 'SSO provider updated');

    return this.mapProviderFromDB(result.rows[0]);
  }

  /**
   * Delete SSO provider
   */
  async deleteProvider(tenantSlug: string, providerId: string): Promise<void> {
    const tenant = await tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      throw new NotFoundError('Tenant', tenantSlug);
    }

    const schemaName = `tenant_${tenant.slug}`;

    const result = await pool.query(
      `DELETE FROM ${schemaName}.sso_providers WHERE id = $1`,
      [providerId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('SSO Provider', providerId);
    }

    logger.info({ providerId }, 'SSO provider deleted');
  }

  /**
   * Map database row to SSOProvider object
   */
  private mapProviderFromDB(row: any): SSOProvider {
    return {
      id: row.id,
      name: row.name,
      providerType: row.provider_type,
      providerName: row.provider_name,
      enabled: row.enabled,
      isDefault: row.is_default,
      configuration: row.configuration,
      attributeMappings: row.attribute_mappings,
      jitProvisioning: row.jit_provisioning,
      autoCreateUsers: row.auto_create_users,
      defaultRole: row.default_role,
      requireVerifiedEmail: row.require_verified_email,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Extract user attributes from SSO response
   */
  extractUserAttributes(
    attributes: Record<string, any>,
    mappings: AttributeMapping
  ): {
    email?: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    groups?: string[];
    roles?: string[];
  } {
    const result: any = {};

    if (mappings.email) {
      result.email = this.getAttributeValue(attributes, mappings.email);
    }

    if (mappings.firstName) {
      result.firstName = this.getAttributeValue(attributes, mappings.firstName);
    }

    if (mappings.lastName) {
      result.lastName = this.getAttributeValue(attributes, mappings.lastName);
    }

    if (mappings.displayName) {
      result.displayName = this.getAttributeValue(attributes, mappings.displayName);
    }

    if (mappings.groups) {
      const groupsValue = this.getAttributeValue(attributes, mappings.groups);
      result.groups = Array.isArray(groupsValue) ? groupsValue : [groupsValue].filter(Boolean);
    }

    if (mappings.roles) {
      const rolesValue = this.getAttributeValue(attributes, mappings.roles);
      result.roles = Array.isArray(rolesValue) ? rolesValue : [rolesValue].filter(Boolean);
    }

    return result;
  }

  /**
   * Get attribute value from nested object
   */
  private getAttributeValue(obj: Record<string, any>, path: string): any {
    const keys = path.split('.');
    let value = obj;

    for (const key of keys) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[key];
    }

    return value;
  }
}

export const ssoService = new SSOService();
