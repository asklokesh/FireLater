import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../config/database.js';
import { tenantService } from './tenant.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ============================================
// LIMITS
// ============================================

/** Requests with more records than this are queued as background jobs. */
export const BULK_ASYNC_THRESHOLD = 1000;
/** Hard cap on records per bulk request. */
export const BULK_MAX_RECORDS = 50000;
/** Records touched per SQL statement. */
export const BULK_CHUNK_SIZE = 1000;

// ============================================
// ENTITY DEFINITIONS (whitelisted tables and columns)
// ============================================

export const BULK_ENTITIES = ['issues', 'problems', 'changes', 'requests'] as const;
export type BulkEntity = (typeof BULK_ENTITIES)[number];

export const BULK_OPERATIONS = ['update', 'delete', 'status', 'assign'] as const;
export type BulkOperation = (typeof BULK_OPERATIONS)[number];

const uuid = z.string().uuid();
const priority4 = z.enum(['critical', 'high', 'medium', 'low']);
const impact4 = z.enum(['widespread', 'significant', 'moderate', 'minor']);
const urgency4 = z.enum(['immediate', 'high', 'medium', 'low']);

interface EntityDef {
  table: string;
  numberColumn: string;
  /** Permission resource, e.g. `issues` for `issues:update`. */
  permission: string;
  /** Permission action required to bulk assign (changes have no assign permission). */
  assignAction: 'assign' | 'update';
  /** Editable fields: payload key -> { column, validator }. */
  fields: Record<string, { column: string; schema: z.ZodTypeAny }>;
  statuses: readonly [string, ...string[]];
  /** Payload key -> column used by the assign operation. */
  assignFields: { user: { key: string; column: string }; group: { key: string; column: string } };
  /** Extra SQL assignments applied per target status. `$USER` is the acting user parameter. */
  statusSideEffects: Record<string, string[]>;
  /** Assigning a record in this status moves it to `assigned`. */
  assignAdvancesNew: boolean;
}

