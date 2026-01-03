import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workflowService } from '../services/workflow.js';

// ============================================
// SCHEMAS
// ============================================

const workflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'greater_than',
    'less_than',
    'is_empty',
    'is_not_empty',
    'in_list',
    'not_in_list',
  ]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  logical_operator: z.enum(['AND', 'OR']).optional(),
});

const workflowActionSchema = z.object({
  action_type: z.enum([
    'set_field',
    'assign_to_user',
    'assign_to_group',
    'change_status',
    'change_priority',
    'add_comment',
    'send_notification',
    'send_email',
    'escalate',
    'link_to_problem',
    'create_task',
  ]),
  parameters: z.record(z.unknown()),
  order: z.number().int().min(0),
});

const createWorkflowRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  entityType: z.enum(['issue', 'problem', 'change', 'request']),
  triggerType: z.enum(['on_create', 'on_update', 'on_status_change', 'on_assignment', 'scheduled']),
  isActive: z.boolean().optional(),
  conditions: z.array(workflowConditionSchema),
  actions: z.array(workflowActionSchema),
  executionOrder: z.number().int().min(0).optional(),
  stopOnMatch: z.boolean().optional(),
});

const updateWorkflowRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  conditions: z.array(workflowConditionSchema).optional(),
  actions: z.array(workflowActionSchema).optional(),
  executionOrder: z.number().int().min(0).optional(),
  stopOnMatch: z.boolean().optional(),
});

