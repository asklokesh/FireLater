import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration032ComplianceReports(pool: Pool): Promise<void> {
  // Apply to all existing tenant schemas plus the template schema
  const schemasResult = await pool.query<{ nspname: string }>(
    `SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%'`
  );

  const schemas: string[] = schemasResult.rows.map((r) => r.nspname);
  if (!schemas.includes('tenant_template')) {
    schemas.push('tenant_template');
  }

  for (const schema of schemas) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.compliance_report_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        report_type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        cadence VARCHAR(20) DEFAULT 'monthly' CHECK (cadence IN ('daily','weekly','monthly','quarterly')),
        recipients JSONB DEFAULT '[]',
        is_active BOOLEAN DEFAULT true,
        last_run_at TIMESTAMPTZ,
        next_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ${schema}.compliance_report_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id UUID REFERENCES ${schema}.compliance_report_schedules(id),
        report_type VARCHAR(100) NOT NULL,
        status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
        parameters JSONB DEFAULT '{}',
        result_summary JSONB,
        started_at TIMESTAMPTZ DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        error_message TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_compliance_schedules_active_${schema.replace(/-/g, '_')}
        ON ${schema}.compliance_report_schedules(is_active, next_run_at)
        WHERE is_active = true;

      CREATE INDEX IF NOT EXISTS idx_compliance_runs_schedule_${schema.replace(/-/g, '_')}
        ON ${schema}.compliance_report_runs(schedule_id, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_compliance_runs_type_${schema.replace(/-/g, '_')}
        ON ${schema}.compliance_report_runs(report_type, started_at DESC);
    `);

    logger.info({ schema }, 'Created compliance report tables');
  }

  logger.info(
    { schemaCount: schemas.length },
    'Migration 032: compliance_report_schedules and compliance_report_runs created'
  );
}
