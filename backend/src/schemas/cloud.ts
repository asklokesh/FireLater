import { z } from 'zod';

export const createAccountSchema = z.object({
  provider: z.enum(['aws', 'azure', 'gcp']),
  accountId: z.string().min(1),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  credentialType: z.enum(['access_key', 'role_arn', 'service_account']),
  credentials: z.record(z.unknown()).optional(),
  roleArn: z.string().optional(),
  externalId: z.string().optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().min(300).optional(),
  syncResources: z.boolean().optional(),
  syncCosts: z.boolean().optional(),
  syncMetrics: z.boolean().optional(),
  regions: z.array(z.string()).optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  credentialType: z.enum(['access_key', 'role_arn', 'service_account']).optional(),
  credentials: z.record(z.unknown()).optional(),
  roleArn: z.string().optional(),
  externalId: z.string().optional(),
  syncEnabled: z.boolean().optional(),
  syncInterval: z.number().min(300).optional(),
  syncResources: z.boolean().optional(),
  syncCosts: z.boolean().optional(),
  syncMetrics: z.boolean().optional(),
  regions: z.array(z.string()).optional(),
});

export const mapResourceSchema = z.object({
  applicationId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
});

export const createMappingRuleSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  priority: z.number().min(1).optional(),
  provider: z.enum(['aws', 'azure', 'gcp']).optional(),
  resourceType: z.string().optional(),
  tagKey: z.string().min(1),
  tagValuePattern: z.string().optional(),
  applicationId: z.string().uuid(),
  environmentType: z.string().optional(),
});

export const accountIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const resourceIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const applicationIdParamSchema = z.object({
  applicationId: z.string().uuid(),
});

export const mappingRuleIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const listAccountsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  provider: z.enum(['aws', 'azure', 'gcp']).optional(),
  status: z.enum(['active', 'inactive', 'error']).optional(),
});

export const listResourcesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  cloud_account_id: z.string().uuid().optional(),
  resource_type: z.string().max(100).optional(),
  application_id: z.string().uuid().optional(),
  environment_id: z.string().uuid().optional(),
  region: z.string().max(50).optional(),
  is_deleted: z.enum(['true', 'false']).optional(),
});

export const listCostsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  cloud_account_id: z.string().uuid().optional(),
  period_type: z.enum(['daily', 'weekly', 'monthly']).optional(),
});

export const applicationCostsQuerySchema = z.object({
  period_type: z.enum(['daily', 'weekly', 'monthly']).optional(),
});
