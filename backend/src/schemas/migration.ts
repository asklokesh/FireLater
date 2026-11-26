import { z } from 'zod';

export const jobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});
export type JobIdParams = z.infer<typeof jobIdParamSchema>;

export const executeMigrationBodySchema = z.object({
  mappingConfig: z.record(z.unknown()).optional(),
  continueOnError: z.boolean().optional(),
  batchSize: z.number().int().min(1).max(100000).optional(),
}).passthrough();

export const saveMappingTemplateSchema = z.object({
  tenantSlug: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  sourceSystem: z.string().min(1).max(100),
  entityType: z.string().min(1).max(100),
  fieldMappings: z.array(z.unknown()).max(1000),
  userMappings: z.array(z.unknown()).max(10000).optional(),
  statusMappings: z.array(z.unknown()).max(1000).optional(),
  priorityMappings: z.array(z.unknown()).max(1000).optional(),
}).passthrough();

export type ExecuteMigrationBodyInput = z.infer<typeof executeMigrationBodySchema>;
export type SaveMappingTemplateInput = z.infer<typeof saveMappingTemplateSchema>;
