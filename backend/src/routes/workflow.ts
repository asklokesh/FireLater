import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';
import { authenticate, authorize } from '../middleware/auth.js';

// Add validation schemas for workflow operations
const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  triggerType: z.enum(['manual', 'automatic', 'scheduled']),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    type: z.enum(['approval', 'notification', 'task', 'condition']),
    config: z.record(z.any()),
    order: z.number().int().min(0),
  })).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    type: z.enum(['approval', 'notification', 'task', 'condition']),
    config: z.record(z.any()),
    order: z.number().int().min(0),
  })).optional(),
});

const executeWorkflowSchema = z.object({
  workflowId: z.string().uuid(),
  context: z.record(z.any()).optional(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Apply auth middleware to all routes
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', authorize(['admin', 'manager']));

  // List workflows
  fastify.get('/', {
    schema: {
      tags: ['Workflows'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          isActive: { type: 'boolean' },
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { page = 1, perPage = 20, isActive } = request.query as any;
    
    const result = await workflowService.list(request.tenantSlug!, {
      page: parseInt(page as any),
      perPage: parseInt(perPage as any)
    }, {
      isActive: isActive !== undefined ? Boolean(isActive) : undefined
    });
    
    return result;
  });

  // Create workflow
  fastify.post('/', {
    schema: {
      tags: ['Workflows'],
      body: {
        type: 'object',
        required: ['name', 'triggerType'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 2000 },
          triggerType: { type: 'string', enum: ['manual', 'automatic', 'scheduled'] },
          isActive: { type: 'boolean' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 255 },
                type: { type: 'string', enum: ['approval', 'notification', 'task', 'condition'] },
                config: { type: 'object' },
                order: { type: 'integer', minimum: 0 }
              },
              required: ['name', 'type', 'config', 'order']
            }
          }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const payload = request.body as any;
    
    // Validate input
    const result = createWorkflowSchema.safeParse(payload);
    if (!result.success) {
      return reply.status(400).send({ 
        error: 'Validation failed',
        details: result.error.flatten()
      });
    }
    
    const workflow = await workflowService.create(request.tenantSlug!, result.data);
    return reply.status(201).send(workflow);
  });

  // Execute workflow
  fastify.post('/execute', {
    schema: {
      tags: ['Workflows'],
      body: {
        type: 'object',
        required: ['workflowId'],
        properties: {
          workflowId: { type: 'string', format: 'uuid' },
          context: { type: 'object' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const payload = request.body as any;
    
    // Validate input
    const result = executeWorkflowSchema.safeParse(payload);
    if (!result.success) {
      return reply.status(400).send({ 
        error: 'Validation failed',
        details: result.error.flatten()
      });
    }
    
    try {
      const execution = await workflowService.execute(
        request.tenantSlug!, 
        result.data.workflowId, 
        result.data.context
      );
      return execution;
    } catch (error: any) {
      request.log.error({ err: error }, 'Workflow execution failed');
      return reply.status(500).send({ 
        error: 'Workflow execution failed',
        message: error.message 
      });
    }
  });
}