import type { FastifyInstance, FastifyRequest } from 'fastify';
import { pool } from '../config/database.js';
import { tenantService } from '../services/tenant.js';
import { auditService, diffValues, type AuditAction, type AuditLogEntry } from '../services/audit.js';
import { logger } from '../utils/logger.js';
import type { AuditOutcome, AuditSeverity } from '../lib/audit-search.js';

// ============================================
// AUDIT HOOKS
//
// Application-wide action logging. Registered once on the root Fastify
// instance, they record who did what, to which entity, from where:
//
//   preHandler  - for updates and deletes of registered entities, snapshot the
//                 row before the handler changes it
//   onSend      - for creates, remember the id of the new entity
//   onResponse  - classify the request, snapshot the row again, diff the two
//                 (field-level old/new values) and write the audit record
//
// Reads are logged only when the tenant enabled log_reads / log_exports.
// Denied requests (403) are always logged. Writing happens after the response
// has been sent, and a failure to audit never fails the request.
// ============================================

declare module 'fastify' {
  interface FastifyRequest {
    auditBefore?: Record<string, unknown> | null;
    auditCreated?: { id?: string; name?: string };
  }
}

interface EntityDef {
  entityType: string;
  table: string;
  /**
   * Join-table state that is part of the entity: field name -> SQL (taking the
   * entity id as $1) returning one row with a column `v` (an array). Snapshotted
   * with the row so changes such as granted roles or group members are diffed.
   */
  relations?: Record<string, (schema: string) => string>;
}

