import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { validate } from '../middleware/validation.js';

// Add workflow execution validation schema
const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

// Add workflow creation schema
const createWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  triggerType: z.enum(['manual', 'auto', 'scheduled']),
  steps: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    type: z.enum(['approval', 'notification', 'task', 'condition']),
    config: z.record(z.any()),
    order: z.number().int().min(0),
  })),
  isActive: z.boolean().optional(),
});

// Add workflow update schema
const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
  steps: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1).max(255),
    type: z.enum(['approval', 'notification', 'task', 'condition']),
    config: z.record(z.any()),
    order: z.number().int().min(0),
  })).optional(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Execute workflow
  fastify.post('/execute', {
    schema: {
      tags: ['Workflows'],
      body: {
        type: 'object',
        properties: {
          requestId: { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' },
          action: { type: 'string', minLength: 1, maxLength: 50 },
          userId: { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' },
          payload: { type: 'object' }
        },
        required: ['requestId', 'action']
      }
    },
    preHandler: [fastify.authenticate, validate({
      body: workflowExecutionSchema
    })]
  }, async (request, reply) => {
    const { requestId, action, userId, payload } = request.body as z.infer<typeof workflowExecutionSchema>;
    const tenant = request.user.tenant;
    
    try {
      // Execute workflow logic would go here
      // const result = await workflowService.execute(tenant.slug, requestId, action, userId, payload);
      
      return reply.code(200).send({
        message: 'Workflow executed successfully',
        // result
      });
    } catch (error: any) {
      request.log.error({ err: error, tenant: tenant.slug, requestId, action }, 'Workflow execution failed');
      
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        return reply.code(404).send({
          message: 'Workflow not found',
          error: 'WORKFLOW_NOT_FOUND'
        });
      }
      
      if (error.code === 'INVALID_ACTION') {
        return reply.code(400).send({
          message: 'Invalid workflow action',
          error: 'INVALID_ACTION'
        });
      }
      
      if (error.code === 'REQUEST_NOT_FOUND') {
        return reply.code(404).send({
          message: 'Request not found',
          error: 'REQUEST_NOT_FOUND'
        });
      }
      
      return reply.code(500).send({
        message: 'Failed to execute workflow',
        error: 'INTERNAL_ERROR'
      });
    }
  });
  
  // Create workflow
  fastify.post('/', {
    schema: {
      tags: ['Workflows'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 1000 },
          triggerType: { type: 'string', enum: ['manual', 'auto', 'scheduled'] },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string', minLength: 1, maxLength: 255 },
                type: { type: 'string', enum: ['approval', 'notification', 'task', 'condition'] },
                config: { type: 'object' },
                order: { type: 'integer', minimum: 0 }
              },
              required: ['name', 'type', 'config', 'order']
            }
          },
          isActive: { type: 'boolean' }
        },
        required: ['name', 'triggerType', 'steps']
      }
    },
    preHandler: [fastify.authenticate, validate({
      body: createWorkflowSchema
    })]
  }, async (request, reply) => {
    const data = request.body as z.infer<typeof createWorkflowSchema>;
    const tenant = request.user.tenant;
    
    try {
      // Create workflow logic would go here
      // const workflow = await workflowService.create(tenant.slug, data);
      
      return reply.code(201).send({
        message: 'Workflow created successfully',
        // workflow
      });
    } catch (error: any) {
      request.log.error({ err: error, tenant: tenant.slug }, 'Workflow creation failed');
      
      return reply.code(500).send({
        message: 'Failed to create workflow',
        error: 'INTERNAL_ERROR'
      });
    }
  });
  
  // Update workflow
  fastify.put('/:workflowId', {
    schema: {
      tags: ['Workflows'],
      params: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' }
        },
        required: ['workflowId']
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 255 },
          description: { type: 'string', maxLength: 1000 },
          isActive: { type: 'boolean' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string', minLength: 1, maxLength: 255 },
                type: { type: 'string', enum: ['approval', 'notification', 'task', 'condition'] },
                config: { type: 'object' },
                order: { type: 'integer', minimum: 0 }
              },
              required: ['name', 'type', 'config', 'order']
            }
          }
        }
      }
    },
    preHandler: [fastify.authenticate, validate({
      params: z.object({
        workflowId: z.string().uuid()
      }),
      body: updateWorkflowSchema
    })]
  }, async (request, reply) => {
    const { workflowId } = request.params as { workflowId: string };
    const data = request.body as z.infer<typeof updateWorkflowSchema>;
    const tenant = request.user.tenant;
    
    try {
      // Update workflow logic would go here
      // const workflow = await workflowService.update(tenant.slug, workflowId, data);
      
      return reply.code(200).send({
        message: 'Workflow updated successfully',
        // workflow
      });
    } catch (error: any) {
      request.log.error({ err: error, tenant: tenant.slug, workflowId }, 'Workflow update failed');
      
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        return reply.code(404).send({
          message: 'Workflow not found',
          error: 'WORKFLOW_NOT_FOUND'
        });
      }
      
      return reply.code(500).send({
        message: 'Failed to update workflow',
        error: 'INTERNAL_ERROR'
      });
    }
  });
}