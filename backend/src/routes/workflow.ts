import { validateUUID } from './knowledge.js';

// Add validation for workflow approval chain endpoints
fastify.post('/workflows/:workflowId/approval-chain', {
  preHandler: [authenticate, authorize('update:workflows')],
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      required: ['workflowId'],
      properties: {
        workflowId: { 
          type: 'string', 
          pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
        }
      }
    },
    body: {
      type: 'object',
      required: ['approvers'],
      properties: {
        approvers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['userId', 'order'],
            properties: {
              userId: { 
                type: 'string', 
                pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
              },
              order: { type: 'number', minimum: 1 },
              condition: { type: 'string', maxLength: 255 }
            }
          }
        },
        approvalType: { 
          type: 'string', 
          enum: ['sequential', 'parallel', 'conditional'] 
        }
      }
    }
  }
}, async (request: FastifyRequest<{ 
  Params: { workflowId: string },
  Body: { 
    approvers: Array<{ userId: string; order: number; condition?: string }>; 
    approvalType?: string 
  } 
}>) => {
  const { workflowId } = request.params;
  const { approvers, approvalType } = request.body;
  
  if (!request.tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
  
  // Validate workflowId
  if (!validateUUID(workflowId)) {
    throw new BadRequestError('Invalid workflowId format');
  }
  
  // Validate approver user IDs
  for (const approver of approvers) {
    if (!validateUUID(approver.userId)) {
      throw new BadRequestError(`Invalid userId format for approver: ${approver.userId}`);
    }
  }
  
  try {
    const approvalChain = await workflowService.createApprovalChain(
      request.tenantSlug,
      workflowId,
      approvers,
      approvalType
    );
    
    return approvalChain;
  } catch (error: any) {
    if (error.code === 'WORKFLOW_NOT_FOUND') {
      throw new NotFoundError('Workflow not found');
    }
    
    if (error.code === 'USER_NOT_FOUND') {
      throw new NotFoundError('One or more approvers not found');
    }
    
    throw error;
  }
});