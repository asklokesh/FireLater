import crypto from 'crypto';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';

// ============================================
// AUDIT CHAIN SERVICE
// Tamper-evident audit trail via SHA-256 hash-chaining
// ============================================

/** Recursively sort object keys so the same logical value always serializes the same way. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalize(source[key])])
    );
  }
  return value;
}

/**
 * Fields of a record covered by its content digest (everything not in the hash
 * payload itself), per digest version. Version 1 (rows sealed before
 * digest_version existed, stored as NULL) did not cover the legacy `changes`
 * column that services write directly; version 2 does. A row is always
 * verified with the field list of the version it was sealed with, and the
 * version itself is part of the record hash, so it cannot be downgraded.
 */
const AUDIT_CONTENT_FIELDS_V1 = [
  'user_email',
  'user_name',
  'entity_name',
  'old_values',
  'new_values',
  'changed_fields',
  'outcome',
  'severity',
  'http_method',
  'request_path',
  'status_code',
  'user_agent',
  'request_id',
] as const;

export const AUDIT_CONTENT_FIELDS = [...AUDIT_CONTENT_FIELDS_V1, 'changes'] as const;

/** Digest version written by sealPending today. */
export const AUDIT_DIGEST_VERSION = 2;

function contentFieldsFor(version: number): readonly string[] {
  return version >= 2 ? AUDIT_CONTENT_FIELDS : AUDIT_CONTENT_FIELDS_V1;
}

export interface ChainVerifyResult {
  valid: boolean;
  firstBrokenSequence?: number;
  checkedCount: number;
}

const COLUMNS = [
  'sequence', 'chain_position', 'prev_hash', 'record_hash', 'content_digest', 'action',
  'entity_type', 'entity_id', 'user_id', 'ip_address', 'created_at', 'metadata', 'digest_version',
  ...AUDIT_CONTENT_FIELDS,
].join(', ');

