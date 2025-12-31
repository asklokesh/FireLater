import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';
import { requirePermission } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';

const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Execute workflow action
  fastify.post('/execute', {
    preHandler: [fastify.authenticate, requirePermission('workflow:execute'), validate(workflowExecutionSchema)],
  }, async (request, reply) => {
    const { requestId, action, userId, payload } = request.body as z.infer<typeof workflowExecutionSchema>;
    const { tenantSlug } = request.user;
    
    try {
      const result = await workflowService.executeAction(
        tenantSlug,
        requestId,
        action,
        userId || request.user.id,
        payload
      );
      
      return reply.send(result);
    } catch (error: any) {
      request.log.error({ err: error, tenantSlug, requestId, action }, 'Workflow execution failed');
      
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        return reply.code(404).send({ message: 'Workflow not found' });
      }
      
      if (error.code === 'INVALID_ACTION') {
        return reply.code(400).send({ message: 'Invalid workflow action' });
      }
      
      if (error.code === 'PERMISSION_DENIED') {
        return reply.code(403).send({ message: 'Insufficient permissions to execute this action' });
      }
      
      return reply.code(500).send({ message: 'Failed to execute workflow' });
    }
  });
}