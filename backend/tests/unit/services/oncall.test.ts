import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for OnCallService
 * Testing on-call scheduling, escalation policies, and iCal export functionality
 *
 * Key coverage areas:
 * - OnCallScheduleService: schedule CRUD, rotations, shifts, overrides
 * - EscalationPolicyService: policy CRUD, step management
 * - ICalExportService: iCal generation, subscription token management
 */

// Mock dependencies
const mockQuery = vi.fn();
vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: vi.fn().mockResolvedValue({
      query: (...args: unknown[]) => mockQuery(...args),
      release: vi.fn(),
    }),
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

vi.mock('../../../src/utils/pagination.js', () => ({
  getOffset: vi.fn((params: { page: number; perPage: number }) => (params.page - 1) * params.perPage),
}));

// Import after mocks
import {
  oncallScheduleService,
  escalationPolicyService,
  icalExportService,
} from '../../../src/services/oncall.js';
import { cacheService } from '../../../src/utils/cache.js';
import { NotFoundError } from '../../../src/utils/errors.js';

describe('OnCallService', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockQuery.mockReset();
  });

  // ============================================
  // ON-CALL SCHEDULE SERVICE
  // ============================================
  describe('OnCallScheduleService', () => {
    describe('list', () => {
      it('should list schedules with pagination', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '5' }] })
          .mockResolvedValueOnce({
            rows: [
              { id: '1', name: 'Primary On-Call', rotation_type: 'weekly', member_count: 3 },
              { id: '2', name: 'Secondary On-Call', rotation_type: 'daily', member_count: 2 },
            ],
          });

        const result = await oncallScheduleService.list(
          'test-tenant',
          { page: 1, perPage: 10 }
        );

        expect(result.total).toBe(5);
        expect(result.schedules).toHaveLength(2);
        expect(cacheService.getOrSet).toHaveBeenCalled();
      });

      it('should filter schedules by groupId', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '2' }] })
          .mockResolvedValueOnce({
            rows: [{ id: '1', name: 'Team A On-Call', group_id: 'group-1' }],
          });

        const result = await oncallScheduleService.list(
          'test-tenant',
          { page: 1, perPage: 10 },
          { groupId: 'group-1' }
        );

        expect(result.schedules).toHaveLength(1);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('group_id = $1'),
          expect.arrayContaining(['group-1'])
        );
      });

      it('should filter schedules by isActive', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '3' }] })
          .mockResolvedValueOnce({ rows: [] });

        await oncallScheduleService.list(
          'test-tenant',
          { page: 1, perPage: 10 },
          { isActive: true }
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_active = $'),
          expect.arrayContaining([true])
        );
      });
    });

    describe('findById', () => {
      it('should find schedule by ID', async () => {
        const mockSchedule = {
          id: 'schedule-1',
          name: 'Primary On-Call',
          timezone: 'America/New_York',
          rotation_type: 'weekly',
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockSchedule] });

        const result = await oncallScheduleService.findById('test-tenant', 'schedule-1');

        expect(result).toEqual(mockSchedule);
        expect(cacheService.getOrSet).toHaveBeenCalled();
      });

      it('should return null if schedule not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await oncallScheduleService.findById('test-tenant', 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a schedule with required fields', async () => {
        const mockSchedule = {
          id: 'new-schedule',
          name: 'New On-Call Schedule',
          timezone: 'UTC',
          rotation_type: 'weekly',
        };
        // First query: INSERT schedule
        mockQuery.mockResolvedValueOnce({ rows: [mockSchedule] });
        // Second query: INSERT audit log
        mockQuery.mockResolvedValueOnce({ rows: [] });
        // Third query: findById (via cache passthrough)
        mockQuery.mockResolvedValueOnce({ rows: [mockSchedule] });

        const result = await oncallScheduleService.create(
          'test-tenant',
          { name: 'New On-Call Schedule' },
          'user-1'
        );

        expect(result.name).toBe('New On-Call Schedule');
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should create a schedule with all optional fields', async () => {
        const mockSchedule = {
          id: 'new-schedule',
          name: 'Full Schedule',
          description: 'Detailed description',
          timezone: 'America/Los_Angeles',
          group_id: 'group-1',
          rotation_type: 'bi_weekly',
          rotation_length: 2,
          handoff_time: '10:00',
          handoff_day: 5,
          color: '#FF5733',
          metadata: { custom: 'data' },
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockSchedule] });
        mockQuery.mockResolvedValueOnce({ rows: [] });
        mockQuery.mockResolvedValueOnce({ rows: [mockSchedule] });

        const result = await oncallScheduleService.create(
          'test-tenant',
          {
            name: 'Full Schedule',
            description: 'Detailed description',
            timezone: 'America/Los_Angeles',
            groupId: 'group-1',
            rotationType: 'bi_weekly',
            rotationLength: 2,
            handoffTime: '10:00',
            handoffDay: 5,
            color: '#FF5733',
            metadata: { custom: 'data' },
          },
          'user-1'
        );

        expect(result.rotation_type).toBe('bi_weekly');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.oncall_schedules'),
          expect.any(Array)
        );
      });
    });

    describe('update', () => {
      it('should update schedule fields', async () => {
        const existingSchedule = { id: 'schedule-1', name: 'Old Name', timezone: 'UTC' };
        const updatedSchedule = { id: 'schedule-1', name: 'New Name', timezone: 'UTC' };

        // findById for existing check
        mockQuery.mockResolvedValueOnce({ rows: [existingSchedule] });
        // UPDATE query
        mockQuery.mockResolvedValueOnce({ rows: [updatedSchedule] });
        // findById after update
        mockQuery.mockResolvedValueOnce({ rows: [updatedSchedule] });

        const result = await oncallScheduleService.update(
          'test-tenant',
          'schedule-1',
          { name: 'New Name' },
          'user-1'
        );

        expect(result.name).toBe('New Name');
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should throw NotFoundError if schedule does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          oncallScheduleService.update('test-tenant', 'nonexistent', { name: 'New' }, 'user-1')
        ).rejects.toThrow(NotFoundError);
      });

      it('should return existing schedule if no updates provided', async () => {
        const existingSchedule = { id: 'schedule-1', name: 'Unchanged' };
        mockQuery.mockResolvedValueOnce({ rows: [existingSchedule] });

        const result = await oncallScheduleService.update(
          'test-tenant',
          'schedule-1',
          {},
          'user-1'
        );

        expect(result).toEqual(existingSchedule);
        // Only one query (findById), no UPDATE
        expect(mockQuery).toHaveBeenCalledTimes(1);
      });
    });

    describe('delete', () => {
      it('should delete a schedule', async () => {
        const existingSchedule = { id: 'schedule-1', name: 'To Delete' };
        mockQuery.mockResolvedValueOnce({ rows: [existingSchedule] });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await oncallScheduleService.delete('test-tenant', 'schedule-1', 'user-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tenant_test.oncall_schedules'),
          ['schedule-1']
        );
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should throw NotFoundError if schedule does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          oncallScheduleService.delete('test-tenant', 'nonexistent', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });
    });

    // Rotations
    describe('getRotations', () => {
      it('should get rotations for a schedule', async () => {
        // First: findById check
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'schedule-1' }] });
        // Second: get rotations
        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'rot-1', user_id: 'user-1', user_name: 'John Doe', position: 1 },
            { id: 'rot-2', user_id: 'user-2', user_name: 'Jane Doe', position: 2 },
          ],
        });

        const result = await oncallScheduleService.getRotations('test-tenant', 'schedule-1');

        expect(result).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM tenant_test.oncall_rotations'),
          ['schedule-1']
        );
      });

      it('should throw NotFoundError if schedule does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          oncallScheduleService.getRotations('test-tenant', 'nonexistent')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('addToRotation', () => {
      it('should add user to rotation with auto-position', async () => {
        // findById check
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'schedule-1' }] });
        // get max position
        mockQuery.mockResolvedValueOnce({ rows: [{ next_pos: 3 }] });
        // INSERT rotation
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'rot-1', user_id: 'user-1', position: 3 }],
        });

        const result = await oncallScheduleService.addToRotation(
          'test-tenant',
          'schedule-1',
          'user-1'
        );

        expect(result.position).toBe(3);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should add user to rotation with specified position', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'schedule-1' }] });
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'rot-1', user_id: 'user-1', position: 1 }],
        });

        const result = await oncallScheduleService.addToRotation(
          'test-tenant',
          'schedule-1',
          'user-1',
          1
        );

        expect(result.position).toBe(1);
      });

      it('should throw NotFoundError if schedule does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          oncallScheduleService.addToRotation('test-tenant', 'nonexistent', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('updateRotationPosition', () => {
      it('should update rotation position', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'rot-1', position: 5 }],
        });

        const result = await oncallScheduleService.updateRotationPosition(
          'test-tenant',
          'schedule-1',
          'rot-1',
          5
        );

        expect(result.position).toBe(5);
      });

      it('should throw NotFoundError if rotation does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          oncallScheduleService.updateRotationPosition('test-tenant', 'schedule-1', 'nonexistent', 1)
        ).rejects.toThrow(NotFoundError);
      });
    });

    describe('removeFromRotation', () => {
      it('should deactivate rotation (soft delete)', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await oncallScheduleService.removeFromRotation('test-tenant', 'schedule-1', 'rot-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SET is_active = false'),
          ['rot-1', 'schedule-1']
        );
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });
    });

    // Shifts
    describe('getShifts', () => {
      it('should get shifts within date range', async () => {
        const startDate = new Date('2025-01-01');
        const endDate = new Date('2025-01-31');

        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'shift-1', user_name: 'John Doe', start_time: startDate },
            { id: 'shift-2', user_name: 'Jane Doe', start_time: new Date('2025-01-08') },
          ],
        });

        const result = await oncallScheduleService.getShifts(
          'test-tenant',
          'schedule-1',
          startDate,
          endDate
        );

        expect(result).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('start_time >= $2'),
          expect.arrayContaining([startDate, endDate])
        );
      });
    });

    describe('createShift', () => {
      it('should create a shift with required fields', async () => {
        const startTime = new Date('2025-01-06T09:00:00Z');
        const endTime = new Date('2025-01-07T09:00:00Z');

        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'shift-1', schedule_id: 'schedule-1', user_id: 'user-1' }],
        });

        const result = await oncallScheduleService.createShift(
          'test-tenant',
          {
            scheduleId: 'schedule-1',
            userId: 'user-1',
            startTime,
            endTime,
          },
          'user-admin'
        );

        expect(result.id).toBe('shift-1');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.oncall_shifts'),
          expect.any(Array)
        );
      });

      it('should create a shift with optional layer and type', async () => {
        const startTime = new Date('2025-01-06T09:00:00Z');
        const endTime = new Date('2025-01-07T09:00:00Z');

        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'shift-1', shift_type: 'secondary', layer: 2 }],
        });

        await oncallScheduleService.createShift(
          'test-tenant',
          {
            scheduleId: 'schedule-1',
            userId: 'user-1',
            startTime,
            endTime,
            shiftType: 'secondary',
            layer: 2,
          },
          'user-admin'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.oncall_shifts'),
          expect.arrayContaining(['secondary', 2])
        );
      });
    });

    describe('createOverride', () => {
      it('should create an override shift', async () => {
        const startTime = new Date('2025-01-06T09:00:00Z');
        const endTime = new Date('2025-01-07T09:00:00Z');

        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'override-1', shift_type: 'override', override_reason: 'Vacation coverage' }],
        });

        const result = await oncallScheduleService.createOverride(
          'test-tenant',
          {
            scheduleId: 'schedule-1',
            userId: 'user-2',
            startTime,
            endTime,
            reason: 'Vacation coverage',
            originalUserId: 'user-1',
          },
          'user-admin'
        );

        expect(result.shift_type).toBe('override');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining("shift_type, override_reason"),
          expect.arrayContaining(['Vacation coverage', 'user-1'])
        );
      });
    });

    describe('deleteShift', () => {
      it('should delete a shift', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await oncallScheduleService.deleteShift('test-tenant', 'schedule-1', 'shift-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tenant_test.oncall_shifts'),
          ['shift-1', 'schedule-1']
        );
      });
    });

    describe('whoIsOnCall', () => {
      it('should return current on-call users', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              schedule_id: 'schedule-1',
              schedule_name: 'Primary',
              user_id: 'user-1',
              user_name: 'John Doe',
              shift_type: 'primary',
            },
          ],
        });

        const result = await oncallScheduleService.whoIsOnCall('test-tenant');

        expect(result).toHaveLength(1);
        expect(result[0].user_name).toBe('John Doe');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('sh.start_time <= NOW()'),
          []
        );
      });

      it('should filter by scheduleId', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await oncallScheduleService.whoIsOnCall('test-tenant', 'schedule-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('s.id = $1'),
          ['schedule-1']
        );
      });

      it('should filter by applicationId', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await oncallScheduleService.whoIsOnCall('test-tenant', undefined, 'app-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('sa.application_id = $1'),
          ['app-1']
        );
      });
    });

    describe('linkToApplication', () => {
      it('should link schedule to application', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await oncallScheduleService.linkToApplication('test-tenant', 'schedule-1', 'app-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO tenant_test.oncall_schedule_applications'),
          ['schedule-1', 'app-1']
        );
      });
    });

    describe('unlinkFromApplication', () => {
      it('should unlink schedule from application', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await oncallScheduleService.unlinkFromApplication('test-tenant', 'schedule-1', 'app-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tenant_test.oncall_schedule_applications'),
          ['schedule-1', 'app-1']
        );
      });
    });

    describe('getLinkedApplications', () => {
      it('should get applications linked to schedule', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'app-1', name: 'App One' },
            { id: 'app-2', name: 'App Two' },
          ],
        });

        const result = await oncallScheduleService.getLinkedApplications('test-tenant', 'schedule-1');

        expect(result).toHaveLength(2);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('JOIN tenant_test.oncall_schedule_applications'),
          ['schedule-1']
        );
      });
    });
  });

  // ============================================
  // ESCALATION POLICY SERVICE
  // ============================================
  describe('EscalationPolicyService', () => {
    describe('list', () => {
      it('should list escalation policies with pagination', async () => {
        mockQuery
          .mockResolvedValueOnce({ rows: [{ count: '3' }] })
          .mockResolvedValueOnce({
            rows: [
              { id: 'policy-1', name: 'Default Policy', is_default: true, step_count: 3 },
              { id: 'policy-2', name: 'Critical Policy', is_default: false, step_count: 5 },
            ],
          });

        const result = await escalationPolicyService.list(
          'test-tenant',
          { page: 1, perPage: 10 }
        );

        expect(result.total).toBe(3);
        expect(result.policies).toHaveLength(2);
        expect(cacheService.getOrSet).toHaveBeenCalled();
      });
    });

    describe('findById', () => {
      it('should find policy by ID', async () => {
        const mockPolicy = {
          id: 'policy-1',
          name: 'Default Policy',
          repeat_count: 3,
          repeat_delay_minutes: 5,
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockPolicy] });

        const result = await escalationPolicyService.findById('test-tenant', 'policy-1');

        expect(result).toEqual(mockPolicy);
        expect(cacheService.getOrSet).toHaveBeenCalled();
      });

      it('should return null if policy not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await escalationPolicyService.findById('test-tenant', 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create a policy with defaults', async () => {
        const mockPolicy = {
          id: 'new-policy',
          name: 'New Policy',
          repeat_count: 3,
          repeat_delay_minutes: 5,
          is_default: false,
        };
        mockQuery.mockResolvedValueOnce({ rows: [mockPolicy] });

        const result = await escalationPolicyService.create(
          'test-tenant',
          { name: 'New Policy' },
          'user-1'
        );

        expect(result.name).toBe('New Policy');
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should unset other defaults when creating new default policy', async () => {
        const mockPolicy = {
          id: 'new-policy',
          name: 'New Default',
          is_default: true,
        };
        // First: unset existing defaults
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // Second: insert new policy
        mockQuery.mockResolvedValueOnce({ rows: [mockPolicy] });

        const result = await escalationPolicyService.create(
          'test-tenant',
          { name: 'New Default', isDefault: true },
          'user-1'
        );

        expect(result.is_default).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SET is_default = false')
        );
      });
    });

    describe('update', () => {
      it('should update policy fields', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Old Name' };
        const updatedPolicy = { id: 'policy-1', name: 'New Name' };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        const result = await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { name: 'New Name' },
          'user-1'
        );

        expect(result.name).toBe('New Name');
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should throw NotFoundError if policy does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          escalationPolicyService.update('test-tenant', 'nonexistent', { name: 'New' }, 'user-1')
        ).rejects.toThrow(NotFoundError);
      });

      it('should return existing policy if no updates provided', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Unchanged' };
        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });

        const result = await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          {},
          'user-1'
        );

        expect(result).toEqual(existingPolicy);
      });

      it('should unset other defaults when updating to default', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Policy', is_default: false };
        const updatedPolicy = { id: 'policy-1', name: 'Policy', is_default: true };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        // Unset other defaults
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
        // Update policy
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        // findById return
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { isDefault: true },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SET is_default = false WHERE is_default = true AND id != $1'),
          ['policy-1']
        );
      });

      it('should update policy metadata', async () => {
        const metadata = { priority: 'high', team: 'platform' };
        const existingPolicy = { id: 'policy-1', name: 'Policy' };
        const updatedPolicy = { id: 'policy-1', name: 'Policy', metadata };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { metadata },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('metadata = $1'),
          expect.arrayContaining([JSON.stringify(metadata)])
        );
      });

      it('should update policy repeatDelayMinutes', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Policy' };
        const updatedPolicy = { id: 'policy-1', name: 'Policy', repeat_delay_minutes: 30 };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { repeatDelayMinutes: 30 },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('repeat_delay_minutes = $1'),
          expect.arrayContaining([30])
        );
      });

      it('should update policy isActive', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Policy' };
        const updatedPolicy = { id: 'policy-1', name: 'Policy', is_active: false };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { isActive: false },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('is_active = $1'),
          expect.arrayContaining([false])
        );
      });

      it('should update policy repeatCount', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Policy' };
        const updatedPolicy = { id: 'policy-1', name: 'Policy', repeat_count: 3 };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { repeatCount: 3 },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('repeat_count = $1'),
          expect.arrayContaining([3])
        );
      });

      it('should update policy description', async () => {
        const existingPolicy = { id: 'policy-1', name: 'Policy' };
        const updatedPolicy = { id: 'policy-1', name: 'Policy', description: 'Updated description' };

        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [updatedPolicy] });

        await escalationPolicyService.update(
          'test-tenant',
          'policy-1',
          { description: 'Updated description' },
          'user-1'
        );

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('description = $1'),
          expect.arrayContaining(['Updated description'])
        );
      });
    });

    describe('delete', () => {
      it('should soft-delete a policy', async () => {
        const existingPolicy = { id: 'policy-1', name: 'To Delete' };
        mockQuery.mockResolvedValueOnce({ rows: [existingPolicy] });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await escalationPolicyService.delete('test-tenant', 'policy-1', 'user-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('SET is_active = false'),
          ['policy-1']
        );
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should throw NotFoundError if policy does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          escalationPolicyService.delete('test-tenant', 'nonexistent', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });
    });

    // Steps
    describe('getSteps', () => {
      it('should get steps for a policy', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [
            { id: 'step-1', step_number: 1, notify_type: 'schedule', schedule_name: 'Primary' },
            { id: 'step-2', step_number: 2, notify_type: 'user', user_name: 'John Doe' },
            { id: 'step-3', step_number: 3, notify_type: 'group', group_name: 'Engineering' },
          ],
        });

        const result = await escalationPolicyService.getSteps('test-tenant', 'policy-1');

        expect(result).toHaveLength(3);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('FROM tenant_test.oncall_escalation_steps'),
          ['policy-1']
        );
      });
    });

    describe('addStep', () => {
      it('should add step with auto step number', async () => {
        // Get max step number
        mockQuery.mockResolvedValueOnce({ rows: [{ next_step: 2 }] });
        // Insert step
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', step_number: 2, notify_type: 'schedule' }],
        });

        const result = await escalationPolicyService.addStep('test-tenant', 'policy-1', {
          notifyType: 'schedule',
          scheduleId: 'schedule-1',
        });

        expect(result.step_number).toBe(2);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should add step with specified step number', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', step_number: 1, notify_type: 'user' }],
        });

        const result = await escalationPolicyService.addStep('test-tenant', 'policy-1', {
          stepNumber: 1,
          notifyType: 'user',
          userId: 'user-1',
          delayMinutes: 10,
          notificationChannels: ['email', 'sms'],
        });

        expect(result.step_number).toBe(1);
      });
    });

    describe('updateStep', () => {
      it('should update step fields', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', delay_minutes: 15 }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          { delayMinutes: 15 }
        );

        expect(result.delay_minutes).toBe(15);
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });

      it('should throw NotFoundError if step does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          escalationPolicyService.updateStep('test-tenant', 'policy-1', 'nonexistent', { delayMinutes: 10 })
        ).rejects.toThrow(NotFoundError);
      });

      it('should return current step if no updates provided', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', delay_minutes: 5 }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          {}
        );

        expect(result.delay_minutes).toBe(5);
      });

      it('should update step groupId', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', group_id: 'group-123' }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          { groupId: 'group-123' }
        );

        expect(result.group_id).toBe('group-123');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('group_id = $1'),
          expect.arrayContaining(['group-123'])
        );
      });

      it('should update step notificationChannels', async () => {
        const channels = ['email', 'sms', 'slack'];
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', notification_channels: channels }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          { notificationChannels: channels }
        );

        expect(result.notification_channels).toEqual(channels);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('notification_channels = $1'),
          expect.arrayContaining([channels])
        );
      });

      it('should update step scheduleId', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', schedule_id: 'schedule-456' }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          { scheduleId: 'schedule-456' }
        );

        expect(result.schedule_id).toBe('schedule-456');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('schedule_id = $1'),
          expect.arrayContaining(['schedule-456'])
        );
      });

      it('should update step userId', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', user_id: 'user-789' }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          { userId: 'user-789' }
        );

        expect(result.user_id).toBe('user-789');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('user_id = $1'),
          expect.arrayContaining(['user-789'])
        );
      });

      it('should update step notifyType', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'step-1', notify_type: 'user' }],
        });

        const result = await escalationPolicyService.updateStep(
          'test-tenant',
          'policy-1',
          'step-1',
          { notifyType: 'user' }
        );

        expect(result.notify_type).toBe('user');
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('notify_type = $1'),
          expect.arrayContaining(['user'])
        );
      });
    });

    describe('deleteStep', () => {
      it('should delete a step', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await escalationPolicyService.deleteStep('test-tenant', 'policy-1', 'step-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tenant_test.oncall_escalation_steps'),
          ['step-1', 'policy-1']
        );
        expect(cacheService.invalidateTenant).toHaveBeenCalledWith('test-tenant', 'oncall');
      });
    });
  });

  // ============================================
  // ICAL EXPORT SERVICE
  // ============================================
  describe('ICalExportService', () => {
    describe('generateICalendar', () => {
      it('should generate valid iCal content', async () => {
        // findById for schedule
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'schedule-1', name: 'Primary On-Call', timezone: 'UTC' }],
        });
        // Get shifts
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'shift-1',
              start_time: new Date('2025-01-06T09:00:00Z'),
              end_time: new Date('2025-01-07T09:00:00Z'),
              user_name: 'John Doe',
              user_email: 'john@example.com',
              shift_type: 'primary',
            },
          ],
        });

        const result = await icalExportService.generateICalendar('test-tenant', {
          scheduleId: 'schedule-1',
        });

        expect(result).toContain('BEGIN:VCALENDAR');
        expect(result).toContain('VERSION:2.0');
        expect(result).toContain('PRODID:-//FireLater//On-Call Schedule//test-tenant//EN');
        expect(result).toContain('BEGIN:VEVENT');
        expect(result).toContain('SUMMARY:On-Call: John Doe - Primary On-Call');
        expect(result).toContain('END:VCALENDAR');
      });

      it('should throw NotFoundError if schedule does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          icalExportService.generateICalendar('test-tenant', { scheduleId: 'nonexistent' })
        ).rejects.toThrow(NotFoundError);
      });

      it('should filter by userId', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'schedule-1', name: 'Primary', timezone: 'UTC' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await icalExportService.generateICalendar('test-tenant', {
          scheduleId: 'schedule-1',
          userId: 'user-1',
        });

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('s.user_id = $4'),
          expect.arrayContaining(['user-1'])
        );
      });

      it('should include alarm in events', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'schedule-1', name: 'Primary', timezone: 'UTC' }],
        });
        mockQuery.mockResolvedValueOnce({
          rows: [
            {
              id: 'shift-1',
              start_time: new Date('2025-01-06T09:00:00Z'),
              end_time: new Date('2025-01-07T09:00:00Z'),
              user_name: 'John Doe',
              shift_type: 'primary',
            },
          ],
        });

        const result = await icalExportService.generateICalendar('test-tenant', {
          scheduleId: 'schedule-1',
        });

        expect(result).toContain('BEGIN:VALARM');
        expect(result).toContain('TRIGGER:-PT15M');
        expect(result).toContain('ACTION:DISPLAY');
        expect(result).toContain('END:VALARM');
      });
    });

    describe('createSubscriptionToken', () => {
      it('should create subscription token', async () => {
        // findById for schedule
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'schedule-1', name: 'Primary' }],
        });
        // Insert subscription
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await icalExportService.createSubscriptionToken(
          'test-tenant',
          'schedule-1',
          'user-1'
        );

        expect(result.token).toBeDefined();
        expect(result.token.length).toBe(64); // 32 bytes hex = 64 chars
        expect(result.url).toContain('/v1/oncall/schedules/schedule-1/ical/subscribe/');
      });

      it('should throw NotFoundError if schedule does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await expect(
          icalExportService.createSubscriptionToken('test-tenant', 'nonexistent', 'user-1')
        ).rejects.toThrow(NotFoundError);
      });

      it('should create subscription with filter user', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'schedule-1', name: 'Primary' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await icalExportService.createSubscriptionToken(
          'test-tenant',
          'schedule-1',
          'user-1',
          'user-2' // Filter to only show user-2's shifts
        );

        expect(result.token).toBeDefined();
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('filter_user_id'),
          expect.arrayContaining(['user-2'])
        );
      });
    });

    describe('validateSubscriptionToken', () => {
      it('should validate and return subscription info', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', filter_user_id: null }],
        });
        // Update last_accessed_at
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await icalExportService.validateSubscriptionToken(
          'test-tenant',
          'schedule-1',
          'valid-token'
        );

        expect(result).toEqual({
          userId: 'user-1',
          filterUserId: null,
        });
      });

      it('should return null for invalid token', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await icalExportService.validateSubscriptionToken(
          'test-tenant',
          'schedule-1',
          'invalid-token'
        );

        expect(result).toBeNull();
      });

      it('should return filter user id if set', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', filter_user_id: 'user-2' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await icalExportService.validateSubscriptionToken(
          'test-tenant',
          'schedule-1',
          'valid-token'
        );

        expect(result?.filterUserId).toBe('user-2');
      });
    });

    describe('validatePublicSubscriptionToken', () => {
      it('should search across all tenant schemas', async () => {
        // Get tenant schemas
        mockQuery.mockResolvedValueOnce({
          rows: [
            { nspname: 'tenant_acme' },
            { nspname: 'tenant_beta' },
          ],
        });
        // UNION ALL query result
        mockQuery.mockResolvedValueOnce({
          rows: [{ schema_name: 'tenant_acme', user_id: 'user-1', filter_user_id: null }],
        });
        // Update last_accessed_at
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await icalExportService.validatePublicSubscriptionToken(
          'schedule-1',
          'valid-token'
        );

        expect(result).toEqual({
          tenantSlug: 'acme',
          userId: 'user-1',
          filterUserId: null,
        });
      });

      it('should return null if no tenant schemas exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await icalExportService.validatePublicSubscriptionToken(
          'schedule-1',
          'token'
        );

        expect(result).toBeNull();
      });

      it('should return null if token not found in any schema', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ nspname: 'tenant_acme' }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await icalExportService.validatePublicSubscriptionToken(
          'schedule-1',
          'invalid-token'
        );

        expect(result).toBeNull();
      });

      it('should handle tenant slug with underscores', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [{ nspname: 'tenant_my_company' }],
        });
        mockQuery.mockResolvedValueOnce({
          rows: [{ schema_name: 'tenant_my_company', user_id: 'user-1', filter_user_id: null }],
        });
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await icalExportService.validatePublicSubscriptionToken(
          'schedule-1',
          'token'
        );

        expect(result?.tenantSlug).toBe('my-company');
      });
    });

    describe('revokeSubscriptionToken', () => {
      it('should revoke subscription token', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        await icalExportService.revokeSubscriptionToken('test-tenant', 'schedule-1', 'user-1');

        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM tenant_test.oncall_calendar_subscriptions'),
          ['schedule-1', 'user-1']
        );
      });
    });
  });
});