export const ENTITY_DEFS: Record<BulkEntity, EntityDef> = {
  issues: {
    table: 'issues',
    numberColumn: 'issue_number',
    permission: 'issues',
    assignAction: 'assign',
    fields: {
      title: { column: 'title', schema: z.string().min(5).max(500) },
      description: { column: 'description', schema: z.string().max(10000).nullable() },
      priority: { column: 'priority', schema: priority4 },
      severity: { column: 'severity', schema: z.enum(['S1', 'S2', 'S3', 'S4']) },
      impact: { column: 'impact', schema: impact4 },
      urgency: { column: 'urgency', schema: urgency4 },
      categoryId: { column: 'category_id', schema: uuid.nullable() },
      applicationId: { column: 'application_id', schema: uuid.nullable() },
      environmentId: { column: 'environment_id', schema: uuid.nullable() },
      assignedTo: { column: 'assigned_to', schema: uuid.nullable() },
      assignedGroup: { column: 'assigned_group', schema: uuid.nullable() },
    },
    statuses: ['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed'],
    assignFields: {
      user: { key: 'assignedTo', column: 'assigned_to' },
      group: { key: 'assignedGroup', column: 'assigned_group' },
    },
    statusSideEffects: {
      resolved: ['resolved_at = NOW()', 'resolved_by = $USER'],
      closed: ['closed_at = NOW()', 'closed_by = $USER'],
    },
    assignAdvancesNew: true,
  },
  problems: {
    table: 'problems',
    numberColumn: 'problem_number',
    permission: 'problems',
    assignAction: 'assign',
    fields: {
      title: { column: 'title', schema: z.string().min(5).max(500) },
      description: { column: 'description', schema: z.string().max(10000).nullable() },
      priority: { column: 'priority', schema: priority4 },
      impact: { column: 'impact', schema: impact4 },
      urgency: { column: 'urgency', schema: urgency4 },
      categoryId: { column: 'category_id', schema: uuid.nullable() },
      applicationId: { column: 'application_id', schema: uuid.nullable() },
      assignedTo: { column: 'assigned_to', schema: uuid.nullable() },
      assignedGroup: { column: 'assigned_group', schema: uuid.nullable() },
    },
    statuses: ['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed'],
    assignFields: {
      user: { key: 'assignedTo', column: 'assigned_to' },
      group: { key: 'assignedGroup', column: 'assigned_group' },
    },
    statusSideEffects: {
      resolved: ['resolved_at = NOW()', 'resolved_by = $USER'],
      closed: ['closed_at = NOW()', 'closed_by = $USER'],
    },
    assignAdvancesNew: true,
  },
  changes: {
    table: 'change_requests',
    numberColumn: 'change_number',
    permission: 'changes',
    assignAction: 'update',
    fields: {
      title: { column: 'title', schema: z.string().min(5).max(500) },
      description: { column: 'description', schema: z.string().max(10000).nullable() },
      riskLevel: { column: 'risk_level', schema: z.enum(['low', 'medium', 'high', 'critical']) },
      impact: { column: 'impact', schema: z.enum(['none', 'minor', 'moderate', 'significant', 'major']) },
      urgency: { column: 'urgency', schema: z.enum(['low', 'medium', 'high']) },
      applicationId: { column: 'application_id', schema: uuid.nullable() },
      environmentId: { column: 'environment_id', schema: uuid.nullable() },
      implementerId: { column: 'implementer_id', schema: uuid.nullable() },
      assignedGroup: { column: 'assigned_group', schema: uuid.nullable() },
    },
    statuses: [
      'draft', 'submitted', 'review', 'approved', 'rejected', 'scheduled',
      'implementing', 'completed', 'failed', 'rolled_back', 'cancelled',
    ],
    assignFields: {
      user: { key: 'assignedTo', column: 'implementer_id' },
      group: { key: 'assignedGroup', column: 'assigned_group' },
    },
    statusSideEffects: {},
    assignAdvancesNew: false,
  },
  requests: {
    table: 'service_requests',
    numberColumn: 'request_number',
    permission: 'requests',
    assignAction: 'assign',
    fields: {
      priority: { column: 'priority', schema: z.enum(['low', 'medium', 'high', 'critical']) },
      notes: { column: 'notes', schema: z.string().max(10000).nullable() },
      assignedTo: { column: 'assigned_to', schema: uuid.nullable() },
      fulfillmentGroupId: { column: 'fulfillment_group_id', schema: uuid.nullable() },
    },
    statuses: ['submitted', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled'],
    assignFields: {
      user: { key: 'assignedTo', column: 'assigned_to' },
      group: { key: 'assignedGroup', column: 'fulfillment_group_id' },
    },
    statusSideEffects: {
      completed: ['completed_at = NOW()', 'completed_by = $USER'],
      cancelled: ['cancelled_at = NOW()', 'cancelled_by = $USER'],
    },
    assignAdvancesNew: false,
  },
};

export function isBulkEntity(value: string): value is BulkEntity {
  return (BULK_ENTITIES as readonly string[]).includes(value);
}

export function isBulkOperation(value: string): value is BulkOperation {
  return (BULK_OPERATIONS as readonly string[]).includes(value);
}

// ============================================
// PAYLOAD VALIDATION
// ============================================

const idList = z
  .array(uuid)
  .min(1, 'ids must contain at least one id')
  .max(BULK_MAX_RECORDS, `ids must not exceed ${BULK_MAX_RECORDS} records`);

const commonOptions = {
  /** Force background execution even below the threshold. */
  async: z.boolean().optional(),
  /** Called (HTTP POST) with progress and completion events for async jobs. */
  webhookUrl: z.string().url().max(2000).optional(),
  reason: z.string().max(500).optional(),
};

function buildChangesSchema(entity: BulkEntity) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, def] of Object.entries(ENTITY_DEFS[entity].fields)) {
    shape[key] = def.schema.optional();
  }
  return z
    .object(shape)
    .strict()
    .refine((value) => Object.values(value).some((v) => v !== undefined), {
      message: 'changes must set at least one field',
    });
}

/**
 * Build the payload schema for one entity and operation.
 * update accepts either `ids` + `changes` (same values for all) or
 * `items` (different values per record).
 */
