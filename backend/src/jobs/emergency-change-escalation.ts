import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { emergencyChangeService } from '../services/emergency-change.js';

// ============================================
// EMERGENCY CHANGE ESCALATION JOB
// ============================================
// Runs periodically to detect emergency changes whose post-hoc CAB review
// deadline has passed but the review is still 'pending', then escalates by
// logging a warning and (optionally) sending notifications.
// ============================================

export async function escalateOverdueEmergencyReviews(): Promise<void> {
  try {
    // Get all active tenants
    const tenantsResult = await pool.query(
      `SELECT slug FROM tenants WHERE status = 'active'`
    );

    let totalEscalated = 0;

    for (const tenant of tenantsResult.rows) {
      try {
        const count = await emergencyChangeService.escalateOverdueReviews(tenant.slug);
        totalEscalated += count;
      } catch (error) {
        logger.error(
          { err: error, tenantSlug: tenant.slug },
          'Error escalating overdue emergency change reviews for tenant'
        );
      }
    }

    if (totalEscalated > 0) {
      logger.warn(
        { totalEscalated, tenantCount: tenantsResult.rows.length },
        'Emergency change post-hoc review escalation complete — overdue reviews found'
      );
    } else {
      logger.debug('Emergency change escalation check complete — no overdue reviews');
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in emergency change escalation job');
  }
}

// ============================================
// SCHEDULER INTEGRATION
// ============================================

let intervalId: NodeJS.Timeout | null = null;

/** Start the escalation job — runs every hour. */
export function startEmergencyChangeEscalation(): void {
  if (intervalId) {
    logger.warn('Emergency change escalation job already running');
    return;
  }

  logger.info('Starting emergency change escalation job');

  // Run immediately on start
  escalateOverdueEmergencyReviews().catch((error) => {
    logger.error({ err: error }, 'Initial emergency change escalation run failed');
  });

  // Then run every hour
  intervalId = setInterval(() => {
    escalateOverdueEmergencyReviews().catch((error) => {
      logger.error({ err: error }, 'Emergency change escalation interval run failed');
    });
  }, 60 * 60 * 1000); // 1 hour
}

export function stopEmergencyChangeEscalation(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Emergency change escalation job stopped');
  }
}
