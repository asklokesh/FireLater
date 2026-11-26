import { z } from 'zod';

export const createSodPolicySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  conflicting_role_a: z.string().min(1).max(100),
  conflicting_role_b: z.string().min(1).max(100),
  entity_type: z.string().min(1).max(100),
  is_active: z.boolean().optional(),
}).passthrough();

export const updateSodPolicySchema = createSodPolicySchema.partial();

export const evaluateSodSchema = z.object({
  actorId: z.string().min(1).max(100),
  actorRoles: z.array(z.string().max(100)).max(100),
  attemptedRole: z.string().min(1).max(100),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1).max(100),
  action: z.string().min(1).max(100),
}).passthrough();

export type CreateSodPolicyInput = z.infer<typeof createSodPolicySchema>;
export type UpdateSodPolicyInput = z.infer<typeof updateSodPolicySchema>;
export type EvaluateSodInput = z.infer<typeof evaluateSodSchema>;
