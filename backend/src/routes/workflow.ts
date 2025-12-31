import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Add workflow execution validation schema
const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Execute workflow action
  fastify.post('/execute', {
    preHandler: [fastify.authenticate, validate({
      body: {
        type: 'object',
        properties: {
          requestId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
          action: { type: 'string', minLength: 1, maxLength: 50 },
          userId: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
          payload: { type: 'object' }
        },
        required: ['requestId', 'action']
      }
    })],
    handler: async (request, reply) => {
      try {
        const { requestId, action, userId, payload } = request.body as {
          requestId: string;
          action: string;
          userId?: string;
          payload?: Record<string, any>;
        };
        const tenant = request.user.tenant;

        // Validate workflow execution
        const result = workflowExecutionSchema.safeParse({
          requestId,
          action,
          userId: userId || request.user.id,
          payload
        });

        if (!result.success) {
          return reply.code(400).send({
            message: 'Invalid workflow execution parameters',
            errors: result.error.errors
          });
        }

        // Execute workflow action
        const executionResult = await fastify.workflowService.executeAction(
          tenant.slug,
          requestId,
          action,
          userId || request.user.id,
          payload
        );

        return reply.code(200).send(executionResult);
      } catch (error) {
        request.log.error({ err: error }, 'Workflow execution failed');
        return reply.code(500).send({ message: 'Failed to execute workflow action' });
      }
    }
  });
}