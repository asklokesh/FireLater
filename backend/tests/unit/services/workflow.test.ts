import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for Workflow Service
 * Testing workflow rule management, condition evaluation, and action execution
 *
 * Key coverage areas:
 * - Workflow rule CRUD operations with caching
 * - Condition evaluation (12 operators)
 * - Action execution (8 action types)
 * - Workflow execution engine
 * - Execution logging
 */

// Mock dependencies
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn().mockResolvedValue({
  query: mockClientQuery,
  release: mockRelease,
});

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
  },
}));

// Mock cache service - bypass caching entirely
vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: vi.fn().mockReturnValue('tenant_test'),
    findBySlug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/contentSanitization.js', () => ({
  sanitizeMarkdown: vi.fn((content: string) => content),
}));

// Mock notification queue (for send_notification action)
vi.mock('../../../src/jobs/queues.js', () => ({
  notificationQueue: {
    add: vi.fn().mockResolvedValue({}),
  },
}));

// Import after mocks
import {
  workflowService,
  listWorkflowRules,
  getWorkflowRule,
  createWorkflowRule,
  updateWorkflowRule,
  deleteWorkflowRule,
  getWorkflowExecutionLogs,
  logWorkflowExecution,
  evaluateCondition,
  evaluateConditions,
  executeWorkflowAction,
  executeWorkflowsForEntity,
  type WorkflowCondition,
  type WorkflowAction,
  type WorkflowRule,
} from '../../../src/services/workflow.js';
import { cacheService } from '../../../src/utils/cache.js';

