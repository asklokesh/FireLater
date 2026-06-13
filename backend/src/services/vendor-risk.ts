import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { cacheService } from '../utils/cache.js';

// ============================================
// TYPES
// ============================================

export interface Vendor {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  risk_tier: 'critical' | 'high' | 'medium' | 'low';
  criticality: 'mission_critical' | 'important' | 'standard' | 'non_critical' | null;
  contract_review_date: string | null;
  assessment_review_date: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVendorData {
  name: string;
  description?: string;
  website?: string;
  riskTier?: 'critical' | 'high' | 'medium' | 'low';
  criticality?: 'mission_critical' | 'important' | 'standard' | 'non_critical';
  contractReviewDate?: string;
  assessmentReviewDate?: string;
  primaryContactName?: string;
  primaryContactEmail?: string;
  isActive?: boolean;
  notes?: string;
  createdBy?: string;
}

export interface VendorReview {
  id: string;
  vendor_id: string;
  review_type: 'contract' | 'security_assessment' | 'due_diligence' | 'annual_review';
  reviewer_id: string | null;
  reviewer_email: string | null;
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue';
  due_date: string;
  completed_date: string | null;
  findings: string | null;
  risk_score: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// SERVICE
// ============================================

export class VendorRiskService {

  // ==================
  // VENDOR CRUD
  // ==================

  async listVendors(
    tenantSlug: string,
    filters?: { riskTier?: string; isActive?: boolean }
  ): Promise<Vendor[]> {
    const cacheKey = `${tenantSlug}:vendors:list:${JSON.stringify(filters ?? {})}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        let whereClause = 'WHERE 1=1';
        const params: unknown[] = [];
        let paramIndex = 1;

        if (filters?.riskTier) {
          whereClause += ` AND risk_tier = $${paramIndex++}`;
          params.push(filters.riskTier);
        }

        if (filters?.isActive !== undefined) {
          whereClause += ` AND is_active = $${paramIndex++}`;
          params.push(filters.isActive);
        }

        const result = await pool.query(
          `SELECT * FROM ${schema}.vendors ${whereClause} ORDER BY name ASC`,
          params
        );

        return result.rows;
      },
      { ttl: 600 }
    );
  }

  async getVendor(tenantSlug: string, id: string): Promise<Vendor> {
    const cacheKey = `${tenantSlug}:vendors:vendor:${id}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        const result = await pool.query(
          `SELECT * FROM ${schema}.vendors WHERE id = $1`,
          [id]
        );

        if (!result.rows[0]) {
          throw new NotFoundError('Vendor', id);
        }

        return result.rows[0];
      },
      { ttl: 600 }
    );
  }

