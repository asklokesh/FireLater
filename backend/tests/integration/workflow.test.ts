import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockWorkflowCondition {
  field: string;
  operator: string;
  value: string | number | boolean | string[];
  logical_operator?: 'AND' | 'OR';
}

interface MockWorkflowAction {
  action_type: string;
  parameters: Record<string, unknown>;
  order: number;
}

interface MockWorkflowRule {
  id: string;
  name: string;
  description: string | null;
  entity_type: 'issue' | 'problem' | 'change' | 'request';
  trigger_type: 'on_create' | 'on_update' | 'on_status_change' | 'on_assignment' | 'scheduled';
  is_active: boolean;
  conditions: MockWorkflowCondition[];
  actions: MockWorkflowAction[];
  execution_order: number;
  stop_on_match: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface MockWorkflowLog {
  id: string;
  rule_id: string;
  rule_name: string;
  entity_type: string;
  entity_id: string;
  executed_at: string;
  success: boolean;
  actions_executed: string[];
  error_message: string | null;
}

const validEntityTypes = ['issue', 'problem', 'change', 'request'];
const validTriggerTypes = ['on_create', 'on_update', 'on_status_change', 'on_assignment', 'scheduled'];
const validOperators = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'starts_with', 'ends_with', 'greater_than', 'less_than',
  'is_empty', 'is_not_empty', 'in_list', 'not_in_list',
];
const validActionTypes = [
  'set_field', 'assign_to_user', 'assign_to_group',
  'change_status', 'change_priority', 'add_comment',
  'send_notification', 'send_email', 'escalate',
  'link_to_problem', 'create_task',
];