describe('Workflow Service', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
    mockClientQuery.mockReset();
  });

  // ============================================
  // WORKFLOW RULE CRUD
  // ============================================
  describe('listWorkflowRules', () => {
    it('should list all workflow rules', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            name: 'Auto-assign critical',
            entity_type: 'issue',
            trigger_type: 'on_create',
            is_active: true,
            conditions: JSON.stringify([{ field: 'priority', operator: 'equals', value: 'critical' }]),
            actions: JSON.stringify([{ action_type: 'assign_to_group', parameters: { groupId: 'g1' }, order: 1 }]),
            execution_order: 1,
            created_by_name: 'Admin User',
          },
          {
            id: 'rule-2',
            name: 'Escalate high priority',
            entity_type: 'issue',
            trigger_type: 'on_status_change',
            is_active: true,
            conditions: JSON.stringify([]),
            actions: JSON.stringify([]),
            execution_order: 2,
          },
        ],
      });

      const result = await listWorkflowRules('test-tenant');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Auto-assign critical');
      expect(result[0].entity_type).toBe('issue');
      expect(cacheService.getOrSet).toHaveBeenCalled();
    });

    it('should filter by entityType', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', name: 'Issue rule', entity_type: 'issue' }],
      });

      await listWorkflowRules('test-tenant', { entityType: 'issue' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('entity_type = $1'),
        ['issue']
      );
    });

    it('should filter by triggerType', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', trigger_type: 'on_create' }],
      });

      await listWorkflowRules('test-tenant', { triggerType: 'on_create' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('trigger_type = $'),
        ['on_create']
      );
    });

    it('should filter by isActive', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', is_active: true }],
      });

      await listWorkflowRules('test-tenant', { isActive: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = $'),
        [true]
      );
    });

    it('should filter by multiple criteria', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listWorkflowRules('test-tenant', {
        entityType: 'problem',
        triggerType: 'on_update',
        isActive: false,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('entity_type = $1'),
        expect.arrayContaining(['problem', 'on_update', false])
      );
    });

    it('should return empty array when no rules exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await listWorkflowRules('test-tenant');

      expect(result).toEqual([]);
    });

    it('should order by execution_order ASC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await listWorkflowRules('test-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY wr.execution_order ASC'),
        []
      );
    });
  });

  describe('getWorkflowRule', () => {
    it('should get rule by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          name: 'Test Rule',
          entity_type: 'issue',
          trigger_type: 'on_create',
          is_active: true,
          conditions: JSON.stringify([]),
          actions: JSON.stringify([]),
        }],
      });

      const result = await getWorkflowRule('test-tenant', 'rule-1');

      expect(result?.id).toBe('rule-1');
      expect(result?.name).toBe('Test Rule');
      expect(cacheService.getOrSet).toHaveBeenCalledWith(
        'test-tenant:workflows:rule:rule-1',
        expect.any(Function),
        { ttl: 900 }
      );
    });

    it('should return null if rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await getWorkflowRule('test-tenant', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should include created_by_name from join', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          created_by: 'user-1',
          created_by_name: 'John Admin',
        }],
      });

      const result = await getWorkflowRule('test-tenant', 'rule-1');

      expect(result?.created_by_name).toBe('John Admin');
    });
  });

  describe('createWorkflowRule', () => {
    it('should create rule with all fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-rule',
          name: 'New Rule',
          description: 'Test description',
          entity_type: 'issue',
          trigger_type: 'on_create',
          is_active: true,
          conditions: JSON.stringify([{ field: 'priority', operator: 'equals', value: 'high' }]),
          actions: JSON.stringify([{ action_type: 'change_status', parameters: { status: 'assigned' }, order: 1 }]),
          execution_order: 10,
          stop_on_match: true,
          created_by: 'user-1',
        }],
      });

      const result = await createWorkflowRule('test-tenant', {
        name: 'New Rule',
        description: 'Test description',
        entityType: 'issue',
        triggerType: 'on_create',
        isActive: true,
        conditions: [{ field: 'priority', operator: 'equals', value: 'high' }],
        actions: [{ action_type: 'change_status', parameters: { status: 'assigned' }, order: 1 }],
        executionOrder: 10,
        stopOnMatch: true,
      }, 'user-1');

      expect(result.id).toBe('new-rule');
      expect(result.name).toBe('New Rule');
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'workflows');
    });

    it('should use default values when not provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-rule',
          is_active: true,
          execution_order: 100,
          stop_on_match: false,
        }],
      });

      await createWorkflowRule('test-tenant', {
        name: 'Simple Rule',
        entityType: 'problem',
        triggerType: 'on_update',
        conditions: [],
        actions: [],
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          'Simple Rule',     // name
          undefined,         // description
          'problem',         // entityType
          'on_update',       // triggerType
          true,              // isActive (default)
          '[]',              // conditions
          '[]',              // actions
          100,               // executionOrder (default)
          false,             // stopOnMatch (default)
          undefined,         // createdBy
        ])
      );
    });

    it('should serialize conditions and actions as JSON', async () => {
      const conditions = [{ field: 'status', operator: 'equals', value: 'new' }];
      const actions = [{ action_type: 'change_priority', parameters: { priority: 'high' }, order: 1 }];

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1' }],
      });

      await createWorkflowRule('test-tenant', {
        name: 'JSON Test',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions,
        actions,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          JSON.stringify(conditions),
          JSON.stringify(actions),
        ])
      );
    });
  });

  describe('updateWorkflowRule', () => {
    it('should update rule name', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', name: 'Updated Name' }],
      });

      const result = await updateWorkflowRule('test-tenant', 'rule-1', {
        name: 'Updated Name',
      });

      expect(result?.name).toBe('Updated Name');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        expect.arrayContaining(['Updated Name', 'rule-1'])
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'workflows');
    });

    it('should update multiple fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', name: 'New Name', description: 'New Desc', is_active: false }],
      });

      await updateWorkflowRule('test-tenant', 'rule-1', {
        name: 'New Name',
        description: 'New Desc',
        isActive: false,
        executionOrder: 5,
        stopOnMatch: true,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('name = $1'),
        expect.arrayContaining(['New Name', 'New Desc', false, 5, true, 'rule-1'])
      );
    });

    it('should update conditions', async () => {
      const newConditions = [{ field: 'priority', operator: 'equals', value: 'critical' }];

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', conditions: JSON.stringify(newConditions) }],
      });

      await updateWorkflowRule('test-tenant', 'rule-1', {
        conditions: newConditions,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conditions = $1'),
        expect.arrayContaining([JSON.stringify(newConditions), 'rule-1'])
      );
    });

    it('should update actions', async () => {
      const newActions = [{ action_type: 'escalate', parameters: { escalationLevel: 2 }, order: 1 }];

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', actions: JSON.stringify(newActions) }],
      });

      await updateWorkflowRule('test-tenant', 'rule-1', {
        actions: newActions,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('actions = $1'),
        expect.arrayContaining([JSON.stringify(newActions), 'rule-1'])
      );
    });

    it('should return existing rule if no updates provided', async () => {
      // When no updates, it calls getWorkflowRule
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rule-1', name: 'Unchanged' }],
      });

      const result = await updateWorkflowRule('test-tenant', 'rule-1', {});

      expect(result?.name).toBe('Unchanged');
      // Should call getWorkflowRule's query, not update
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE wr.id = $1'),
        ['rule-1']
      );
    });

    it('should return null if rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await updateWorkflowRule('test-tenant', 'nonexistent', {
        name: 'New Name',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteWorkflowRule', () => {
    it('should delete rule and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await deleteWorkflowRule('test-tenant', 'rule-1');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM tenant_test.workflow_rules'),
        ['rule-1']
      );
      expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'workflows');
    });

    it('should return false if rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await deleteWorkflowRule('test-tenant', 'nonexistent');

      expect(result).toBe(false);
    });
  });

  // ============================================
  // EXECUTION LOGS
  // ============================================
  describe('logWorkflowExecution', () => {
    it('should log execution with all fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await logWorkflowExecution('test-tenant', {
        rule_id: 'rule-1',
        rule_name: 'Test Rule',
        entity_type: 'issue',
        entity_id: 'issue-123',
        trigger_type: 'on_create',
        conditions_matched: true,
        actions_executed: [{ action_type: 'change_status', parameters: { status: 'assigned' }, order: 1 }],
        execution_time_ms: 50,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenant_test.workflow_execution_logs'),
        expect.arrayContaining([
          'rule-1',
          'Test Rule',
          'issue',
          'issue-123',
          'on_create',
          true,
          expect.any(String), // JSON stringified actions
          50,
          undefined, // no error
        ])
      );
    });

    it('should log execution with error', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await logWorkflowExecution('test-tenant', {
        rule_id: 'rule-1',
        rule_name: 'Failing Rule',
        entity_type: 'problem',
        entity_id: 'prob-1',
        trigger_type: 'on_update',
        conditions_matched: true,
        actions_executed: [],
        execution_time_ms: 10,
        error: 'Action execution failed',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['Action execution failed'])
      );
    });
  });

  describe('getWorkflowExecutionLogs', () => {
    it('should get logs with default pagination', async () => {
      // Count query
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '100' }] });
      // Logs query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'log-1', rule_id: 'rule-1', rule_name: 'Rule 1', executed_at: '2025-01-01' },
          { id: 'log-2', rule_id: 'rule-2', rule_name: 'Rule 2', executed_at: '2025-01-02' },
        ],
      });

      const result = await getWorkflowExecutionLogs('test-tenant');

      expect(result.total).toBe(100);
      expect(result.logs).toHaveLength(2);
      // Default limit is 50, offset is 0
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('LIMIT $1 OFFSET $2'),
        [50, 0]
      );
    });

    it('should filter by ruleId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getWorkflowExecutionLogs('test-tenant', { ruleId: 'rule-1' });

      // First call is COUNT query with filter param
      expect(mockQuery.mock.calls[0][0]).toContain('rule_id = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('rule-1');
    });

    it('should filter by entityType', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '10' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getWorkflowExecutionLogs('test-tenant', { entityType: 'issue' });

      // First call is COUNT query with filter param
      expect(mockQuery.mock.calls[0][0]).toContain('entity_type = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('issue');
    });

    it('should filter by entityId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getWorkflowExecutionLogs('test-tenant', { entityId: 'issue-123' });

      // First call is COUNT query with filter param
      expect(mockQuery.mock.calls[0][0]).toContain('entity_id = $1');
      expect(mockQuery.mock.calls[0][1][0]).toBe('issue-123');
    });

    it('should paginate correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '150' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getWorkflowExecutionLogs('test-tenant', { page: 3, limit: 25 });

      // Offset should be (3-1) * 25 = 50
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining([25, 50])
      );
    });

    it('should combine multiple filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await getWorkflowExecutionLogs('test-tenant', {
        ruleId: 'rule-1',
        entityType: 'problem',
        entityId: 'prob-1',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('rule_id = $1'),
        expect.arrayContaining(['rule-1', 'problem', 'prob-1'])
      );
    });
  });

  // ============================================
  // CONDITION EVALUATION
  // ============================================
  describe('evaluateCondition', () => {
    describe('equals operator', () => {
      it('should return true when field equals value', () => {
        const condition: WorkflowCondition = { field: 'priority', operator: 'equals', value: 'high' };
        const entity = { priority: 'high', status: 'new' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field does not equal value', () => {
        const condition: WorkflowCondition = { field: 'priority', operator: 'equals', value: 'high' };
        const entity = { priority: 'low' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should handle numeric equality', () => {
        const condition: WorkflowCondition = { field: 'count', operator: 'equals', value: 5 };
        const entity = { count: 5 };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should handle boolean equality', () => {
        const condition: WorkflowCondition = { field: 'is_urgent', operator: 'equals', value: true };
        const entity = { is_urgent: true };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });
    });

    describe('not_equals operator', () => {
      it('should return true when field does not equal value', () => {
        const condition: WorkflowCondition = { field: 'status', operator: 'not_equals', value: 'closed' };
        const entity = { status: 'open' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field equals value', () => {
        const condition: WorkflowCondition = { field: 'status', operator: 'not_equals', value: 'closed' };
        const entity = { status: 'closed' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('contains operator', () => {
      it('should return true when field contains value (case insensitive)', () => {
        const condition: WorkflowCondition = { field: 'title', operator: 'contains', value: 'urgent' };
        const entity = { title: 'URGENT: Server down' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field does not contain value', () => {
        const condition: WorkflowCondition = { field: 'title', operator: 'contains', value: 'urgent' };
        const entity = { title: 'Normal request' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should return false for non-string fields', () => {
        const condition: WorkflowCondition = { field: 'count', operator: 'contains', value: '5' };
        const entity = { count: 55 };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('not_contains operator', () => {
      it('should return true when field does not contain value', () => {
        const condition: WorkflowCondition = { field: 'description', operator: 'not_contains', value: 'spam' };
        const entity = { description: 'Valid request details' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field contains value', () => {
        const condition: WorkflowCondition = { field: 'description', operator: 'not_contains', value: 'spam' };
        const entity = { description: 'This is SPAM content' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should return true for non-string fields', () => {
        const condition: WorkflowCondition = { field: 'count', operator: 'not_contains', value: '5' };
        const entity = { count: 123 };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });
    });

    describe('starts_with operator', () => {
      it('should return true when field starts with value (case insensitive)', () => {
        const condition: WorkflowCondition = { field: 'title', operator: 'starts_with', value: 'req' };
        const entity = { title: 'Request for access' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field does not start with value', () => {
        const condition: WorkflowCondition = { field: 'title', operator: 'starts_with', value: 'req' };
        const entity = { title: 'New request' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('ends_with operator', () => {
      it('should return true when field ends with value (case insensitive)', () => {
        const condition: WorkflowCondition = { field: 'email', operator: 'ends_with', value: '@company.com' };
        const entity = { email: 'user@COMPANY.COM' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field does not end with value', () => {
        const condition: WorkflowCondition = { field: 'email', operator: 'ends_with', value: '@company.com' };
        const entity = { email: 'user@external.org' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('greater_than operator', () => {
      it('should return true when field is greater than value', () => {
        const condition: WorkflowCondition = { field: 'impact_score', operator: 'greater_than', value: 50 };
        const entity = { impact_score: 75 };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field is less than or equal to value', () => {
        const condition: WorkflowCondition = { field: 'impact_score', operator: 'greater_than', value: 50 };
        const entity = { impact_score: 50 };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should handle string numbers', () => {
        const condition: WorkflowCondition = { field: 'count', operator: 'greater_than', value: 10 };
        const entity = { count: '20' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });
    });

    describe('less_than operator', () => {
      it('should return true when field is less than value', () => {
        const condition: WorkflowCondition = { field: 'age_hours', operator: 'less_than', value: 24 };
        const entity = { age_hours: 12 };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field is greater than or equal to value', () => {
        const condition: WorkflowCondition = { field: 'age_hours', operator: 'less_than', value: 24 };
        const entity = { age_hours: 48 };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('is_empty operator', () => {
      it('should return true when field is null', () => {
        const condition: WorkflowCondition = { field: 'assigned_to', operator: 'is_empty', value: '' };
        const entity = { assigned_to: null };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return true when field is undefined', () => {
        const condition: WorkflowCondition = { field: 'assigned_to', operator: 'is_empty', value: '' };
        const entity = { status: 'new' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return true when field is empty string', () => {
        const condition: WorkflowCondition = { field: 'notes', operator: 'is_empty', value: '' };
        const entity = { notes: '' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field has value', () => {
        const condition: WorkflowCondition = { field: 'assigned_to', operator: 'is_empty', value: '' };
        const entity = { assigned_to: 'user-1' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('is_not_empty operator', () => {
      it('should return true when field has value', () => {
        const condition: WorkflowCondition = { field: 'assignee', operator: 'is_not_empty', value: '' };
        const entity = { assignee: 'user-123' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field is null', () => {
        const condition: WorkflowCondition = { field: 'assignee', operator: 'is_not_empty', value: '' };
        const entity = { assignee: null };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should return false when field is empty string', () => {
        const condition: WorkflowCondition = { field: 'notes', operator: 'is_not_empty', value: '' };
        const entity = { notes: '' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('in_list operator', () => {
      it('should return true when field value is in list', () => {
        const condition: WorkflowCondition = {
          field: 'priority',
          operator: 'in_list',
          value: ['critical', 'high'],
        };
        const entity = { priority: 'high' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field value is not in list', () => {
        const condition: WorkflowCondition = {
          field: 'priority',
          operator: 'in_list',
          value: ['critical', 'high'],
        };
        const entity = { priority: 'low' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should return false when value is not an array', () => {
        const condition: WorkflowCondition = {
          field: 'priority',
          operator: 'in_list',
          value: 'high',
        };
        const entity = { priority: 'high' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });

    describe('not_in_list operator', () => {
      it('should return true when field value is not in list', () => {
        const condition: WorkflowCondition = {
          field: 'category',
          operator: 'not_in_list',
          value: ['spam', 'test'],
        };
        const entity = { category: 'support' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });

      it('should return false when field value is in list', () => {
        const condition: WorkflowCondition = {
          field: 'category',
          operator: 'not_in_list',
          value: ['spam', 'test'],
        };
        const entity = { category: 'spam' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });

      it('should return true when value is not an array', () => {
        const condition: WorkflowCondition = {
          field: 'category',
          operator: 'not_in_list',
          value: 'spam',
        };
        const entity = { category: 'support' };

        expect(evaluateCondition(condition, entity)).toBe(true);
      });
    });

    describe('unknown operator', () => {
      it('should return false for unknown operator', () => {
        const condition = { field: 'status', operator: 'invalid_op', value: 'test' } as WorkflowCondition;
        const entity = { status: 'test' };

        expect(evaluateCondition(condition, entity)).toBe(false);
      });
    });
  });

  describe('evaluateConditions', () => {
    it('should return true for empty conditions array', () => {
      const result = evaluateConditions([], { status: 'any' });
      expect(result).toBe(true);
    });

    it('should return true for null/undefined conditions', () => {
      expect(evaluateConditions(null as unknown as WorkflowCondition[], {})).toBe(true);
      expect(evaluateConditions(undefined as unknown as WorkflowCondition[], {})).toBe(true);
    });

    it('should evaluate single condition', () => {
      const conditions: WorkflowCondition[] = [
        { field: 'priority', operator: 'equals', value: 'critical' },
      ];

      expect(evaluateConditions(conditions, { priority: 'critical' })).toBe(true);
      expect(evaluateConditions(conditions, { priority: 'low' })).toBe(false);
    });

    it('should AND multiple conditions by default', () => {
      const conditions: WorkflowCondition[] = [
        { field: 'priority', operator: 'equals', value: 'critical' },
        { field: 'status', operator: 'equals', value: 'new' },
      ];

      expect(evaluateConditions(conditions, { priority: 'critical', status: 'new' })).toBe(true);
      expect(evaluateConditions(conditions, { priority: 'critical', status: 'assigned' })).toBe(false);
      expect(evaluateConditions(conditions, { priority: 'low', status: 'new' })).toBe(false);
    });

    it('should handle OR logical operator', () => {
      const conditions: WorkflowCondition[] = [
        { field: 'priority', operator: 'equals', value: 'critical' },
        { field: 'priority', operator: 'equals', value: 'high', logical_operator: 'OR' },
      ];

      expect(evaluateConditions(conditions, { priority: 'critical' })).toBe(true);
      expect(evaluateConditions(conditions, { priority: 'high' })).toBe(true);
      expect(evaluateConditions(conditions, { priority: 'low' })).toBe(false);
    });

    it('should handle mixed AND/OR conditions', () => {
      const conditions: WorkflowCondition[] = [
        { field: 'priority', operator: 'equals', value: 'critical' },
        { field: 'status', operator: 'equals', value: 'new', logical_operator: 'AND' },
        { field: 'is_escalated', operator: 'equals', value: true, logical_operator: 'OR' },
      ];

      // (critical AND new) OR escalated
      // Evaluates left to right: ((critical AND new) OR escalated)
      expect(evaluateConditions(conditions, { priority: 'critical', status: 'new', is_escalated: false })).toBe(true);
      expect(evaluateConditions(conditions, { priority: 'low', status: 'any', is_escalated: true })).toBe(true);
      expect(evaluateConditions(conditions, { priority: 'low', status: 'new', is_escalated: false })).toBe(false);
    });
  });

  // ============================================
  // ACTION EXECUTION
  // ============================================
  describe('executeWorkflowAction', () => {
    describe('set_field action', () => {
      it('should set field value on entity', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'set_field',
          parameters: { field: 'category', value: 'infrastructure' },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', {});

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tenant_test.issues'),
          ['infrastructure', 'issue-1']
        );
      });
    });

    describe('assign_to_user action', () => {
      it('should assign entity to user and update status if new', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'assign_to_user',
          parameters: { userId: 'user-123' },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', { status: 'new' });

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("SET assigned_to = $1, status = CASE WHEN status = 'new' THEN 'assigned' ELSE status END"),
          ['user-123', 'issue-1']
        );
      });
    });

    describe('assign_to_group action', () => {
      it('should assign entity to group', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'assign_to_group',
          parameters: { groupId: 'group-1' },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'problem', 'prob-1', {});

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tenant_test.problems'),
          ['group-1', 'prob-1']
        );
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('assigned_group = $1'),
          expect.any(Array)
        );
      });
    });

    describe('change_status action', () => {
      it('should change entity status', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'change_status',
          parameters: { status: 'in_progress' },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'change', 'change-1', {});

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tenant_test.changes'),
          ['in_progress', 'change-1']
        );
      });
    });

    describe('change_priority action', () => {
      it('should change entity priority', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'change_priority',
          parameters: { priority: 'critical' },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'request', 'req-1', {});

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tenant_test.service_requests'),
          ['critical', 'req-1']
        );
      });
    });

    describe('add_comment action', () => {
      it('should add system comment to entity', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'add_comment',
          parameters: { content: 'Auto-assigned by workflow', isInternal: true },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', {});

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.issue_comments'),
          ['issue-1', 'Auto-assigned by workflow', true]
        );
      });

      it('should add external comment when isInternal is false', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action: WorkflowAction = {
          action_type: 'add_comment',
          parameters: { content: 'Status updated', isInternal: false },
          order: 1,
        };

        await executeWorkflowAction('test-tenant', action, 'problem', 'prob-1', {});

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.problem_comments'),
          ['prob-1', 'Status updated', false]
        );
      });

      it('should use correct comment table for each entity type', async () => {
        // Issue
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await executeWorkflowAction('test-tenant',
          { action_type: 'add_comment', parameters: { content: 'test' }, order: 1 },
          'issue', 'id-1', {});
        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.stringContaining('issue_comments'),
          expect.any(Array)
        );

        // Problem
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await executeWorkflowAction('test-tenant',
          { action_type: 'add_comment', parameters: { content: 'test' }, order: 1 },
          'problem', 'id-1', {});
        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.stringContaining('problem_comments'),
          expect.any(Array)
        );

        // Change
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await executeWorkflowAction('test-tenant',
          { action_type: 'add_comment', parameters: { content: 'test' }, order: 1 },
          'change', 'id-1', {});
        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.stringContaining('change_comments'),
          expect.any(Array)
        );

        // Request
        mockQuery.mockResolvedValueOnce({ rows: [] });
        await executeWorkflowAction('test-tenant',
          { action_type: 'add_comment', parameters: { content: 'test' }, order: 1 },
          'request', 'id-1', {});
        expect(mockQuery).toHaveBeenLastCalledWith(
          expect.stringContaining('request_comments'),
          expect.any(Array)
        );
      });
    });

    describe('send_notification action', () => {
      it('should queue notifications for recipients', async () => {
        const { notificationQueue } = await import('../../../src/jobs/queues.js');

        const action: WorkflowAction = {
          action_type: 'send_notification',
          parameters: {
            recipientIds: ['user-1', 'user-2'],
            message: 'New critical issue assigned',
          },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', {});

        expect(result.success).toBe(true);
        expect(notificationQueue.add).toHaveBeenCalledTimes(2);
        expect(notificationQueue.add).toHaveBeenCalledWith('send-notification', {
          tenantSlug: 'test-tenant',
          type: 'workflow_notification',
          recipientIds: ['user-1'],
          data: expect.objectContaining({
            message: 'New critical issue assigned',
            entityType: 'issue',
            entityId: 'issue-1',
          }),
        });
      });
    });

    describe('escalate action', () => {
      it('should log escalation trigger', async () => {
        const { logger } = await import('../../../src/utils/logger.js');

        const action: WorkflowAction = {
          action_type: 'escalate',
          parameters: { escalationLevel: 2 },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', {});

        expect(result.success).toBe(true);
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantSlug: 'test-tenant',
            entityType: 'issue',
            entityId: 'issue-1',
            escalationLevel: 2,
          }),
          'Escalation triggered by workflow'
        );
      });
    });

    describe('unknown action type', () => {
      it('should return error for unknown action type', async () => {
        const { logger } = await import('../../../src/utils/logger.js');

        const action = {
          action_type: 'unknown_action',
          parameters: {},
          order: 1,
        } as unknown as WorkflowAction;

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown action type: unknown_action');
        expect(logger.warn).toHaveBeenCalled();
      });
    });

    describe('action execution error handling', () => {
      it('should return error when database query fails', async () => {
        mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

        const action: WorkflowAction = {
          action_type: 'set_field',
          parameters: { field: 'status', value: 'assigned' },
          order: 1,
        };

        const result = await executeWorkflowAction('test-tenant', action, 'issue', 'issue-1', {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('Database connection failed');
      });
    });
  });

  // ============================================
  // WORKFLOW EXECUTION ENGINE
  // ============================================
  describe('executeWorkflowsForEntity', () => {
    it('should execute matching workflows', async () => {
      // List rules query (via cache bypass)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          name: 'Auto-assign critical',
          entity_type: 'issue',
          trigger_type: 'on_create',
          is_active: true,
          conditions: [{ field: 'priority', operator: 'equals', value: 'critical' }],
          actions: [{ action_type: 'assign_to_group', parameters: { groupId: 'g1' }, order: 1 }],
          execution_order: 1,
          stop_on_match: false,
        }],
      });
      // Execute action
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Log execution
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await executeWorkflowsForEntity(
        'test-tenant',
        'issue',
        'issue-1',
        'on_create',
        { priority: 'critical', status: 'new' }
      );

      expect(result.rulesExecuted).toBe(1);
      expect(result.actionsExecuted).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip rules that do not match conditions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          name: 'Critical only',
          conditions: [{ field: 'priority', operator: 'equals', value: 'critical' }],
          actions: [{ action_type: 'change_status', parameters: { status: 'escalated' }, order: 1 }],
          stop_on_match: false,
        }],
      });

      const result = await executeWorkflowsForEntity(
        'test-tenant',
        'issue',
        'issue-1',
        'on_create',
        { priority: 'low', status: 'new' }  // Does not match critical
      );

      expect(result.rulesExecuted).toBe(0);
      expect(result.actionsExecuted).toBe(0);
      // No action queries should be made
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should execute multiple matching rules', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            name: 'Rule 1',
            conditions: [],
            actions: [{ action_type: 'add_comment', parameters: { content: 'Rule 1' }, order: 1 }],
            stop_on_match: false,
          },
          {
            id: 'rule-2',
            name: 'Rule 2',
            conditions: [],
            actions: [{ action_type: 'add_comment', parameters: { content: 'Rule 2' }, order: 1 }],
            stop_on_match: false,
          },
        ],
      });
      // Action 1
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Log 1
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Action 2
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Log 2
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await executeWorkflowsForEntity(
        'test-tenant',
        'issue',
        'issue-1',
        'on_update',
        {}
      );

      expect(result.rulesExecuted).toBe(2);
      expect(result.actionsExecuted).toBe(2);
    });

    it('should stop processing on stop_on_match', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            name: 'Stop Rule',
            conditions: [],
            actions: [{ action_type: 'add_comment', parameters: { content: 'First' }, order: 1 }],
            stop_on_match: true,  // Should stop after this rule
          },
          {
            id: 'rule-2',
            name: 'Never Reached',
            conditions: [],
            actions: [{ action_type: 'add_comment', parameters: { content: 'Second' }, order: 1 }],
            stop_on_match: false,
          },
        ],
      });
      // Action for rule 1
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Log for rule 1
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await executeWorkflowsForEntity(
        'test-tenant',
        'issue',
        'issue-1',
        'on_create',
        {}
      );

      expect(result.rulesExecuted).toBe(1);
      expect(result.actionsExecuted).toBe(1);
      // Only 3 queries: list rules, action, log
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('should execute actions in order', async () => {
      const actionOrder: number[] = [];
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          name: 'Multi-action rule',
          conditions: [],
          actions: [
            { action_type: 'add_comment', parameters: { content: 'Third' }, order: 3 },
            { action_type: 'add_comment', parameters: { content: 'First' }, order: 1 },
            { action_type: 'add_comment', parameters: { content: 'Second' }, order: 2 },
          ],
          stop_on_match: false,
        }],
      });

      // Track order of action execution
      mockQuery.mockImplementation(async (query: string, params: unknown[]) => {
        if (query.includes('INSERT INTO tenant_test.issue_comments')) {
          const content = params[1] as string;
          if (content === 'First') actionOrder.push(1);
          if (content === 'Second') actionOrder.push(2);
          if (content === 'Third') actionOrder.push(3);
        }
        return { rows: [] };
      });

      await executeWorkflowsForEntity(
        'test-tenant',
        'issue',
        'issue-1',
        'on_create',
        {}
      );

      expect(actionOrder).toEqual([1, 2, 3]);
    });

    it('should collect errors from failed actions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rule-1',
          name: 'Failing Rule',
          conditions: [],
          actions: [
            { action_type: 'set_field', parameters: { field: 'invalid', value: 'test' }, order: 1 },
          ],
          stop_on_match: false,
        }],
      });
      // Action fails
      mockQuery.mockRejectedValueOnce(new Error('Column does not exist'));
      // Log still succeeds
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await executeWorkflowsForEntity(
        'test-tenant',
        'issue',
        'issue-1',
        'on_create',
        {}
      );

      expect(result.rulesExecuted).toBe(1);
      expect(result.actionsExecuted).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Failing Rule');
      expect(result.errors[0]).toContain('set_field');
    });

    it('should return zeros when no rules exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await executeWorkflowsForEntity(
        'test-tenant',
        'problem',
        'prob-1',
        'on_status_change',
        {}
      );

      expect(result.rulesExecuted).toBe(0);
      expect(result.actionsExecuted).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ============================================
  // SERVICE EXPORT OBJECT
  // ============================================
  describe('workflowService export', () => {
    it('should export all functions', () => {
      expect(workflowService.listWorkflowRules).toBe(listWorkflowRules);
      expect(workflowService.getWorkflowRule).toBe(getWorkflowRule);
      expect(workflowService.createWorkflowRule).toBe(createWorkflowRule);
      expect(workflowService.updateWorkflowRule).toBe(updateWorkflowRule);
      expect(workflowService.deleteWorkflowRule).toBe(deleteWorkflowRule);
      expect(workflowService.getWorkflowExecutionLogs).toBe(getWorkflowExecutionLogs);
      expect(workflowService.logWorkflowExecution).toBe(logWorkflowExecution);
      expect(workflowService.evaluateCondition).toBe(evaluateCondition);
      expect(workflowService.evaluateConditions).toBe(evaluateConditions);
      expect(workflowService.executeWorkflowAction).toBe(executeWorkflowAction);
      expect(workflowService.executeWorkflowsForEntity).toBe(executeWorkflowsForEntity);
    });
  });
});
