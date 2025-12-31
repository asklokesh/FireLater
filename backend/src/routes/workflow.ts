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

export async function workflowRoutes(fastify: FastifyInstance) {
  // POST /api/v1/workflow/execute
  fastify.post('/execute', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          requestId: { type: 'string', format: 'uuid' },
          action: { type: 'string', minLength: 1, maxLength: 50 },
          userId: { type: 'string', format: 'uuid' },
          payload: { type: 'object' }
        },
        required: ['requestId', 'action'],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { requestId, action, userId, payload } = request.body as {
      requestId: string;
      action: string;
      userId?: string;
      payload?: Record<string, any>;
    };

    // Validate input with Zod schema
    try {
      workflowExecutionSchema.parse({ requestId, action, userId, payload });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }

    // Execute workflow logic
    const result = await fastify.workflowService.executeWorkflow(
      request.user.tenant,
      requestId,
      action,
      userId || request.user.id,
      payload
    );

    return reply.send(result);
  });

  // POST /api/v1/workflow/validate-config
  fastify.post('/validate-config', {
    preHandler: [fastify.authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          config: {
            type: 'object',
            properties: {
              steps: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', minLength: 1 },
                    type: { type: 'string', minLength: 1 },
                    name: { type: 'string', minLength: 1, maxLength: 100 },
                    description: { type: 'string', maxLength: 1000 },
                    config: { type: 'object' },
                    nextStepId: { type: 'string' }
                  },
                  required: ['id', 'type', 'name'],
                  additionalProperties: false
                }
              },
              startStepId: { type: 'string', minLength: 1 }
            },
            required: ['steps', 'startStepId'],
            additionalProperties: false
          }
        },
        required: ['config'],
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { config } = request.body as { config: any };

    try {
      workflowConfigSchema.parse(config);
      return reply.send({ valid: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          valid: false,
          error: 'Validation failed',
          details: error.errors
        });
      }
      throw error;
    }
  });
}