import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

// ============================================
// TYPES
// ============================================

export interface PendingOperation {
  id: string;
  operation_type: string;
  entity_type?: string;
  entity_id?: string;
  maker_id: string;
  maker_email?: string;
  checker_id?: string;
  checker_email?: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  justification?: string;
  checker_comment?: string;
  expires_at: string;
  decided_at?: string;
  created_at: string;
}

export interface MakerCheckerConfigEntry {
  id: string;
  operation_type: string;
  description: string | null;
  expiry_hours: number;
  is_active: boolean;
  created_at: string;
}

export interface CreatePendingOperationParams {
  operationType: string;
  entityType?: string;
  entityId?: string;
  makerId: string;
  makerEmail?: string;
  payload: Record<string, unknown>;
  justification?: string;
}

export interface ListOperationsFilters {
  status?: string;
  makerId?: string;
  operationType?: string;
}

// ============================================
// SERVICE
// ============================================

export class MakerCheckerService {
  /**
   * Check if a given operation type has an active maker-checker config
   */
  async requiresMakerChecker(tenantSlug: string, operationType: string): Promise<boolean> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT 1 FROM ${schema}.maker_checker_config
       WHERE operation_type = $1 AND is_active = true
       LIMIT 1`,
      [operationType]
    );
    return result.rows.length > 0;
  }

  /**
   * Create a pending operation (submitted by the maker)
   */
  async createPendingOperation(
    tenantSlug: string,
    params: CreatePendingOperationParams
  ): Promise<PendingOperation> {
    const schema = tenantService.getSchemaName(tenantSlug);

    // Resolve expiry hours from config (default 24h if not configured)
    const configResult = await pool.query(
      `SELECT expiry_hours FROM ${schema}.maker_checker_config
       WHERE operation_type = $1 AND is_active = true
       LIMIT 1`,
      [params.operationType]
    );
    const expiryHours: number = configResult.rows[0]?.expiry_hours ?? 24;

    const result = await pool.query(
      `INSERT INTO ${schema}.pending_operations
         (operation_type, entity_type, entity_id, maker_id, maker_email,
          payload, justification, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '1 hour' * $8)
       RETURNING *`,
      [
        params.operationType,
        params.entityType ?? null,
        params.entityId ?? null,
        params.makerId,
        params.makerEmail ?? null,
        JSON.stringify(params.payload),
        params.justification ?? null,
        expiryHours,
      ]
    );

    const op = result.rows[0] as PendingOperation;
    logger.info(
      { tenantSlug, operationId: op.id, operationType: params.operationType, makerId: params.makerId },
      'Pending operation created'
    );
    return op;
  }

  /**
   * Approve a pending operation. Checker must differ from maker.
   */
  async approve(
    tenantSlug: string,
    operationId: string,
    checkerId: string,
    checkerEmail?: string,
    comment?: string
  ): Promise<PendingOperation> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.getById(tenantSlug, operationId);

    if (existing.maker_id === checkerId) {
      throw new BadRequestError('Checker must be different from maker (four-eyes principle)');
    }

    if (existing.status !== 'pending') {
      throw new BadRequestError(`Operation is already in '${existing.status}' status`);
    }

    if (new Date(existing.expires_at) < new Date()) {
      throw new BadRequestError('Operation has expired and can no longer be approved');
    }

    const result = await pool.query(
      `UPDATE ${schema}.pending_operations
       SET status = 'approved',
           checker_id = $2,
           checker_email = $3,
           checker_comment = $4,
           decided_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [operationId, checkerId, checkerEmail ?? null, comment ?? null]
    );

    const op = result.rows[0] as PendingOperation;
    logger.info(
      { tenantSlug, operationId, checkerId },
      'Pending operation approved'
    );
    return op;
  }

  /**
   * Reject a pending operation.
   */
  async reject(
    tenantSlug: string,
    operationId: string,
    checkerId: string,
    checkerEmail?: string,
    comment?: string
  ): Promise<PendingOperation> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const existing = await this.getById(tenantSlug, operationId);

    if (existing.maker_id === checkerId) {
      throw new BadRequestError('Checker must be different from maker (four-eyes principle)');
    }

    if (existing.status !== 'pending') {
      throw new BadRequestError(`Operation is already in '${existing.status}' status`);
    }

    const result = await pool.query(
      `UPDATE ${schema}.pending_operations
       SET status = 'rejected',
           checker_id = $2,
           checker_email = $3,
           checker_comment = $4,
           decided_at = NOW(),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [operationId, checkerId, checkerEmail ?? null, comment ?? null]
    );

    const op = result.rows[0] as PendingOperation;
    logger.info(
      { tenantSlug, operationId, checkerId },
      'Pending operation rejected'
    );
    return op;
  }

  /**
   * Retrieve a pending operation by its ID.
   */
  async getById(tenantSlug: string, id: string): Promise<PendingOperation> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.pending_operations WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      throw new NotFoundError('PendingOperation', id);
    }
    return result.rows[0] as PendingOperation;
  }

  /**
   * List pending operations with optional filters.
   */
  async list(
    tenantSlug: string,
    filters: ListOperationsFilters = {}
  ): Promise<PendingOperation[]> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.makerId) {
      conditions.push(`maker_id = $${idx++}`);
      values.push(filters.makerId);
    }
    if (filters.operationType) {
      conditions.push(`operation_type = $${idx++}`);
      values.push(filters.operationType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM ${schema}.pending_operations ${where} ORDER BY created_at DESC`,
      values
    );

    return result.rows as PendingOperation[];
  }

  /**
   * Expire stale pending operations past their deadline.
   * Returns the number of records updated.
   */
  async expireStale(tenantSlug: string): Promise<number> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `UPDATE ${schema}.pending_operations
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending' AND expires_at < NOW()`,
      []
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ tenantSlug, expired: count }, 'Expired stale pending operations');
    }
    return count;
  }

  /**
   * List maker-checker configuration entries.
   */
  async listConfig(tenantSlug: string): Promise<MakerCheckerConfigEntry[]> {
    const schema = tenantService.getSchemaName(tenantSlug);
    const result = await pool.query(
      `SELECT * FROM ${schema}.maker_checker_config ORDER BY operation_type`
    );
    return result.rows as MakerCheckerConfigEntry[];
  }

  /**
   * Upsert a maker-checker config entry.
   */
  async upsertConfig(
    tenantSlug: string,
    operationType: string,
    config: { description?: string; expiryHours?: number; isActive?: boolean }
  ): Promise<void> {
    const schema = tenantService.getSchemaName(tenantSlug);

    const setParts: string[] = [];
    const values: unknown[] = [operationType];
    let idx = 2;

    if (config.description !== undefined) {
      setParts.push(`description = $${idx++}`);
      values.push(config.description);
    }
    if (config.expiryHours !== undefined) {
      setParts.push(`expiry_hours = $${idx++}`);
      values.push(config.expiryHours);
    }
    if (config.isActive !== undefined) {
      setParts.push(`is_active = $${idx++}`);
      values.push(config.isActive);
    }

    if (setParts.length === 0) {
      // Nothing to update — just ensure the row exists
      await pool.query(
        `INSERT INTO ${schema}.maker_checker_config (operation_type)
         VALUES ($1)
         ON CONFLICT (operation_type) DO NOTHING`,
        [operationType]
      );
      return;
    }

    await pool.query(
      `INSERT INTO ${schema}.maker_checker_config (operation_type, ${setParts.map((p) => p.split(' = ')[0]).join(', ')})
       VALUES ($1, ${Array.from({ length: setParts.length }, (_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (operation_type) DO UPDATE SET ${setParts.join(', ')}`,
      values
    );

    logger.info({ tenantSlug, operationType }, 'Upserted maker-checker config');
  }
}

export const makerCheckerService = new MakerCheckerService();
