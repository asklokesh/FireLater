import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration036VendorRisk(pool: Pool): Promise<void> {
  // Get all tenant schemas (existing tenants + template)
  const schemasResult = await pool.query(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );

  const schemas: string[] = schemasResult.rows.map((r: { nspname: string }) => r.nspname);

  // Ensure tenant_template is always included
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    logger.info({ schema }, 'Applying vendor risk migration');

    // Vendors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.vendors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        website VARCHAR(500),
        risk_tier VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (risk_tier IN ('critical','high','medium','low')),
        criticality VARCHAR(20) DEFAULT 'standard' CHECK (criticality IN ('mission_critical','important','standard','non_critical')),
        contract_review_date DATE,
        assessment_review_date DATE,
        primary_contact_name VARCHAR(255),
        primary_contact_email VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        notes TEXT,
        created_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Vendor-Application many-to-many link table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.vendor_application_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES ${schema}.vendors(id) ON DELETE CASCADE,
        application_id VARCHAR(255) NOT NULL,
        dependency_type VARCHAR(50) DEFAULT 'service' CHECK (dependency_type IN ('service','component','hosting','support','licensing')),
        criticality VARCHAR(20) DEFAULT 'standard',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Vendor review/assessment tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.vendor_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_id UUID NOT NULL REFERENCES ${schema}.vendors(id) ON DELETE CASCADE,
        review_type VARCHAR(50) NOT NULL CHECK (review_type IN ('contract','security_assessment','due_diligence','annual_review')),
        reviewer_id VARCHAR(255),
        reviewer_email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','overdue')),
        due_date DATE NOT NULL,
        completed_date DATE,
        findings TEXT,
        risk_score INT CHECK (risk_score BETWEEN 1 AND 10),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_risk_tier ON ${schema}.vendors(risk_tier)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_app_links_vendor ON ${schema}.vendor_application_links(vendor_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_app_links_app ON ${schema}.vendor_application_links(application_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_reviews_vendor ON ${schema}.vendor_reviews(vendor_id, status)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vendor_reviews_due ON ${schema}.vendor_reviews(due_date)
      WHERE status IN ('scheduled','in_progress')
    `);

    logger.info({ schema }, 'Vendor risk migration applied');
  }

  logger.info('Migration 036: vendor risk tables created across all tenant schemas');
}
