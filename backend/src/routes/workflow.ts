import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validateTenantAccess } from '../middleware/tenant.js';

// Add workflow execution validation schema
const workflowExecutionSchema = z.object({
  requestId: z.string().uuid(),
  action: z.string().min(1).max(50),
  userId: z.string().uuid().optional(),
  payload: z.record(z.any()).optional(),
});

export async function workflowRoutes(fastify: FastifyInstance) {
  // POST /api/v1/workflow/execute
  fastify.post('/execute', {
    preHandler: [authenticate, authorize('execute:workflow'), validateTenantAccess],
    schema: {
      body: {
        type: 'object',
        required: ['requestId', 'action'],
        properties: {
          requestId: { type: 'string', format: 'uuid' },
          action: { type: 'string', minLength: 1, maxLength: 50 },
          userId: { type: 'string', format: 'uuid' },
          payload: { type: 'object' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const { requestId, action, userId, payload } = request.body as {
      requestId: string;
      action: string;
      userId?: string;
      payload?: Record<string, any>;
    };

    try {
      // Validate input
      const validatedData = workflowExecutionSchema.parse({ requestId, action, userId, payload });
      
      // Execute workflow
      const result = await workflowService.executeWorkflow(
        tenantSlug, 
        validatedData.requestId, 
        validatedData.action, 
        validatedData.userId || request.user.id,
        validatedData.payload
      );
      
      return reply.send(result);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: error.errors
        });
      }
      
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        return reply.status(404).send({
          error: 'Workflow not found',
          code: 'WORKFLOW_NOT_FOUND'
        });
      }
      
      if (error.code === 'INVALID_STATE_TRANSITION') {
        return reply.status(400).send({
          error: 'Invalid state transition',
          code: 'INVALID_STATE_TRANSITION',
          details: error.message
        });
      }
      
      if (error.code === 'WORKFLOW_EXECUTION_FAILED') {
        return reply.status(400).send({
          error: 'Workflow execution failed',
          code: 'WORKFLOW_EXECUTION_FAILED',
          details: error.message
        });
      }
      
      fastify.log.error({ error }, 'Workflow execution error');
      return reply.status(500).send({
        error: 'Internal server error',
        code: 'WORKFLOW_EXECUTION_ERROR'
      });
    }
  });

  // GET /api/v1/workflow/:requestId/state
  fastify.get('/:requestId/state', {
    preHandler: [authenticate, authorize('read:workflow'), validateTenantAccess],
    schema: {
      params: {
        type: 'object',
        required: ['requestId'],
        properties: {
          requestId: { type: 'string', format: 'uuid' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenantSlug } = request.params as { tenantSlug: string };
    const { requestId } = request.params as { requestId: string };

    try {
      const state = await workflowService.getCurrentState(tenantSlug, requestId);
      return reply.send(state);
    } catch (error: any) {
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        return reply.status(404).send({
          error: 'Workflow not found',
          code: 'WORKFLOW_NOT_FOUND'
        });
      }
      
      fastify.log.error({ error }, 'Failed to get workflow state');
      return reply.status(500).send({
        error: 'Failed to retrieve workflow state',
        code: 'WORKFLOW_STATE_ERROR'
      });
    }
  });
}