import { FastifyInstance, FastifyRequest } from 'fastify';
import { workflowService } from '../services/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validatePagination } from '../middleware/validation.js';
import { BadRequestError } from '../utils/errors.js';
import { getTenantContext } from '../utils/tenantContext.js';

// Add validation functions for workflow execution
function validateWorkflowExecutionParams(params: { workflowId: string; input?: Record<string, any> }): void {
  if (!params.workflowId) {
    throw new BadRequestError('Workflow ID is required');
  }
  if (params.input && typeof params.input !== 'object') {
    throw new BadRequestError('Input must be an object');
  }
}

export async function workflowRoutes(fastify: FastifyInstance) {
  // Execute workflow
  fastify.post('/workflows/execute', {
    preHandler: [authenticate, authorize('execute:workflows')],
    schema: {
      tags: ['Workflows'],
      body: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
          input: { type: 'object' }
        },
        required: ['workflowId']
      }
    }
  }, async (request: FastifyRequest<{ 
    Body: { workflowId: string; input?: Record<string, any> } 
  }>) => {
    // Use tenant context utility instead of direct property access
    const { tenantSlug } = getTenantContext(request);
    
    const { workflowId, input } = request.body;
    
    // Validate parameters
    validateWorkflowExecutionParams({ workflowId, input });
    
    const result = await workflowService.executeWorkflow(
      tenantSlug,
      workflowId,
      input
    );
    
    return result;
  });

  // GET /api/v1/workflows
  fastify.get('/workflows', {
    preHandler: [authenticate, authorize('read:workflows'), validatePagination],
    schema: {
      tags: ['Workflows'],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1 },
          perPage: { type: 'integer', minimum: 1, maximum: 100 },
          status: { type: 'string' },
          search: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest<{ 
    Querystring: { page?: number; perPage?: number; status?: string; search?: string } 
  }>) => {
    const { tenantSlug } = getTenantContext(request);
    const { page = 1, perPage = 20, status, search } = request.query;
    const pagination = { page, perPage };
    
    const workflows = await workflowService.list(
      tenantSlug,
      pagination,
      { status, search }
    );
    
    return workflows;
  });
}