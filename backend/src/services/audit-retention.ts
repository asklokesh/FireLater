import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { auditService, type AuditLogEntry } from './audit.js';
import { cacheService } from '../utils/cache.js';

// ============================================
// AUDIT RETENTION & ARCHIVAL
//
// Policy (per tenant, audit_settings):
//   retention_days      - records are purged once retention_until has passed
//   archive_after_days  - records older than this move from audit_logs to the
//                         audit_logs_archive cold table (NULL = never archive)
//   legal_hold          - per-record flag that blocks purge, always
//
// The newest live record is never archived or purged so the hash chain keeps
// its anchor (the next record's prev_hash).
// ============================================

const ARCHIVE_BATCH_SIZE = 5000;
const MAX_BATCHES_PER_RUN = 200;

/**
 * Every column of the live table, read from the catalog, so a record is moved
 * whole (including the legacy `changes` payload and any column added later).
 * Archiving refuses to run when the archive table lacks one of them, because
 * moving the row would silently drop that value.
 */
async function archiveCopyColumns(schema: string): Promise<string> {
  const result = await pool.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name IN ('audit_logs', 'audit_logs_archive')
      ORDER BY ordinal_position`,
    [schema]
  );
  const rows = result.rows as Array<{ table_name: string; column_name: string }>;
  const live = rows.filter((r) => r.table_name === 'audit_logs').map((r) => r.column_name);
  const archive = new Set(rows.filter((r) => r.table_name === 'audit_logs_archive').map((r) => r.column_name));
  if (live.length === 0) throw new Error(`No audit_logs table in schema ${schema}`);
  const missing = live.filter((c) => !archive.has(c));
  if (missing.length > 0) {
    throw new Error(`audit_logs_archive in ${schema} is missing columns: ${missing.join(', ')} (run the migrations)`);
  }
  return live.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
}

export interface RetentionRunResult {
  tenantSlug: string;
  backfilled: number;
  archived: number;
  purgedLive: number;
  purgedArchive: number;
}

export interface PurgeResult {
  count: number;
  /** Inclusive [first, last] chain-position ranges that were removed */
  positions: Array<[number, number]>;
}

const MAX_RECORDED_RANGES = 1000;

/** Collapse chain positions into inclusive ranges. */
function toRanges(positions: number[]): Array<[number, number]> {
  const sorted = [...positions].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const p of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && p === last[1] + 1) last[1] = p;
    else if (!last || p > last[1]) ranges.push([p, p]);
  }
  return ranges;
}

/** Merge overlapping or adjacent inclusive ranges. */
function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((x, y) => x[0] - y[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * Check a retention / archive policy as it would be after applying `update`
 * to `current`. Returns an error message, or null when the policy is valid.
 */
export function validateRetentionPolicy(
  current: { retention_days: number; archive_after_days?: number | null },
  update: { retention_days?: number; archive_after_days?: number | null }
): string | null {
  const retention = update.retention_days ?? current.retention_days;
  const archive = update.archive_after_days !== undefined ? update.archive_after_days : current.archive_after_days;
  if (archive != null && archive >= retention) {
    return 'archive_after_days must be smaller than retention_days';
  }
  return null;
}

export interface LegalHoldScope {
  userId?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
}

export class AuditRetentionService {
  /**
   * Make every record's retention_until match the tenant's retention policy
   * (created_at + retention_days), in the live table and the archive. Called
   * when the policy changes and by the daily run, so raising or lowering
   * retention_days also applies to records stamped under an older policy.
   */
  async applyRetentionPolicy(tenantSlug: string, retentionDays: number): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    let changed = 0;
    for (const table of ['audit_logs', 'audit_logs_archive']) {
      const result = await pool.query(
        `UPDATE ${schema}.${table}
            SET retention_until = created_at + INTERVAL '1 day' * $1
          WHERE retention_until IS DISTINCT FROM created_at + INTERVAL '1 day' * $1`,
        [retentionDays]
      );
      changed += result.rowCount ?? 0;
    }
    return changed;
  }

  /** Move records older than archiveAfterDays into the archive table. */
  async archiveOld(tenantSlug: string, archiveAfterDays: number): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const columns = await archiveCopyColumns(schema);
    let total = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const moved = await pool.query(
        `WITH moved AS (
           DELETE FROM ${schema}.audit_logs
            WHERE id IN (
              SELECT id FROM ${schema}.audit_logs
               WHERE created_at < NOW() - INTERVAL '1 day' * $1
                 AND sequence < (SELECT MAX(sequence) FROM ${schema}.audit_logs)
               ORDER BY created_at
               LIMIT ${ARCHIVE_BATCH_SIZE}
            )
            RETURNING ${columns}
         )
         INSERT INTO ${schema}.audit_logs_archive (${columns}, archived_at)
         SELECT ${columns}, NOW() FROM moved`,
        [archiveAfterDays]
      );
      const count = moved.rowCount ?? 0;
      total += count;
      if (count < ARCHIVE_BATCH_SIZE) break;
    }

    return total;
  }

  /**
   * Delete expired records from the live table: retention_until has passed
   * (records without a stamp expire retentionDays after creation). Legal holds
   * and the newest record are always kept.
   */
  async purgeLive(tenantSlug: string, retentionDays: number | null = null): Promise<PurgeResult> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.audit_logs
        WHERE COALESCE(retention_until, created_at + INTERVAL '1 day' * $1) < NOW()
          AND (legal_hold IS NULL OR legal_hold = false)
          AND sequence < (SELECT MAX(sequence) FROM ${schema}.audit_logs)
        RETURNING chain_position`,
      [retentionDays && retentionDays > 0 ? retentionDays : null]
    );
    return this.toPurgeResult(result);
  }

  /** Delete expired records from the archive (same rule as purgeLive). Legal holds are always kept. */
  async purgeArchive(tenantSlug: string, retentionDays: number | null = null): Promise<PurgeResult> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `DELETE FROM ${schema}.audit_logs_archive
        WHERE COALESCE(retention_until, created_at + INTERVAL '1 day' * $1) < NOW()
          AND (legal_hold IS NULL OR legal_hold = false)
        RETURNING chain_position`,
      [retentionDays && retentionDays > 0 ? retentionDays : null]
    );
    return this.toPurgeResult(result);
  }

  private toPurgeResult(
    result: { rowCount?: number | null; rows?: Array<{ chain_position: string | number | null }> } | undefined
  ): PurgeResult {
    if (!result) return { count: 0, positions: [] };
    const positions = (result.rows ?? [])
      .filter((r) => r.chain_position !== null && r.chain_position !== undefined)
      .map((r) => Number(r.chain_position));
    return { count: result.rowCount ?? 0, positions: toRanges(positions) };
  }

  /**
   * Apply the tenant's retention policy once: re-stamp, optionally archive,
   * purge. The daily job, POST /v1/audit/retention/run and POST
   * /v1/audit/cleanup (archive: false) all use it; see purgeAndRecord for the
   * single delete path.
   */
  async runForTenant(
    tenantSlug: string,
    options: { archive?: boolean; mode?: string; actor?: Partial<AuditLogEntry> } = {}
  ): Promise<RetentionRunResult> {
    const settings = await auditService.getSettings(tenantSlug);

    const backfilled =
      settings.retention_days > 0 ? await this.applyRetentionPolicy(tenantSlug, settings.retention_days) : 0;
    const archived =
      options.archive !== false && settings.archive_after_days && settings.archive_after_days > 0
        ? await this.archiveOld(tenantSlug, settings.archive_after_days)
        : 0;
    const purged = await this.purgeAndRecord(tenantSlug, settings.retention_days, {
      archived,
      backfilled,
      mode: options.mode,
      actor: options.actor,
    });
    return { tenantSlug, backfilled, archived, ...purged };
  }

  /**
   * Delete expired records (live and archive) without re-stamping or
   * archiving: auditService.cleanupOldLogs. Same delete path as runForTenant.
   */
  async purgeExpired(
    tenantSlug: string,
    options: { mode?: string; actor?: Partial<AuditLogEntry> } = {}
  ): Promise<{ purgedLive: number; purgedArchive: number }> {
    const settings = await auditService.getSettings(tenantSlug);
    return this.purgeAndRecord(tenantSlug, settings.retention_days, { archived: 0, backfilled: 0, ...options });
  }

  /**
   * The only code path that deletes audit records. Every run that moved or
   * deleted records (or was started by an admin) writes one `retention_run`
   * record carrying the purged chain positions, so chain verification can
   * tell a retention purge from a deleted record. `actor` attributes that
   * record to the admin who triggered the run.
   */
  private async purgeAndRecord(
    tenantSlug: string,
    retentionDays: number,
    run: { archived: number; backfilled: number; mode?: string; actor?: Partial<AuditLogEntry> }
  ): Promise<{ purgedLive: number; purgedArchive: number }> {
    const live = await this.purgeLive(tenantSlug, retentionDays);
    const archive = await this.purgeArchive(tenantSlug, retentionDays);
    const purgedLive = live.count;
    const purgedArchive = archive.count;
    const { archived, backfilled } = run;

    if (backfilled > 0 || archived > 0 || purgedLive > 0 || purgedArchive > 0) {
      // Cached audit queries no longer reflect the tables.
      await cacheService.invalidateTenant(tenantSlug, 'audit');
    }

    if (archived > 0 || purgedLive > 0 || purgedArchive > 0 || run.actor) {
      logger.info({ tenantSlug, archived, purgedLive, purgedArchive, mode: run.mode }, 'Audit retention policy applied');
      // Deleting audit data is itself an audited event.
      const purgedPositions = mergeRanges([...live.positions, ...archive.positions]).slice(0, MAX_RECORDED_RANGES);
      await auditService.logSafe(tenantSlug, {
        ...(run.actor ?? {}),
        action: 'retention_run',
        entityType: 'audit_log',
        severity: 'medium',
        metadata: {
          ...(run.mode ? { mode: run.mode } : {}),
          archived,
          purgedLive,
          purgedArchive,
          deletedCount: purgedLive + purgedArchive,
          retentionDays,
          purgedPositions,
        },
      });
    }

    return { purgedLive, purgedArchive };
  }

  /** Set or clear legal hold on every record matching the scope (live and archive). */
  async setLegalHold(tenantSlug: string, scope: LegalHoldScope, hold: boolean): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [hold];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('$?', `$${params.length}`));
    };
    if (scope.userId) add('user_id = $?', scope.userId);
    if (scope.entityType) add('entity_type = $?', scope.entityType);
    if (scope.entityId) add('entity_id = $?', scope.entityId);
    if (scope.startDate) add('created_at >= $?', scope.startDate);
    if (scope.endDate) add('created_at <= $?', scope.endDate);

    if (conditions.length === 0) {
      throw new Error('A legal hold needs at least one scope filter');
    }

    const schema = tenantService.getSchemaName(tenantSlug);
    const where = conditions.join(' AND ');
    const live = await pool.query(
      `UPDATE ${schema}.audit_logs SET legal_hold = $1 WHERE ${where}`,
      params
    );
    const archived = await pool.query(
      `UPDATE ${schema}.audit_logs_archive SET legal_hold = $1 WHERE ${where}`,
      params
    );
    return (live.rowCount ?? 0) + (archived.rowCount ?? 0);
  }

  async getStorageStats(tenantSlug: string): Promise<{
    liveCount: number;
    archivedCount: number;
    legalHoldCount: number;
    oldestLive: Date | null;
    oldestArchived: Date | null;
  }> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const live = await pool.query(
      `SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest,
              COUNT(*) FILTER (WHERE legal_hold)::int AS held
         FROM ${schema}.audit_logs`
    );
    const archive = await pool.query(
      `SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest,
              COUNT(*) FILTER (WHERE legal_hold)::int AS held
         FROM ${schema}.audit_logs_archive`
    );
    return {
      liveCount: live.rows[0].count,
      archivedCount: archive.rows[0].count,
      legalHoldCount: live.rows[0].held + archive.rows[0].held,
      oldestLive: live.rows[0].oldest,
      oldestArchived: archive.rows[0].oldest,
    };
  }
}

export const auditRetentionService = new AuditRetentionService();
