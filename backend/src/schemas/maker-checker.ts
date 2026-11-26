import { z } from 'zod';

export const createOperationSchema = z.object({
  operationType: z.string().min(1).max(100),
  entityType: z.string().max(100).optional(),
  entityId: z.string().max(100).optional(),
  payload: z.record(z.unknown()),
  justification: z.string().max(5000).optional(),
}).passthrough();

/** approve / reject body is optional */
export const decisionCommentSchema = z.object({
  comment: z.string().max(5000).optional(),
}).passthrough().optional();

export const upsertOperationConfigSchema = z.object({
  description: z.string().max(1000).optional(),
  expiryHours: z.number().min(0).max(24 * 365).optional(),
  isActive: z.boolean().optional(),
}).passthrough();

export type CreateOperationInput = z.infer<typeof createOperationSchema>;
export type UpsertOperationConfigInput = z.infer<typeof upsertOperationConfigSchema>;
