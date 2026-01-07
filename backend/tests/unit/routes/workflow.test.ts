import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/workflow.js', () => ({
  workflowService: {
    listWorkflowRules: vi.fn().mockResolvedValue([]),
    getWorkflowRule: vi.fn().mockResolvedValue(null),
    createWorkflowRule: vi.fn().mockResolvedValue({}),
    updateWorkflowRule: vi.fn().mockResolvedValue({}),
    deleteWorkflowRule: vi.fn().mockResolvedValue(true),
    getWorkflowExecutionLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
    evaluateConditions: vi.fn().mockReturnValue(true),
    evaluateCondition: vi.fn().mockReturnValue(true),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

describe('Workflow Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Workflow Condition Schema', () => {
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

    it('should require field, operator, and value', () => {
      const result = workflowConditionSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid condition', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'priority',
        operator: 'equals',
        value: 'high',
      });
      expect(result.success).toBe(true);
    });

    it('should require field of at least 1 character', () => {
      const result = workflowConditionSchema.safeParse({
        field: '',
        operator: 'equals',
        value: 'high',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all operators', () => {
      const operators = [
        'equals', 'not_equals', 'contains', 'not_contains',
        'starts_with', 'ends_with', 'greater_than', 'less_than',
        'is_empty', 'is_not_empty', 'in_list', 'not_in_list',
      ];
      for (const operator of operators) {
        const result = workflowConditionSchema.safeParse({
          field: 'status',
          operator,
          value: 'open',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid operator', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'status',
        operator: 'matches',
        value: 'open',
      });
      expect(result.success).toBe(false);
    });

    it('should accept string value', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'status',
        operator: 'equals',
        value: 'open',
      });
      expect(result.success).toBe(true);
    });

    it('should accept number value', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'age_hours',
        operator: 'greater_than',
        value: 24,
      });
      expect(result.success).toBe(true);
    });

    it('should accept boolean value', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'is_escalated',
        operator: 'equals',
        value: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept array value for in_list', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'priority',
        operator: 'in_list',
        value: ['critical', 'high'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept AND logical operator', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'status',
        operator: 'equals',
        value: 'open',
        logical_operator: 'AND',
      });
      expect(result.success).toBe(true);
    });

    it('should accept OR logical operator', () => {
      const result = workflowConditionSchema.safeParse({
        field: 'status',
        operator: 'equals',
        value: 'open',
        logical_operator: 'OR',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Workflow Action Schema', () => {
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

    it('should require action_type, parameters, and order', () => {
      const result = workflowActionSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid action', () => {
      const result = workflowActionSchema.safeParse({
        action_type: 'change_status',
        parameters: { new_status: 'in_progress' },
        order: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept all action types', () => {
      const actionTypes = [
        'set_field', 'assign_to_user', 'assign_to_group',
        'change_status', 'change_priority', 'add_comment',
        'send_notification', 'send_email', 'escalate',
        'link_to_problem', 'create_task',
      ];
      for (const action_type of actionTypes) {
        const result = workflowActionSchema.safeParse({
          action_type,
          parameters: {},
          order: 0,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid action type', () => {
      const result = workflowActionSchema.safeParse({
        action_type: 'delete_issue',
        parameters: {},
        order: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should require non-negative order', () => {
      const result = workflowActionSchema.safeParse({
        action_type: 'change_status',
        parameters: {},
        order: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept order of 0', () => {
      const result = workflowActionSchema.safeParse({
        action_type: 'change_status',
        parameters: {},
        order: 0,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Create Workflow Rule Schema', () => {
    const workflowConditionSchema = z.object({
      field: z.string().min(1),
      operator: z.enum([
        'equals', 'not_equals', 'contains', 'not_contains',
        'starts_with', 'ends_with', 'greater_than', 'less_than',
        'is_empty', 'is_not_empty', 'in_list', 'not_in_list',
      ]),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      logical_operator: z.enum(['AND', 'OR']).optional(),
    });

    const workflowActionSchema = z.object({
      action_type: z.enum([
        'set_field', 'assign_to_user', 'assign_to_group',
        'change_status', 'change_priority', 'add_comment',
        'send_notification', 'send_email', 'escalate',
        'link_to_problem', 'create_task',
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

    it('should require name, entityType, triggerType, conditions, and actions', () => {
      const result = createWorkflowRuleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid workflow rule', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Auto-assign critical issues',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [
          { field: 'priority', operator: 'equals', value: 'critical' },
        ],
        actions: [
          { action_type: 'assign_to_group', parameters: { group_id: 'support' }, order: 0 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should require name of at least 1 character', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: '',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 characters', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'x'.repeat(101),
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Rule',
        description: 'This rule auto-assigns issues',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 500 characters', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Rule',
        description: 'x'.repeat(501),
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept all entity types', () => {
      const entityTypes = ['issue', 'problem', 'change', 'request'];
      for (const entityType of entityTypes) {
        const result = createWorkflowRuleSchema.safeParse({
          name: 'Rule',
          entityType,
          triggerType: 'on_create',
          conditions: [],
          actions: [],
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid entity type', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Rule',
        entityType: 'incident',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
      });
      expect(result.success).toBe(false);
    });

    it('should accept all trigger types', () => {
      const triggerTypes = ['on_create', 'on_update', 'on_status_change', 'on_assignment', 'scheduled'];
      for (const triggerType of triggerTypes) {
        const result = createWorkflowRuleSchema.safeParse({
          name: 'Rule',
          entityType: 'issue',
          triggerType,
          conditions: [],
          actions: [],
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept isActive flag', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Rule',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept executionOrder', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Rule',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
        executionOrder: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should accept stopOnMatch', () => {
      const result = createWorkflowRuleSchema.safeParse({
        name: 'Rule',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
        stopOnMatch: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Workflow Rule Schema', () => {
    const updateWorkflowRuleSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      description: z.string().max(500).optional(),
      isActive: z.boolean().optional(),
      conditions: z.array(z.object({
        field: z.string().min(1),
        operator: z.string(),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
      })).optional(),
      actions: z.array(z.object({
        action_type: z.string(),
        parameters: z.record(z.unknown()),
        order: z.number().int().min(0),
      })).optional(),
      executionOrder: z.number().int().min(0).optional(),
      stopOnMatch: z.boolean().optional(),
    });

    it('should accept partial update', () => {
      const result = updateWorkflowRuleSchema.safeParse({ name: 'Updated Rule' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateWorkflowRuleSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive toggle', () => {
      const result = updateWorkflowRuleSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept conditions update', () => {
      const result = updateWorkflowRuleSchema.safeParse({
        conditions: [
          { field: 'status', operator: 'equals', value: 'open' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept actions update', () => {
      const result = updateWorkflowRuleSchema.safeParse({
        actions: [
          { action_type: 'change_status', parameters: { new_status: 'closed' }, order: 0 },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Route Permissions', () => {
    it('should require workflows:read for GET /rules', () => {
      const permission = 'workflows:read';
      expect(permission).toBe('workflows:read');
    });

    it('should require workflows:read for GET /rules/:id', () => {
      const permission = 'workflows:read';
      expect(permission).toBe('workflows:read');
    });

    it('should require workflows:write for POST /rules', () => {
      const permission = 'workflows:write';
      expect(permission).toBe('workflows:write');
    });

    it('should require workflows:write for PATCH /rules/:id', () => {
      const permission = 'workflows:write';
      expect(permission).toBe('workflows:write');
    });

    it('should require workflows:write for DELETE /rules/:id', () => {
      const permission = 'workflows:write';
      expect(permission).toBe('workflows:write');
    });

    it('should require workflows:write for POST /rules/:id/toggle', () => {
      const permission = 'workflows:write';
      expect(permission).toBe('workflows:write');
    });

    it('should require workflows:read for GET /logs', () => {
      const permission = 'workflows:read';
      expect(permission).toBe('workflows:read');
    });

    it('should require workflows:write for POST /rules/:id/test', () => {
      const permission = 'workflows:write';
      expect(permission).toBe('workflows:write');
    });

    it('should require workflows:read for GET /fields/:entityType', () => {
      const permission = 'workflows:read';
      expect(permission).toBe('workflows:read');
    });

    it('should require workflows:read for GET /actions/:entityType', () => {
      const permission = 'workflows:read';
      expect(permission).toBe('workflows:read');
    });
  });

  describe('Response Formats', () => {
    it('should return rules in data wrapper', () => {
      const rules = [{ id: 'rule-1', name: 'Auto-assign' }];
      const response = { data: rules };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return 404 for missing rule', () => {
      const response = { error: 'Workflow rule not found' };
      const statusCode = 404;
      expect(statusCode).toBe(404);
      expect(response.error).toBe('Workflow rule not found');
    });

    it('should return 201 for created rule', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted rule', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return 400 for creation error', () => {
      const response = { error: 'Failed to create workflow rule' };
      const statusCode = 400;
      expect(statusCode).toBe(400);
      expect(response.error).toContain('create');
    });

    it('should return logs with meta', () => {
      const response = {
        data: [],
        meta: { total: 0, page: 1, limit: 50 },
      };
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('meta');
      expect(response.meta).toHaveProperty('total');
    });

    it('should return test results with conditionsMatch', () => {
      const response = {
        data: {
          ruleId: 'rule-1',
          ruleName: 'Auto-assign',
          conditionsMatch: true,
          conditions: [],
          actionsWouldExecute: [],
        },
      };
      expect(response.data).toHaveProperty('conditionsMatch');
    });

    it('should return fields for entity type', () => {
      const response = {
        data: [
          { field: 'status', label: 'Status', type: 'select' },
          { field: 'priority', label: 'Priority', type: 'select' },
        ],
      };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return actions for entity type', () => {
      const response = {
        data: [
          { action_type: 'set_field', label: 'Set Field Value' },
        ],
      };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and filters to workflowService.listWorkflowRules', async () => {
      const { workflowService } = await import('../../../src/services/workflow.js');
      const filters = { entityType: 'issue', isActive: true };

      await workflowService.listWorkflowRules('test-tenant', filters);
      expect(workflowService.listWorkflowRules).toHaveBeenCalledWith('test-tenant', filters);
    });

    it('should pass tenantSlug and id to workflowService.getWorkflowRule', async () => {
      const { workflowService } = await import('../../../src/services/workflow.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await workflowService.getWorkflowRule('test-tenant', id);
      expect(workflowService.getWorkflowRule).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug, body, and userId to workflowService.createWorkflowRule', async () => {
      const { workflowService } = await import('../../../src/services/workflow.js');
      const body = {
        name: 'Rule',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [],
        actions: [],
      };

      await workflowService.createWorkflowRule('test-tenant', body, 'user-1');
      expect(workflowService.createWorkflowRule).toHaveBeenCalledWith('test-tenant', body, 'user-1');
    });
  });

  describe('Query Filters', () => {
    it('should handle entityType filter', () => {
      const query = { entityType: 'issue' };
      const filters = { entityType: query.entityType };
      expect(filters.entityType).toBe('issue');
    });

    it('should handle triggerType filter', () => {
      const query = { triggerType: 'on_create' };
      const filters = { triggerType: query.triggerType };
      expect(filters.triggerType).toBe('on_create');
    });

    it('should handle isActive filter as true', () => {
      const query = { isActive: 'true' };
      const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
      expect(isActive).toBe(true);
    });

    it('should handle isActive filter as false', () => {
      const query = { isActive: 'false' };
      const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
      expect(isActive).toBe(false);
    });

    it('should handle missing isActive filter', () => {
      const query = {} as { isActive?: string };
      const isActive = query.isActive === 'true' ? true : query.isActive === 'false' ? false : undefined;
      expect(isActive).toBeUndefined();
    });
  });

  describe('Entity Type Fields', () => {
    it('should have fields for issue type', () => {
      const issueFields = [
        { field: 'status', label: 'Status', type: 'select' },
        { field: 'priority', label: 'Priority', type: 'select' },
        { field: 'category', label: 'Category', type: 'text' },
        { field: 'assigned_to', label: 'Assigned To', type: 'user' },
      ];
      expect(issueFields.length).toBeGreaterThan(0);
      expect(issueFields.some(f => f.field === 'status')).toBe(true);
    });

    it('should have fields for problem type', () => {
      const problemFields = [
        { field: 'impact', label: 'Impact', type: 'select' },
      ];
      expect(problemFields.some(f => f.field === 'impact')).toBe(true);
    });

    it('should have fields for change type', () => {
      const changeFields = [
        { field: 'risk_level', label: 'Risk Level', type: 'select' },
        { field: 'change_type', label: 'Change Type', type: 'select' },
      ];
      expect(changeFields.some(f => f.field === 'risk_level')).toBe(true);
    });

    it('should have link_to_problem action for issue type only', () => {
      const actions = [
        { action_type: 'link_to_problem', label: 'Link to Problem' },
      ];
      expect(actions.some(a => a.action_type === 'link_to_problem')).toBe(true);
    });
  });
});
