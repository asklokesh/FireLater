import { Pool } from 'pg';
import { logger } from '../utils/logger.js';

export async function migration034RegulatorySla(pool: Pool): Promise<void> {
  // Apply to tenant_template first
  await applyToSchema(pool, 'tenant_template');

  // Apply to all existing tenant schemas
  const tenantSchemas = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name LIKE 'tenant_%'
    AND schema_name != 'tenant_template'
  `);

  for (const row of tenantSchemas.rows) {
    await applyToSchema(pool, row.schema_name);
    logger.info({ schema: row.schema_name }, 'Applied regulatory SLA tables to tenant schema');
  }

  logger.info('Migration 034: regulatory SLA tables created in all schemas');
}

async function applyToSchema(pool: Pool, schema: string): Promise<void> {
  await pool.query(`
    -- Jurisdiction/regulation → deadline configurations
    CREATE TABLE IF NOT EXISTS ${schema}.regulatory_frameworks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(50) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Deadline rules within a framework
    CREATE TABLE IF NOT EXISTS ${schema}.regulatory_deadlines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      framework_id UUID NOT NULL REFERENCES ${schema}.regulatory_frameworks(id),
      deadline_type VARCHAR(50) NOT NULL,
      incident_classification VARCHAR(50),
      hours_from_detection INT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Active regulatory clocks for specific incidents
    CREATE TABLE IF NOT EXISTS ${schema}.regulatory_clocks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      incident_id VARCHAR(255) NOT NULL,
      framework_id UUID NOT NULL REFERENCES ${schema}.regulatory_frameworks(id),
      deadline_id UUID NOT NULL REFERENCES ${schema}.regulatory_deadlines(id),
      detected_at TIMESTAMPTZ NOT NULL,
      deadline_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running','met','breached','cancelled')),
      notification_sent_at TIMESTAMPTZ,
      notification_actor_id VARCHAR(255),
      notification_recipient VARCHAR(255),
      notification_evidence TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ${schema}.regulatory_clock_escalations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clock_id UUID NOT NULL REFERENCES ${schema}.regulatory_clocks(id),
      escalation_type VARCHAR(50) NOT NULL,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      sent_to VARCHAR(255)
    );

    CREATE INDEX IF NOT EXISTS idx_reg_clocks_incident ON ${schema}.regulatory_clocks(incident_id);
    CREATE INDEX IF NOT EXISTS idx_reg_clocks_status ON ${schema}.regulatory_clocks(status);
    CREATE INDEX IF NOT EXISTS idx_reg_clocks_deadline ON ${schema}.regulatory_clocks(deadline_at) WHERE status = 'running';
  `);

  // Seed default regulatory frameworks and deadlines (idempotent)
  await pool.query(`
    -- DORA framework
    INSERT INTO ${schema}.regulatory_frameworks (code, name, description)
    VALUES ('DORA', 'Digital Operational Resilience Act', 'EU regulation for financial sector digital resilience')
    ON CONFLICT (code) DO NOTHING;
  `);

  await pool.query(`
    -- GLBA framework
    INSERT INTO ${schema}.regulatory_frameworks (code, name, description)
    VALUES ('GLBA', 'Gramm-Leach-Bliley Act', 'US federal law governing financial data privacy and security')
    ON CONFLICT (code) DO NOTHING;
  `);

  await pool.query(`
    -- NY-DFS framework
    INSERT INTO ${schema}.regulatory_frameworks (code, name, description)
    VALUES ('NY-DFS', 'New York DFS Cybersecurity Regulation (23 NYCRR 500)', 'New York Department of Financial Services cybersecurity requirements')
    ON CONFLICT (code) DO NOTHING;
  `);

  // Seed DORA deadlines
  await pool.query(`
    WITH fw AS (SELECT id FROM ${schema}.regulatory_frameworks WHERE code = 'DORA')
    INSERT INTO ${schema}.regulatory_deadlines
      (framework_id, deadline_type, incident_classification, hours_from_detection, description)
    SELECT
      fw.id, 'initial_notification', 'major', 4,
      'DORA Art. 19: Initial notification within 4 hours of major incident classification'
    FROM fw
    WHERE NOT EXISTS (
      SELECT 1 FROM ${schema}.regulatory_deadlines rd
      WHERE rd.framework_id = fw.id
        AND rd.deadline_type = 'initial_notification'
        AND rd.incident_classification = 'major'
    );
  `);

  await pool.query(`
    WITH fw AS (SELECT id FROM ${schema}.regulatory_frameworks WHERE code = 'DORA')
    INSERT INTO ${schema}.regulatory_deadlines
      (framework_id, deadline_type, incident_classification, hours_from_detection, description)
    SELECT
      fw.id, 'intermediate', 'major', 72,
      'DORA Art. 19: Intermediate report within 72 hours of major incident'
    FROM fw
    WHERE NOT EXISTS (
      SELECT 1 FROM ${schema}.regulatory_deadlines rd
      WHERE rd.framework_id = fw.id
        AND rd.deadline_type = 'intermediate'
        AND rd.incident_classification = 'major'
    );
  `);

  await pool.query(`
    WITH fw AS (SELECT id FROM ${schema}.regulatory_frameworks WHERE code = 'DORA')
    INSERT INTO ${schema}.regulatory_deadlines
      (framework_id, deadline_type, incident_classification, hours_from_detection, description)
    SELECT
      fw.id, 'final', 'major', 720,
      'DORA Art. 19: Final report within 1 month (720 hours) of major incident resolution'
    FROM fw
    WHERE NOT EXISTS (
      SELECT 1 FROM ${schema}.regulatory_deadlines rd
      WHERE rd.framework_id = fw.id
        AND rd.deadline_type = 'final'
        AND rd.incident_classification = 'major'
    );
  `);

  // Seed GLBA deadlines
  await pool.query(`
    WITH fw AS (SELECT id FROM ${schema}.regulatory_frameworks WHERE code = 'GLBA')
    INSERT INTO ${schema}.regulatory_deadlines
      (framework_id, deadline_type, incident_classification, hours_from_detection, description)
    SELECT
      fw.id, 'breach_notification', 'all', 72,
      'GLBA Safeguards Rule: Notify FTC within 72 hours of discovering a security event'
    FROM fw
    WHERE NOT EXISTS (
      SELECT 1 FROM ${schema}.regulatory_deadlines rd
      WHERE rd.framework_id = fw.id
        AND rd.deadline_type = 'breach_notification'
    );
  `);

  // Seed NY-DFS deadlines
  await pool.query(`
    WITH fw AS (SELECT id FROM ${schema}.regulatory_frameworks WHERE code = 'NY-DFS')
    INSERT INTO ${schema}.regulatory_deadlines
      (framework_id, deadline_type, incident_classification, hours_from_detection, description)
    SELECT
      fw.id, 'initial_notification', 'significant', 72,
      'NY-DFS 23 NYCRR 500.17: Notify DFS within 72 hours of significant cybersecurity event'
    FROM fw
    WHERE NOT EXISTS (
      SELECT 1 FROM ${schema}.regulatory_deadlines rd
      WHERE rd.framework_id = fw.id
        AND rd.deadline_type = 'initial_notification'
        AND rd.incident_classification = 'significant'
    );
  `);

  await pool.query(`
    WITH fw AS (SELECT id FROM ${schema}.regulatory_frameworks WHERE code = 'NY-DFS')
    INSERT INTO ${schema}.regulatory_deadlines
      (framework_id, deadline_type, incident_classification, hours_from_detection, description)
    SELECT
      fw.id, 'final', 'significant', 720,
      'NY-DFS 23 NYCRR 500.17: Final report within 30 days (720 hours) of significant cybersecurity event'
    FROM fw
    WHERE NOT EXISTS (
      SELECT 1 FROM ${schema}.regulatory_deadlines rd
      WHERE rd.framework_id = fw.id
        AND rd.deadline_type = 'final'
        AND rd.incident_classification = 'significant'
    );
  `);
}
