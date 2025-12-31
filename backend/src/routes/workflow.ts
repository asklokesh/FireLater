// Add this export for testing purposes at the top of the file
export const workflowHandlers = {
  executeWorkflow: async (request: FastifyRequest, reply: FastifyReply) => {
    const { workflowId } = request.params as { workflowId: string };
    const { inputs, triggerType } = request.body as { 
      inputs: Record<string, any>;
      triggerType: string;
    };
    const tenant = request.user.tenant;
    
    try {
      // Validate workflow exists and belongs to tenant
      const workflow = await workflowService.getWorkflow(tenant.slug, workflowId);
      if (!workflow) {
        return reply.code(404).send({ 
          message: 'Workflow not found',
          error: 'NOT_FOUND'
        });
      }
      
      // Check if workflow is active
      if (!workflow.isActive) {
        return reply.code(400).send({
          message: 'Workflow is not active',
          error: 'WORKFLOW_INACTIVE'
        });
      }
      
      // Execute workflow with inputs
      const executionResult = await workflowService.executeWorkflow(
        tenant.slug, 
        workflowId, 
        inputs,
        triggerType
      );
      
      return reply.code(200).send({
        message: 'Workflow executed successfully',
        executionId: executionResult.executionId,
        status: executionResult.status,
        outputs: executionResult.outputs
      });
    } catch (error: any) {
      request.log.error({ err: error, workflowId, tenant: tenant.slug }, 'Workflow execution failed');
      
      if (error.code === 'VALIDATION_ERROR') {
        return reply.code(400).send({
          message: 'Invalid workflow inputs',
          error: 'VALIDATION_ERROR',
          details: error.details
        });
      }
      
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        return reply.code(404).send({
          message: 'Workflow not found',
          error: 'NOT_FOUND'
        });
      }
      
      if (error.code === 'WORKFLOW_EXECUTION_FAILED') {
        return reply.code(500).send({
          message: 'Workflow execution failed',
          error: 'EXECUTION_FAILED',
          details: error.details
        });
      }
      
      return reply.code(500).send({
        message: 'Failed to execute workflow',
        error: 'INTERNAL_ERROR'
      });
    }
  },
  
  getWorkflowState: async (request: FastifyRequest, reply: FastifyReply) => {
    const { workflowId, executionId } = request.params as { 
      workflowId: string; 
      executionId: string;
    };
    const tenant = request.user.tenant;
    
    try {
      const state = await workflowService.getWorkflowState(
        tenant.slug, 
        workflowId, 
        executionId
      );
      
      if (!state) {
        return reply.code(404).send({
          message: 'Workflow execution not found',
          error: 'NOT_FOUND'
        });
      }
      
      return reply.code(200).send(state);
    } catch (error: any) {
      request.log.error({ 
        err: error, 
        workflowId, 
        executionId, 
        tenant: tenant.slug 
      }, 'Failed to fetch workflow state');
      
      return reply.code(500).send({
        message: 'Failed to fetch workflow state',
        error: 'INTERNAL_ERROR'
      });
    }
  }
};

// Update route registrations to use exported handlers
fastify.post('/workflows/:workflowId/execute', {
  preHandler: [fastify.authenticate],
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' }
      },
      required: ['workflowId']
    },
    body: {
      type: 'object',
      properties: {
        inputs: { type: 'object' },
        triggerType: { type: 'string' }
      },
      required: ['inputs']
    }
  }
}, workflowHandlers.executeWorkflow);

fastify.get('/workflows/:workflowId/executions/:executionId/state', {
  preHandler: [fastify.authenticate],
  schema: {
    tags: ['Workflows'],
    params: {
      type: 'object',
      properties: {
        workflowId: { type: 'string' },
        executionId: { type: 'string' }
      },
      required: ['workflowId', 'executionId']
    }
  }
}, workflowHandlers.getWorkflowState);