import { z } from 'zod';

export const auditSettingsSchema = z.object({
  retention_days: z.number().int().min(1).max(3650).optional(),
  log_reads: z.boolean().optional(),
  log_exports: z.boolean().optional(),
  sensitive_fields: z.array(z.string().max(100)).max(500).optional(),
}).passthrough();

export type AuditSettingsInput = z.infer<typeof auditSettingsSchema>;
