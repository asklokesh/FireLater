import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { recertificationService } from '../services/recertification.js';

// ============================================
// RECERTIFICATION REMINDER JOB
// Runs daily: sends reminders and escalates overdue items for all tenants
// ============================================

export async function runRecertificationReminders(): Promise<void> {
  try {
    // Get all active tenants
    const tenantsResult = await pool.query(
      `SELECT slug FROM tenants WHERE status = 'active'`
    );

    let totalReminders = 0;
    let totalEscalations = 0;

    for (const tenant of tenantsResult.rows) {
      const tenantSlug = tenant.slug as string;

      try {
        const reminders = await recertificationService.sendReminders(tenantSlug);
        const escalations = await recertificationService.escalateOverdue(tenantSlug);

        totalReminders += reminders;
        totalEscalations += escalations;

        if (reminders > 0 || escalations > 0) {
          logger.info(
            { tenantSlug, reminders, escalations },
            'Recertification reminders and escalations processed'
          );
        }
      } catch (error) {
        logger.error(
          { err: error, tenantSlug },
          'Error processing recertification reminders for tenant'
        );
        // Continue processing other tenants even if one fails
      }
    }

    logger.info(
      { totalReminders, totalEscalations, tenantCount: tenantsResult.rows.length },
      'Recertification reminder job completed'
    );
  } catch (error) {
    logger.error({ err: error }, 'Error in recertification reminder job');
    throw error;
  }
}

// ============================================
// SCHEDULER INTEGRATION
// Registers as a daily scheduled task
// ============================================

let intervalId: NodeJS.Timeout | null = null;

const DAILY_MS = 24 * 60 * 60 * 1000;

export function startRecertificationReminderJob(): void {
  if (intervalId) {
    logger.warn('Recertification reminder job already running');
    return;
  }

  logger.info('Starting recertification reminder job (daily)');

  // Run once on startup after a short delay to avoid startup contention
  setTimeout(() => {
    runRecertificationReminders().catch((err) => {
      logger.error({ err }, 'Initial recertification reminder run failed');
    });
  }, 10000);

  // Then run daily
  intervalId = setInterval(() => {
    runRecertificationReminders().catch((err) => {
      logger.error({ err }, 'Recertification reminder interval run failed');
    });
  }, DAILY_MS);
}

export function stopRecertificationReminderJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Recertification reminder job stopped');
  }
}