/** URL prefix (after /v1/) -> entity. Longest prefix wins. */
export const AUDIT_ENTITY_REGISTRY: Record<string, EntityDef> = {
  issues: { entityType: 'issue', table: 'issues' },
  problems: { entityType: 'problem', table: 'problems' },
  changes: { entityType: 'change', table: 'change_requests' },
  applications: { entityType: 'application', table: 'applications' },
  users: {
    entityType: 'user',
    table: 'users',
    relations: {
      roles: (schema) =>
        `SELECT COALESCE(array_agg(r.name ORDER BY r.name), '{}') AS v
           FROM ${schema}.user_roles ur JOIN ${schema}.roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1`,
    },
  },
  groups: {
    entityType: 'group',
    table: 'groups',
    relations: {
      members: (schema) =>
        `SELECT COALESCE(array_agg(user_id::text ORDER BY user_id), '{}') AS v
           FROM ${schema}.group_members WHERE group_id = $1`,
    },
  },
  roles: { entityType: 'role', table: 'roles' },
  assets: { entityType: 'asset', table: 'assets' },
  requests: { entityType: 'request', table: 'service_requests' },
  // knowledgeRoutes is mounted at /v1/kb (GET /:articleId, PUT /:articleId, ...)
  kb: { entityType: 'kb_article', table: 'kb_articles' },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Never audited: the audit API itself, health, realtime sockets, token refresh. */
const SKIP_PREFIXES = ['/v1/audit', '/v1/ws', '/health', '/ready', '/v1/auth/refresh', '/csrf-token', '/docs'];
/** Fields that change on every update and carry no audit value. */
const DIFF_IGNORE = ['updated_at', 'updatedAt', 'version'];
const NAME_FIELDS = ['title', 'name', 'display_name', 'subject', 'email'];
const VERB_ACTIONS: Record<string, AuditAction> = {
  assign: 'assign',
  approve: 'approve',
  reject: 'reject',
  escalate: 'escalate',
  export: 'export',
};
const MAX_CAPTURE_BYTES = 64 * 1024;

export interface AuditTarget {
  /** Path segments after /v1 */
  segments: string[];
  entity?: EntityDef;
  entityType: string;
  entityId?: string;
  /** Segment after the id, e.g. "assign" in /issues/:id/assign */
  verb?: string;
  /** Everything after the entity id, e.g. "members/<userId>" in /groups/:id/members/:userId */
  subResource?: string;
}

/** Work out which entity a request URL addresses. */
export function resolveAuditTarget(url: string): AuditTarget | null {
  const path = url.split('?')[0];
  if (!path.startsWith('/v1/')) return null;
  const segments = path.slice(4).split('/').filter(Boolean);
  if (segments.length === 0) return null;

  let entity: EntityDef | undefined;
  let consumed = 1;
  if (segments.length >= 2 && AUDIT_ENTITY_REGISTRY[`${segments[0]}/${segments[1]}`]) {
    entity = AUDIT_ENTITY_REGISTRY[`${segments[0]}/${segments[1]}`];
    consumed = 2;
  } else if (AUDIT_ENTITY_REGISTRY[segments[0]]) {
    entity = AUDIT_ENTITY_REGISTRY[segments[0]];
  }

  const idIndex = segments.findIndex((s, i) => i >= consumed && UUID_RE.test(s));
  const entityId = idIndex >= 0 ? segments[idIndex] : undefined;
  const verb =
    idIndex >= 0
      ? segments[idIndex + 1]
      : segments.length > consumed
        ? segments[consumed]
        : undefined;

  return {
    segments,
    entity,
    entityType: entity?.entityType ?? segments.slice(0, consumed).join('_').replace(/-/g, '_'),
    entityId,
    verb: verb && !UUID_RE.test(verb) ? verb : undefined,
    subResource: idIndex >= 0 && segments.length > idIndex + 1 ? segments.slice(idIndex + 1).join('/') : undefined,
  };
}

export interface AuditClassification {
  action: AuditAction;
  severity: AuditSeverity;
}

/** Map an HTTP request to an audit action and severity. */
export function classifyRequest(method: string, target: AuditTarget): AuditClassification {
  const first = target.segments[0];

  if (first === 'auth' && MUTATING.has(method)) {
    return target.verb === 'logout'
      ? { action: 'logout', severity: 'info' }
      : { action: 'update', severity: 'medium' };
  }
  if (first === 'roles' || target.verb === 'roles' || target.verb === 'permissions') {
    if (MUTATING.has(method)) {
      return { action: method === 'DELETE' ? 'permission_revoked' : 'permission_granted', severity: 'high' };
    }
  }
  if (first === 'settings' && MUTATING.has(method)) {
    return { action: 'config_change', severity: 'medium' };
  }
  if (target.verb && VERB_ACTIONS[target.verb] && MUTATING.has(method)) {
    return { action: VERB_ACTIONS[target.verb], severity: 'info' };
  }

  switch (method) {
    case 'POST':
      return { action: target.entityId ? 'update' : 'create', severity: 'info' };
    case 'PUT':
    case 'PATCH':
      return { action: 'update', severity: 'info' };
    case 'DELETE':
      // Removing a member / link / environment changes the parent, it does not delete it.
      return target.subResource !== undefined
        ? { action: 'update', severity: 'info' }
        : { action: 'delete', severity: 'medium' };
    default:
      return { action: 'view', severity: 'info' };
  }
}

function pickName(row: Record<string, unknown> | null | undefined): string | undefined {
  if (!row) return undefined;
  for (const field of NAME_FIELDS) {
    const v = row[field];
    if (typeof v === 'string' && v) return v.slice(0, 255);
  }
  return undefined;
}

async function snapshot(
  tenantSlug: string,
  entity: EntityDef,
  id: string
): Promise<Record<string, unknown> | null> {
  const schema = tenantService.getSchemaName(tenantSlug);
  const result = await pool.query(`SELECT * FROM ${schema}.${entity.table} WHERE id = $1`, [id]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  for (const [field, sql] of Object.entries(entity.relations ?? {})) {
    try {
      const related = await pool.query(sql(schema), [id]);
      row[field] = related.rows[0]?.v ?? [];
    } catch {
      // the relation could not be read: audit without it
    }
  }
  return row;
}

/**
 * The audit API is not audited by these hooks (its admin actions are logged
 * explicitly), except that a denied request to it is always recorded: probing
 * the audit log without permission is exactly what must leave a trace.
 */
function isAuditable(request: FastifyRequest, statusCode?: number): boolean {
  if (request.method === 'OPTIONS' || request.method === 'HEAD') return false;
  if (statusCode === 403 && request.url.startsWith('/v1/audit')) return true;
  return !SKIP_PREFIXES.some((p) => request.url.startsWith(p));
}

function bodyOf(request: FastifyRequest): Record<string, unknown> | undefined {
  const body = request.body;
  return body && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : undefined;
}

export function registerAuditHooks(app: FastifyInstance): void {
  // Snapshot the "before" state. Route-level auth runs after app-level
  // preHandlers, so the token is verified here as well; an invalid or missing
  // token just means there is nothing to audit.
  app.addHook('preHandler', async (request) => {
    try {
      if (!MUTATING.has(request.method) || !isAuditable(request)) return;
      const target = resolveAuditTarget(request.url);
      if (!target?.entity || !target.entityId) return;

      await request.jwtVerify();
      const tenantSlug = request.user?.tenantSlug;
      if (!tenantSlug) return;
      request.auditBefore = await snapshot(tenantSlug, target.entity, target.entityId);
    } catch {
      // not authenticated, or the snapshot failed: audit without a before-state
    }
  });

  // Remember the id/name of a newly created entity from the response body.
  app.addHook('onSend', async (request, reply, payload) => {
    try {
      if (
        request.method === 'POST' &&
        reply.statusCode < 300 &&
        typeof payload === 'string' &&
        payload.length <= MAX_CAPTURE_BYTES &&
        isAuditable(request)
      ) {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        const root = (parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed) as Record<string, unknown>;
        if (root && typeof root.id === 'string' && UUID_RE.test(root.id)) {
          request.auditCreated = { id: root.id, name: pickName(root) };
        }
      }
    } catch {
      // not JSON: nothing to capture
    }
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    try {
      await recordRequest(request, reply.statusCode);
    } catch (err) {
      logger.error({ err, url: request.url }, 'Failed to write audit record for request');
    }
  });
}

async function recordRequest(request: FastifyRequest, statusCode: number): Promise<void> {
  const user = request.user;
  const tenantSlug = user?.tenantSlug;
  if (!tenantSlug || !isAuditable(request, statusCode)) return;

  // Load the tenant's masking list / alert switch before the write.
  await auditService.getCachedSettings(tenantSlug).catch(() => undefined);

  const method = request.method;
  const denied = statusCode === 403;
  const succeeded = statusCode < 400;
  if (!denied && !succeeded) return;

  const target = resolveAuditTarget(request.url);
  if (!target) return;

  const explicit = (request as unknown as {
    _auditOptions?: { action: AuditAction; entityType: string };
  })._auditOptions;
  const classified = classifyRequest(method, target);
  let action: AuditAction = explicit?.action ?? classified.action;
  let severity: AuditSeverity = classified.severity;
  const entityType = explicit?.entityType ?? target.entityType;

  if (method === 'GET') {
    const settings = await auditService.getCachedSettings(tenantSlug);
    const isExport =
      target.verb === 'export' ||
      /\/export(\/|$)/.test(request.url.split('?')[0]) ||
      (request.query as Record<string, unknown> | undefined)?.format === 'csv';
    if (!denied) {
      if (isExport) {
        if (!settings.log_exports) return;
        action = 'export';
      } else {
        if (!settings.log_reads) return;
        action = 'view';
      }
    }
  }

  const outcome: AuditOutcome = denied ? 'denied' : 'success';
  if (denied && severity === 'info') severity = 'medium';

  const entityId = target.entityId ?? request.auditCreated?.id;
  const body = bodyOf(request);

  let oldValues: Record<string, unknown> | undefined;
  let newValues: Record<string, unknown> | undefined;
  let changedFields: string[] | undefined;
  let entityName = request.auditCreated?.name;

  const isSub = target.subResource !== undefined;
  const isPermission = action === 'permission_granted' || action === 'permission_revoked';

  if (!denied && MUTATING.has(method)) {
    const before = request.auditBefore ?? undefined;
    entityName = entityName ?? pickName(before);

    if (method === 'DELETE' && !isSub) {
      oldValues = before ?? undefined;
    } else if (before && target.entity && target.entityId) {
      // Field-level change tracking: re-read the row and diff against the snapshot.
      const after = await snapshot(tenantSlug, target.entity, target.entityId).catch(() => null);
      if (after) {
        const diff = diffValues(before, after, DIFF_IGNORE);
        oldValues = diff.oldValues;
        newValues = diff.newValues;
        changedFields = diff.changedFields;
        entityName = pickName(after) ?? entityName;
      } else {
        newValues = body;
      }
      // A change to a sub-resource or a permission is not fully described by the
      // parent row: keep what was requested (the posted comment, the roles granted).
      if (body && (isSub || isPermission)) {
        newValues = { ...(newValues ?? {}), ...body };
        changedFields = [...new Set([...(changedFields ?? []), ...Object.keys(body)])];
      } else if (isSub && (changedFields ?? []).length === 0 && target.verb) {
        changedFields = [target.verb];
      }
    } else {
      newValues = body;
    }
  }

  const entry: AuditLogEntry = {
    userId: user.userId,
    userEmail: user.email,
    action,
    entityType,
    entityId: entityId && UUID_RE.test(entityId) ? entityId : undefined,
    entityName,
    oldValues,
    newValues,
    changedFields,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: request.id,
    severity,
    outcome,
    httpMethod: method,
    requestPath: request.url.split('?')[0].slice(0, 500),
    statusCode,
    metadata: {
      route: request.routeOptions?.url ?? null,
      ...(isSub ? { subResource: target.subResource } : {}),
    },
  };

  await auditService.log(tenantSlug, entry);
}
