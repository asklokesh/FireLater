import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing service
const mockQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn(() => ({
  query: mockClientQuery,
  release: mockRelease,
}));

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
    connect: () => mockConnect(),
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
    invalidateTenant: vi.fn(),
  },
}));

// Note: crypto.randomUUID is a built-in, we verify the generated ID exists instead

import { cabMeetingService } from '../../../src/services/cabMeetings.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('CabMeetingService', () => {
  const tenantSlug = 'test';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================
  // LIST MEETINGS
  // ==================
  describe('list', () => {
    it('should list meetings with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 'meeting-1', title: 'CAB Weekly', organizer_name: 'Admin' },
            { id: 'meeting-2', title: 'Emergency CAB', organizer_name: 'Admin' },
          ],
        });

      const result = await cabMeetingService.list(tenantSlug, { page: 1, perPage: 10 });

      expect(result.total).toBe(5);
      expect(result.meetings).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('should filter by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cabMeetingService.list(tenantSlug, { page: 1, perPage: 10 }, { status: 'scheduled' });

      expect(mockQuery.mock.calls[0][0]).toContain('m.status = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('scheduled');
    });

    it('should filter by organizerId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cabMeetingService.list(tenantSlug, { page: 1, perPage: 10 }, { organizerId: 'user-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('m.organizer_id = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('user-1');
    });

    it('should filter by date range', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cabMeetingService.list(
        tenantSlug,
        { page: 1, perPage: 10 },
        { fromDate: '2025-01-01', toDate: '2025-01-31' }
      );

      expect(mockQuery.mock.calls[0][0]).toContain('m.meeting_date >= $1');
      expect(mockQuery.mock.calls[0][0]).toContain('m.meeting_date <= $2');
      // Count query has date filter params
      expect(mockQuery.mock.calls[0][1][0]).toBe('2025-01-01');
      expect(mockQuery.mock.calls[0][1][1]).toBe('2025-01-31');
    });

    it('should combine multiple filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await cabMeetingService.list(
        tenantSlug,
        { page: 1, perPage: 10 },
        { status: 'scheduled', organizerId: 'user-1' }
      );

      expect(mockQuery.mock.calls[0][0]).toContain('m.status = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('m.organizer_id = $2');
    });
  });

  // ==================
  // GET BY ID
  // ==================
  describe('getById', () => {
    it('should get meeting by UUID', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'meeting-1', title: 'CAB Weekly', organizer_name: 'Admin' }],
        })
        .mockResolvedValueOnce({ rows: [{ user_id: 'user-1', role: 'chair' }] })
        .mockResolvedValueOnce({ rows: [{ change_id: 'change-1', change_number: 'CHG-001' }] });

      const result = await cabMeetingService.getById(tenantSlug, 'meeting-1');

      expect(result).toHaveProperty('title', 'CAB Weekly');
      expect(result).toHaveProperty('attendees');
      expect(result).toHaveProperty('changes');
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE m.id = $1');
    });

    it('should get meeting by meeting_number (CAB-xxx)', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'meeting-1', meeting_number: 'CAB-001', title: 'CAB Weekly' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await cabMeetingService.getById(tenantSlug, 'CAB-001');

      expect(result).toHaveProperty('meeting_number', 'CAB-001');
      expect(mockQuery.mock.calls[0][0]).toContain('WHERE m.meeting_number = $1');
    });

    it('should throw NotFoundError if meeting does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(cabMeetingService.getById(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ==================
  // CREATE MEETING
  // ==================
  describe('create', () => {
    it('should create meeting with all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'CAB-001' }] }) // generateMeetingNumber
        .mockResolvedValueOnce({
          rows: [{ id: 'meeting-1', meeting_number: 'CAB-001', title: 'Weekly CAB' }],
        }) // INSERT meeting
        .mockResolvedValueOnce({ rows: [] }); // INSERT attendee (organizer as chair)

      const result = await cabMeetingService.create(tenantSlug, 'organizer-1', {
        title: 'Weekly CAB',
        description: 'Weekly change review',
        meetingDate: '2025-01-15T10:00:00Z',
        meetingEnd: '2025-01-15T11:00:00Z',
        location: 'Conference Room A',
        meetingLink: 'https://meet.example.com/cab',
      });

      expect(result).toHaveProperty('meeting_number', 'CAB-001');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO tenant_test.cab_meetings');
      // Organizer added as chair
      expect(mockQuery.mock.calls[2][0]).toContain("'chair', 'accepted'");
    });

    it('should create meeting with minimal fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'CAB-002' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-2', title: 'Emergency CAB' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await cabMeetingService.create(tenantSlug, 'organizer-1', {
        title: 'Emergency CAB',
        meetingDate: '2025-01-16T14:00:00Z',
      });

      expect(result).toHaveProperty('title', 'Emergency CAB');
    });
  });

  // ==================
  // UPDATE MEETING
  // ==================
  describe('update', () => {
    it('should update meeting fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', title: 'Updated CAB' }] });

      const result = await cabMeetingService.update(tenantSlug, 'meeting-1', {
        title: 'Updated CAB',
        description: 'Updated description',
      });

      expect(result).toHaveProperty('title', 'Updated CAB');
      expect(mockQuery.mock.calls[1][0]).toContain('title = $1');
    });

    it('should throw BadRequestError if meeting is completed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'completed' }] });

      await expect(
        cabMeetingService.update(tenantSlug, 'meeting-1', { title: 'New Title' })
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if meeting is cancelled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'cancelled' }] });

      await expect(
        cabMeetingService.update(tenantSlug, 'meeting-1', { title: 'New Title' })
      ).rejects.toThrow(BadRequestError);
    });

    it('should return meeting unchanged if no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] });

      const result = await cabMeetingService.update(tenantSlug, 'meeting-1', {});

      expect(result).toHaveProperty('id', 'meeting-1');
      expect(mockQuery).toHaveBeenCalledTimes(1); // Only getMeetingById
    });

    it('should update all supported fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] });

      await cabMeetingService.update(tenantSlug, 'meeting-1', {
        title: 'New Title',
        description: 'New Description',
        meetingDate: '2025-02-01T10:00:00Z',
        meetingEnd: '2025-02-01T11:00:00Z',
        location: 'Room B',
        meetingLink: 'https://new-link.com',
        status: 'in_progress',
        agenda: 'New agenda',
      });

      const updateQuery = mockQuery.mock.calls[1][0];
      expect(updateQuery).toContain('title = $1');
      expect(updateQuery).toContain('description = $2');
      expect(updateQuery).toContain('meeting_date = $3');
    });
  });

  // ==================
  // DELETE MEETING
  // ==================
  describe('delete', () => {
    it('should delete meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await cabMeetingService.delete(tenantSlug, 'meeting-1');

      expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM tenant_test.cab_meetings');
    });

    it('should throw BadRequestError if meeting is completed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'completed' }] });

      await expect(cabMeetingService.delete(tenantSlug, 'meeting-1')).rejects.toThrow(
        BadRequestError
      );
    });

    it('should throw NotFoundError if meeting does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(cabMeetingService.delete(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ==================
  // ATTENDEES
  // ==================
  describe('getAttendees', () => {
    it('should get attendees for meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user-1', role: 'chair', user_name: 'Admin' },
            { user_id: 'user-2', role: 'member', user_name: 'Member' },
          ],
        });

      const result = await cabMeetingService.getAttendees(tenantSlug, 'meeting-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('role', 'chair');
    });
  });

  describe('addAttendee', () => {
    it('should add attendee with default role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ meeting_id: 'meeting-1', user_id: 'user-2', role: 'member' }] });

      const result = await cabMeetingService.addAttendee(tenantSlug, 'meeting-1', 'user-2');

      expect(result).toHaveProperty('role', 'member');
      expect(mockQuery.mock.calls[1][1]).toContain('member');
    });

    it('should add attendee with specified role', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ meeting_id: 'meeting-1', user_id: 'user-2', role: 'guest' }] });

      const result = await cabMeetingService.addAttendee(tenantSlug, 'meeting-1', 'user-2', 'guest');

      expect(result).toHaveProperty('role', 'guest');
    });

    it('should throw BadRequestError for invalid role', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] });

      await expect(
        cabMeetingService.addAttendee(tenantSlug, 'meeting-1', 'user-2', 'invalid-role')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if user already attendee', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockRejectedValueOnce({ code: '23505' }); // unique constraint violation

      await expect(
        cabMeetingService.addAttendee(tenantSlug, 'meeting-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('removeAttendee', () => {
    it('should remove attendee', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await cabMeetingService.removeAttendee(tenantSlug, 'meeting-1', 'user-2');

      expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM tenant_test.cab_meeting_attendees');
    });

    it('should throw NotFoundError if attendee not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        cabMeetingService.removeAttendee(tenantSlug, 'meeting-1', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateAttendeeStatus', () => {
    it('should update attendee status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', attendance_status: 'accepted' }],
        });

      const result = await cabMeetingService.updateAttendeeStatus(
        tenantSlug,
        'meeting-1',
        'user-1',
        'accepted'
      );

      expect(result).toHaveProperty('attendance_status', 'accepted');
    });

    it('should update attendee status with notes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user-1', attendance_status: 'declined', notes: 'Conflict' }],
        });

      const result = await cabMeetingService.updateAttendeeStatus(
        tenantSlug,
        'meeting-1',
        'user-1',
        'declined',
        'Conflict'
      );

      expect(result).toHaveProperty('attendance_status', 'declined');
      expect(result).toHaveProperty('notes', 'Conflict');
    });

    it('should throw BadRequestError for invalid status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] });

      await expect(
        cabMeetingService.updateAttendeeStatus(tenantSlug, 'meeting-1', 'user-1', 'invalid-status')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if attendee not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        cabMeetingService.updateAttendeeStatus(tenantSlug, 'meeting-1', 'nonexistent', 'accepted')
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // CHANGES (AGENDA)
  // ==================
  describe('getChanges', () => {
    it('should get changes for meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [
            { change_id: 'change-1', change_number: 'CHG-001', sort_order: 1 },
            { change_id: 'change-2', change_number: 'CHG-002', sort_order: 2 },
          ],
        });

      const result = await cabMeetingService.getChanges(tenantSlug, 'meeting-1');

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[1][0]).toContain('ORDER BY mc.sort_order');
    });
  });

  describe('addChange', () => {
    it('should add change to agenda with auto sort order', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'change-1' }] }) // change exists
        .mockResolvedValueOnce({ rows: [{ next_order: 3 }] }) // next sort order
        .mockResolvedValueOnce({
          rows: [{ meeting_id: 'meeting-1', change_id: 'change-1', sort_order: 3 }],
        });

      const result = await cabMeetingService.addChange(tenantSlug, 'meeting-1', 'change-1');

      expect(result).toHaveProperty('sort_order', 3);
    });

    it('should add change with specified sort order', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'change-1' }] })
        .mockResolvedValueOnce({
          rows: [{ meeting_id: 'meeting-1', change_id: 'change-1', sort_order: 1 }],
        });

      const result = await cabMeetingService.addChange(tenantSlug, 'meeting-1', 'change-1', 15, 1);

      expect(result).toHaveProperty('sort_order', 1);
    });

    it('should throw NotFoundError if change does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [] }); // change not found

      await expect(
        cabMeetingService.addChange(tenantSlug, 'meeting-1', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError if change already on agenda', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'change-1' }] })
        .mockResolvedValueOnce({ rows: [{ next_order: 1 }] })
        .mockRejectedValueOnce({ code: '23505' }); // unique constraint

      await expect(
        cabMeetingService.addChange(tenantSlug, 'meeting-1', 'change-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('removeChange', () => {
    it('should remove change from agenda', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await cabMeetingService.removeChange(tenantSlug, 'meeting-1', 'change-1');

      expect(mockQuery.mock.calls[1][0]).toContain('DELETE FROM tenant_test.cab_meeting_changes');
    });

    it('should throw NotFoundError if change not on agenda', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        cabMeetingService.removeChange(tenantSlug, 'meeting-1', 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateChange', () => {
    it('should update change discussion notes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [{ change_id: 'change-1', discussion_notes: 'Discussion notes' }],
        });

      const result = await cabMeetingService.updateChange(tenantSlug, 'meeting-1', 'change-1', {
        discussionNotes: 'Discussion notes',
      });

      expect(result).toHaveProperty('discussion_notes', 'Discussion notes');
    });

    it('should update time allocated', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [{ change_id: 'change-1', time_allocated_minutes: 30 }],
        });

      const result = await cabMeetingService.updateChange(tenantSlug, 'meeting-1', 'change-1', {
        timeAllocatedMinutes: 30,
      });

      expect(result).toHaveProperty('time_allocated_minutes', 30);
    });

    it('should return existing if no updates provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({
          rows: [{ change_id: 'change-1', sort_order: 1 }],
        });

      const result = await cabMeetingService.updateChange(tenantSlug, 'meeting-1', 'change-1', {});

      expect(result).toHaveProperty('change_id', 'change-1');
    });

    it('should throw NotFoundError if change not on agenda', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        cabMeetingService.updateChange(tenantSlug, 'meeting-1', 'nonexistent', {
          discussionNotes: 'Notes',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ==================
  // MEETING ACTIONS
  // ==================
  describe('generateAgenda', () => {
    it('should generate agenda with changes', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'meeting-1', title: 'Weekly CAB', meeting_date: '2025-01-15T10:00:00Z' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // attendees
        .mockResolvedValueOnce({
          rows: [
            {
              sort_order: 1,
              change_number: 'CHG-001',
              change_title: 'Network Upgrade',
              change_type: 'normal',
              risk_level: 'medium',
              requester_name: 'John',
              time_allocated_minutes: 15,
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1 }); // save agenda

      const result = await cabMeetingService.generateAgenda(tenantSlug, 'meeting-1');

      expect(result).toContain('CAB MEETING AGENDA');
      expect(result).toContain('Weekly CAB');
      expect(result).toContain('CHG-001');
      expect(result).toContain('Network Upgrade');
    });

    it('should generate agenda with no changes', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 'meeting-1', title: 'Weekly CAB', meeting_date: '2025-01-15T10:00:00Z' }],
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // no changes
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await cabMeetingService.generateAgenda(tenantSlug, 'meeting-1');

      expect(result).toContain('No changes scheduled for review');
    });
  });

  describe('saveMinutes', () => {
    it('should save meeting minutes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', minutes: 'Meeting minutes...' }] });

      const result = await cabMeetingService.saveMinutes(
        tenantSlug,
        'meeting-1',
        'Meeting minutes...'
      );

      expect(result).toHaveProperty('minutes', 'Meeting minutes...');
    });
  });

  describe('recordDecision', () => {
    it('should record decision for change', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'link-1' }] }) // change on agenda
        .mockResolvedValueOnce({ rows: [{ decisions: [] }] }) // current decisions
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'meeting-1',
              decisions: [{ changeId: 'change-1', decision: 'approved', notes: 'Good to go' }],
            },
          ],
        });

      const result = await cabMeetingService.recordDecision(
        tenantSlug,
        'meeting-1',
        'change-1',
        'approved',
        'Good to go'
      );

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0]).toHaveProperty('decision', 'approved');
    });

    it('should replace existing decision for same change', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'link-1' }] })
        .mockResolvedValueOnce({
          rows: [{ decisions: [{ changeId: 'change-1', decision: 'pending', notes: null }] }],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'meeting-1', decisions: [{ changeId: 'change-1', decision: 'approved' }] },
          ],
        });

      const result = await cabMeetingService.recordDecision(
        tenantSlug,
        'meeting-1',
        'change-1',
        'approved'
      );

      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0].decision).toBe('approved');
    });

    it('should throw BadRequestError if change not on agenda', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [] }); // change not on agenda

      await expect(
        cabMeetingService.recordDecision(tenantSlug, 'meeting-1', 'change-1', 'approved')
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('addActionItem', () => {
    it('should add action item to meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ action_items: [] }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', action_items: [{ id: 'test-uuid-123' }] }] });

      const result = await cabMeetingService.addActionItem(tenantSlug, 'meeting-1', {
        description: 'Follow up on security review',
        assigneeId: 'user-1',
        dueDate: '2025-01-20',
      });

      expect(result.actionItem).toHaveProperty('id');
      expect(typeof result.actionItem.id).toBe('string');
      expect(result.actionItem).toHaveProperty('description', 'Follow up on security review');
      expect(result.actionItem).toHaveProperty('status', 'pending');
    });

    it('should add action item without optional fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ action_items: null }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1' }] });

      const result = await cabMeetingService.addActionItem(tenantSlug, 'meeting-1', {
        description: 'General action item',
      });

      expect(result.actionItem).toHaveProperty('description', 'General action item');
      expect(result.actionItem.assigneeId).toBeUndefined();
    });
  });

  // ==================
  // MEETING LIFECYCLE
  // ==================
  describe('startMeeting', () => {
    it('should start scheduled meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] });

      const result = await cabMeetingService.startMeeting(tenantSlug, 'meeting-1', 'user-1');

      expect(result).toHaveProperty('status', 'in_progress');
    });

    it('should throw BadRequestError if meeting not scheduled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] });

      await expect(
        cabMeetingService.startMeeting(tenantSlug, 'meeting-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('completeMeeting', () => {
    it('should complete in_progress meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'completed' }] });

      const result = await cabMeetingService.completeMeeting(tenantSlug, 'meeting-1', 'user-1');

      expect(result).toHaveProperty('status', 'completed');
    });

    it('should throw BadRequestError if meeting not in_progress', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] });

      await expect(
        cabMeetingService.completeMeeting(tenantSlug, 'meeting-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('cancelMeeting', () => {
    it('should cancel scheduled meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'scheduled' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'cancelled' }] });

      const result = await cabMeetingService.cancelMeeting(tenantSlug, 'meeting-1', 'user-1');

      expect(result).toHaveProperty('status', 'cancelled');
    });

    it('should cancel in_progress meeting', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'in_progress' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'cancelled' }] });

      const result = await cabMeetingService.cancelMeeting(tenantSlug, 'meeting-1', 'user-1');

      expect(result).toHaveProperty('status', 'cancelled');
    });

    it('should throw BadRequestError if meeting already completed', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'completed' }] });

      await expect(
        cabMeetingService.cancelMeeting(tenantSlug, 'meeting-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if meeting already cancelled', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'meeting-1', status: 'cancelled' }] });

      await expect(
        cabMeetingService.cancelMeeting(tenantSlug, 'meeting-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ==================
  // QUERIES
  // ==================
  describe('getUpcoming', () => {
    it('should get upcoming meetings with default 14 days', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'meeting-1', title: 'CAB 1', meeting_date: '2025-01-20' },
          { id: 'meeting-2', title: 'CAB 2', meeting_date: '2025-01-27' },
        ],
      });

      const result = await cabMeetingService.getUpcoming(tenantSlug);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][1]).toEqual([14]);
    });

    it('should get upcoming meetings with custom days', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await cabMeetingService.getUpcoming(tenantSlug, 7);

      expect(mockQuery.mock.calls[0][1]).toEqual([7]);
    });
  });

  describe('getPendingChanges', () => {
    it('should get changes pending CAB review', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'change-1', change_number: 'CHG-001', cab_required: true, status: 'submitted' },
          { id: 'change-2', change_number: 'CHG-002', cab_required: true, status: 'review' },
        ],
      });

      const result = await cabMeetingService.getPendingChanges(tenantSlug);

      expect(result).toHaveLength(2);
      expect(mockQuery.mock.calls[0][0]).toContain('cab_required = true');
      expect(mockQuery.mock.calls[0][0]).toContain("status IN ('submitted', 'review')");
    });
  });
});