export function getBulkSchema(entity: BulkEntity, operation: BulkOperation) {
  const def = ENTITY_DEFS[entity];
  switch (operation) {
    case 'update': {
      const changes = buildChangesSchema(entity);
      return z
        .object({
          ids: idList.optional(),
          changes: changes.optional(),
          items: z
            .array(z.object({ id: uuid, changes }))
            .min(1)
            .max(BULK_MAX_RECORDS)
            .optional(),
          ...commonOptions,
        })
        .strict()
        .superRefine((value, ctx) => {
          const uniform = value.ids !== undefined || value.changes !== undefined;
          if (value.items && uniform) {
            ctx.addIssue({ code: 'custom', message: 'Provide either items or ids with changes, not both' });
          } else if (!value.items && !(value.ids && value.changes)) {
            ctx.addIssue({ code: 'custom', message: 'Provide ids with changes, or items' });
          }
        });
    }
    case 'delete':
      return z.object({ ids: idList, ...commonOptions }).strict();
    case 'status':
      return z
        .object({ ids: idList, status: z.enum(def.statuses), ...commonOptions })
        .strict();
    case 'assign':
      return z
        .object({
          ids: idList,
          assignedTo: uuid.nullable().optional(),
          assignedGroup: uuid.nullable().optional(),
          ...commonOptions,
        })
        .strict()
        .refine((v) => v.assignedTo !== undefined || v.assignedGroup !== undefined, {
          message: 'Provide assignedTo and/or assignedGroup',
        });
  }
}

export interface BulkPayload {
  ids?: string[];
  changes?: Record<string, unknown>;
  items?: Array<{ id: string; changes: Record<string, unknown> }>;
  status?: string;
  assignedTo?: string | null;
  assignedGroup?: string | null;
  async?: boolean;
  webhookUrl?: string;
  reason?: string;
}

/** Number of records a validated payload touches (distinct ids). */
export function countRecords(payload: BulkPayload): number {
  const ids = payload.items ? payload.items.map((i) => i.id) : payload.ids || [];
  return new Set(ids).size;
}

/** True when the request must run as a background job. */
export function shouldRunAsync(payload: BulkPayload): boolean {
  return payload.async === true || countRecords(payload) > BULK_ASYNC_THRESHOLD;
}

// ============================================
// EXECUTION
// ============================================

export interface BulkActor {
  userId: string;
  tenantSlug: string;
}

export interface BulkResult {
  entity: BulkEntity;
  operation: BulkOperation;
  requested: number;
  affected: number;
}

