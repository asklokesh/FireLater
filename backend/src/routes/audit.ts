import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { isIP } from 'net';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import {
  auditService,
  AuditAction,
  AuditQueryOptions,
  AUDIT_EXPORT_COLUMNS,
  toCsv,
} from '../services/audit.js';
import { auditChainService } from '../services/audit-chain.js';
import { auditAlertService } from '../services/audit-alerts.js';
import { auditRetentionService, validateRetentionPolicy } from '../services/audit-retention.js';
import { AUDIT_REPORT_TEMPLATES } from '../services/audit-reports.js';
import { complianceReportsService, type ReportType } from '../services/compliance-reports.js';
import { AUDIT_OUTCOMES, AUDIT_SEVERITIES } from '../lib/audit-search.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { validateDate, validateDateRange, validateLimit, validateOffset } from '../utils/validation.js';

// ============================================
// SCHEMAS
// ============================================

const severitySchema = z.enum(AUDIT_SEVERITIES);
const outcomeSchema = z.enum(AUDIT_OUTCOMES);

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  userId: z.string().uuid().optional(),
  action: z.string().max(60).optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  ipAddress: z
    .string()
    .refine((v) => isIP(v) !== 0, 'ipAddress must be a valid IPv4 or IPv6 address')
    .optional(),
  severity: severitySchema.optional(),
  outcome: outcomeSchema.optional(),
  source: z.enum(['live', 'archive', 'all']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

const alertRuleSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().max(2000).nullable().optional(),
  actions: z.array(z.string().max(60)).max(30).optional(),
  entityTypes: z.array(z.string().max(100)).max(30).optional(),
  outcome: outcomeSchema.nullable().optional(),
  threshold: z.number().int().min(1).max(100000),
  windowMinutes: z.number().int().min(1).max(10080),
  groupBy: z.enum(['user', 'ip', 'none']).optional(),
  severity: severitySchema.optional(),
  enabled: z.boolean().optional(),
});

