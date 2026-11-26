import { isIP } from 'node:net';
import { z } from 'zod';
import { AUDIT_OUTCOMES, AUDIT_SEVERITIES } from '../lib/audit-search.js';
import type { AuditReportTemplate } from '../services/audit-reports.js';
import { idParamSchema, optionalInt, textIdSchema, uuidSchema } from './common.js';

// Schemas for /v1/audit (routes/audit.ts). The registry applies them before the handler runs.

export const auditSeveritySchema = z.enum(AUDIT_SEVERITIES);
export const auditOutcomeSchema = z.enum(AUDIT_OUTCOMES);

/** Filters for GET /, /search and /export. limit/offset stay strings: validateLimit/validateOffset read them. */
export const auditSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  userId: uuidSchema.optional(),
  action: z.string().max(60).optional(),
  entityType: z.string().max(100).optional(),
  entityId: uuidSchema.optional(),
  ipAddress: z
    .string()
    .refine((v) => isIP(v) !== 0, 'ipAddress must be a valid IPv4 or IPv6 address')
    .optional(),
  severity: auditSeveritySchema.optional(),
  outcome: auditOutcomeSchema.optional(),
  source: z.enum(['live', 'archive', 'all']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

export const auditExportQuerySchema = auditSearchQuerySchema.extend({
  format: z.enum(['csv', 'json']).default('csv'),
});

export const auditAlertRuleSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().max(2000).nullable().optional(),
  actions: z.array(z.string().max(60)).max(30).optional(),
  entityTypes: z.array(z.string().max(100)).max(30).optional(),
  outcome: auditOutcomeSchema.nullable().optional(),
  threshold: z.number().int().min(1).max(100000),
  windowMinutes: z.number().int().min(1).max(10080),
  groupBy: z.enum(['user', 'ip', 'none']).optional(),
  severity: auditSeveritySchema.optional(),
  enabled: z.boolean().optional(),
});

export const auditAlertRulePatchSchema = auditAlertRuleSchema.partial();

export const auditSettingsSchema = z
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
    { message: 'archive_after_days must be smaller than retention_days', path: ['archive_after_days'] }
  );

export const auditLegalHoldSchema = z.object({
  hold: z.boolean(),
  userId: uuidSchema.optional(),
  entityType: z.string().max(100).optional(),
  entityId: uuidSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const AUDIT_REPORT_TEMPLATE_IDS = ['audit_trail_soc2', 'audit_trail_iso27001'] as const satisfies readonly AuditReportTemplate[];
// Fails to compile when services/audit-reports.ts adds a template that is missing above.
const allTemplatesListed: Exclude<AuditReportTemplate, (typeof AUDIT_REPORT_TEMPLATE_IDS)[number]> extends never ? true : never = true;
void allTemplatesListed;

export const auditReportParamsSchema = z.object({ template: z.enum(AUDIT_REPORT_TEMPLATE_IDS) });
export const auditReportQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

/** audit_logs.entity_type is VARCHAR(100) and entity_id is UUID (migration 002). */
export const auditEntityParamsSchema = z.object({ entityType: textIdSchema.max(100), entityId: uuidSchema });
export const auditUserParamsSchema = z.object({ userId: uuidSchema });
export const auditUserActivityQuerySchema = z.object({ days: optionalInt(1, 3650) });
export const auditSecurityQuerySchema = z.object({ hours: optionalInt(1, 8760) });
export const auditFailedLoginsQuerySchema = z.object({ hours: optionalInt(1, 8760), threshold: optionalInt(1, 100000) });
export const auditVerifyQuerySchema = z.object({ from: z.string().max(64).optional(), to: z.string().max(64).optional() });
export const auditAlertsQuerySchema = z.object({
  status: z.enum(['open', 'acknowledged']).optional(),
  severity: auditSeveritySchema.optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});
export const auditIdParamSchema = idParamSchema;

export type AuditSearchQuery = z.infer<typeof auditSearchQuerySchema>;
export type AuditExportQuery = z.infer<typeof auditExportQuerySchema>;
export type AuditAlertRuleInput = z.infer<typeof auditAlertRuleSchema>;
export type AuditAlertRulePatch = z.infer<typeof auditAlertRulePatchSchema>;
export type AuditSettingsInput = z.infer<typeof auditSettingsSchema>;
export type AuditLegalHoldInput = z.infer<typeof auditLegalHoldSchema>;
export type AuditReportParams = z.infer<typeof auditReportParamsSchema>;
export type AuditReportQuery = z.infer<typeof auditReportQuerySchema>;
export type AuditEntityParams = z.infer<typeof auditEntityParamsSchema>;
export type AuditUserParams = z.infer<typeof auditUserParamsSchema>;
export type AuditUserActivityQuery = z.infer<typeof auditUserActivityQuerySchema>;
export type AuditSecurityQuery = z.infer<typeof auditSecurityQuerySchema>;
export type AuditFailedLoginsQuery = z.infer<typeof auditFailedLoginsQuerySchema>;
export type AuditVerifyQuery = z.infer<typeof auditVerifyQuerySchema>;
export type AuditAlertsQuery = z.infer<typeof auditAlertsQuerySchema>;
