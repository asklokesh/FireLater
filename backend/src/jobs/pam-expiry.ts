import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { pamService } from '../services/pam.js';

// ============================================
// PAM GRANT EXPIRY JOB
// ============================================
// Runs every 15 minutes: marks active grants past their expires_at as 'expired'.

export async function expirePamGrants(): Promise<void> {
  try {
    const tenantsResult = await pool.query(
      `SELECT slug FROM tenants WHERE status = 'active'`
    );

    let totalExpired = 0;

    for (const tenant of tenantsResult.rows) {
      try {
        const count = await pamService.expireStaleGrants(tenant.slug);
        totalExpired += count;
      } catch (error) {
        logger.error(
          { err: error, tenantSlug: tenant.slug },
          'PAM expiry job failed for tenant'
        );
      }
    }

    if (totalExpired > 0) {
      logger.info({ totalExpired }, 'PAM grant expiry job: expired stale grants');
    } else {
      logger.debug('PAM grant expiry job: no stale grants found');
    }
  } catch (error) {
    logger.error({ err: error }, 'PAM grant expiry job failed');
  }
}

// ============================================
// INTERVAL RUNNER
// ============================================

const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let intervalId: NodeJS.Timeout | null = null;

export function startPamExpiryJob(): void {
  if (intervalId) {
    logger.warn('PAM expiry job already running');
    return;
  }

  logger.info('Starting PAM grant expiry job (every 15 minutes)');

  // Run once immediately on startup
  expirePamGrants().catch((error) => {
    logger.error({ err: error }, 'Initial PAM expiry run failed');
  });

  intervalId = setInterval(() => {
    expirePamGrants().catch((error) => {
      logger.error({ err: error }, 'PAM expiry interval run failed');
    });
  }, INTERVAL_MS);
}

export function stopPamExpiryJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('PAM grant expiry job stopped');
  }
}