export type BulkProgress = (processed: number, total: number) => void | Promise<void>;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Lock the rows and return their current state; throws when any id is missing. */
async function lockRows(
  client: Pick<PoolClient, 'query'>,
  schema: string,
  def: EntityDef,
  ids: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const result = await client.query(
    `SELECT * FROM ${schema}.${def.table} WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [ids]
  );
  const rows = new Map<string, Record<string, unknown>>();
  for (const row of result.rows) {
    rows.set(row.id as string, row);
  }
  if (rows.size !== ids.length) {
    const missing = ids.filter((id) => !rows.has(id));
    throw new NotFoundError(def.table, missing.slice(0, 5).join(', ') + (missing.length > 5 ? ` (+${missing.length - 5} more)` : ''));
  }
  return rows;
}

interface AuditRow {
  entityId: string;
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

async function writeAudit(
  client: Pick<PoolClient, 'query'>,
  schema: string,
  actor: BulkActor,
  entity: BulkEntity,
  action: 'update' | 'delete' | 'assign',
  rows: AuditRow[],
  metadata: Record<string, unknown>
): Promise<void> {
  if (rows.length === 0) return;
  await client.query(
    `INSERT INTO ${schema}.audit_logs
       (user_id, action, entity_type, entity_id, old_values, new_values, changed_fields, metadata)
     SELECT $1, $2, $3, t.entity_id, t.old_values, t.new_values,
            (SELECT array_agg(k) FROM jsonb_object_keys(t.new_values) k), $4::jsonb
     FROM unnest($5::uuid[], $6::jsonb[], $7::jsonb[]) AS t(entity_id, old_values, new_values)`,
    [
      actor.userId,
      action,
      entity,
      JSON.stringify(metadata),
      rows.map((r) => r.entityId),
      rows.map((r) => JSON.stringify(r.oldValues)),
      rows.map((r) => JSON.stringify(r.newValues)),
    ]
  );
}

function snapshot(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of columns) out[c] = row[c] ?? null;
  return out;
}

interface Assignment {
  column: string;
  value: unknown;
}

/**
 * Apply the same column assignments to one chunk of ids and audit them.
 * `extraSql` carries computed assignments (timestamps) that have no parameter.
 */
async function applyAssignments(
  client: Pick<PoolClient, 'query'>,
  schema: string,
  actor: BulkActor,
  entity: BulkEntity,
  ids: string[],
  assignments: Assignment[],
  extraSql: string[],
  auditAction: 'update' | 'assign',
  metadata: Record<string, unknown>,
  advanceNew = false
): Promise<number> {
  const def = ENTITY_DEFS[entity];
  const rows = await lockRows(client, schema, def, ids);
  await verifyReferences(client, schema, assignments);

  const params: unknown[] = [ids];
  const sets: string[] = [];
  for (const a of assignments) {
    params.push(a.value);
    sets.push(`${a.column} = $${params.length}`);
  }
  if (extraSql.length > 0) {
    params.push(actor.userId);
    for (const s of extraSql) sets.push(s.replace('$USER', `$${params.length}::uuid`));
  }
  if (advanceNew) sets.push(`status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END`);
  sets.push('updated_at = NOW()');

  const result = await client.query(
    `UPDATE ${schema}.${def.table} SET ${sets.join(', ')} WHERE id = ANY($1::uuid[])`,
    params
  );

  const touched = assignments.map((a) => a.column);
  const newVals: Record<string, unknown> = {};
  for (const a of assignments) newVals[a.column] = a.value ?? null;
  const oldCols = [...touched, 'status'];
  await writeAudit(
    client,
    schema,
    actor,
    entity,
    auditAction,
    ids.map((id) => ({
      entityId: id,
      oldValues: snapshot(rows.get(id)!, oldCols),
      newValues: newVals,
    })),
    metadata
  );
  return result.rowCount ?? 0;
}

// Tenant schemas are cloned without foreign keys, so referenced ids are verified explicitly.
const REFERENCE_TABLES: Record<string, string> = {
  assigned_to: 'users',
  implementer_id: 'users',
  assigned_group: 'groups',
  fulfillment_group_id: 'groups',
  application_id: 'applications',
  environment_id: 'environments',
  category_id: 'issue_categories',
};

async function verifyReferences(
  client: Pick<PoolClient, 'query'>,
  schema: string,
  assignments: Assignment[]
): Promise<void> {
  for (const a of assignments) {
    const table = REFERENCE_TABLES[a.column];
    if (!table || a.value === null || a.value === undefined) continue;
    const found = await client.query(`SELECT 1 FROM ${schema}.${table} WHERE id = $1::uuid`, [a.value]);
    if (found.rowCount === 0) {
      throw new BadRequestError(`${a.column} '${String(a.value)}' does not exist; no changes were applied`);
    }
  }
}

function mapDbError(error: unknown): never {
  const code = (error as { code?: string })?.code;
  if (code === '23503') {
    throw new ConflictError('A referenced record does not exist or the record is still referenced by other data; no changes were applied');
  }
  if (code === '22P02' || code === '23514' || code === '22001') {
    throw new BadRequestError('A value in the bulk payload was rejected by the database; no changes were applied');
  }
  throw error;
}

/**
 * Run a bulk operation inside the supplied client's transaction.
 * The caller owns BEGIN/COMMIT/ROLLBACK so the whole request is all-or-nothing.
 */
export async function runBulkInTransaction(
  client: Pick<PoolClient, 'query'>,
  actor: BulkActor,
  entity: BulkEntity,
  operation: BulkOperation,
  payload: BulkPayload,
  onProgress?: BulkProgress,
  operationId?: string
): Promise<BulkResult> {
  const def = ENTITY_DEFS[entity];
  const schema = tenantService.getSchemaName(actor.tenantSlug);
  const metadata: Record<string, unknown> = {
    bulk: true,
    operation,
    ...(operationId ? { operationId } : {}),
    ...(payload.reason ? { reason: payload.reason } : {}),
  };

  const total = countRecords(payload);
  let processed = 0;
  let affected = 0;
  const advance = async (count: number) => {
    processed += count;
    if (onProgress) await onProgress(processed, total);
  };

  if (operation === 'update' && payload.items) {
    // Group records that share identical change sets so each group is one statement.
    const groups = new Map<string, { changes: Record<string, unknown>; ids: string[] }>();
    const seen = new Set<string>();
    for (const item of payload.items) {
      if (seen.has(item.id)) throw new BadRequestError(`Duplicate id in items: ${item.id}`);
      seen.add(item.id);
      const normalized = Object.fromEntries(
        Object.entries(item.changes).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
      );
      const key = JSON.stringify(normalized);
      const group = groups.get(key) || { changes: normalized, ids: [] };
      group.ids.push(item.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const assignments = toAssignments(def, group.changes);
      for (const ids of chunk(group.ids, BULK_CHUNK_SIZE)) {
        affected += await applyAssignments(client, schema, actor, entity, ids, assignments, [], 'update', metadata);
        await advance(ids.length);
      }
    }
    return { entity, operation, requested: total, affected };
  }

  const ids = dedupe(payload.ids || []);

  for (const ids_ of chunk(ids, BULK_CHUNK_SIZE)) {
    switch (operation) {
      case 'update':
        affected += await applyAssignments(
          client, schema, actor, entity, ids_, toAssignments(def, payload.changes || {}), [], 'update', metadata
        );
        break;
      case 'assign': {
        const assignments: Assignment[] = [];
        if (payload.assignedTo !== undefined) {
          assignments.push({ column: def.assignFields.user.column, value: payload.assignedTo });
        }
        if (payload.assignedGroup !== undefined) {
          assignments.push({ column: def.assignFields.group.column, value: payload.assignedGroup });
        }
        affected += await applyAssignments(
          client, schema, actor, entity, ids_, assignments, [], 'assign', metadata, def.assignAdvancesNew
        );
        break;
      }
      case 'status': {
        const extra = def.statusSideEffects[payload.status as string] || [];
        affected += await applyStatus(client, schema, actor, entity, ids_, payload.status as string, extra, metadata);
        break;
      }
      case 'delete': {
        const rows = await lockRows(client, schema, def, ids_);
        const result = await client.query(
          `DELETE FROM ${schema}.${def.table} WHERE id = ANY($1::uuid[])`,
          [ids_]
        );
        affected += result.rowCount ?? 0;
        await writeAudit(
          client, schema, actor, entity, 'delete',
          ids_.map((id) => ({
            entityId: id,
            oldValues: snapshot(rows.get(id)!, [def.numberColumn, 'status']),
            newValues: { deleted: true },
          })),
          metadata
        );
        break;
      }
    }
    await advance(ids_.length);
  }

  return { entity, operation, requested: total, affected };
}

async function applyStatus(
  client: Pick<PoolClient, 'query'>,
  schema: string,
  actor: BulkActor,
  entity: BulkEntity,
  ids: string[],
  status: string,
  extraSql: string[],
  metadata: Record<string, unknown>
): Promise<number> {
  const def = ENTITY_DEFS[entity];
  const rows = await lockRows(client, schema, def, ids);
  const params: unknown[] = [ids, status];
  const sets = ['status = $2'];
  if (extraSql.length > 0) {
    params.push(actor.userId);
    for (const s of extraSql) sets.push(s.replace('$USER', `$${params.length}::uuid`));
  }
  sets.push('updated_at = NOW()');
  const result = await client.query(
    `UPDATE ${schema}.${def.table} SET ${sets.join(', ')} WHERE id = ANY($1::uuid[])`,
    params
  );
  await writeAudit(
    client, schema, actor, entity, 'update',
    ids.map((id) => ({
      entityId: id,
      oldValues: { status: rows.get(id)!.status ?? null },
      newValues: { status },
    })),
    metadata
  );
  return result.rowCount ?? 0;
}

function toAssignments(def: EntityDef, changes: Record<string, unknown>): Assignment[] {
  const out: Assignment[] = [];
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    const field = def.fields[key];
    if (!field) throw new BadRequestError(`Field '${key}' cannot be bulk updated`);
    out.push({ column: field.column, value });
  }
  if (out.length === 0) throw new BadRequestError('changes must set at least one field');
  return out;
}

/** Execute a bulk operation atomically in its own transaction. */
export async function executeBulk(
  actor: BulkActor,
  entity: BulkEntity,
  operation: BulkOperation,
  payload: BulkPayload,
  onProgress?: BulkProgress,
  operationId?: string
): Promise<BulkResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await runBulkInTransaction(client, actor, entity, operation, payload, onProgress, operationId);
    await client.query('COMMIT');
    logger.info({ ...result, tenantSlug: actor.tenantSlug, userId: actor.userId }, 'Bulk operation committed');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, 'Bulk rollback failed');
    }
    logger.warn({ entity, operation, tenantSlug: actor.tenantSlug, err: error }, 'Bulk operation rolled back');
    return mapDbError(error);
  } finally {
    client.release();
  }
}
