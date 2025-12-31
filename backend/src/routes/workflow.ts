import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';
import { requirePermission } from '../middleware/auth.js';
import { BadRequestError } from '../utils/errors.js';

// Validation schemas for workflow operations
const createWorkflowSchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(['manual', 'scheduled', 'event']),
  isActive: z.boolean().optional().default(true),
  steps: z.array(z.object({
    stepNumber: z.number().int().min(1),
    actionType: z.string().min(1),
    config: z.record(z.unknown()).optional(),
  })),
  conditions: z.array(z.object({
    field: z.string().min(1),
    operator: z.string().min(1),
    value: z.unknown(),
  })).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().uuid().optional(),
    stepNumber: z.number().int().min(1),
    actionType: z.string().min(1),
    config: z.record(z.unknown()).optional(),
  })).optional(),
  conditions: z.array(z.object({
    id: z.string().uuid().optional(),
    field: z.string().min(1),
    operator: z.string().min(1),
    value: z.unknown(),
  })).optional(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Create workflow
  fastify.post('/', {
    preHandler: [requirePermission('workflow:create')],
    schema: {
      body: createWorkflowSchema._def.schema,
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            triggerType: { type: 'string' },
            isActive: { type: 'boolean' },
          }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const parsed = createWorkflowSchema.safeParse(request.body);
    
    if (!parsed.success) {
      throw new BadRequestError('Invalid workflow data', parsed.error.flatten());
    }
    
    const workflow = await workflowService.create(tenantSlug, parsed.data);
    return reply.code(201).send(workflow);
  });

  // Update workflow
  fastify.put('/:id', {
    preHandler: [requirePermission('workflow:update')],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      body: updateWorkflowSchema._def.schema
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const parsed = updateWorkflowSchema.safeParse(request.body);
    
    if (!parsed.success) {
      throw new BadRequestError('Invalid workflow data', parsed.error.flatten());
    }
    
    const workflow = await workflowService.update(tenantSlug, id, parsed.data);
    return workflow;
  });

  // Execute workflow
  fastify.post('/:id/execute', {
    preHandler: [requirePermission('workflow:execute')],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          context: {
            type: 'object',
            additionalProperties: true
          }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = request.params as { id: string };
    const { context } = request.body as { context?: Record<string, unknown> };
    
    try {
      const result = await workflowService.execute(tenantSlug, id, context);
      return result;
    } catch (error: any) {
      request.log.error({ err: error, workflowId: id, tenant: tenantSlug }, 'Workflow execution failed');
      throw error;
    }
  });
}