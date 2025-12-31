// Add this import at the top with other imports
import { workflowApprovalService } from '../services/workflowApprovals.js';

// Add this route handler for workflow approval chains
fastify.post('/workflows/:workflowId/approval-chain', {
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', format: 'uuid' }
      },
      required: ['workflowId']
    },
    body: {
      type: 'object',
      properties: {
        approvers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              order: { type: 'number' },
              required: { type: 'boolean' }
            },
            required: ['userId', 'order']
          }
        },
        conditions: {
          type: 'object',
          properties: {
            minApprovals: { type: 'number' },
            timeoutHours: { type: 'number' }
          }
        }
      },
      required: ['approvers']
    }
  },
  preHandler: [fastify.authenticate, validate({
    params: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', format: 'uuid' }
      },
      required: ['workflowId']
    },
    body: {
      type: 'object',
      properties: {
        approvers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              userId: { type: 'string', format: 'uuid' },
              order: { type: 'number' },
              required: { type: 'boolean' }
            },
            required: ['userId', 'order']
          }
        },
        conditions: {
          type: 'object',
          properties: {
            minApprovals: { type: 'number' },
            timeoutHours: { type: 'number' }
          }
        }
      },
      required: ['approvers']
    }
  })]
}, async (request, reply) => {
  const { workflowId } = request.params as { workflowId: string };
  const { approvers, conditions } = request.body as { 
    approvers: Array<{ userId: string; order: number; required: boolean }>;
    conditions?: { minApprovals?: number; timeoutHours?: number };
  };
  const tenant = request.user.tenant;

  try {
    const approvalChain = await workflowApprovalService.createApprovalChain(
      tenant.slug,
      workflowId,
      approvers,
      conditions
    );

    return reply.code(201).send(approvalChain);
  } catch (error: any) {
    request.log.error({ err: error, workflowId, tenant: tenant.slug }, 'Failed to create approval chain');
    return reply.code(500).send({ 
      message: 'Failed to create approval chain',
      error: 'INTERNAL_ERROR' 
    });
  }
});