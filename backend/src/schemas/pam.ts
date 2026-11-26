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
