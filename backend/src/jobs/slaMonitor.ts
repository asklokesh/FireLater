import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';

export async function monitorSLABreaches(): Promise<void> {
  try {
    const now = new Date();

    // Get all tenants
    const tenantsResult = await pool.query('SELECT slug FROM tenants WHERE status = $1', ['active']);

    for (const tenant of tenantsResult.rows) {
      const schemaName = `tenant_${tenant.slug.replace(/[^a-z0-9-]/gi, '').replace(/-/g, '_')}`;

      try {
        // Update breached issues in tenant schema
        const result = await pool.query(`
          UPDATE ${schemaName}.issues
          SET sla_breached = true,
              response_met = CASE
                WHEN response_due < $1 AND first_response_at IS NULL THEN false
                ELSE response_met
              END,
              resolution_met = CASE
                WHEN resolution_due < $1 AND resolved_at IS NULL THEN false
                ELSE resolution_met
              END,
              updated_at = NOW()
          WHERE (
            (response_due < $1 AND first_response_at IS NULL AND (response_met IS NULL OR response_met = true))
            OR (resolution_due < $1 AND resolved_at IS NULL AND (resolution_met IS NULL OR resolution_met = true))
          )
          AND status NOT IN ('closed', 'resolved')
          AND sla_breached = false
        `, [now]);

        if (result.rowCount && result.rowCount > 0) {
          logger.warn(
            { tenant: tenant.slug, count: result.rowCount },
            'Updated issues with SLA breaches'
          );
        }
      } catch (error) {
        logger.error(
          { tenant: tenant.slug, error },
          'Error monitoring SLA breaches for tenant'
        );
      }
    }
  } catch (error) {
    logger.error({ error }, 'Error in SLA breach monitoring job');
  }
}

// Run every minute
let intervalId: NodeJS.Timeout | null = null;

export function startSLAMonitor(): void {
  if (intervalId) {
    logger.warn('SLA monitor already running');
    return;
  }

  logger.info('Starting SLA breach monitor');

  // Run immediately on start
  monitorSLABreaches().catch((error) => {
    logger.error({ error }, 'Initial SLA monitor run failed');
  });

  // Then run every minute
  intervalId = setInterval(() => {
    monitorSLABreaches().catch((error) => {
      logger.error({ error }, 'SLA monitor interval run failed');
    });
  }, 60000);
}

export function stopSLAMonitor(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('SLA breach monitor stopped');
  }
}