  async createVendor(tenantSlug: string, data: CreateVendorData): Promise<Vendor> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `INSERT INTO ${schema}.vendors (
        name, description, website, risk_tier, criticality,
        contract_review_date, assessment_review_date,
        primary_contact_name, primary_contact_email,
        is_active, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        data.name,
        data.description ?? null,
        data.website ?? null,
        data.riskTier ?? 'medium',
        data.criticality ?? 'standard',
        data.contractReviewDate ?? null,
        data.assessmentReviewDate ?? null,
        data.primaryContactName ?? null,
        data.primaryContactEmail ?? null,
        data.isActive ?? true,
        data.notes ?? null,
        data.createdBy ?? null,
      ]
    );

    await cacheService.invalidateTenant(tenantSlug, 'vendors');

    logger.info({ tenantSlug, vendorId: result.rows[0].id }, 'Vendor created');

    return result.rows[0];
  }

  async updateVendor(
    tenantSlug: string,
    id: string,
    data: Partial<CreateVendorData>
  ): Promise<Vendor> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify vendor exists
    await this.getVendor(tenantSlug, id);

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      description: 'description',
      website: 'website',
      riskTier: 'risk_tier',
      criticality: 'criticality',
      contractReviewDate: 'contract_review_date',
      assessmentReviewDate: 'assessment_review_date',
      primaryContactName: 'primary_contact_name',
      primaryContactEmail: 'primary_contact_email',
      isActive: 'is_active',
      notes: 'notes',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (key in data) {
        fields.push(`${column} = $${paramIndex++}`);
        values.push((data as Record<string, unknown>)[key] ?? null);
      }
    }

    if (fields.length === 0) {
      return this.getVendor(tenantSlug, id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.vendors SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await cacheService.invalidateTenant(tenantSlug, 'vendors');

    return result.rows[0];
  }

  async deleteVendor(tenantSlug: string, id: string): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify exists
    await this.getVendor(tenantSlug, id);

    await pool.query(`DELETE FROM ${schema}.vendors WHERE id = $1`, [id]);

    await cacheService.invalidateTenant(tenantSlug, 'vendors');

    logger.info({ tenantSlug, vendorId: id }, 'Vendor deleted');
  }

  // ==================
  // APPLICATION LINKS
  // ==================

  async linkApplication(
    tenantSlug: string,
    vendorId: string,
    applicationId: string,
    dependencyType: string = 'service',
    notes?: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify vendor exists
    await this.getVendor(tenantSlug, vendorId);

    const validTypes = ['service', 'component', 'hosting', 'support', 'licensing'];
    if (!validTypes.includes(dependencyType)) {
      throw new BadRequestError(`Invalid dependency type. Must be one of: ${validTypes.join(', ')}`);
    }

    try {
      await pool.query(
        `INSERT INTO ${schema}.vendor_application_links (vendor_id, application_id, dependency_type, notes)
         VALUES ($1, $2, $3, $4)`,
        [vendorId, applicationId, dependencyType, notes ?? null]
      );
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestError('Application is already linked to this vendor');
      }
      throw error;
    }

    await cacheService.invalidateTenant(tenantSlug, 'vendors');
  }

  async unlinkApplication(
    tenantSlug: string,
    vendorId: string,
    applicationId: string
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.vendor_application_links
       WHERE vendor_id = $1 AND application_id = $2`,
      [vendorId, applicationId]
    );

    if (result.rowCount === 0) {
      throw new NotFoundError('Vendor-Application link', `${vendorId}/${applicationId}`);
    }

    await cacheService.invalidateTenant(tenantSlug, 'vendors');
  }

  async getVendorApplications(tenantSlug: string, vendorId: string): Promise<unknown[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify vendor exists
    await this.getVendor(tenantSlug, vendorId);

    const result = await pool.query(
      `SELECT val.*, v.name as vendor_name
       FROM ${schema}.vendor_application_links val
       JOIN ${schema}.vendors v ON val.vendor_id = v.id
       WHERE val.vendor_id = $1
       ORDER BY val.application_id`,
      [vendorId]
    );

    return result.rows;
  }

  async getApplicationVendors(tenantSlug: string, applicationId: string): Promise<Vendor[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT v.*, val.dependency_type, val.criticality as link_criticality, val.notes as link_notes
       FROM ${schema}.vendors v
       JOIN ${schema}.vendor_application_links val ON v.id = val.vendor_id
       WHERE val.application_id = $1
       ORDER BY v.risk_tier, v.name`,
      [applicationId]
    );

    return result.rows;
  }

  // ==================
  // CHANGE IMPACT
  // ==================

  async getChangeImpactVendors(
    tenantSlug: string,
    applicationId: string
  ): Promise<{ vendors: Vendor[]; criticalCount: number; highRiskCount: number }> {
    const vendors = await this.getApplicationVendors(tenantSlug, applicationId);

    const criticalCount = vendors.filter((v) => v.criticality === 'mission_critical').length;
    const highRiskCount = vendors.filter(
      (v) => v.risk_tier === 'critical' || v.risk_tier === 'high'
    ).length;

    return { vendors, criticalCount, highRiskCount };
  }

  // ==================
  // REVIEWS
  // ==================

  async listReviews(tenantSlug: string, vendorId?: string): Promise<VendorReview[]> {
    const cacheKey = `${tenantSlug}:vendors:reviews:${vendorId ?? 'all'}`;

    return cacheService.getOrSet(
      cacheKey,
      async () => {
        const schema = tenantService.getSchemaName(tenantSlug);

        let query = `SELECT vr.*, v.name as vendor_name
                     FROM ${schema}.vendor_reviews vr
                     JOIN ${schema}.vendors v ON vr.vendor_id = v.id`;
        const params: unknown[] = [];

        if (vendorId) {
          query += ` WHERE vr.vendor_id = $1`;
          params.push(vendorId);
        }

        query += ` ORDER BY vr.due_date ASC`;

        const result = await pool.query(query, params);

        return result.rows;
      },
      { ttl: 300 } // 5 min TTL — reviews change more often
    );
  }

  async createReview(
    tenantSlug: string,
    data: {
      vendorId: string;
      reviewType: string;
      dueDate: string;
      reviewerId?: string;
      reviewerEmail?: string;
    }
  ): Promise<VendorReview> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify vendor exists
    await this.getVendor(tenantSlug, data.vendorId);

    const validTypes = ['contract', 'security_assessment', 'due_diligence', 'annual_review'];
    if (!validTypes.includes(data.reviewType)) {
      throw new BadRequestError(`Invalid review type. Must be one of: ${validTypes.join(', ')}`);
    }

    const result = await pool.query(
      `INSERT INTO ${schema}.vendor_reviews (vendor_id, review_type, due_date, reviewer_id, reviewer_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.vendorId,
        data.reviewType,
        data.dueDate,
        data.reviewerId ?? null,
        data.reviewerEmail ?? null,
      ]
    );

    await cacheService.invalidateTenant(tenantSlug, 'vendors');

    logger.info(
      { tenantSlug, reviewId: result.rows[0].id, vendorId: data.vendorId },
      'Vendor review created'
    );

    return result.rows[0];
  }

  async updateReview(
    tenantSlug: string,
    id: string,
    data: {
      status?: string;
      completedDate?: string;
      findings?: string;
      riskScore?: number;
    }
  ): Promise<VendorReview> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Verify review exists
    const existing = await pool.query(
      `SELECT id FROM ${schema}.vendor_reviews WHERE id = $1`,
      [id]
    );

    if (!existing.rows[0]) {
      throw new NotFoundError('Vendor Review', id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.status !== undefined) {
      const validStatuses = ['scheduled', 'in_progress', 'completed', 'overdue'];
      if (!validStatuses.includes(data.status)) {
        throw new BadRequestError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
      }
      fields.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.completedDate !== undefined) {
      fields.push(`completed_date = $${paramIndex++}`);
      values.push(data.completedDate);
    }

    if (data.findings !== undefined) {
      fields.push(`findings = $${paramIndex++}`);
      values.push(data.findings);
    }

    if (data.riskScore !== undefined) {
      if (data.riskScore < 1 || data.riskScore > 10) {
        throw new BadRequestError('Risk score must be between 1 and 10');
      }
      fields.push(`risk_score = $${paramIndex++}`);
      values.push(data.riskScore);
    }

    if (fields.length === 0) {
      const current = await pool.query(
        `SELECT * FROM ${schema}.vendor_reviews WHERE id = $1`,
        [id]
      );
      return current.rows[0];
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE ${schema}.vendor_reviews SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    await cacheService.invalidateTenant(tenantSlug, 'vendors');

    return result.rows[0];
  }

  // ==================
  // OVERDUE / DUE SOON
  // ==================

  async getOverdueReviews(tenantSlug: string): Promise<VendorReview[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT vr.*, v.name as vendor_name, v.risk_tier
       FROM ${schema}.vendor_reviews vr
       JOIN ${schema}.vendors v ON vr.vendor_id = v.id
       WHERE vr.due_date < CURRENT_DATE
       AND vr.status IN ('scheduled', 'in_progress')
       ORDER BY vr.due_date ASC`
    );

    return result.rows;
  }

  async getDueSoonReviews(tenantSlug: string, daysAhead: number = 30): Promise<VendorReview[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT vr.*, v.name as vendor_name, v.risk_tier
       FROM ${schema}.vendor_reviews vr
       JOIN ${schema}.vendors v ON vr.vendor_id = v.id
       WHERE vr.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $1 * INTERVAL '1 day'
       AND vr.status IN ('scheduled', 'in_progress')
       ORDER BY vr.due_date ASC`,
      [daysAhead]
    );

    return result.rows;
  }

  // ==================
  // EXPORT REGISTER
  // ==================

  async exportRegister(
    tenantSlug: string
  ): Promise<{ vendors: Vendor[]; links: unknown[]; reviews: VendorReview[] }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const [vendorsResult, linksResult, reviewsResult] = await Promise.all([
      pool.query(`SELECT * FROM ${schema}.vendors ORDER BY name`),
      pool.query(
        `SELECT val.*, v.name as vendor_name
         FROM ${schema}.vendor_application_links val
         JOIN ${schema}.vendors v ON val.vendor_id = v.id
         ORDER BY v.name, val.application_id`
      ),
      pool.query(
        `SELECT vr.*, v.name as vendor_name
         FROM ${schema}.vendor_reviews vr
         JOIN ${schema}.vendors v ON vr.vendor_id = v.id
         ORDER BY vr.due_date DESC`
      ),
    ]);

    return {
      vendors: vendorsResult.rows,
      links: linksResult.rows,
      reviews: reviewsResult.rows,
    };
  }

  // ==================
  // RISK SUMMARY
  // ==================

  async getRiskSummary(tenantSlug: string): Promise<{
    total: number;
    byCriticality: Record<string, number>;
    byRiskTier: Record<string, number>;
    overdueReviews: number;
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const [vendorsResult, overdueResult] = await Promise.all([
      pool.query(
        `SELECT criticality, risk_tier FROM ${schema}.vendors WHERE is_active = true`
      ),
      pool.query(
        `SELECT COUNT(*) as count
         FROM ${schema}.vendor_reviews
         WHERE due_date < CURRENT_DATE
         AND status IN ('scheduled', 'in_progress')`
      ),
    ]);

    const vendors = vendorsResult.rows;
    const total = vendors.length;

    const byCriticality: Record<string, number> = {};
    const byRiskTier: Record<string, number> = {};

    for (const vendor of vendors) {
      const crit = vendor.criticality ?? 'standard';
      byCriticality[crit] = (byCriticality[crit] ?? 0) + 1;

      const tier = vendor.risk_tier ?? 'medium';
      byRiskTier[tier] = (byRiskTier[tier] ?? 0) + 1;
    }

    const overdueReviews = parseInt(overdueResult.rows[0]?.count ?? '0', 10);

    return { total, byCriticality, byRiskTier, overdueReviews };
  }
}

export const vendorRiskService = new VendorRiskService();
