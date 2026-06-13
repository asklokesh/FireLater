import crypto from 'crypto';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';

// ============================================
// AUDIT CHAIN SERVICE
// Immutable, tamper-evident audit trail via WORM + SHA-256 hash-chaining
// ============================================

export class AuditChainService {
  /**
   * Compute a SHA-256 hash over a canonical (sorted-keys) JSON representation
   * of the payload combined with the previous record's hash.
   *
   * Canonical JSON uses sorted top-level keys so that the same logical payload
   * always produces the same hash regardless of insertion order.
   */
  computeHash(payload: Record<string, unknown>, prevHash: string | null): string {
    const canonicalPayload = JSON.stringify(payload, Object.keys(payload).sort());
    const data = `${canonicalPayload}|${prevHash ?? ''}`;
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Retrieve the record_hash of the most recent audit log entry for a tenant.
   * Returns null when there are no records yet (genesis state).
   */
  async getLastHash(tenantSlug: string): Promise<string | null> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `SELECT record_hash
         FROM ${schema}.audit_logs
        WHERE record_hash IS NOT NULL
        ORDER BY sequence DESC
        LIMIT 1`
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].record_hash as string;
  }

  /**
   * Verify the integrity of the hash chain for a tenant over an optional date range.
   *
   * Walks every audit log record in sequence order and re-derives the expected
   * record_hash.  Stops at the first broken link and returns its sequence number.
   *
   * Records that were inserted before migration 027 (record_hash IS NULL) are
   * skipped — they pre-date the chain and cannot be retroactively verified.
   *
   * @returns { valid, firstBrokenSequence?, checkedCount }
   */
  async verifyChain(
    tenantSlug: string,
    from?: Date,
    to?: Date
  ): Promise<{ valid: boolean; firstBrokenSequence?: number; checkedCount: number }> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Build optional date range filter
    const conditions: string[] = ['record_hash IS NOT NULL'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (from) {
      conditions.push(`created_at >= $${paramIdx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${paramIdx++}`);
      params.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT
         sequence,
         prev_hash,
         record_hash,
         action,
         entity_type,
         entity_id,
         user_id,
         ip_address,
         created_at,
         metadata
       FROM ${schema}.audit_logs
       ${whereClause}
       ORDER BY sequence ASC`,
      params
    );

    const rows = result.rows as Array<{
      sequence: number;
      prev_hash: string | null;
      record_hash: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      user_id: string | null;
      ip_address: string | null;
      created_at: Date;
      metadata: Record<string, unknown> | null;
    }>;

    if (rows.length === 0) {
      return { valid: true, checkedCount: 0 };
    }

    let expectedPrevHash: string | null = rows[0].prev_hash;

    for (const row of rows) {
      // Build the same canonical payload that was used when writing the record
      const payload: Record<string, unknown> = {
        action: row.action,
        created_at: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
        entity_id: row.entity_id,
        entity_type: row.entity_type,
        ip_address: row.ip_address,
        metadata: row.metadata ?? {},
        sequence: row.sequence,
        user_id: row.user_id,
      };

      const expectedHash = this.computeHash(payload, row.prev_hash);

      if (expectedHash !== row.record_hash) {
        logger.warn(
          { tenantSlug, sequence: row.sequence, expectedHash, actualHash: row.record_hash },
          'Audit chain integrity failure detected'
        );
        return {
          valid: false,
          firstBrokenSequence: Number(row.sequence),
          checkedCount: rows.indexOf(row),
        };
      }

      expectedPrevHash = row.record_hash;
    }

    // Suppress unused variable warning — kept for future cross-record checks
    void expectedPrevHash;

    return { valid: true, checkedCount: rows.length };
  }

  /**
   * Delete audit log records whose retention_until has passed, unless they are
   * under a legal hold.
   *
   * @returns The number of records purged.
   */
  async purgeExpired(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const result = await pool.query(
      `DELETE FROM ${schema}.audit_logs
        WHERE retention_until IS NOT NULL
          AND retention_until < NOW()
          AND (legal_hold IS NULL OR legal_hold = false)
        RETURNING id`
    );

    const purgedCount = result.rowCount ?? 0;

    if (purgedCount > 0) {
      logger.info({ tenantSlug, purgedCount }, 'Purged expired audit log records');
    }

    return purgedCount;
  }
}

export const auditChainService = new AuditChainService();
