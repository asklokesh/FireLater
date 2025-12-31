import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Add workflow execution validation schema
const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

// Add workflow configuration validation schema
const workflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  config: z.record(z.any()).optional(),
  nextStepId: z.string().optional().nullable(),
});

const workflowConfigSchema = z.object({
  steps: z.array(workflowStepSchema).min(1),
  startStepId: z.string().min(1),
});

const createRequestSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  categoryId: z.string().uuid().optional(),
  workflowConfig: workflowConfigSchema.optional(),
  formFields: z.array(z.any()).optional(),
  slaSettings: z.record(z.any()).optional(),
});

const updateRequestSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  workflowConfig: workflowConfigSchema.optional(),
  formFields: z.array(z.any()).optional(),
  slaSettings: z.record(z.any()).optional(),
});