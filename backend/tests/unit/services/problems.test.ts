import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing service
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug}`,
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
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
  sanitizeMarkdown: (content: string) => content,
  sanitizePlainText: (content: string) => content,
}));

import { problemService } from '../../../src/services/problems.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('ProblemService', () => {
  const tenantSlug = 'test';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================
  // LIST PROBLEMS
  // ==================
  describe('list', () => {
    it('should list problems with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '15' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'prob-1', problem_number: 'PRB-001', status: 'new' },
            { id: 'prob-2', problem_number: 'PRB-002', status: 'investigating' },
          ],
        });

      const result = await problemService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(15);
      expect(result.problems).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { status: 'investigating' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.status = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('investigating');
    });

    it('should filter by priority', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { priority: 'high' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.priority = $1');
    });

    it('should filter by assignedTo', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { assignedTo: 'user-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.assigned_to = $1');
    });

    it('should filter by assignedGroup', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '4' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { assignedGroup: 'group-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.assigned_group = $1');
    });

    it('should filter by applicationId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { applicationId: 'app-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.application_id = $1');
    });

    it('should filter by reporterId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { reporterId: 'user-2' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.reporter_id = $1');
    });

    it('should filter by isKnownError', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { isKnownError: true });

      expect(mockQuery.mock.calls[0][0]).toContain('p.is_known_error = $1');
      expect(mockQuery.mock.calls[0][1]).toContain(true);
    });

    it('should filter by problemType', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { problemType: 'proactive' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.problem_type = $1');
    });

    it('should filter by search term', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(tenantSlug, { page: 1, perPage: 10 }, { search: 'network' });

      expect(mockQuery.mock.calls[0][0]).toContain('p.title ILIKE $1');
      expect(mockQuery.mock.calls[0][0]).toContain('p.problem_number ILIKE $1');
      expect(mockQuery.mock.calls[0][1]).toContain('%network%');
    });

    it('should combine multiple filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await problemService.list(
        tenantSlug,
        { page: 1, perPage: 10 },
        { status: 'investigating', priority: 'high', isKnownError: false }
      );

      expect(mockQuery.mock.calls[0][0]).toContain('p.status = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('p.priority = $2');
      expect(mockQuery.mock.calls[0][0]).toContain('p.is_known_error = $3');
    });
  });

  // ==================
  // GET BY ID
  // ==================
  describe('getById', () => {
    it('should get problem by ID', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'prob-1', problem_number: 'PRB-001', status: 'new', title: 'Network Issues' }],
      });

      const result = await problemService.getById(tenantSlug, 'prob-1');

      expect(result).toHaveProperty('problem_number', 'PRB-001');
      expect(result).toHaveProperty('title', 'Network Issues');
    });

    it('should throw NotFoundError if problem not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(problemService.getById(tenantSlug, 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // CREATE PROBLEM
  // ==================
  describe('create', () => {
    it('should create problem with all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ problem_number: 'PRB-001' }] }) // generate number
        .mockResolvedValueOnce({
          rows: [{ id: 'prob-1', problem_number: 'PRB-001', title: 'Server Crash', status: 'new' }],
        }) // INSERT
        .mockResolvedValueOnce({ rowCount: 1 }); // status history

      const result = await problemService.create(tenantSlug, 'user-1', {
        title: 'Server Crash',
        description: 'Server keeps crashing',
        priority: 'high',
        impact: 'high',
        urgency: 'high',
        categoryId: 'cat-1',
        problemType: 'reactive',
        applicationId: 'app-1',
        assignedTo: 'user-2',
        assignedGroup: 'group-1',
        tags: ['infrastructure', 'critical'],
      });

      expect(result).toHaveProperty('problem_number', 'PRB-001');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO tenant_test.problems');
    });

    it('should create problem with minimal fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ problem_number: 'PRB-002' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'prob-2', problem_number: 'PRB-002', title: 'Simple Problem', priority: 'medium' }],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await problemService.create(tenantSlug, 'user-1', {
        title: 'Simple Problem',
      });

      expect(result).toHaveProperty('problem_number', 'PRB-002');
      // Default priority is 'medium'
      expect(mockQuery.mock.calls[1][1]).toContain('medium');
    });

    it('should use default problemType as reactive', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ problem_number: 'PRB-003' }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'prob-3', problem_type: 'reactive' }],
        })
        .mockResolvedValueOnce({ rowCount: 1 });

      await problemService.create(tenantSlug, 'user-1', { title: 'Test' });

      expect(mockQuery.mock.calls[1][1]).toContain('reactive');
    });
  });

  // ==================
  // UPDATE PROBLEM
  // ==================
  describe('update', () => {
    it('should update problem fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'new' }] }) // getById
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', title: 'Updated', priority: 'high' }] });

      const result = await problemService.update(tenantSlug, 'prob-1', {
        title: 'Updated',
        priority: 'high',
      }, 'user-1');

      expect(result).toHaveProperty('title', 'Updated');
      expect(mockQuery.mock.calls[1][0]).toContain('title = $1');
    });

    it('should update root cause and set timestamps', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'investigating', root_cause: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', root_cause: 'Configuration error' }] });

      await problemService.update(tenantSlug, 'prob-1', {
        rootCause: 'Configuration error',
      }, 'user-1');

      expect(mockQuery.mock.calls[1][0]).toContain('root_cause = $1');
      expect(mockQuery.mock.calls[1][0]).toContain('root_cause_identified_at = NOW()');
      expect(mockQuery.mock.calls[1][0]).toContain('root_cause_identified_by = $2');
    });

    it('should update workaround and set has_workaround', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', workaround: null, workaround_documented_at: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', workaround: 'Restart service', has_workaround: true }] });

      await problemService.update(tenantSlug, 'prob-1', {
        workaround: 'Restart service',
      }, 'user-1');

      expect(mockQuery.mock.calls[1][0]).toContain('workaround = $1');
      expect(mockQuery.mock.calls[1][0]).toContain('has_workaround = true');
      expect(mockQuery.mock.calls[1][0]).toContain('workaround_documented_at = NOW()');
    });

    it('should update RCA data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] });

      await problemService.update(tenantSlug, 'prob-1', {
        rcaData: {
          fiveWhys: [{ why: 'Why 1?', answer: 'Answer 1' }],
          summary: 'RCA Summary',
        },
      }, 'user-1');

      expect(mockQuery.mock.calls[1][0]).toContain('rca_data = $1');
    });

    it('should return existing if no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'prob-1', title: 'Original', status: 'new' }],
      });

      const result = await problemService.update(tenantSlug, 'prob-1', {}, 'user-1');

      expect(result).toHaveProperty('title', 'Original');
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

  // ==================
  // UPDATE STATUS
  // ==================
  describe('updateStatus', () => {
    it('should transition from new to assigned', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'new' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'assigned' }] })
        .mockResolvedValueOnce({ rowCount: 1 }); // status history

      const result = await problemService.updateStatus(tenantSlug, 'prob-1', 'assigned', 'user-1');

      expect(result).toHaveProperty('status', 'assigned');
    });

    it('should transition from new to investigating', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'new' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'investigating' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await problemService.updateStatus(tenantSlug, 'prob-1', 'investigating', 'user-1');

      expect(result).toHaveProperty('status', 'investigating');
    });

    it('should transition to known_error and set flags', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'prob-1', status: 'root_cause_identified', root_cause_identified_at: new Date(), root_cause: 'Bug' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'known_error', is_known_error: true }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await problemService.updateStatus(tenantSlug, 'prob-1', 'known_error', 'user-1');

      expect(result).toHaveProperty('is_known_error', true);
      expect(mockQuery.mock.calls[1][0]).toContain('is_known_error = true');
      expect(mockQuery.mock.calls[1][0]).toContain('known_error_since = NOW()');
    });

    it('should transition to resolved and set resolved fields', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'prob-1',
            status: 'root_cause_identified',
            root_cause_identified_at: new Date(),
            root_cause: 'Config bug fixed',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'resolved' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await problemService.updateStatus(tenantSlug, 'prob-1', 'resolved', 'user-1');

      expect(result).toHaveProperty('status', 'resolved');
      expect(mockQuery.mock.calls[1][0]).toContain('resolved_at = NOW()');
      expect(mockQuery.mock.calls[1][0]).toContain('resolved_by = $2');
    });

    it('should transition to closed and set closed fields', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'prob-1',
            status: 'known_error',
            root_cause_identified_at: new Date(),
            root_cause: 'Documented issue',
          }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'closed' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await problemService.updateStatus(tenantSlug, 'prob-1', 'closed', 'user-1');

      expect(result).toHaveProperty('status', 'closed');
      expect(mockQuery.mock.calls[1][0]).toContain('closed_at = NOW()');
      expect(mockQuery.mock.calls[1][0]).toContain('closed_by = $2');
    });

    it('should throw BadRequestError for invalid transition', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'new' }] });

      await expect(
        problemService.updateStatus(tenantSlug, 'prob-1', 'resolved', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if resolving without root cause identified', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'prob-1', status: 'root_cause_identified', root_cause_identified_at: null, root_cause: null }],
      });

      await expect(
        problemService.updateStatus(tenantSlug, 'prob-1', 'resolved', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if resolving with empty root cause', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prob-1',
          status: 'root_cause_identified',
          root_cause_identified_at: new Date(),
          root_cause: '  ',
        }],
      });

      await expect(
        problemService.updateStatus(tenantSlug, 'prob-1', 'resolved', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should allow reopening closed problem to investigating', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'prob-1', status: 'closed', root_cause_identified_at: new Date(), root_cause: 'Fixed' }],
        })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'investigating' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await problemService.updateStatus(tenantSlug, 'prob-1', 'investigating', 'user-1');

      expect(result).toHaveProperty('status', 'investigating');
    });
  });

  // ==================
  // ASSIGN
  // ==================
  describe('assign', () => {
    it('should assign problem to user', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'investigating' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', assigned_to: 'user-2' }] });

      const result = await problemService.assign(tenantSlug, 'prob-1', 'user-2', 'user-1');

      expect(result).toHaveProperty('assigned_to', 'user-2');
    });

    it('should auto-transition from new to assigned', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'new' }] }) // getById for assign
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', assigned_to: 'user-2' }] }) // UPDATE
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'new' }] }) // getById for updateStatus
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', status: 'assigned' }] }) // UPDATE status
        .mockResolvedValueOnce({ rowCount: 1 }); // status history

      const result = await problemService.assign(tenantSlug, 'prob-1', 'user-2', 'user-1');

      expect(result).toHaveProperty('assigned_to', 'user-2');
    });
  });

  // ==================
  // DELETE
  // ==================
  describe('delete', () => {
    it('should delete problem', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await problemService.delete(tenantSlug, 'prob-1');

      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM tenant_test.problems');
    });

    it('should throw NotFoundError if problem not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await expect(problemService.delete(tenantSlug, 'nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // COMMENTS
  // ==================
  describe('addComment', () => {
    it('should add comment to problem', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] }) // getById
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1' }] }) // INSERT
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE problem

      const result = await problemService.addComment(tenantSlug, 'prob-1', 'user-1', 'Test comment');

      expect(result).toHaveProperty('id', 'comment-1');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO tenant_test.problem_comments');
    });

    it('should add internal comment', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'comment-1' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await problemService.addComment(tenantSlug, 'prob-1', 'user-1', 'Internal note', true);

      expect(mockQuery.mock.calls[1][1]).toContain(true); // is_internal
    });
  });

  describe('getComments', () => {
    it('should get comments for problem', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'comment-1', content: 'First' },
            { id: 'comment-2', content: 'Second' },
          ],
        });

      const result = await problemService.getComments(tenantSlug, 'prob-1');

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY c.created_at DESC');
    });
  });

  // ==================
  // ISSUE LINKING
  // ==================
  describe('linkIssue', () => {
    it('should link issue to problem', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] }) // getById
        .mockResolvedValueOnce({ rows: [{ id: 'issue-1' }] }) // issue exists
        .mockResolvedValueOnce({ rowCount: 1 }) // INSERT problem_issues
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE issue
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE incidents count

      await problemService.linkIssue(tenantSlug, 'prob-1', 'issue-1', 'user-1', 'caused_by');

      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO tenant_test.problem_issues');
    });

    it('should throw NotFoundError if issue not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({ rows: [] }); // issue not found

      await expect(
        problemService.linkIssue(tenantSlug, 'prob-1', 'nonexistent', 'user-1')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('unlinkIssue', () => {
    it('should unlink issue from problem', async () => {
      mockQuery
        .mockResolvedValueOnce({ rowCount: 1 }) // DELETE
        .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE issue
        .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE incidents count

      await problemService.unlinkIssue(tenantSlug, 'prob-1', 'issue-1');

      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM tenant_test.problem_issues');
    });
  });

  describe('getLinkedIssues', () => {
    it('should get linked issues', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'issue-1', issue_number: 'INC-001', relationship_type: 'caused_by' },
            { id: 'issue-2', issue_number: 'INC-002', relationship_type: 'caused_by' },
          ],
        });

      const result = await problemService.getLinkedIssues(tenantSlug, 'prob-1');

      expect(result).toHaveLength(2);
    });
  });

  // ==================
  // STATUS HISTORY
  // ==================
  describe('getStatusHistory', () => {
    it('should get status history', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { from_status: null, to_status: 'new' },
          { from_status: 'new', to_status: 'assigned' },
          { from_status: 'assigned', to_status: 'investigating' },
        ],
      });

      const result = await problemService.getStatusHistory(tenantSlug, 'prob-1');

      expect(result).toHaveLength(3);
      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY h.created_at DESC');
    });
  });

  // ==================
  // WORKLOGS
  // ==================
  describe('addWorklog', () => {
    it('should add worklog to problem', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'worklog-1' }] });

      const result = await problemService.addWorklog(
        tenantSlug,
        'prob-1',
        'user-1',
        120,
        'Analyzed logs',
        'analysis'
      );

      expect(result).toHaveProperty('id', 'worklog-1');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO tenant_test.problem_worklogs');
    });
  });

  describe('getWorklogs', () => {
    it('should get worklogs for problem', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'worklog-1', time_spent: 60, description: 'Initial analysis' },
          { id: 'worklog-2', time_spent: 120, description: 'Root cause research' },
        ],
      });

      const result = await problemService.getWorklogs(tenantSlug, 'prob-1');

      expect(result).toHaveLength(2);
    });
  });

  // ==================
  // FINANCIAL IMPACT
  // ==================
  describe('updateFinancialImpact', () => {
    it('should update financial impact fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] }) // getById
        .mockResolvedValueOnce({
          rows: [{ id: 'prob-1', financial_impact_estimated: 10000, financial_impact_actual: 8000 }],
        });

      const result = await problemService.updateFinancialImpact(tenantSlug, 'prob-1', {
        estimated: 10000,
        actual: 8000,
        currency: 'USD',
        notes: 'Revenue impact from downtime',
      });

      expect(result).toHaveProperty('financial_impact_estimated', 10000);
      expect(result).toHaveProperty('financial_impact_actual', 8000);
    });

    it('should update cost breakdown', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1' }] });

      await problemService.updateFinancialImpact(tenantSlug, 'prob-1', {
        costBreakdown: {
          labor_hours: 40,
          labor_rate: 100,
          revenue_loss: 5000,
          recovery_costs: 1000,
        },
      });

      expect(mockQuery.mock.calls[1][0]).toContain('cost_breakdown = $1');
    });

    it('should return existing if no updates', async () => {
      // First call is for getById verification, second for the return
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', financial_impact_estimated: 5000 }] }) // getById check
        .mockResolvedValueOnce({ rows: [{ id: 'prob-1', financial_impact_estimated: 5000 }] }); // getById return

      const result = await problemService.updateFinancialImpact(tenantSlug, 'prob-1', {});

      expect(result).toHaveProperty('id', 'prob-1');
    });
  });

  describe('getFinancialImpact', () => {
    it('should get financial impact with calculated total', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prob-1',
          financial_impact_estimated: 10000,
          financial_impact_actual: 12000,
          financial_impact_currency: 'USD',
          financial_impact_notes: 'Outage impact',
          cost_breakdown: {
            labor_hours: 20,
            labor_rate: 150,
            revenue_loss: 5000,
            recovery_costs: 2000,
            third_party_costs: 1000,
            customer_credits: 500,
            other: 200,
          },
        }],
      });

      const result = await problemService.getFinancialImpact(tenantSlug, 'prob-1');

      expect(result.estimated).toBe(10000);
      expect(result.actual).toBe(12000);
      expect(result.currency).toBe('USD');
      // Calculated: (20*150) + 5000 + 2000 + 1000 + 500 + 200 = 3000 + 8700 = 11700
      expect(result.calculatedTotal).toBe(11700);
    });

    it('should return zero calculated total if no breakdown', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'prob-1',
          financial_impact_estimated: 5000,
          financial_impact_actual: null,
          financial_impact_currency: 'USD',
          financial_impact_notes: null,
          cost_breakdown: null,
        }],
      });

      const result = await problemService.getFinancialImpact(tenantSlug, 'prob-1');

      expect(result.calculatedTotal).toBe(0);
    });
  });
});
