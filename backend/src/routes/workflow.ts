// Add validation for workflow state transitions
fastify.post('/transitions', {
  schema: {
    body: {
      type: 'object',
      required: ['workflowId', 'requestId', 'fromState', 'toState'],
      properties: {
        workflowId: { type: 'string', format: 'uuid' },
        requestId: { type: 'string', format: 'uuid' },
        fromState: { type: 'string' },
        toState: { type: 'string' },
        userId: { type: 'string', format: 'uuid' },
        comment: { type: 'string' }
      }
    }
  },
  preHandler: [authMiddleware, tenantMiddleware]
}, async (request, reply) => {
  const { workflowId, requestId, fromState, toState, userId, comment } = request.body as {
    workflowId: string;
    requestId: string;
    fromState: string;
    toState: string;
    userId?: string;
    comment?: string;
  };
  
  const { tenantSlug } = request;
  
  // Validate that fromState and toState are different
  if (fromState === toState) {
    throw new BadRequestError('fromState and toState must be different');
  }
  
  // Validate workflow exists and belongs to tenant
  const workflow = await workflowService.getById(tenantSlug, workflowId);
  if (!workflow) {
    throw new NotFoundError('Workflow not found');
  }
  
  // Validate request exists and belongs to tenant
  const req = await requestService.getById(tenantSlug, requestId);
  if (!req) {
    throw new NotFoundError('Request not found');
  }
  
  // Validate that the transition is allowed by workflow definition
  const isValidTransition = await workflowService.validateStateTransition(
    tenantSlug,
    workflowId,
    fromState,
    toState
  );
  
  if (!isValidTransition) {
    throw new BadRequestError(`Invalid state transition from ${fromState} to ${toState}`);
  }
  
  // Check user permissions for this transition
  if (userId) {
    const hasPermission = await workflowService.canUserTransition(
      tenantSlug,
      workflowId,
      userId,
      fromState,
      toState
    );
    
    if (!hasPermission) {
      throw new ForbiddenError('User does not have permission to perform this transition');
    }
  }
  
  // Execute the state transition
  const result = await workflowService.executeTransition(
    tenantSlug,
    workflowId,
    requestId,
    fromState,
    toState,
    userId,
    comment
  );
  
  return result;
});