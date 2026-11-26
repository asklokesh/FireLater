import { pool } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { auditChainService } from '../services/audit-chain.js';
import { auditRetentionService } from '../services/audit-retention.js';
import { auditService } from '../services/audit.js';

// ============================================
// AUDIT INTEGRITY JOB
// Daily scheduled task that:
//   1. Verifies the hash chain for every active tenant
//   2. Applies the tenant's retention policy: stamps retention_until, moves
//      records older than archive_after_days to the archive table and purges
//      records whose retention window has expired (legal_hold records are
//      always preserved)
// ============================================

export interface AuditIntegrityResult {
  tenantSlug: string;
  chainValid: boolean;
  firstBrokenSequence?: number;
  checkedCount: number;
  purgedCount: number;
}

/**
 * Run chain verification + retention purge for a single tenant.
 */
async function processAuditIntegrityForTenant(
  tenantSlug: string
): Promise<AuditIntegrityResult> {
  // 0. Seal records that were inserted without going through auditService.log
  await auditService.sealPending(tenantSlug);

  // 1. Verify chain integrity (no date filter = full history)
  const verifyResult = await auditChainService.verifyChain(tenantSlug);

  if (!verifyResult.valid) {
    logger.error(
      {
        tenantSlug,
        firstBrokenSequence: verifyResult.firstBrokenSequence,
        checkedCount: verifyResult.checkedCount,
      },
      'AUDIT CHAIN INTEGRITY FAILURE — tamper-evident check failed for tenant'
    );
  } else {
    logger.debug(
      { tenantSlug, checkedCount: verifyResult.checkedCount },
      'Audit chain integrity verified'
    );
  }

  // 2. Apply retention policy: archive old records, purge expired ones (honours legal_hold)
  const retention = await auditRetentionService.runForTenant(tenantSlug);
  const purgedCount = retention.purgedLive + retention.purgedArchive;

  return {
    tenantSlug,
    chainValid: verifyResult.valid,
    firstBrokenSequence: verifyResult.firstBrokenSequence,
    checkedCount: verifyResult.checkedCount,
    purgedCount,
  };
}

/**
 * Entry-point called by the scheduler once per day.
 * Iterates all active tenants sequentially to avoid overwhelming the DB.
 */
export async function runAuditIntegrityJob(): Promise<AuditIntegrityResult[]> {
  logger.info('Starting daily audit integrity job');

  const tenantsResult = await pool.query(
    `SELECT slug FROM tenants WHERE status = 'active'`
  );

  const results: AuditIntegrityResult[] = [];
  let failureCount = 0;

  for (const tenant of tenantsResult.rows) {
    try {
      const result = await processAuditIntegrityForTenant(tenant.slug as string);
      results.push(result);

      if (!result.chainValid) {
        failureCount++;
      }
    } catch (error) {
      logger.error(
        { err: error, tenantSlug: tenant.slug },
        'Audit integrity job failed for tenant'
      );
      results.push({
        tenantSlug: tenant.slug as string,
        chainValid: false,
        checkedCount: 0,
        purgedCount: 0,
      });
      failureCount++;
    }
  }

  const totalPurged = results.reduce((sum, r) => sum + r.purgedCount, 0);

  logger.info(
    {
      tenantsChecked: tenantsResult.rows.length,
      failures: failureCount,
      totalPurged,
    },
    'Daily audit integrity job completed'
  );

  if (failureCount > 0) {
    logger.error(
      { failureCount },
      'One or more tenants have a broken audit chain — immediate investigation required'
    );
  }

  return results;
}
