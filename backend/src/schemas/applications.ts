import { z } from 'zod';

export const createApplicationSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(2000).optional(),
  tier: z.enum(['P1', 'P2', 'P3', 'P4']),
  status: z.enum(['active', 'inactive', 'deprecated']).optional(),
  lifecycleStage: z.enum(['development', 'staging', 'production', 'sunset']).optional(),
  ownerUserId: z.string().uuid().optional(),
  ownerGroupId: z.string().uuid().optional(),
  supportGroupId: z.string().uuid().optional(),
  businessUnit: z.string().max(255).optional(),
  criticality: z.enum(['mission_critical', 'business_critical', 'business_operational', 'administrative']).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateApplicationSchema = createApplicationSchema.partial();

export const createEnvironmentSchema = z.object({
  name: z.string().min(2).max(100),
  type: z.enum(['dev', 'test', 'staging', 'prod']),
  url: z.string().url().optional(),
  cloudProvider: z.enum(['aws', 'gcp', 'azure', 'on-prem']).optional(),
  cloudAccount: z.string().max(255).optional(),
  cloudRegion: z.string().max(50).optional(),
  resourceIds: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateEnvironmentSchema = createEnvironmentSchema.partial();

export const appIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const appEnvParamSchema = z.object({
  id: z.string().uuid(),
  envId: z.string().uuid(),
});

export const listAppsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  tier: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
  status: z.enum(['active', 'inactive', 'deprecated']).optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  owner_id: z.string().uuid().optional(),
  support_group_id: z.string().uuid().optional(),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
export type AppIdParam = z.infer<typeof appIdParamSchema>;
export type AppEnvParam = z.infer<typeof appEnvParamSchema>;
export type ListAppsQuery = z.infer<typeof listAppsQuerySchema>;
