import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { regulatorySlaService } from '../services/regulatory-sla.js';

// ============================================
// REGULATORY CLOCK CHECKER JOB
// Runs hourly: checks each tenant's running regulatory clocks,
// escalates approaching deadlines, and marks breached clocks.
// ============================================

export async function checkRegulatoryClocks(): Promise<{
  tenantsChecked: number;
  totalEscalated: number;
  totalBreached: number;
}> {
  logger.info('Starting regulatory clock check across all tenants');

  let tenantsChecked = 0;
  let totalEscalated = 0;
  let totalBreached = 0;

  // Get all active tenants
  const tenantsResult = await pool.query(
    `SELECT slug FROM tenants WHERE status = 'active'`
  );

  for (const row of tenantsResult.rows) {
    const tenantSlug: string = row.slug;

    try {
      const result = await regulatorySlaService.checkAndEscalate(tenantSlug);
      totalEscalated += result.escalated;
      totalBreached += result.breached;
      tenantsChecked++;
    } catch (error) {
      logger.error(
        { err: error, tenantSlug },
        'Error checking regulatory clocks for tenant'
      );
      // Continue with remaining tenants even if one fails
    }
  }

  logger.info(
    { tenantsChecked, totalEscalated, totalBreached },
    'Regulatory clock check complete'
  );

  return { tenantsChecked, totalEscalated, totalBreached };
}

// ============================================
// INTERVAL-BASED RUNNER
// ============================================

const HOURLY_MS = 60 * 60 * 1000;

let intervalId: NodeJS.Timeout | null = null;

export function startRegulatoryClockChecker(): void {
  if (intervalId) {
    logger.warn('Regulatory clock checker already running');
    return;
  }

  logger.info('Starting regulatory clock checker (hourly interval)');

  // Run immediately on startup
  checkRegulatoryClocks().catch((error) => {
    logger.error({ err: error }, 'Initial regulatory clock check failed');
  });

  // Then run every hour
  intervalId = setInterval(() => {
    checkRegulatoryClocks().catch((error) => {
      logger.error({ err: error }, 'Regulatory clock check interval run failed');
    });
  }, HOURLY_MS);
}

export function stopRegulatoryClockChecker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Regulatory clock checker stopped');
  }
}