describe('Workflow Routes', () => {
  let app: FastifyInstance;
  const rules: MockWorkflowRule[] = [];
  const logs: MockWorkflowLog[] = [];
  let ruleIdCounter = 0;
  let logIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/workflow/rules - List workflow rules
    app.get('/v1/workflow/rules', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        entityType?: string;
        triggerType?: string;
        isActive?: string;
      };

      // Validate entityType
      if (query.entityType && !validEntityTypes.includes(query.entityType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid entityType value',
        });
      }

      // Validate triggerType
      if (query.triggerType && !validTriggerTypes.includes(query.triggerType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid triggerType value',
        });
      }

      let filteredRules = [...rules];

      if (query.entityType) {
        filteredRules = filteredRules.filter(r => r.entity_type === query.entityType);
      }
      if (query.triggerType) {
        filteredRules = filteredRules.filter(r => r.trigger_type === query.triggerType);
      }
      if (query.isActive !== undefined) {
        const isActive = query.isActive === 'true';
        filteredRules = filteredRules.filter(r => r.is_active === isActive);
      }

      return { data: filteredRules };
    });

    // GET /v1/workflow/rules/:id - Get rule by ID
    app.get('/v1/workflow/rules/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const rule = rules.find(r => r.id === id);

      if (!rule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow rule not found',
        });
      }

      return { data: rule };
    });

    // POST /v1/workflow/rules - Create rule
    app.post('/v1/workflow/rules', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        name?: string;
        description?: string;
        entityType?: string;
        triggerType?: string;
        isActive?: boolean;
        conditions?: MockWorkflowCondition[];
        actions?: MockWorkflowAction[];
        executionOrder?: number;
        stopOnMatch?: boolean;
      };

      if (!body.name || body.name.length < 1) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name is required',
        });
      }

      if (body.name.length > 100) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Name must be at most 100 characters',
        });
      }

      if (!body.entityType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'entityType is required',
        });
      }

      if (!validEntityTypes.includes(body.entityType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid entityType value',
        });
      }

      if (!body.triggerType) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'triggerType is required',
        });
      }

      if (!validTriggerTypes.includes(body.triggerType)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid triggerType value',
        });
      }

      if (!body.conditions || !Array.isArray(body.conditions)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'conditions is required and must be an array',
        });
      }

      // Validate conditions
      for (const condition of body.conditions) {
        if (!condition.field || condition.field.length < 1) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Condition field is required',
          });
        }
        if (!condition.operator || !validOperators.includes(condition.operator)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Invalid condition operator',
          });
        }
        if (condition.logical_operator && !['AND', 'OR'].includes(condition.logical_operator)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Invalid logical_operator',
          });
        }
      }

      if (!body.actions || !Array.isArray(body.actions)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'actions is required and must be an array',
        });
      }

      // Validate actions
      for (const action of body.actions) {
        if (!action.action_type || !validActionTypes.includes(action.action_type)) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Invalid action_type',
          });
        }
        if (action.order === undefined || action.order < 0) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Action order must be non-negative',
          });
        }
      }

      const newRule: MockWorkflowRule = {
        id: `rule-${++ruleIdCounter}`,
        name: body.name,
        description: body.description || null,
        entity_type: body.entityType as 'issue' | 'problem' | 'change' | 'request',
        trigger_type: body.triggerType as 'on_create' | 'on_update' | 'on_status_change' | 'on_assignment' | 'scheduled',
        is_active: body.isActive !== false,
        conditions: body.conditions,
        actions: body.actions,
        execution_order: body.executionOrder || 0,
        stop_on_match: body.stopOnMatch || false,
        created_by: 'user-1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      rules.push(newRule);
      reply.status(201).send({ data: newRule });
    });

    // PATCH /v1/workflow/rules/:id - Update rule
    app.patch('/v1/workflow/rules/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const ruleIndex = rules.findIndex(r => r.id === id);

      if (ruleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow rule not found',
        });
      }

      const body = request.body as Partial<{
        name: string;
        description: string;
        isActive: boolean;
        conditions: MockWorkflowCondition[];
        actions: MockWorkflowAction[];
        executionOrder: number;
        stopOnMatch: boolean;
      }>;

      if (body.name !== undefined) {
        if (body.name.length < 1) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Name is required',
          });
        }
        if (body.name.length > 100) {
          return reply.status(400).send({
            statusCode: 400,
            error: 'Validation Error',
            message: 'Name must be at most 100 characters',
          });
        }
        rules[ruleIndex].name = body.name;
      }

      if (body.description !== undefined) {
        rules[ruleIndex].description = body.description;
      }

      if (body.isActive !== undefined) {
        rules[ruleIndex].is_active = body.isActive;
      }

      if (body.conditions !== undefined) {
        for (const condition of body.conditions) {
          if (!condition.field || condition.field.length < 1) {
            return reply.status(400).send({
              statusCode: 400,
              error: 'Validation Error',
              message: 'Condition field is required',
            });
          }
        }
        rules[ruleIndex].conditions = body.conditions;
      }

      if (body.actions !== undefined) {
        rules[ruleIndex].actions = body.actions;
      }

      if (body.executionOrder !== undefined) {
        rules[ruleIndex].execution_order = body.executionOrder;
      }

      if (body.stopOnMatch !== undefined) {
        rules[ruleIndex].stop_on_match = body.stopOnMatch;
      }

      rules[ruleIndex].updated_at = new Date().toISOString();

      return { data: rules[ruleIndex] };
    });

    // DELETE /v1/workflow/rules/:id - Delete rule
    app.delete('/v1/workflow/rules/:id', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const ruleIndex = rules.findIndex(r => r.id === id);

      if (ruleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow rule not found',
        });
      }

      rules.splice(ruleIndex, 1);
      reply.status(204).send();
    });

    // POST /v1/workflow/rules/:id/toggle - Toggle rule active status
    app.post('/v1/workflow/rules/:id/toggle', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const rule = rules.find(r => r.id === id);

      if (!rule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow rule not found',
        });
      }

      rule.is_active = !rule.is_active;
      rule.updated_at = new Date().toISOString();

      return { data: rule };
    });

    // GET /v1/workflow/logs - Get workflow execution logs
    app.get('/v1/workflow/logs', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        ruleId?: string;
        entityType?: string;
        entityId?: string;
        page?: string;
        limit?: string;
      };

      let filteredLogs = [...logs];

      if (query.ruleId) {
        filteredLogs = filteredLogs.filter(l => l.rule_id === query.ruleId);
      }
      if (query.entityType) {
        filteredLogs = filteredLogs.filter(l => l.entity_type === query.entityType);
      }
      if (query.entityId) {
        filteredLogs = filteredLogs.filter(l => l.entity_id === query.entityId);
      }

      const page = parseInt(query.page || '1');
      const limit = parseInt(query.limit || '50');
      const start = (page - 1) * limit;
      const end = start + limit;

      return {
        data: filteredLogs.slice(start, end),
        meta: {
          total: filteredLogs.length,
          page,
          limit,
        },
      };
    });

    // POST /v1/workflow/rules/:id/test - Test rule (dry run)
    app.post('/v1/workflow/rules/:id/test', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { id } = request.params as { id: string };
      const rule = rules.find(r => r.id === id);

      if (!rule) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: 'Workflow rule not found',
        });
      }

      const { entityData } = request.body as { entityData?: Record<string, unknown> };

      if (!entityData) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'entityData is required',
        });
      }

      // Evaluate conditions (simplified logic)
      const conditionResults = rule.conditions.map(condition => {
        const fieldValue = entityData[condition.field];
        let matches = false;

        switch (condition.operator) {
          case 'equals':
            matches = fieldValue === condition.value;
            break;
          case 'not_equals':
            matches = fieldValue !== condition.value;
            break;
          case 'contains':
            matches = typeof fieldValue === 'string' &&
              typeof condition.value === 'string' &&
              fieldValue.includes(condition.value);
            break;
          case 'is_empty':
            matches = fieldValue === null || fieldValue === undefined || fieldValue === '';
            break;
          case 'is_not_empty':
            matches = fieldValue !== null && fieldValue !== undefined && fieldValue !== '';
            break;
          case 'in_list':
            matches = Array.isArray(condition.value) && condition.value.includes(fieldValue as string);
            break;
          default:
            matches = false;
        }

        return {
          ...condition,
          evaluatedResult: matches,
        };
      });

      const conditionsMatch = conditionResults.length === 0 ||
        conditionResults.every(c => c.evaluatedResult);

      return {
        data: {
          ruleId: id,
          ruleName: rule.name,
          conditionsMatch,
          conditions: conditionResults,
          actionsWouldExecute: conditionsMatch ? rule.actions : [],
        },
      };
    });

    // GET /v1/workflow/fields/:entityType - Get available fields
    app.get('/v1/workflow/fields/:entityType', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

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

    // GET /v1/workflow/actions/:entityType - Get available actions
    app.get('/v1/workflow/actions/:entityType', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

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
        actions.push({
          action_type: 'link_to_problem',
          label: 'Link to Problem',
          description: 'Link to an existing problem',
        });
      }

      return { data: actions };
    });

    // Add some test logs
    logs.push({
      id: `log-${++logIdCounter}`,
      rule_id: 'rule-1',
      rule_name: 'Auto-assign critical issues',
      entity_type: 'issue',
      entity_id: 'issue-1',
      executed_at: new Date().toISOString(),
      success: true,
      actions_executed: ['assign_to_group', 'send_notification'],
      error_message: null,
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/workflow/rules', () => {
    it('should return empty list initially', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules?entityType=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid triggerType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules?triggerType=invalid',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /v1/workflow/rules', () => {
    it('should create a workflow rule', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Auto-assign critical issues',
          description: 'Automatically assign critical issues to support team',
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [
            { field: 'priority', operator: 'equals', value: 'critical' },
          ],
          actions: [
            { action_type: 'assign_to_group', parameters: { group_id: 'support' }, order: 0 },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe('Auto-assign critical issues');
      expect(body.data.entity_type).toBe('issue');
      expect(body.data.trigger_type).toBe('on_create');
      expect(body.data.is_active).toBe(true);
      expect(body.data.id).toBeDefined();
    });

    it('should return 400 for missing name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for name over 100 characters', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'x'.repeat(101),
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          triggerType: 'on_create',
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          entityType: 'invalid',
          triggerType: 'on_create',
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing triggerType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          entityType: 'issue',
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid triggerType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          entityType: 'issue',
          triggerType: 'invalid',
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid condition operator', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [
            { field: 'status', operator: 'invalid', value: 'open' },
          ],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid action_type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [],
          actions: [
            { action_type: 'invalid', parameters: {}, order: 0 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for negative action order', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Test Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [],
          actions: [
            { action_type: 'change_status', parameters: {}, order: -1 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should accept all valid entity types', async () => {
      const token = generateTestToken(app);
      for (const entityType of validEntityTypes) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/workflow/rules',
          headers: createAuthHeader(token),
          payload: {
            name: `Rule for ${entityType}`,
            entityType,
            triggerType: 'on_create',
            conditions: [],
            actions: [],
          },
        });

        expect(response.statusCode).toBe(201);
      }
    });

    it('should accept all valid trigger types', async () => {
      const token = generateTestToken(app);
      for (const triggerType of validTriggerTypes) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/workflow/rules',
          headers: createAuthHeader(token),
          payload: {
            name: `Rule with ${triggerType}`,
            entityType: 'issue',
            triggerType,
            conditions: [],
            actions: [],
          },
        });

        expect(response.statusCode).toBe(201);
      }
    });

    it('should create rule with isActive false', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Inactive Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          isActive: false,
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.is_active).toBe(false);
    });

    it('should create rule with executionOrder', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Priority Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          executionOrder: 10,
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.execution_order).toBe(10);
    });

    it('should create rule with stopOnMatch', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Exclusive Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          stopOnMatch: true,
          conditions: [],
          actions: [],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.stop_on_match).toBe(true);
    });
  });

  describe('GET /v1/workflow/rules - with data', () => {
    it('should list rules', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should filter by entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules?entityType=issue',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((r: MockWorkflowRule) => r.entity_type === 'issue')).toBe(true);
    });

    it('should filter by triggerType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules?triggerType=on_create',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((r: MockWorkflowRule) => r.trigger_type === 'on_create')).toBe(true);
    });

    it('should filter by isActive', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules?isActive=true',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((r: MockWorkflowRule) => r.is_active === true)).toBe(true);
    });

    it('should filter by isActive=false', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules?isActive=false',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((r: MockWorkflowRule) => r.is_active === false)).toBe(true);
    });
  });

  describe('GET /v1/workflow/rules/:id', () => {
    it('should get a rule by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe('rule-1');
    });

    it('should return 404 for non-existent rule', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules/rule-1',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /v1/workflow/rules/:id', () => {
    it('should update a rule name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
        payload: {
          name: 'Updated Rule Name',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.name).toBe('Updated Rule Name');
    });

    it('should update rule description', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
        payload: {
          description: 'New description',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.description).toBe('New description');
    });

    it('should update rule isActive', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
        payload: {
          isActive: false,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.is_active).toBe(false);
    });

    it('should return 404 for non-existent rule', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/non-existent',
        headers: createAuthHeader(token),
        payload: { name: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for empty name', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for name over 100 characters', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
        payload: { name: 'x'.repeat(101) },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /v1/workflow/rules/:id', () => {
    it('should delete a rule', async () => {
      const token = generateTestToken(app);
      // First create a rule to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Rule to Delete',
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [],
          actions: [],
        },
      });

      const rule = JSON.parse(createResponse.body).data;

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/workflow/rules/${rule.id}`,
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 for non-existent rule', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/workflow/rules/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /v1/workflow/rules/:id/toggle', () => {
    it('should toggle rule active status', async () => {
      const token = generateTestToken(app);
      // First get current state
      const getResponse = await app.inject({
        method: 'GET',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
      });
      const currentState = JSON.parse(getResponse.body).data.is_active;

      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules/rule-1/toggle',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.is_active).toBe(!currentState);
    });

    it('should return 404 for non-existent rule', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules/non-existent/toggle',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/workflow/logs', () => {
    it('should get workflow logs', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/logs',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.meta).toBeDefined();
    });

    it('should filter logs by ruleId', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/logs?ruleId=rule-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((l: MockWorkflowLog) => l.rule_id === 'rule-1')).toBe(true);
    });

    it('should filter logs by entityType', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/logs?entityType=issue',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((l: MockWorkflowLog) => l.entity_type === 'issue')).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/logs',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should support pagination', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/logs?page=1&limit=10',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
    });
  });

  describe('POST /v1/workflow/rules/:id/test', () => {
    it('should test a rule with matching data', async () => {
      const token = generateTestToken(app);
      // Ensure rule-1 exists with proper conditions
      await app.inject({
        method: 'PATCH',
        url: '/v1/workflow/rules/rule-1',
        headers: createAuthHeader(token),
        payload: {
          conditions: [
            { field: 'priority', operator: 'equals', value: 'critical' },
          ],
          actions: [
            { action_type: 'assign_to_group', parameters: { group_id: 'support' }, order: 0 },
          ],
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules/rule-1/test',
        headers: createAuthHeader(token),
        payload: {
          entityData: { priority: 'critical', status: 'open' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.conditionsMatch).toBe(true);
      expect(body.data.actionsWouldExecute.length).toBeGreaterThan(0);
    });

    it('should test a rule with non-matching data', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules/rule-1/test',
        headers: createAuthHeader(token),
        payload: {
          entityData: { priority: 'low', status: 'open' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.conditionsMatch).toBe(false);
      expect(body.data.actionsWouldExecute).toEqual([]);
    });

    it('should return 404 for non-existent rule', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules/non-existent/test',
        headers: createAuthHeader(token),
        payload: {
          entityData: {},
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for missing entityData', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules/rule-1/test',
        headers: createAuthHeader(token),
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/workflow/fields/:entityType', () => {
    it('should get fields for issue type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/fields/issue',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.some((f: { field: string }) => f.field === 'status')).toBe(true);
      expect(body.data.some((f: { field: string }) => f.field === 'source')).toBe(true);
    });

    it('should get fields for problem type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/fields/problem',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.some((f: { field: string }) => f.field === 'impact')).toBe(true);
    });

    it('should get fields for change type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/fields/change',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.some((f: { field: string }) => f.field === 'risk_level')).toBe(true);
    });

    it('should get fields for request type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/fields/request',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.some((f: { field: string }) => f.field === 'requester_id')).toBe(true);
    });

    it('should return empty array for unknown type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/fields/unknown',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/fields/issue',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/workflow/actions/:entityType', () => {
    it('should get actions for issue type with link_to_problem', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/actions/issue',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.some((a: { action_type: string }) => a.action_type === 'link_to_problem')).toBe(true);
    });

    it('should get actions for non-issue type without link_to_problem', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/actions/problem',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.some((a: { action_type: string }) => a.action_type === 'link_to_problem')).toBe(false);
    });

    it('should include common actions', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/actions/change',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.some((a: { action_type: string }) => a.action_type === 'change_status')).toBe(true);
      expect(body.data.some((a: { action_type: string }) => a.action_type === 'send_notification')).toBe(true);
      expect(body.data.some((a: { action_type: string }) => a.action_type === 'assign_to_user')).toBe(true);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/workflow/actions/issue',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('Complex Workflow Scenarios', () => {
    it('should create a rule with multiple conditions', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/workflow/rules',
        headers: createAuthHeader(token),
        payload: {
          name: 'Multi-condition Rule',
          entityType: 'issue',
          triggerType: 'on_create',
          conditions: [
            { field: 'priority', operator: 'in_list', value: ['critical', 'high'], logical_operator: 'AND' },
            { field: 'status', operator: 'equals', value: 'open', logical_operator: 'AND' },
            { field: 'category', operator: 'contains', value: 'network' },
          ],
          actions: [
            { action_type: 'assign_to_group', parameters: { group_id: 'network-ops' }, order: 0 },
            { action_type: 'change_priority', parameters: { priority: 'critical' }, order: 1 },
            { action_type: 'send_notification', parameters: { template: 'urgent' }, order: 2 },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.data.conditions.length).toBe(3);
      expect(body.data.actions.length).toBe(3);
    });

    it('should create rules for all entity types', async () => {
      const token = generateTestToken(app);
      const entityTypes = ['issue', 'problem', 'change', 'request'];

      for (const entityType of entityTypes) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/workflow/rules',
          headers: createAuthHeader(token),
          payload: {
            name: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Workflow`,
            entityType,
            triggerType: 'on_status_change',
            conditions: [
              { field: 'status', operator: 'equals', value: 'closed' },
            ],
            actions: [
              { action_type: 'send_notification', parameters: { message: 'Closed' }, order: 0 },
            ],
          },
        });

        expect(response.statusCode).toBe(201);
      }
    });
  });
});