export class AuditChainService {
  /**
   * Compute a SHA-256 hash over a canonical JSON representation of the payload
   * combined with the previous record's hash.
   *
   * Canonical JSON sorts keys at every depth so that the same logical payload
   * always produces the same hash regardless of insertion order, and nested
   * values (e.g. metadata) are part of the hash.
   */
  computeHash(payload: Record<string, unknown>, prevHash: string | null): string {
    const canonicalPayload = JSON.stringify(canonicalize(payload));
    const data = `${canonicalPayload}|${prevHash ?? ''}`;
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * SHA-256 over the parts of a record that are not in the hash payload
   * (old/new values, changed fields, user email, outcome, ...). The digest is
   * stored with the record and included in the record hash.
   */
  computeContentDigest(fields: Record<string, unknown>, version: number = AUDIT_DIGEST_VERSION): string {
    const picked: Record<string, unknown> = {};
    for (const key of contentFieldsFor(version)) {
      const v = fields[key];
      picked[key] = v === undefined ? null : v;
    }
    return crypto.createHash('sha256').update(JSON.stringify(canonicalize(picked)), 'utf8').digest('hex');
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
   * Walks the live and archived records in chain order and checks, for each:
   *   - the record hash re-derived from its payload, content digest and prev_hash
   *   - the content digest re-derived from old/new values, user, outcome, ...
   *   - that prev_hash is the record hash of the preceding chain position
   * and that no chain position is missing unless a retention run recorded
   * purging it. Stops at the first broken record and returns its sequence.
   *
   * Records that were inserted before they were sealed (record_hash IS NULL)
   * are skipped; the integrity job and the verify endpoint seal them first.
   */
  async verifyChain(tenantSlug: string, from?: Date, to?: Date): Promise<ChainVerifyResult> {
    const schema = tenantService.getSchemaName(tenantSlug);

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
    const where = `WHERE ${conditions.join(' AND ')}`;
    const order = 'ORDER BY COALESCE(chain_position, sequence) ASC';

    let result;
    try {
      result = await pool.query(
        `SELECT ${COLUMNS} FROM (
           SELECT ${COLUMNS} FROM ${schema}.audit_logs
           UNION ALL
           SELECT ${COLUMNS} FROM ${schema}.audit_logs_archive
         ) AS chain
         ${where}
         ${order}`,
        params
      );
    } catch (error) {
      if ((error as { code?: string }).code !== '42P01') throw error;
      result = await pool.query(
        `SELECT ${COLUMNS} FROM ${schema}.audit_logs ${where} ${order}`,
        params
      );
    }

    type Row = Record<string, unknown> & {
      sequence: number | string;
      chain_position?: number | string | null;
      prev_hash: string | null;
      record_hash: string;
      content_digest?: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      user_id: string | null;
      ip_address: string | null;
      created_at: Date | string;
      metadata: Record<string, unknown> | null;
      digest_version?: number | string | null;
    };
    const rows = result.rows as Row[];

    if (rows.length === 0) {
      return { valid: true, checkedCount: 0 };
    }

    const broken = (index: number, reason: string): ChainVerifyResult => {
      const row = rows[index];
      logger.warn(
        { tenantSlug, sequence: row.sequence, reason, actualHash: row.record_hash },
        'Audit chain integrity failure detected'
      );
      return { valid: false, firstBrokenSequence: Number(row.sequence), checkedCount: index };
    };

    const gaps: Array<{ start: number; end: number; index: number }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const position =
        row.chain_position === null || row.chain_position === undefined ? null : Number(row.chain_position);

      // Build the same canonical payload that was used when sealing the record
      const payload: Record<string, unknown> = {
        action: row.action,
        created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
        entity_id: row.entity_id,
        entity_type: row.entity_type,
        ip_address: row.ip_address,
        metadata: row.metadata ?? {},
        // pg returns BIGINT as a string; the hash was computed over the number.
        sequence: Number(row.sequence),
        user_id: row.user_id,
      };
      if (position !== null) payload.chain_position = position;
      if (row.content_digest) {
        payload.content = row.content_digest;
        const version = row.digest_version === null || row.digest_version === undefined ? 1 : Number(row.digest_version);
        if (version >= 2) payload.digest_version = version;
        if (this.computeContentDigest(row, version) !== row.content_digest) return broken(i, 'content digest mismatch');
      }

      if (this.computeHash(payload, row.prev_hash) !== row.record_hash) return broken(i, 'record hash mismatch');

      if (i > 0 && position !== null) {
        const prev = rows[i - 1];
        const prevPosition =
          prev.chain_position === null || prev.chain_position === undefined ? null : Number(prev.chain_position);
        if (prevPosition !== null) {
          if (position === prevPosition + 1) {
            if (row.prev_hash !== prev.record_hash) return broken(i, 'prev_hash does not match the preceding record');
          } else if (position > prevPosition + 1) {
            gaps.push({ start: prevPosition + 1, end: position - 1, index: i });
          }
        }
      }
    }

    if (gaps.length > 0) {
      // Gaps are only legitimate where a retention run recorded purging them.
      const purged = await this.getPurgedRanges(schema);
      for (const gap of gaps) {
        for (let pos = gap.start; pos <= gap.end; pos++) {
          if (!purged.some(([a, b]) => pos >= a && pos <= b)) {
            return broken(gap.index, `chain position ${pos} is missing`);
          }
        }
      }
    }

    return { valid: true, checkedCount: rows.length };
  }

  /** Chain-position ranges that retention runs recorded as purged. */
  private async getPurgedRanges(schema: string): Promise<Array<[number, number]>> {
    const result = await pool.query(
      `SELECT metadata->'purgedPositions' AS ranges
         FROM (
           SELECT metadata, action FROM ${schema}.audit_logs
           UNION ALL
           SELECT metadata, action FROM ${schema}.audit_logs_archive
         ) AS runs
        WHERE action = 'retention_run' AND metadata ? 'purgedPositions'`
    );
    const ranges: Array<[number, number]> = [];
    for (const row of result.rows as Array<{ ranges: Array<[number, number]> | null }>) {
      for (const range of row.ranges ?? []) ranges.push([Number(range[0]), Number(range[1])]);
    }
    return ranges;
  }
}

export const auditChainService = new AuditChainService();
