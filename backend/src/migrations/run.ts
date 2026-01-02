import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { migration001PublicSchema } from './001_public_schema.js';
import { migration002TenantSchema } from './002_tenant_schema.js';
import { migration003CatalogRequests } from './003_catalog_requests.js';
import { migration004AdditionalPermissions } from './004_additional_permissions.js';
import { migration005OnCall } from './005_oncall.js';
import { migration006Changes } from './006_changes.js';
import { migration007HealthCloud } from './007_health_cloud.js';
import { migration008Reporting } from './008_reporting.js';
import { migration009NotificationDelivery } from './009_notification_delivery.js';
import { migration010Attachments } from './010_attachments.js';
import { migration011AuditLogs } from './011_audit_logs.js';
import { migration012EmailVerification } from './012_email_verification.js';
import { migration013Problems } from './013_problems.js';
import { migration014KnowledgeBase } from './014_knowledge_base.js';
import { migration015Workflows } from './015_workflows.js';
import { migration016Assets } from './016_assets.js';
import { migration017EmailIntegration } from './017_email_integration.js';
import { migration018Integrations } from './018_integrations.js';
import { migration019RcaTools } from './019_rca_tools.js';
import { migration020CabMeetings } from './020_cab_meetings.js';
import { migration021ShiftSwaps } from './021_shift_swaps.js';
import { migration022FinancialImpact } from './022_financial_impact.js';
import { migration023IcalSubscriptions } from './023_ical_subscriptions.js';
import { migration024PerformanceIndexes } from './024_performance_indexes.js';

interface Migration {
  name: string;
  up: (client: typeof pool) => Promise<void>;
}

const migrations: Migration[] = [
  { name: '001_public_schema', up: migration001PublicSchema },
  { name: '002_tenant_schema', up: migration002TenantSchema },
  { name: '003_catalog_requests', up: migration003CatalogRequests },
  { name: '004_additional_permissions', up: migration004AdditionalPermissions },
  { name: '005_oncall', up: migration005OnCall },
  { name: '006_changes', up: migration006Changes },
  { name: '007_health_cloud', up: migration007HealthCloud },
  { name: '008_reporting', up: migration008Reporting },
  { name: '009_notification_delivery', up: migration009NotificationDelivery },
  { name: '010_attachments', up: migration010Attachments },
  { name: '011_audit_logs', up: migration011AuditLogs },
  { name: '012_email_verification', up: migration012EmailVerification },
  { name: '013_problems', up: migration013Problems },
  { name: '014_knowledge_base', up: migration014KnowledgeBase },
  { name: '015_workflows', up: migration015Workflows },
  { name: '016_assets', up: migration016Assets },
  { name: '017_email_integration', up: migration017EmailIntegration },
  { name: '018_integrations', up: migration018Integrations },
  { name: '019_rca_tools', up: migration019RcaTools },
  { name: '020_cab_meetings', up: migration020CabMeetings },
  { name: '021_shift_swaps', up: migration021ShiftSwaps },
  { name: '022_financial_impact', up: migration022FinancialImpact },
  { name: '023_ical_subscriptions', up: migration023IcalSubscriptions },
  { name: '024_performance_indexes', up: migration024PerformanceIndexes },
];

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function getExecutedMigrations(): Promise<string[]> {
  const result = await pool.query('SELECT name FROM migrations ORDER BY id');
  return result.rows.map((row) => row.name);
}

async function recordMigration(name: string) {
  await pool.query('INSERT INTO migrations (name) VALUES ($1)', [name]);
}

async function runMigrations() {
  try {
    logger.info('Starting migrations...');
    await ensureMigrationsTable();

    const executed = await getExecutedMigrations();
    const pending = migrations.filter((m) => !executed.includes(m.name));

    if (pending.length === 0) {
      logger.info('No pending migrations');
      return;
    }

    for (const migration of pending) {
      logger.info(`Running migration: ${migration.name}`);
      await migration.up(pool);
      await recordMigration(migration.name);
      logger.info(`Completed migration: ${migration.name}`);
    }

    logger.info(`Successfully ran ${pending.length} migrations`);
  } catch (error) {
    logger.error({ err: error }, 'Migration failed');
    throw error;
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
