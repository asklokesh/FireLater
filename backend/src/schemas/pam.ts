import { z } from 'zod';

export const requestGrantSchema = z.object({
  privilegeType: z.string().min(1).max(100),
  resource: z.string().max(255).optional(),
  reason: z.string().min(5).max(5000),
  durationHours: z.number().int().min(1).max(72),
});

export const approveGrantSchema = z.object({
  approverEmail: z.string().email().optional(),
});

export const revokeGrantSchema = z.object({
  revokedBy: z.string().min(1).max(255).optional(),
});

export const activitySchema = z.object({
  activityType: z.enum(['login', 'query', 'command', 'config_change']),
  activityDetail: z.string().max(5000).optional(),
  ipAddress: z.string().max(45).optional(),
});

export const upsertConfigSchema = z.object({
  description: z.string().max(500).optional(),
  maxDurationHours: z.number().int().min(1).max(720).optional(),
  requiresApprover: z.boolean().optional(),
  autoApprove: z.boolean().optional(),
});

export const summaryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const listGrantsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'active', 'expired', 'revoked']).optional(),
  requesterId: z.string().optional(),
  privilegeType: z.string().optional(),
});


export type RequestGrantInput = z.infer<typeof requestGrantSchema>;
export type ApproveGrantInput = z.infer<typeof approveGrantSchema>;
export type RevokeGrantInput = z.infer<typeof revokeGrantSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type UpsertConfigInput = z.infer<typeof upsertConfigSchema>;
export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>;
export type ListGrantsQueryInput = z.infer<typeof listGrantsQuerySchema>;

export const approveGrantBodySchema = approveGrantSchema.default({});
export type ApproveGrantBodyInput = z.infer<typeof approveGrantBodySchema>;

export const revokeGrantBodySchema = revokeGrantSchema.default({});
export type RevokeGrantBodyInput = z.infer<typeof revokeGrantBodySchema>;

export const upsertConfigBodySchema = upsertConfigSchema.default({});
export type UpsertConfigBodyInput = z.infer<typeof upsertConfigBodySchema>;
