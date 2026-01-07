import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for ChangesService
 * Testing change management workflows, status transitions, and ITIL change lifecycle
 *
 * Key coverage areas:
 * - Change status transitions (ITIL state machine)
 * - Change window CRUD operations
 * - Change template management
 * - Change request lifecycle
 */

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
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

// Import after mocks
import {
  changeWindowService,
  changeTemplateService,
  changeRequestService,
} from '../../../src/services/changes.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('ChangesService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // CHANGE WINDOW SERVICE
  // ============================================
  describe('ChangeWindowService', () => {
    describe('list', () => {
      it('should list change windows with pagination', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '5' }] })
          .mockResolvedValueOnce({
            rows: [
              { id: '1', name: 'Maintenance Window 1', type: 'standard' },
              { id: '2', name: 'Emergency Window', type: 'emergency' },
            ],
          });

        const result = await changeWindowService.list(
          'test-tenant',
          { page: 1, perPage: 10 }
        );

        expect(result.total).toBe(5);
        expect(result.windows).toHaveLength(2);
        expect(cacheService.getOrSet).toHaveBeenCalled();
      });

      it('should filter change windows by type', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '2' }] })
          .mockResolvedValueOnce({
            rows: [{ id: '1', name: 'Maintenance Window', type: 'standard' }],
          });

        const result = await changeWindowService.list(
          'test-tenant',
          { page: 1, perPage: 10 },
          { type: 'standard' }
        );

        expect(result.windows).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('type = $1'),
          expect.arrayContaining(['standard'])
        );
      });

      it('should filter change windows by status', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '3' }] })
          .mockResolvedValueOnce({ rows: [] });

        await changeWindowService.list(
          'test-tenant',
          { page: 1, perPage: 10 },
          { status: 'active' }
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('status = $'),
          expect.arrayContaining(['active'])
        );
      });
    });

    describe('findById', () => {
      it('should find change window by ID', async () => {
        const mockWindow = { id: 'window-1', name: 'Weekly Maintenance' };
        mockQuery.mockResolvedValueOnce({ rows: [mockWindow] });

        const result = await changeWindowService.findById('test-tenant', 'window-1');

        expect(result).toEqual(mockWindow);
      });

      it('should return null if change window not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await changeWindowService.findById('test-tenant', 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a change window', async () => {
        const mockWindow = {
          id: 'new-window',
          name: 'New Maintenance Window',
          type: 'standard',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockWindow] });

        const result = await changeWindowService.create('test-tenant', {
          name: 'New Maintenance Window',
          type: 'standard',
        });

        expect(result).toEqual(mockWindow);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should create a change window with all optional fields', async () => {
        const mockWindow = {
          id: 'new-window',
          name: 'Full Window',
          type: 'recurring',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockWindow] });

        await changeWindowService.create('test-tenant', {
          name: 'Full Window',
          description: 'Full maintenance window',
          type: 'recurring',
          recurrence: 'weekly',
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=SU',
          startTime: '02:00:00',
          endTime: '06:00:00',
          timezone: 'America/New_York',
          applications: ['app-1', 'app-2'],
          tiers: ['P1', 'P2'],
          notifyBeforeMinutes: 30,
        });

        expect(mockQuery).toHaveBeenCalled();
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });
    });

    describe('update', () => {
      it('should update a change window', async () => {
        const existingWindow = { id: 'window-1', name: 'Old Name' };
        const updatedWindow = { id: 'window-1', name: 'New Name' };
        mockQuery
          .mockResolvedValueOnce({ rows: [existingWindow] })
          .mockResolvedValueOnce({ rows: [updatedWindow] });

        const result = await changeWindowService.update('test-tenant', 'window-1', {
          name: 'New Name',
        });

        expect(result).toEqual(updatedWindow);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should throw NotFoundError if window does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          changeWindowService.update('test-tenant', 'nonexistent', { name: 'New' })
        ).rejects.toThrow(NotFoundError);
      });

      it('should return existing window if no fields to update', async () => {
        const existingWindow = { id: 'window-1', name: 'Existing' };
        mockQuery.mockResolvedValueOnce({ rows: [existingWindow] });

        const result = await changeWindowService.update('test-tenant', 'window-1', {});

        expect(result).toEqual(existingWindow);
      });
    });

    describe('delete', () => {
      it('should delete a change window', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 'window-1' }] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await changeWindowService.delete('test-tenant', 'window-1');

        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should throw NotFoundError if window does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          changeWindowService.delete('test-tenant', 'nonexistent')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('getUpcoming', () => {
      it('should get upcoming change windows', async () => {
        const mockWindows = [
          { id: '1', name: 'This Week', start_date: '2026-01-10' },
          { id: '2', name: 'Next Week', start_date: '2026-01-17' },
        ];
        mockQuery.mockResolvedValueOnce({ rows: mockWindows });

        const result = await changeWindowService.getUpcoming('test-tenant', 30);

        expect(result).toHaveLength(2);
      });

      it('should use default 30 days if not specified', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await changeWindowService.getUpcoming('test-tenant');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.any(String),
          [30]
        );
      });
    });
  });

  // ============================================
  // CHANGE TEMPLATE SERVICE
  // ============================================
  describe('ChangeTemplateService', () => {
    describe('list', () => {
      it('should list active templates with pagination', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '3' }] })
          .mockResolvedValueOnce({
            rows: [
              { id: '1', name: 'Standard Change', is_active: true },
              { id: '2', name: 'Emergency Change', is_active: true },
            ],
          });

        const result = await changeTemplateService.list('test-tenant', { page: 1, perPage: 10 });

        expect(result.total).toBe(3);
        expect(result.templates).toHaveLength(2);
      });
    });

    describe('findById', () => {
      it('should find template by ID', async () => {
        const mockTemplate = {
          id: 'template-1',
          name: 'Standard Change Template',
          type: 'standard',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        const result = await changeTemplateService.findById('test-tenant', 'template-1');

        expect(result).toEqual(mockTemplate);
      });

      it('should return null if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await changeTemplateService.findById('test-tenant', 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a template with defaults', async () => {
        const mockTemplate = {
          id: 'new-template',
          name: 'New Template',
          type: 'standard',
          default_risk_level: 'low',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        const result = await changeTemplateService.create('test-tenant', {
          name: 'New Template',
        });

        expect(result).toEqual(mockTemplate);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should create a template with all fields', async () => {
        const mockTemplate = {
          id: 'full-template',
          name: 'Full Template',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        await changeTemplateService.create('test-tenant', {
          name: 'Full Template',
          description: 'A complete template',
          type: 'emergency',
          category: 'Infrastructure',
          defaultRiskLevel: 'high',
          implementationPlanTemplate: 'Step 1...',
          rollbackPlanTemplate: 'Rollback step 1...',
          testPlanTemplate: 'Test step 1...',
          defaultTasks: [{ title: 'Task 1' }],
          approvalRequired: true,
          approvalGroups: ['group-1'],
        });

        expect(mockQuery).toHaveBeenCalled();
      });
    });

    describe('update', () => {
      it('should update a template', async () => {
        const existingTemplate = { id: 'template-1', name: 'Old Name' };
        const updatedTemplate = { id: 'template-1', name: 'New Name' };
        mockQuery
          .mockResolvedValueOnce({ rows: [existingTemplate] })
          .mockResolvedValueOnce({ rows: [updatedTemplate] });

        const result = await changeTemplateService.update('test-tenant', 'template-1', {
          name: 'New Name',
        });

        expect(result).toEqual(updatedTemplate);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should throw NotFoundError if template does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          changeTemplateService.update('test-tenant', 'nonexistent', { name: 'New' })
        ).rejects.toThrow(NotFoundError);
      });

      it('should update defaultTasks separately', async () => {
        const existingTemplate = { id: 'template-1', name: 'Template' };
        const updatedTemplate = { id: 'template-1', name: 'Template', default_tasks: [] };
        mockQuery
          .mockResolvedValueOnce({ rows: [existingTemplate] })
          .mockResolvedValueOnce({ rows: [updatedTemplate] });

        await changeTemplateService.update('test-tenant', 'template-1', {
          defaultTasks: [{ title: 'New Task' }],
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('default_tasks'),
          expect.any(Array)
        );
      });
    });

    describe('delete', () => {
      it('should soft delete a template', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 'template-1' }] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await changeTemplateService.delete('test-tenant', 'template-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_active = false'),
          expect.any(Array)
        );
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should throw NotFoundError if template does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          changeTemplateService.delete('test-tenant', 'nonexistent')
        ).rejects.toThrow(NotFoundError);
      });
    });
  });

  // ============================================
  // CHANGE REQUEST SERVICE
  // ============================================
  describe('ChangeRequestService', () => {
    describe('list', () => {
      it('should list change requests with pagination', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '10' }] })
          .mockResolvedValueOnce({
            rows: [
              { id: '1', title: 'Change 1', status: 'draft' },
              { id: '2', title: 'Change 2', status: 'submitted' },
            ],
          });

        const result = await changeRequestService.list(
          'test-tenant',
          { page: 1, perPage: 10 }
        );

        expect(result.total).toBe(10);
        expect(result.changes).toHaveLength(2);
      });

      it('should apply status filter', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '2' }] })
          .mockResolvedValueOnce({ rows: [] });

        await changeRequestService.list(
          'test-tenant',
          { page: 1, perPage: 10 },
          { status: 'implementing' }
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('c.status = $'),
          expect.arrayContaining(['implementing'])
        );
      });

      it('should apply risk level filter', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '1' }] })
          .mockResolvedValueOnce({ rows: [] });

        await changeRequestService.list(
          'test-tenant',
          { page: 1, perPage: 10 },
          { riskLevel: 'high' }
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('c.risk_level = $'),
          expect.arrayContaining(['high'])
        );
      });
    });

    describe('findById', () => {
      it('should find change request by UUID', async () => {
        const mockChange = {
          id: 'uuid-1',
          change_number: 'CHG-001',
          title: 'Server Upgrade',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockChange] });

        const result = await changeRequestService.findById('test-tenant', 'uuid-1');

        expect(result).toEqual(mockChange);
        // UUID-based lookup
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('c.id = $1'),
          ['uuid-1']
        );
      });

      it('should find change request by change number', async () => {
        const mockChange = {
          id: 'uuid-1',
          change_number: 'CHG-001',
          title: 'Server Upgrade',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockChange] });

        const result = await changeRequestService.findById('test-tenant', 'CHG-001');

        expect(result).toEqual(mockChange);
        // Change number lookup
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('c.change_number = $1'),
          ['CHG-001']
        );
      });

      it('should return null if change not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await changeRequestService.findById('test-tenant', 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a change request', async () => {
        const mockChange = {
          id: 'new-change',
          change_number: 'CHG-100',
          title: 'New Change',
          status: 'draft',
        };
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 'CHG-100' }] })  // next_id
          .mockResolvedValueOnce({ rows: [mockChange] })         // INSERT
          .mockResolvedValueOnce({ rowCount: 1 });               // status_history

        const result = await changeRequestService.create(
          'test-tenant',
          { title: 'New Change' },
          'user-1'
        );

        expect(result).toEqual(mockChange);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
      });

      it('should generate change number', async () => {
        const mockChange = {
          id: 'new-change',
          change_number: 'CHG-101',
          title: 'New Change',
        };
        mockQuery
          .mockResolvedValueOnce({ rows: [{ id: 'CHG-101' }] })
          .mockResolvedValueOnce({ rows: [mockChange] })
          .mockResolvedValueOnce({ rowCount: 1 });

        await changeRequestService.create('test-tenant', { title: 'New Change' }, 'user-1');

        // First query is the next_id call (no params array)
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('next_id')
        );
      });
    });

    describe('update', () => {
      it('should update change request in draft status', async () => {
        const existingChange = { id: 'change-1', status: 'draft', title: 'Old Title' };
        const updatedChange = { id: 'change-1', status: 'draft', title: 'New Title' };
        mockQuery
          .mockResolvedValueOnce({ rows: [existingChange] })
          .mockResolvedValueOnce({ rows: [updatedChange] });

        const result = await changeRequestService.update(
          'test-tenant',
          'change-1',
          { title: 'New Title' },
          'user-1'
        );

        expect(result).toEqual(updatedChange);
      });

      it('should update change request in submitted status', async () => {
        const existingChange = { id: 'change-1', status: 'submitted' };
        const updatedChange = { ...existingChange, description: 'Updated' };
        mockQuery
          .mockResolvedValueOnce({ rows: [existingChange] })
          .mockResolvedValueOnce({ rows: [updatedChange] });

        await changeRequestService.update(
          'test-tenant',
          'change-1',
          { description: 'Updated' },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalled();
      });

      it('should update change request in review status', async () => {
        const existingChange = { id: 'change-1', status: 'review' };
        const updatedChange = { ...existingChange, description: 'Updated' };
        mockQuery
          .mockResolvedValueOnce({ rows: [existingChange] })
          .mockResolvedValueOnce({ rows: [updatedChange] });

        await changeRequestService.update(
          'test-tenant',
          'change-1',
          { description: 'Updated' },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalled();
      });

      it('should not allow update in approved status', async () => {
        const approvedChange = { id: 'change-1', status: 'approved' };
        mockQuery.mockResolvedValueOnce({ rows: [approvedChange] });

        await expect(
          changeRequestService.update(
            'test-tenant',
            'change-1',
            { description: 'Updated' },
            'user-1'
          )
        ).rejects.toThrow(BadRequestError);
      });

      it('should not allow update in implementing status', async () => {
        const implementingChange = { id: 'change-1', status: 'implementing' };
        mockQuery.mockResolvedValueOnce({ rows: [implementingChange] });

        await expect(
          changeRequestService.update(
            'test-tenant',
            'change-1',
            { description: 'Updated' },
            'user-1'
          )
        ).rejects.toThrow(BadRequestError);
      });

      it('should not allow update in completed status', async () => {
        const completedChange = { id: 'change-1', status: 'completed' };
        mockQuery.mockResolvedValueOnce({ rows: [completedChange] });

        await expect(
          changeRequestService.update(
            'test-tenant',
            'change-1',
            { description: 'Updated' },
            'user-1'
          )
        ).rejects.toThrow(BadRequestError);
      });

      it('should throw NotFoundError if change not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          changeRequestService.update(
            'test-tenant',
            'nonexistent',
            { title: 'New' },
            'user-1'
          )
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('Status Transitions - Approval Workflow', () => {
      describe('approve', () => {
        it('should allow approve from submitted status', async () => {
          const submittedChange = { id: 'change-1', status: 'submitted' };
          const approvedChange = { id: 'change-1', status: 'approved' };
          mockQuery
            .mockResolvedValueOnce({ rows: [submittedChange] })  // findById check
            .mockResolvedValueOnce({ rowCount: 1 })              // INSERT approval
            .mockResolvedValueOnce({ rows: [submittedChange] })  // findById in updateStatus
            .mockResolvedValueOnce({ rowCount: 1 })              // UPDATE status
            .mockResolvedValueOnce({ rowCount: 1 })              // INSERT status_history
            .mockResolvedValueOnce({ rows: [approvedChange] });  // final findById

          const result = await changeRequestService.approve(
            'test-tenant',
            'change-1',
            'user-1',
            'Looks good'
          );

          expect(result).toEqual(approvedChange);
        });

        it('should allow approve from review status', async () => {
          const reviewChange = { id: 'change-1', status: 'review' };
          const approvedChange = { id: 'change-1', status: 'approved' };
          mockQuery
            .mockResolvedValueOnce({ rows: [reviewChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [reviewChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [approvedChange] });

          const result = await changeRequestService.approve('test-tenant', 'change-1', 'user-1');

          expect(result).toEqual(approvedChange);
        });

        it('should not allow approve from draft status', async () => {
          const draftChange = { id: 'change-1', status: 'draft' };
          mockQuery.mockResolvedValueOnce({ rows: [draftChange] });

          await expect(
            changeRequestService.approve('test-tenant', 'change-1', 'user-1')
          ).rejects.toThrow(BadRequestError);
        });

        it('should throw NotFoundError for nonexistent change', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.approve('test-tenant', 'nonexistent', 'user-1')
          ).rejects.toThrow(NotFoundError);
        });
      });

      describe('reject', () => {
        it('should allow reject from submitted status', async () => {
          const submittedChange = { id: 'change-1', status: 'submitted' };
          const rejectedChange = { id: 'change-1', status: 'rejected' };
          mockQuery
            .mockResolvedValueOnce({ rows: [submittedChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [submittedChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [rejectedChange] });

          const result = await changeRequestService.reject(
            'test-tenant',
            'change-1',
            'user-1',
            'Missing rollback plan'
          );

          expect(result).toEqual(rejectedChange);
        });

        it('should not allow reject from draft status', async () => {
          const draftChange = { id: 'change-1', status: 'draft' };
          mockQuery.mockResolvedValueOnce({ rows: [draftChange] });

          await expect(
            changeRequestService.reject('test-tenant', 'change-1', 'user-1', 'reason')
          ).rejects.toThrow(BadRequestError);
        });
      });
    });

    describe('Status Transitions - Scheduling', () => {
      describe('schedule', () => {
        it('should allow schedule from approved status', async () => {
          const approvedChange = { id: 'change-1', status: 'approved', cab_required: false };
          const scheduledChange = { id: 'change-1', status: 'scheduled' };
          mockQuery
            .mockResolvedValueOnce({ rows: [approvedChange] })
            .mockResolvedValueOnce({ rows: [approvedChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [scheduledChange] });

          const result = await changeRequestService.schedule('test-tenant', 'change-1', 'user-1');

          expect(result).toEqual(scheduledChange);
        });

        it('should not allow schedule from submitted status', async () => {
          const submittedChange = { id: 'change-1', status: 'submitted' };
          mockQuery.mockResolvedValueOnce({ rows: [submittedChange] });

          await expect(
            changeRequestService.schedule('test-tenant', 'change-1', 'user-1')
          ).rejects.toThrow(BadRequestError);
        });

        it('should enforce CAB approval requirement', async () => {
          const cabRequiredChange = {
            id: 'change-1',
            status: 'approved',
            cab_required: true,
          };
          mockQuery
            .mockResolvedValueOnce({ rows: [cabRequiredChange] })
            .mockResolvedValueOnce({ rows: [{ count: '1' }] }); // Only 1 approval

          await expect(
            changeRequestService.schedule('test-tenant', 'change-1', 'user-1')
          ).rejects.toThrow(/CAB approval required/);
        });

        it('should allow schedule with sufficient CAB approvals', async () => {
          const cabRequiredChange = {
            id: 'change-1',
            status: 'approved',
            cab_required: true,
          };
          const scheduledChange = { id: 'change-1', status: 'scheduled' };
          mockQuery
            .mockResolvedValueOnce({ rows: [cabRequiredChange] })
            .mockResolvedValueOnce({ rows: [{ count: '3' }] })  // 3 approvals
            .mockResolvedValueOnce({ rows: [cabRequiredChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [scheduledChange] });

          const result = await changeRequestService.schedule('test-tenant', 'change-1', 'user-1');

          expect(result).toEqual(scheduledChange);
        });
      });
    });

    describe('Status Transitions - Execution', () => {
      describe('start', () => {
        it('should allow start from scheduled status', async () => {
          const scheduledChange = { id: 'change-1', status: 'scheduled' };
          const implementingChange = { id: 'change-1', status: 'implementing' };
          mockQuery
            .mockResolvedValueOnce({ rows: [scheduledChange] })
            .mockResolvedValueOnce({ rowCount: 1 })  // actual_start update
            .mockResolvedValueOnce({ rows: [scheduledChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [implementingChange] });

          const result = await changeRequestService.start('test-tenant', 'change-1', 'user-1');

          expect(result).toEqual(implementingChange);
        });

        it('should set actual_start timestamp', async () => {
          const scheduledChange = { id: 'change-1', status: 'scheduled' };
          mockQuery
            .mockResolvedValueOnce({ rows: [scheduledChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [scheduledChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ ...scheduledChange, status: 'implementing' }] });

          await changeRequestService.start('test-tenant', 'change-1', 'user-1');

          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('actual_start = NOW()'),
            expect.any(Array)
          );
        });
      });

      describe('complete', () => {
        it('should allow complete from implementing status', async () => {
          const implementingChange = { id: 'change-1', status: 'implementing' };
          const completedChange = { id: 'change-1', status: 'completed' };
          mockQuery
            .mockResolvedValueOnce({ rows: [implementingChange] })
            .mockResolvedValueOnce({ rowCount: 1 })  // outcome update
            .mockResolvedValueOnce({ rows: [implementingChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [completedChange] });

          const result = await changeRequestService.complete(
            'test-tenant',
            'change-1',
            'user-1',
            'Change implemented successfully'
          );

          expect(result).toEqual(completedChange);
        });

        it('should set outcome to successful', async () => {
          const implementingChange = { id: 'change-1', status: 'implementing' };
          mockQuery
            .mockResolvedValueOnce({ rows: [implementingChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [implementingChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ ...implementingChange, status: 'completed' }] });

          await changeRequestService.complete('test-tenant', 'change-1', 'user-1');

          expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("outcome = 'successful'"),
            expect.any(Array)
          );
        });
      });

      describe('fail', () => {
        it('should allow fail from implementing status', async () => {
          const implementingChange = { id: 'change-1', status: 'implementing' };
          const failedChange = { id: 'change-1', status: 'failed' };
          mockQuery
            .mockResolvedValueOnce({ rows: [implementingChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [implementingChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [failedChange] });

          const result = await changeRequestService.fail(
            'test-tenant',
            'change-1',
            'user-1',
            'Database migration failed'
          );

          expect(result).toEqual(failedChange);
        });
      });

      describe('rollback', () => {
        // NOTE: The rollback() method attempts to transition to 'rolled_back' status,
        // but this is not in the VALID_CHANGE_TRANSITIONS map. This test documents
        // the current behavior - rollback will throw BadRequestError due to invalid transition.
        // The outcome is still set to 'rolled_back' in the DB before the transition fails.
        it('should throw BadRequestError because rolled_back is not a valid transition', async () => {
          const implementingChange = { id: 'change-1', status: 'implementing' };
          mockQuery
            .mockResolvedValueOnce({ rows: [implementingChange] })  // findById in rollback
            .mockResolvedValueOnce({ rowCount: 1 })                 // UPDATE outcome
            .mockResolvedValueOnce({ rows: [implementingChange] }); // findById in updateStatus

          // Rollback fails because 'rolled_back' is not in VALID_CHANGE_TRANSITIONS
          await expect(
            changeRequestService.rollback(
              'test-tenant',
              'change-1',
              'user-1',
              'Rollback due to performance issues'
            )
          ).rejects.toThrow(BadRequestError);
        });
      });
    });

    describe('Status Transitions - Cancellation', () => {
      describe('cancel', () => {
        it('should allow cancel from draft status', async () => {
          const draftChange = { id: 'change-1', status: 'draft' };
          const cancelledChange = { id: 'change-1', status: 'cancelled' };
          mockQuery
            .mockResolvedValueOnce({ rows: [draftChange] })
            .mockResolvedValueOnce({ rows: [draftChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [cancelledChange] });

          const result = await changeRequestService.cancel(
            'test-tenant',
            'change-1',
            'user-1',
            'No longer needed'
          );

          expect(result).toEqual(cancelledChange);
        });

        it('should allow cancel from scheduled status', async () => {
          const scheduledChange = { id: 'change-1', status: 'scheduled' };
          const cancelledChange = { id: 'change-1', status: 'cancelled' };
          mockQuery
            .mockResolvedValueOnce({ rows: [scheduledChange] })
            .mockResolvedValueOnce({ rows: [scheduledChange] })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rowCount: 1 })
            .mockResolvedValueOnce({ rows: [cancelledChange] });

          const result = await changeRequestService.cancel('test-tenant', 'change-1', 'user-1');

          expect(result).toEqual(cancelledChange);
        });

        it('should not allow cancel from implementing status', async () => {
          const implementingChange = { id: 'change-1', status: 'implementing' };
          mockQuery.mockResolvedValueOnce({ rows: [implementingChange] });

          await expect(
            changeRequestService.cancel('test-tenant', 'change-1', 'user-1')
          ).rejects.toThrow(BadRequestError);
        });

        it('should not allow cancel from completed status', async () => {
          const completedChange = { id: 'change-1', status: 'completed' };
          mockQuery.mockResolvedValueOnce({ rows: [completedChange] });

          await expect(
            changeRequestService.cancel('test-tenant', 'change-1', 'user-1')
          ).rejects.toThrow(BadRequestError);
        });
      });
    });

    describe('Tasks', () => {
      describe('getTasks', () => {
        it('should get tasks for a change request', async () => {
          const mockChange = { id: 'change-1' };
          const mockTasks = [
            { id: 'task-1', title: 'Backup database' },
            { id: 'task-2', title: 'Apply changes' },
          ];
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: mockTasks });

          const result = await changeRequestService.getTasks('test-tenant', 'change-1');

          expect(result).toHaveLength(2);
          expect(result).toEqual(mockTasks);
        });

        it('should throw NotFoundError if change does not exist', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.getTasks('test-tenant', 'nonexistent')
          ).rejects.toThrow(NotFoundError);
        });
      });

      describe('createTask', () => {
        it('should create a task', async () => {
          const mockChange = { id: 'change-1' };
          const mockTask = { id: 'task-1', title: 'New Task' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [{ id: 'TASK-001' }] })
            .mockResolvedValueOnce({ rows: [mockTask] });

          const result = await changeRequestService.createTask('test-tenant', 'change-1', {
            title: 'New Task',
          });

          expect(result).toEqual(mockTask);
          expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
        });

        it('should throw NotFoundError if change does not exist', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.createTask('test-tenant', 'non-existent', { title: 'Task' })
          ).rejects.toThrow(NotFoundError);
        });
      });

      describe('updateTask', () => {
        it('should update a task with new data', async () => {
          const mockChange = { id: 'change-1' };
          const mockUpdatedTask = { id: 'task-1', title: 'Updated Title', status: 'in_progress' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockUpdatedTask] });

          const result = await changeRequestService.updateTask('test-tenant', 'change-1', 'task-1', {
            title: 'Updated Title',
            status: 'in_progress',
          });

          expect(result).toEqual(mockUpdatedTask);
          expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
        });

        it('should return existing task when no data to update', async () => {
          const mockChange = { id: 'change-1' };
          const mockTask = { id: 'task-1', title: 'Original Title' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockTask] });

          const result = await changeRequestService.updateTask('test-tenant', 'change-1', 'task-1', {});

          expect(result).toEqual(mockTask);
        });

        it('should throw NotFoundError if change does not exist', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.updateTask('test-tenant', 'non-existent-change', 'task-1', { title: 'New' })
          ).rejects.toThrow(NotFoundError);
        });

        it('should throw NotFoundError if task does not exist', async () => {
          const mockChange = { id: 'change-1' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.updateTask('test-tenant', 'change-1', 'non-existent-task', { title: 'New' })
          ).rejects.toThrow(NotFoundError);
        });
      });

      describe('startTask', () => {
        it('should start a task by setting status and actualStart', async () => {
          const mockChange = { id: 'change-1' };
          const mockStartedTask = { id: 'task-1', status: 'in_progress', actual_start: '2024-01-01T10:00:00Z' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockStartedTask] });

          const result = await changeRequestService.startTask('test-tenant', 'change-1', 'task-1');

          expect(result).toEqual(mockStartedTask);
          expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
        });
      });

      describe('completeTask', () => {
        it('should complete a task by setting status and actualEnd', async () => {
          const mockChange = { id: 'change-1' };
          const mockCompletedTask = { id: 'task-1', status: 'completed', actual_end: '2024-01-01T12:00:00Z' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockCompletedTask] });

          const result = await changeRequestService.completeTask('test-tenant', 'change-1', 'task-1');

          expect(result).toEqual(mockCompletedTask);
          expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
        });

        it('should complete a task with notes', async () => {
          const mockChange = { id: 'change-1' };
          const mockCompletedTask = { id: 'task-1', status: 'completed', notes: 'Task finished' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockCompletedTask] });

          const result = await changeRequestService.completeTask('test-tenant', 'change-1', 'task-1', 'Task finished');

          expect(result).toEqual(mockCompletedTask);
        });
      });

      describe('deleteTask', () => {
        it('should delete a task', async () => {
          const mockChange = { id: 'change-1' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rowCount: 1 });

          await changeRequestService.deleteTask('test-tenant', 'change-1', 'task-1');

          expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
        });

        it('should throw NotFoundError if task does not exist', async () => {
          const mockChange = { id: 'change-1' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rowCount: 0 });

          await expect(
            changeRequestService.deleteTask('test-tenant', 'change-1', 'nonexistent')
          ).rejects.toThrow(NotFoundError);
        });

        it('should throw NotFoundError if change does not exist', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.deleteTask('test-tenant', 'non-existent-change', 'task-1')
          ).rejects.toThrow(NotFoundError);
        });
      });
    });

    describe('Comments', () => {
      describe('getComments', () => {
        it('should get comments for a change request', async () => {
          const mockChange = { id: 'change-1' };
          const mockComments = [
            { id: 'comment-1', content: 'Looks good' },
            { id: 'comment-2', content: 'Approved' },
          ];
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: mockComments });

          const result = await changeRequestService.getComments('test-tenant', 'change-1');

          expect(result).toHaveLength(2);
        });

        it('should throw NotFoundError when change does not exist', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.getComments('test-tenant', 'non-existent-change')
          ).rejects.toThrow(NotFoundError);
        });
      });

      describe('addComment', () => {
        it('should add a comment', async () => {
          const mockChange = { id: 'change-1' };
          const mockComment = { id: 'comment-1', content: 'New comment' };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockComment] });

          const result = await changeRequestService.addComment(
            'test-tenant',
            'change-1',
            'user-1',
            'New comment'
          );

          expect(result).toEqual(mockComment);
          expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'changes');
        });

        it('should add internal comment', async () => {
          const mockChange = { id: 'change-1' };
          const mockComment = { id: 'comment-1', content: 'Internal note', is_internal: true };
          mockQuery
            .mockResolvedValueOnce({ rows: [mockChange] })
            .mockResolvedValueOnce({ rows: [mockComment] });

          const result = await changeRequestService.addComment(
            'test-tenant',
            'change-1',
            'user-1',
            'Internal note',
            true
          );

          expect(result).toEqual(mockComment);
        });

        it('should throw NotFoundError when change does not exist', async () => {
          mockQuery.mockResolvedValueOnce({ rows: [] });

          await expect(
            changeRequestService.addComment('test-tenant', 'non-existent-change', 'user-1', 'Comment')
          ).rejects.toThrow(NotFoundError);
        });
      });
    });

    describe('Status History', () => {
      it('should get status history', async () => {
        const mockChange = { id: 'change-1' };
        const mockHistory = [
          { from_status: null, to_status: 'draft', changed_by_name: 'User 1' },
          { from_status: 'draft', to_status: 'submitted', changed_by_name: 'User 1' },
        ];
        mockQuery
          .mockResolvedValueOnce({ rows: [mockChange] })
          .mockResolvedValueOnce({ rows: mockHistory });

        const result = await changeRequestService.getStatusHistory('test-tenant', 'change-1');

        expect(result).toHaveLength(2);
      });
    });

    describe('Approvals', () => {
      it('should get approvals', async () => {
        const mockChange = { id: 'change-1' };
        const mockApprovals = [
          { id: 'approval-1', status: 'approved', approver_name: 'Manager 1' },
        ];
        mockQuery
          .mockResolvedValueOnce({ rows: [mockChange] })
          .mockResolvedValueOnce({ rows: mockApprovals });

        const result = await changeRequestService.getApprovals('test-tenant', 'change-1');

        expect(result).toHaveLength(1);
      });

      it('should throw NotFoundError if change does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          changeRequestService.getApprovals('test-tenant', 'non-existent')
        ).rejects.toThrow(NotFoundError);
      });
    });
  });
});