const settingsSchema = z
  .object({
    retention_days: z.number().int().min(30).max(3650).optional(),
    log_reads: z.boolean().optional(),
    log_exports: z.boolean().optional(),
    sensitive_fields: z.array(z.string().min(1).max(100)).max(100).optional(),
    archive_after_days: z.number().int().min(1).max(3650).nullable().optional(),
    alerts_enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.archive_after_days == null ||
      v.retention_days == null ||
      v.archive_after_days < v.retention_days,
    { message: 'archive_after_days must be smaller than retention_days' }
  );

const legalHoldSchema = z.object({
  hold: z.boolean(),
  userId: z.string().uuid().optional(),
  entityType: z.string().max(100).optional(),
  entityId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const reportQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/** Turn validated query-string input into service options. */
function toQueryOptions(raw: unknown): AuditQueryOptions {
  const q = searchQuerySchema.parse(raw);
  const startDate = validateDate(q.startDate, 'startDate');
  const endDate = validateDate(q.endDate, 'endDate');
  validateDateRange(startDate, endDate, 365);
  return {
    q: q.q,
    userId: q.userId,
    action: q.action as AuditAction | undefined,
    entityType: q.entityType,
    entityId: q.entityId,
    ipAddress: q.ipAddress,
    severity: q.severity,
    outcome: q.outcome,
    source: q.source,
    startDate,
    endDate,
    limit: validateLimit(q.limit, 1000),
    offset: validateOffset(q.offset),
  };
}

/** Record an administrative action on the audit system itself. */
async function auditAdminAction(
  request: FastifyRequest,
  action: AuditAction,
  entityType: string,
  details: { entityId?: string; entityName?: string; metadata?: Record<string, unknown>; oldValues?: Record<string, unknown>; newValues?: Record<string, unknown> } = {}
): Promise<void> {
  const { tenantSlug, userId, email } = request.user;
  await auditService.logSafe(tenantSlug, {
    userId,
    userEmail: email,
    action,
    entityType,
    entityId: details.entityId,
    entityName: details.entityName,
    oldValues: details.oldValues,
    newValues: details.newValues,
    metadata: details.metadata,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: request.id,
    severity: 'medium',
    httpMethod: request.method,
    requestPath: request.url.split('?')[0],
  });
}

// ============================================
// AUDIT LOG ROUTES
// ============================================

const auditRoutes: FastifyPluginAsync = async (app) => {
  // Query / search audit logs (filters + full-text `q`)
  const searchHandler = async (request: FastifyRequest) => {
    const { tenantSlug } = request.user;
    return auditService.query(tenantSlug, toQueryOptions(request.query));
  };

  app.get('/', { preHandler: [requirePermission('admin:read')] }, searchHandler);
  app.get('/search', { preHandler: [requirePermission('admin:read')] }, searchHandler);

  // Export the filtered audit trail (CSV or JSON). The export is itself audited.
  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/export',
    { preHandler: [requirePermission('admin:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const format = z.enum(['csv', 'json']).default('csv').parse(request.query.format);
      const options = toQueryOptions({ ...request.query, limit: undefined, offset: undefined });

      const { rows, truncated } = await auditService.exportLogs(tenantSlug, options);

      await auditAdminAction(request, 'export', 'audit_log', {
        metadata: { format, rowCount: rows.length, truncated },
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      reply.header('Content-Disposition', `attachment; filename="audit-trail-${stamp}.${format}"`);
      reply.header('X-Audit-Export-Truncated', String(truncated));
      if (format === 'json') {
        return { exportedAt: new Date().toISOString(), rowCount: rows.length, truncated, logs: rows };
      }
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      return toCsv(rows as unknown as Array<Record<string, unknown>>, AUDIT_EXPORT_COLUMNS);
    }
  );

  // Compliance report templates (SOC 2 / ISO 27001 audit trail)
  app.get(
    '/reports/templates',
    { preHandler: [requirePermission('admin:read')] },
    async () => ({
      templates: Object.entries(AUDIT_REPORT_TEMPLATES).map(([id, meta]) => ({ id, ...meta })),
    })
  );

  app.get<{ Params: { template: string }; Querystring: Record<string, string | undefined> }>(
    '/reports/:template',
    { preHandler: [requirePermission('admin:read')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const template = z
        .enum(Object.keys(AUDIT_REPORT_TEMPLATES) as [string, ...string[]])
        .parse(request.params.template) as ReportType;
      const query = reportQuerySchema.parse(request.query);
      const from = new Date(query.from);
      const to = new Date(query.to);
      validateDateRange(from, to, 366);

      const result = await complianceReportsService.generateReport(tenantSlug, template, { from, to });
      await complianceReportsService.recordRun(tenantSlug, null, template, result).catch(() => undefined);
      await auditAdminAction(request, 'export', 'audit_report', {
        entityName: template,
        metadata: { template, from: query.from, to: query.to, format: query.format },
      });

      if (query.format === 'csv') {
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', `attachment; filename="${template}.csv"`);
        return complianceReportsService.exportToCsv(result);
      }
      return result;
    }
  );

  // Get entity history
  app.get<{
    Params: { entityType: string; entityId: string };
  }>(
    '/entity/:entityType/:entityId',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { entityType, entityId } = request.params;

      const logs = await auditService.getEntityHistory(tenantSlug, entityType, entityId);

      return { logs };
    }
  );

  // Get user activity
  app.get<{
    Params: { userId: string };
    Querystring: { days?: string };
  }>(
    '/user/:userId',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { userId } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const logs = await auditService.getUserActivity(tenantSlug, userId, days);

      return { logs };
    }
  );

  // Get security events
  app.get<{
    Querystring: { hours?: string };
  }>(
    '/security',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const hours = parseInt(request.query.hours || '24', 10);

      const events = await auditService.getSecurityEvents(tenantSlug, hours);

      return { events };
    }
  );

  // Get failed login attempts
  app.get<{
    Querystring: { hours?: string; threshold?: string };
  }>(
    '/security/failed-logins',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const hours = parseInt(request.query.hours || '24', 10);
      const threshold = parseInt(request.query.threshold || '5', 10);

      const attempts = await auditService.getFailedLogins(tenantSlug, hours, threshold);

      return { attempts };
    }
  );

  // Get summary by user
  app.get(
    '/summary/users',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const summary = await auditService.getSummaryByUser(tenantSlug);

      return { summary };
    }
  );

  // Get summary by entity
  app.get(
    '/summary/entities',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const summary = await auditService.getSummaryByEntity(tenantSlug);

      return { summary };
    }
  );

  // Get audit settings
  app.get(
    '/settings',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      const settings = await auditService.getSettings(tenantSlug);

      return { settings };
    }
  );

  // Update audit settings
  app.patch<{
    Body: {
      retention_days?: number;
      log_reads?: boolean;
      log_exports?: boolean;
      sensitive_fields?: string[];
      archive_after_days?: number | null;
      alerts_enabled?: boolean;
    };
  }>(
    '/settings',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug, userId } = request.user;
      const settings = settingsSchema.parse(request.body);

      const before = await auditService.getSettings(tenantSlug);
      // The window must be valid against the policy as it will be, not just the request.
      const invalid = validateRetentionPolicy(before, settings);
      if (invalid) throw new BadRequestError(invalid);

      await auditService.updateSettings(tenantSlug, settings, userId);
      if (settings.retention_days !== undefined && settings.retention_days !== before.retention_days) {
        // Records stamped under the old policy follow the new one.
        await auditRetentionService.applyRetentionPolicy(tenantSlug, settings.retention_days);
      }

      const updated = await auditService.getSettings(tenantSlug);
      await auditAdminAction(request, 'config_change', 'audit_settings', {
        oldValues: before as unknown as Record<string, unknown>,
        newValues: updated as unknown as Record<string, unknown>,
      });

      return { settings: updated };
    }
  );

  // Verify audit chain integrity
  app.get<{
    Querystring: { from?: string; to?: string };
  }>(
    '/verify',
    {
      preHandler: [requirePermission('admin:read')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;
      const { from, to } = request.query;

      // Records inserted by services directly are sealed before verifying.
      await auditService.sealPending(tenantSlug);

      const validatedFrom = validateDate(from, 'from');
      const validatedTo = validateDate(to, 'to');
      validateDateRange(validatedFrom, validatedTo, 3650); // up to 10 years

      const result = await auditChainService.verifyChain(
        tenantSlug,
        validatedFrom ?? undefined,
        validatedTo ?? undefined
      );

      return result;
    }
  );

  // Manual cleanup (admin only)
  app.post(
    '/cleanup',
    {
      preHandler: [requirePermission('admin:write')],
    },
    async (request, _reply) => {
      const { tenantSlug } = request.user;

      // Same purge path as the scheduled retention run (records the purged
      // chain positions, keeps legal holds and the newest record), without
      // archiving. The retention_run record it writes is the admin audit entry.
      const result = await auditRetentionService.runForTenant(tenantSlug, {
        archive: false,
        mode: 'cleanup',
        actor: {
          userId: request.user.userId,
          userEmail: request.user.email,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
          requestId: request.id,
          httpMethod: request.method,
          requestPath: request.url.split('?')[0],
        },
      });

      return { deletedCount: result.purgedLive + result.purgedArchive };
    }
  );

  // ---------- Retention & archival ----------

  app.get(
    '/retention/stats',
    { preHandler: [requirePermission('admin:read')] },
    async (request) => {
      const { tenantSlug } = request.user;
      const [settings, storage] = await Promise.all([
        auditService.getSettings(tenantSlug),
        auditRetentionService.getStorageStats(tenantSlug),
      ]);
      return { settings, storage };
    }
  );

  // Apply the retention policy now: archive, then purge expired records.
  app.post(
    '/retention/run',
    { preHandler: [requirePermission('admin:write')] },
    async (request) => {
      const { tenantSlug } = request.user;
      const result = await auditRetentionService.runForTenant(tenantSlug);
      return { result };
    }
  );

  // Place or release a legal hold on the records matching a scope.
  app.post(
    '/legal-hold',
    { preHandler: [requirePermission('admin:write')] },
    async (request) => {
      const { tenantSlug } = request.user;
      const body = legalHoldSchema.parse(request.body);
      const { hold, startDate, endDate, ...scope } = body;
      if (!scope.userId && !scope.entityType && !scope.entityId && !startDate && !endDate) {
        throw new BadRequestError('A legal hold needs at least one of userId, entityType, entityId, startDate, endDate');
      }
      const affected = await auditRetentionService.setLegalHold(
        tenantSlug,
        {
          ...scope,
          startDate: startDate ? new Date(startDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
        },
        hold
      );
      await auditAdminAction(request, 'legal_hold', 'audit_log', {
        metadata: { hold, affected, scope: body },
      });
      return { hold, affected };
    }
  );

  // ---------- Real-time alert rules ----------

  app.get(
    '/alert-rules',
    { preHandler: [requirePermission('admin:read')] },
    async (request) => ({ rules: await auditAlertService.listRules(request.user.tenantSlug) })
  );

  app.post(
    '/alert-rules',
    { preHandler: [requirePermission('admin:write')] },
    async (request, reply) => {
      const { tenantSlug, userId } = request.user;
      const input = alertRuleSchema.parse(request.body);
      const rule = await auditAlertService.createRule(tenantSlug, input, userId).catch((err: { code?: string }) => {
        if (err.code === '23505') throw new BadRequestError(`An alert rule named "${input.name}" already exists`);
        throw err;
      });
      await auditAdminAction(request, 'config_change', 'audit_alert_rule', {
        entityId: rule.id,
        entityName: rule.name,
        newValues: input as unknown as Record<string, unknown>,
      });
      reply.code(201);
      return { rule };
    }
  );

  app.patch<{ Params: { id: string } }>(
    '/alert-rules/:id',
    { preHandler: [requirePermission('admin:write')] },
    async (request) => {
      const { tenantSlug } = request.user;
      const { id } = idParamSchema.parse(request.params);
      const input = alertRuleSchema.partial().parse(request.body);
      const rule = await auditAlertService.updateRule(tenantSlug, id, input);
      if (!rule) throw new NotFoundError('Alert rule');
      await auditAdminAction(request, 'config_change', 'audit_alert_rule', {
        entityId: id,
        entityName: rule.name,
        newValues: input as unknown as Record<string, unknown>,
      });
      return { rule };
    }
  );

  app.delete<{ Params: { id: string } }>(
    '/alert-rules/:id',
    { preHandler: [requirePermission('admin:write')] },
    async (request, reply) => {
      const { tenantSlug } = request.user;
      const { id } = idParamSchema.parse(request.params);
      const deleted = await auditAlertService.deleteRule(tenantSlug, id);
      if (!deleted) throw new NotFoundError('Alert rule');
      await auditAdminAction(request, 'config_change', 'audit_alert_rule', { entityId: id, metadata: { deleted: true } });
      return reply.code(204).send();
    }
  );

  // ---------- Alerts ----------

  app.get<{ Querystring: { status?: string; severity?: string; limit?: string; offset?: string } }>(
    '/alerts',
    { preHandler: [requirePermission('admin:read')] },
    async (request) => {
      const q = z
        .object({
          status: z.enum(['open', 'acknowledged']).optional(),
          severity: severitySchema.optional(),
        })
        .parse(request.query);
      return auditAlertService.listAlerts(request.user.tenantSlug, {
        ...q,
        limit: validateLimit(request.query.limit, 200),
        offset: validateOffset(request.query.offset),
      });
    }
  );

  app.post<{ Params: { id: string } }>(
    '/alerts/:id/acknowledge',
    { preHandler: [requirePermission('admin:write')] },
    async (request) => {
      const { tenantSlug, userId } = request.user;
      const { id } = idParamSchema.parse(request.params);
      const alert = await auditAlertService.acknowledge(tenantSlug, id, userId);
      if (!alert) throw new NotFoundError('Open alert');
      return { alert };
    }
  );
};

export default auditRoutes;
