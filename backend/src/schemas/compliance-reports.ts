import { z } from 'zod';

export const reportTypeSchema = z.enum([
  'change_success_rate',
  'unauthorized_changes',
  'sla_breach_evidence',
  'emergency_change_usage',
  'access_recertification_status',
  'sod_violation_attempts',
  'audit_trail_soc2',
  'audit_trail_iso27001',
]);

export const generateReportSchema = z.object({
  reportType: reportTypeSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  format: z.enum(['json', 'csv']).optional().default('json'),
});

export const createScheduleSchema = z.object({
  reportType: reportTypeSchema,
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).default('monthly'),
  recipients: z.array(z.string().email()).default([]),
});

export const updateScheduleSchema = z.object({
  cadence: z.enum(['daily', 'weekly', 'monthly', 'quarterly']).optional(),
  recipients: z.array(z.string().email()).optional(),
  isActive: z.boolean().optional(),
  description: z.string().max(2000).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});


export type ReportTypeInput = z.infer<typeof reportTypeSchema>;
export type GenerateReportInput = z.infer<typeof generateReportSchema>;
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type IdParamInput = z.infer<typeof idParamSchema>;
