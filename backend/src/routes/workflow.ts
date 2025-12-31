import { FastifyInstance } from 'fastify';
import { workflowService } from '../services/workflow.js';
import { requirePermission } from '../middleware/auth.js';
import { getTenantContext } from '../utils/tenantContext.js';

export default async function workflowRoutes(fastify: FastifyInstance) {
  // GET /workflows
  fastify.get('/', {
    preHandler: [requirePermission('workflow:read')]
  }, async (request, reply) => {
    const { tenantSlug } = getTenantContext(request);
    const workflows = await workflowService.listWorkflows(tenantSlug);
    return workflows;
  });

  // GET /workflows/:id
  fastify.get('/:id', {
    preHandler: [requirePermission('workflow:read')]
  }, async (request, reply) => {
    const { tenantSlug } = getTenantContext(request);
    const { id } = request.params as { id: string };
    const workflow = await workflowService.getWorkflow(tenantSlug, id);
    return workflow;
  });

  // POST /workflows
  fastify.post('/', {
    preHandler: [requirePermission('workflow:write')]
  }, async (request, reply) => {
    const { tenantSlug } = getTenantContext(request);
    const workflowData = request.body as any;
    const workflow = await workflowService.createWorkflow(tenantSlug, workflowData);
    return workflow;
  });

  // PUT /workflows/:id
  fastify.put('/:id', {
    preHandler: [requirePermission('workflow:write')]
  }, async (request, reply) => {
    const { tenantSlug } = getTenantContext(request);
    const { id } = request.params as { id: string };
    const workflowData = request.body as any;
    const workflow = await workflowService.updateWorkflow(tenantSlug, id, workflowData);
    return workflow;
  });

  // DELETE /workflows/:id
  fastify.delete('/:id', {
    preHandler: [requirePermission('workflow:delete')]
  }, async (request, reply) => {
    const { tenantSlug } = getTenantContext(request);
    const { id } = request.params as { id: string };
    await workflowService.deleteWorkflow(tenantSlug, id);
    return { message: 'Workflow deleted successfully' };
  });
}