import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';
import { requirePermission } from '../middleware/auth.js';

// Add workflow validation schemas
const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  triggerType: z.enum(['manual', 'auto', 'scheduled']),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    type: z.enum(['action', 'decision', 'notification']),
    config: z.record(z.any()),
    position: z.object({
      x: z.number(),
      y: z.number()
    })
  })).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    type: z.enum(['action', 'decision', 'notification']),
    config: z.record(z.any()),
    position: z.object({
      x: z.number(),
      y: z.number()
    })
  })).optional(),
});

const workflowExecutionSchema = z.object({
  workflowId: z.string().uuid(),
  triggerData: z.record(z.any()).optional(),
  userId: z.string().uuid().optional(),
});