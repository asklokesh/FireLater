import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';

// ============================================
// VENDOR REVIEW REMINDER JOB
// Runs daily — surfaces overdue and due-soon vendor reviews
// Supports DORA/FFIEC compliance requirements
// ============================================

export async function checkVendorReviewReminders(): Promise<void> {
  try {
    logger.info('Starting vendor review reminder check');

    // Get all active tenants
    const tenantsResult = await pool.query(
      `SELECT slug FROM public.tenants WHERE status = 'active'`
    );

    for (const tenant of tenantsResult.rows) {
      const schema = `tenant_${(tenant.slug as string).replace(/-/g, '_')}`;

      try {
        // Check for overdue reviews
        const overdueResult = await pool.query(
          `SELECT vr.id, vr.review_type, vr.due_date, vr.reviewer_email,
                  v.name as vendor_name, v.risk_tier
           FROM ${schema}.vendor_reviews vr
           JOIN ${schema}.vendors v ON vr.vendor_id = v.id
           WHERE vr.due_date < CURRENT_DATE
           AND vr.status IN ('scheduled', 'in_progress')
           ORDER BY v.risk_tier, vr.due_date ASC`
        );

        if (overdueResult.rows.length > 0) {
          logger.warn(
            {
              tenant: tenant.slug,
              overdueCount: overdueResult.rows.length,
              reviews: overdueResult.rows.map((r) => ({
                id: r.id,
                vendor: r.vendor_name,
                type: r.review_type,
                dueDate: r.due_date,
                riskTier: r.risk_tier,
              })),
            },
            'Overdue vendor reviews detected'
          );

          // Mark overdue reviews as overdue in DB
          await pool.query(
            `UPDATE ${schema}.vendor_reviews
             SET status = 'overdue', updated_at = NOW()
             WHERE due_date < CURRENT_DATE
             AND status IN ('scheduled', 'in_progress')`,
          );
        }

        // Check for reviews due in the next 30 days
        const dueSoonResult = await pool.query(
          `SELECT vr.id, vr.review_type, vr.due_date, vr.reviewer_email,
                  v.name as vendor_name, v.risk_tier
           FROM ${schema}.vendor_reviews vr
           JOIN ${schema}.vendors v ON vr.vendor_id = v.id
           WHERE vr.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
           AND vr.status IN ('scheduled', 'in_progress')
           ORDER BY vr.due_date ASC`
        );

        if (dueSoonResult.rows.length > 0) {
          logger.info(
            {
              tenant: tenant.slug,
              dueSoonCount: dueSoonResult.rows.length,
              reviews: dueSoonResult.rows.map((r) => ({
                id: r.id,
                vendor: r.vendor_name,
                type: r.review_type,
                dueDate: r.due_date,
                riskTier: r.risk_tier,
              })),
            },
            'Vendor reviews due soon'
          );
        }
      } catch (tenantError) {
        logger.error(
          { tenant: tenant.slug, err: tenantError },
          'Error checking vendor review reminders for tenant'
        );
      }
    }

    logger.info('Vendor review reminder check completed');
  } catch (error) {
    logger.error({ err: error }, 'Error in vendor review reminder job');
    throw error;
  }
}

// ============================================
// SCHEDULER EXPORT
// Called by scheduler.ts on a daily interval
// ============================================

export async function scheduleVendorReviewReminders(): Promise<void> {
  await checkVendorReviewReminders();
}

// ============================================
// SIMPLE INTERVAL RUNNER (fallback if not using scheduler)
// ============================================

let reminderIntervalId: NodeJS.Timeout | null = null;

export function startVendorReviewReminderJob(): void {
  if (reminderIntervalId) {
    logger.warn('Vendor review reminder job already running');
    return;
  }

  logger.info('Starting vendor review reminder job (daily)');

  // Run once on startup after a short delay
  setTimeout(() => {
    checkVendorReviewReminders().catch((err) => {
      logger.error({ err }, 'Initial vendor review reminder run failed');
    });
  }, 10000); // 10 second delay on startup

  // Run every 24 hours
  reminderIntervalId = setInterval(
    () => {
      checkVendorReviewReminders().catch((err) => {
        logger.error({ err }, 'Vendor review reminder interval run failed');
      });
    },
    24 * 60 * 60 * 1000
  );
}

export function stopVendorReviewReminderJob(): void {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    logger.info('Vendor review reminder job stopped');
  }
}