// ============================================
// ROUTES
// ============================================

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Require authentication for all routes
  fastify.addHook('onRequest', async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // ----------------------------------------
  // LIST WORKFLOW RULES
  // ----------------------------------------
  fastify.get('/rules', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as {
      entityType?: 'issue' | 'problem' | 'change' | 'request';
      triggerType?: 'on_create' | 'on_update' | 'on_status_change' | 'on_assignment' | 'scheduled';
      isActive?: string;
    };

    const rules = await workflowService.listWorkflowRules(tenant.slug, {
      entityType: query.entityType,
      triggerType: query.triggerType,
      isActive: query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined,
    });

    return { data: rules };
  });

  // ----------------------------------------
  // GET WORKFLOW RULE BY ID
  // ----------------------------------------
  fastify.get('/rules/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const rule = await workflowService.getWorkflowRule(tenant.slug, id);

    if (!rule) {
      return reply.code(404).send({ error: 'Workflow rule not found' });
    }

    return { data: rule };
  });

  // ----------------------------------------
  // CREATE WORKFLOW RULE
  // ----------------------------------------
  fastify.post('/rules', async (request, reply) => {
    const tenant = (request as any).tenant;
    const user = (request as any).user;
    const body = createWorkflowRuleSchema.parse(request.body);

    try {
      const rule = await workflowService.createWorkflowRule(
        tenant.slug,
        body,
        user?.id
      );
      return reply.code(201).send({ data: rule });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workflow rule';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // UPDATE WORKFLOW RULE
  // ----------------------------------------
  fastify.patch('/rules/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    const body = updateWorkflowRuleSchema.parse(request.body);

    try {
      const rule = await workflowService.updateWorkflowRule(tenant.slug, id, body);

      if (!rule) {
        return reply.code(404).send({ error: 'Workflow rule not found' });
      }

      return { data: rule };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update workflow rule';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // DELETE WORKFLOW RULE
  // ----------------------------------------
  fastify.delete('/rules/:id', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    try {
      const deleted = await workflowService.deleteWorkflowRule(tenant.slug, id);

      if (!deleted) {
        return reply.code(404).send({ error: 'Workflow rule not found' });
      }

      return reply.code(204).send();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete workflow rule';
      return reply.code(400).send({ error: message });
    }
  });

  // ----------------------------------------
  // TOGGLE WORKFLOW RULE ACTIVE STATUS
  // ----------------------------------------
  fastify.post('/rules/:id/toggle', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };

    const rule = await workflowService.getWorkflowRule(tenant.slug, id);
    if (!rule) {
      return reply.code(404).send({ error: 'Workflow rule not found' });
    }

    const updated = await workflowService.updateWorkflowRule(tenant.slug, id, {
      isActive: !rule.is_active,
    });

    return { data: updated };
  });

  // ----------------------------------------
  // GET WORKFLOW EXECUTION LOGS
  // ----------------------------------------
  fastify.get('/logs', async (request, _reply) => {
    const tenant = (request as any).tenant;
    const query = request.query as {
      ruleId?: string;
      entityType?: 'issue' | 'problem' | 'change' | 'request';
      entityId?: string;
      page?: number;
      limit?: number;
    };

    const result = await workflowService.getWorkflowExecutionLogs(tenant.slug, {
      ruleId: query.ruleId,
      entityType: query.entityType,
      entityId: query.entityId,
      page: query.page || 1,
      limit: query.limit || 50,
    });

    return {
      data: result.logs,
      meta: {
        total: result.total,
        page: query.page || 1,
        limit: query.limit || 50,
      },
    };
  });

  // ----------------------------------------
  // TEST WORKFLOW RULE (DRY RUN)
  // ----------------------------------------
  fastify.post('/rules/:id/test', async (request, reply) => {
    const tenant = (request as any).tenant;
    const { id } = request.params as { id: string };
    const { entityData } = request.body as { entityData: Record<string, unknown> };

    const rule = await workflowService.getWorkflowRule(tenant.slug, id);
    if (!rule) {
      return reply.code(404).send({ error: 'Workflow rule not found' });
    }

    const conditionsMatch = workflowService.evaluateConditions(rule.conditions, entityData);

    return {
      data: {
        ruleId: id,
        ruleName: rule.name,
        conditionsMatch,
        conditions: rule.conditions.map((condition) => ({
          ...condition,
          evaluatedResult: workflowService.evaluateCondition(condition, entityData),
        })),
        actionsWouldExecute: conditionsMatch ? rule.actions : [],
      },
    };
  });

  // ----------------------------------------
  // GET AVAILABLE FIELDS FOR ENTITY TYPE
  // ----------------------------------------
  fastify.get('/fields/:entityType', async (request, _reply) => {
    const { entityType } = request.params as { entityType: string };

    const fieldsByEntityType: Record<string, Array<{ field: string; label: string; type: string }>> = {
      issue: [
        { field: 'status', label: 'Status', type: 'select' },
        { field: 'priority', label: 'Priority', type: 'select' },
        { field: 'category', label: 'Category', type: 'text' },
        { field: 'assigned_to', label: 'Assigned To', type: 'user' },
        { field: 'assigned_group', label: 'Assigned Group', type: 'group' },
        { field: 'title', label: 'Title', type: 'text' },
        { field: 'description', label: 'Description', type: 'text' },
        { field: 'reporter_id', label: 'Reporter', type: 'user' },
        { field: 'source', label: 'Source', type: 'select' },
      ],
      problem: [
        { field: 'status', label: 'Status', type: 'select' },
        { field: 'priority', label: 'Priority', type: 'select' },
        { field: 'category', label: 'Category', type: 'text' },
        { field: 'assigned_to', label: 'Assigned To', type: 'user' },
        { field: 'assigned_group', label: 'Assigned Group', type: 'group' },
        { field: 'title', label: 'Title', type: 'text' },
        { field: 'description', label: 'Description', type: 'text' },
        { field: 'impact', label: 'Impact', type: 'select' },
      ],
      change: [
        { field: 'status', label: 'Status', type: 'select' },
        { field: 'priority', label: 'Priority', type: 'select' },
        { field: 'category', label: 'Category', type: 'text' },
        { field: 'assigned_to', label: 'Assigned To', type: 'user' },
        { field: 'title', label: 'Title', type: 'text' },
        { field: 'description', label: 'Description', type: 'text' },
        { field: 'risk_level', label: 'Risk Level', type: 'select' },
        { field: 'change_type', label: 'Change Type', type: 'select' },
      ],
      request: [
        { field: 'status', label: 'Status', type: 'select' },
        { field: 'priority', label: 'Priority', type: 'select' },
        { field: 'category', label: 'Category', type: 'text' },
        { field: 'assigned_to', label: 'Assigned To', type: 'user' },
        { field: 'title', label: 'Title', type: 'text' },
        { field: 'description', label: 'Description', type: 'text' },
        { field: 'requester_id', label: 'Requester', type: 'user' },
      ],
    };

    const fields = fieldsByEntityType[entityType] || [];
    return { data: fields };
  });

  // ----------------------------------------
  // GET AVAILABLE ACTIONS FOR ENTITY TYPE
  // ----------------------------------------
  fastify.get('/actions/:entityType', async (request, _reply) => {
    const { entityType } = request.params as { entityType: string };

    const actions = [
      { action_type: 'set_field', label: 'Set Field Value', description: 'Update any field to a specific value' },
      { action_type: 'assign_to_user', label: 'Assign to User', description: 'Assign to a specific user' },
      { action_type: 'assign_to_group', label: 'Assign to Group', description: 'Assign to a specific group' },
      { action_type: 'change_status', label: 'Change Status', description: 'Update the status' },
      { action_type: 'change_priority', label: 'Change Priority', description: 'Update the priority level' },
      { action_type: 'add_comment', label: 'Add Comment', description: 'Add an automated comment' },
      { action_type: 'send_notification', label: 'Send Notification', description: 'Send an in-app notification' },
      { action_type: 'send_email', label: 'Send Email', description: 'Send an email notification' },
      { action_type: 'escalate', label: 'Escalate', description: 'Escalate to next level' },
    ];

    if (entityType === 'issue') {
      actions.push({ action_type: 'link_to_problem', label: 'Link to Problem', description: 'Link to an existing problem' });
    }

    return { data: actions };
  });
}
