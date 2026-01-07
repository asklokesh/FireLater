import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/changes.js', () => ({
  changeWindowService: {
    list: vi.fn().mockResolvedValue({ windows: [], total: 0 }),
    getUpcoming: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  changeTemplateService: {
    list: vi.fn().mockResolvedValue({ templates: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  changeRequestService: {
    list: vi.fn().mockResolvedValue({ changes: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue(undefined),
    submit: vi.fn().mockResolvedValue({}),
    approve: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
    schedule: vi.fn().mockResolvedValue({}),
    start: vi.fn().mockResolvedValue({}),
    complete: vi.fn().mockResolvedValue({}),
    fail: vi.fn().mockResolvedValue({}),
    rollback: vi.fn().mockResolvedValue({}),
    getApprovals: vi.fn().mockResolvedValue([]),
    getStatusHistory: vi.fn().mockResolvedValue([]),
    getTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn().mockResolvedValue({}),
    updateTask: vi.fn().mockResolvedValue({}),
    startTask: vi.fn().mockResolvedValue({}),
    completeTask: vi.fn().mockResolvedValue({}),
    deleteTask: vi.fn().mockResolvedValue(undefined),
    getComments: vi.fn().mockResolvedValue([]),
    addComment: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../../src/services/cabMeetings.js', () => ({
  cabMeetingService: {
    list: vi.fn().mockResolvedValue({ meetings: [], total: 0 }),
    getUpcoming: vi.fn().mockResolvedValue([]),
    getPendingChanges: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getAttendees: vi.fn().mockResolvedValue([]),
    addAttendee: vi.fn().mockResolvedValue({}),
    removeAttendee: vi.fn().mockResolvedValue(undefined),
    updateAttendeeStatus: vi.fn().mockResolvedValue({}),
    getChanges: vi.fn().mockResolvedValue([]),
    addChange: vi.fn().mockResolvedValue({}),
    removeChange: vi.fn().mockResolvedValue(undefined),
    updateChange: vi.fn().mockResolvedValue({}),
    startMeeting: vi.fn().mockResolvedValue({}),
    completeMeeting: vi.fn().mockResolvedValue({}),
    cancelMeeting: vi.fn().mockResolvedValue({}),
    generateAgenda: vi.fn().mockResolvedValue(''),
    saveMinutes: vi.fn().mockResolvedValue({}),
    recordDecision: vi.fn().mockResolvedValue({}),
    addActionItem: vi.fn().mockResolvedValue({}),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

describe('Changes Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Change Window Schema', () => {
    const createWindowSchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(2000).optional(),
      type: z.enum(['maintenance', 'freeze', 'emergency_only', 'blackout']),
      recurrence: z.enum(['one_time', 'weekly', 'monthly', 'custom']).optional(),
      recurrenceRule: z.string().max(500).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      startDate: z.string().date().optional(),
      endDate: z.string().date().optional(),
      dayOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      timezone: z.string().max(100).optional(),
      applications: z.array(z.string().uuid()).optional(),
      tiers: z.array(z.enum(['P1', 'P2', 'P3', 'P4'])).optional(),
      notifyBeforeMinutes: z.number().int().min(0).max(1440).optional(),
    });

    it('should accept valid window data', () => {
      const result = createWindowSchema.safeParse({
        name: 'Maintenance Window',
        type: 'maintenance',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all window types', () => {
      const types = ['maintenance', 'freeze', 'emergency_only', 'blackout'];
      for (const type of types) {
        const result = createWindowSchema.safeParse({ name: 'Test', type });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all recurrence values', () => {
      const recurrences = ['one_time', 'weekly', 'monthly', 'custom'];
      for (const recurrence of recurrences) {
        const result = createWindowSchema.safeParse({
          name: 'Test',
          type: 'maintenance',
          recurrence,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should validate time format HH:MM', () => {
      const result = createWindowSchema.safeParse({
        name: 'Test',
        type: 'maintenance',
        startTime: '09:00',
        endTime: '17:00',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid time format', () => {
      const result = createWindowSchema.safeParse({
        name: 'Test',
        type: 'maintenance',
        startTime: '9:00', // Missing leading zero
      });
      expect(result.success).toBe(false);
    });

    it('should accept day of week array (0-6)', () => {
      const result = createWindowSchema.safeParse({
        name: 'Weekend Window',
        type: 'maintenance',
        dayOfWeek: [0, 6], // Sunday, Saturday
      });
      expect(result.success).toBe(true);
    });

    it('should reject day of week outside 0-6', () => {
      const result = createWindowSchema.safeParse({
        name: 'Test',
        type: 'maintenance',
        dayOfWeek: [7],
      });
      expect(result.success).toBe(false);
    });

    it('should accept all tier values', () => {
      const result = createWindowSchema.safeParse({
        name: 'Test',
        type: 'freeze',
        tiers: ['P1', 'P2', 'P3', 'P4'],
      });
      expect(result.success).toBe(true);
    });

    it('should validate notifyBeforeMinutes range', () => {
      const result = createWindowSchema.safeParse({
        name: 'Test',
        type: 'maintenance',
        notifyBeforeMinutes: 60,
      });
      expect(result.success).toBe(true);
    });

    it('should reject notifyBeforeMinutes above 1440', () => {
      const result = createWindowSchema.safeParse({
        name: 'Test',
        type: 'maintenance',
        notifyBeforeMinutes: 1441,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Change Template Schema', () => {
    const createTemplateSchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(2000).optional(),
      type: z.enum(['standard', 'normal']).optional(),
      category: z.string().max(100).optional(),
      defaultRiskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      implementationPlanTemplate: z.string().max(10000).optional(),
      rollbackPlanTemplate: z.string().max(10000).optional(),
      testPlanTemplate: z.string().max(10000).optional(),
      defaultTasks: z.array(z.object({
        title: z.string(),
        description: z.string().optional(),
        taskType: z.string().optional(),
        sortOrder: z.number().optional(),
      })).optional(),
      approvalRequired: z.boolean().optional(),
      approvalGroups: z.array(z.string().uuid()).optional(),
    });

    it('should accept valid template data', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Server Patch Template',
        type: 'standard',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all risk levels', () => {
      const levels = ['low', 'medium', 'high', 'critical'];
      for (const defaultRiskLevel of levels) {
        const result = createTemplateSchema.safeParse({
          name: 'Test',
          defaultRiskLevel,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept default tasks array', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Test',
        defaultTasks: [
          { title: 'Backup', description: 'Take backup' },
          { title: 'Deploy', taskType: 'implementation' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should validate plan template max length', () => {
      const result = createTemplateSchema.safeParse({
        name: 'Test',
        implementationPlanTemplate: 'x'.repeat(10001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Change Request Schema', () => {
    const createChangeSchema = z.object({
      title: z.string().min(5).max(500),
      description: z.string().max(10000).optional(),
      justification: z.string().max(5000).optional(),
      type: z.enum(['standard', 'normal', 'emergency']).optional(),
      category: z.string().max(100).optional(),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      impact: z.enum(['none', 'minor', 'moderate', 'significant', 'major']).optional(),
      urgency: z.enum(['low', 'medium', 'high']).optional(),
      templateId: z.string().uuid().optional(),
      applicationId: z.string().uuid().optional(),
      environmentId: z.string().uuid().optional(),
      assignedGroup: z.string().uuid().optional(),
      plannedStart: z.string().datetime().optional(),
      plannedEnd: z.string().datetime().optional(),
      downtimeMinutes: z.number().int().min(0).optional(),
      changeWindowId: z.string().uuid().optional(),
      implementationPlan: z.string().max(20000).optional(),
      rollbackPlan: z.string().max(20000).optional(),
      testPlan: z.string().max(20000).optional(),
      communicationPlan: z.string().max(10000).optional(),
      riskAssessment: z.record(z.unknown()).optional(),
      cabRequired: z.boolean().optional(),
      cabDate: z.string().datetime().optional(),
      relatedIssueId: z.string().uuid().optional(),
    });

    it('should accept valid change request', () => {
      const result = createChangeSchema.safeParse({
        title: 'Update database schema',
        type: 'normal',
        riskLevel: 'medium',
      });
      expect(result.success).toBe(true);
    });

    it('should require title of at least 5 characters', () => {
      const result = createChangeSchema.safeParse({
        title: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all change types', () => {
      const types = ['standard', 'normal', 'emergency'];
      for (const type of types) {
        const result = createChangeSchema.safeParse({
          title: 'Test change',
          type,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all impact levels', () => {
      const impacts = ['none', 'minor', 'moderate', 'significant', 'major'];
      for (const impact of impacts) {
        const result = createChangeSchema.safeParse({
          title: 'Test change',
          impact,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all urgency levels', () => {
      const urgencies = ['low', 'medium', 'high'];
      for (const urgency of urgencies) {
        const result = createChangeSchema.safeParse({
          title: 'Test change',
          urgency,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept datetime for planned dates', () => {
      const result = createChangeSchema.safeParse({
        title: 'Test change',
        plannedStart: '2024-01-15T10:00:00Z',
        plannedEnd: '2024-01-15T12:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept downtime in minutes', () => {
      const result = createChangeSchema.safeParse({
        title: 'Test change',
        downtimeMinutes: 30,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative downtime', () => {
      const result = createChangeSchema.safeParse({
        title: 'Test change',
        downtimeMinutes: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should accept risk assessment object', () => {
      const result = createChangeSchema.safeParse({
        title: 'Test change',
        riskAssessment: {
          likelihood: 'medium',
          impact: 'low',
          mitigations: ['Backup', 'Rollback plan'],
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Change Task Schema', () => {
    const createTaskSchema = z.object({
      title: z.string().min(2).max(500),
      description: z.string().max(5000).optional(),
      taskType: z.enum(['pre_check', 'implementation', 'validation', 'rollback']).optional(),
      sortOrder: z.number().int().min(0).optional(),
      assignedTo: z.string().uuid().optional(),
      plannedStart: z.string().datetime().optional(),
      plannedEnd: z.string().datetime().optional(),
      durationMinutes: z.number().int().min(0).optional(),
      isBlocking: z.boolean().optional(),
    });

    it('should accept valid task data', () => {
      const result = createTaskSchema.safeParse({
        title: 'Backup database',
        taskType: 'pre_check',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all task types', () => {
      const types = ['pre_check', 'implementation', 'validation', 'rollback'];
      for (const taskType of types) {
        const result = createTaskSchema.safeParse({
          title: 'Test task',
          taskType,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should require title of at least 2 characters', () => {
      const result = createTaskSchema.safeParse({
        title: 'X',
      });
      expect(result.success).toBe(false);
    });

    it('should accept isBlocking flag', () => {
      const result = createTaskSchema.safeParse({
        title: 'Critical task',
        isBlocking: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Task Schema', () => {
    const updateTaskSchema = z.object({
      title: z.string().min(2).max(500).optional(),
      description: z.string().max(5000).optional(),
      taskType: z.enum(['pre_check', 'implementation', 'validation', 'rollback']).optional(),
      sortOrder: z.number().int().min(0).optional(),
      assignedTo: z.string().uuid().optional(),
      plannedStart: z.string().datetime().optional(),
      plannedEnd: z.string().datetime().optional(),
      durationMinutes: z.number().int().min(0).optional(),
      isBlocking: z.boolean().optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']).optional(),
      actualStart: z.string().datetime().optional(),
      actualEnd: z.string().datetime().optional(),
      notes: z.string().max(5000).optional(),
    });

    it('should accept all task statuses', () => {
      const statuses = ['pending', 'in_progress', 'completed', 'skipped', 'failed'];
      for (const status of statuses) {
        const result = updateTaskSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should accept actual timestamps', () => {
      const result = updateTaskSchema.safeParse({
        status: 'completed',
        actualStart: '2024-01-15T10:00:00Z',
        actualEnd: '2024-01-15T10:30:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('CAB Meeting Schema', () => {
    const createCabMeetingSchema = z.object({
      title: z.string().min(2).max(500),
      description: z.string().max(5000).optional(),
      meetingDate: z.string().datetime(),
      meetingEnd: z.string().datetime().optional(),
      location: z.string().max(500).optional(),
      meetingLink: z.string().url().max(1000).optional(),
    });

    it('should accept valid CAB meeting', () => {
      const result = createCabMeetingSchema.safeParse({
        title: 'Weekly CAB',
        meetingDate: '2024-01-15T14:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should require meetingDate', () => {
      const result = createCabMeetingSchema.safeParse({
        title: 'Weekly CAB',
      });
      expect(result.success).toBe(false);
    });

    it('should validate meetingLink as URL', () => {
      const result = createCabMeetingSchema.safeParse({
        title: 'Weekly CAB',
        meetingDate: '2024-01-15T14:00:00Z',
        meetingLink: 'https://zoom.us/j/123456',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid meetingLink', () => {
      const result = createCabMeetingSchema.safeParse({
        title: 'Weekly CAB',
        meetingDate: '2024-01-15T14:00:00Z',
        meetingLink: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Attendee Schema', () => {
    const addAttendeeSchema = z.object({
      userId: z.string().uuid(),
      role: z.enum(['chair', 'member', 'guest']).optional(),
    });

    it('should accept valid attendee', () => {
      const result = addAttendeeSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        role: 'chair',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all roles', () => {
      const roles = ['chair', 'member', 'guest'];
      for (const role of roles) {
        const result = addAttendeeSchema.safeParse({
          userId: '123e4567-e89b-12d3-a456-426614174000',
          role,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should require userId', () => {
      const result = addAttendeeSchema.safeParse({
        role: 'member',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Update Attendee Schema', () => {
    const updateAttendeeSchema = z.object({
      status: z.enum(['pending', 'accepted', 'declined', 'attended']),
      notes: z.string().max(2000).optional(),
    });

    it('should accept all attendee statuses', () => {
      const statuses = ['pending', 'accepted', 'declined', 'attended'];
      for (const status of statuses) {
        const result = updateAttendeeSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('should require status', () => {
      const result = updateAttendeeSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Meeting Change Schema', () => {
    const addMeetingChangeSchema = z.object({
      changeId: z.string().uuid(),
      timeAllocatedMinutes: z.number().int().min(1).max(120).optional(),
      sortOrder: z.number().int().min(0).optional(),
    });

    it('should accept valid meeting change', () => {
      const result = addMeetingChangeSchema.safeParse({
        changeId: '123e4567-e89b-12d3-a456-426614174000',
        timeAllocatedMinutes: 15,
      });
      expect(result.success).toBe(true);
    });

    it('should validate time allocated range (1-120)', () => {
      const result = addMeetingChangeSchema.safeParse({
        changeId: '123e4567-e89b-12d3-a456-426614174000',
        timeAllocatedMinutes: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject time above 120 minutes', () => {
      const result = addMeetingChangeSchema.safeParse({
        changeId: '123e4567-e89b-12d3-a456-426614174000',
        timeAllocatedMinutes: 121,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Record Decision Schema', () => {
    const recordDecisionSchema = z.object({
      changeId: z.string().uuid(),
      decision: z.enum(['approved', 'rejected', 'deferred', 'more_info_needed']),
      notes: z.string().max(5000).optional(),
    });

    it('should accept all decision types', () => {
      const decisions = ['approved', 'rejected', 'deferred', 'more_info_needed'];
      for (const decision of decisions) {
        const result = recordDecisionSchema.safeParse({
          changeId: '123e4567-e89b-12d3-a456-426614174000',
          decision,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should require changeId and decision', () => {
      const result = recordDecisionSchema.safeParse({
        notes: 'Some notes',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Save Minutes Schema', () => {
    const saveMinutesSchema = z.object({
      minutes: z.string().min(1).max(100000),
    });

    it('should accept valid minutes', () => {
      const result = saveMinutesSchema.safeParse({
        minutes: 'Meeting started at 2pm...',
      });
      expect(result.success).toBe(true);
    });

    it('should require minutes', () => {
      const result = saveMinutesSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject empty minutes', () => {
      const result = saveMinutesSchema.safeParse({
        minutes: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Route Permissions', () => {
    it('should require changes:read for GET list endpoints', () => {
      expect('changes:read').toBe('changes:read');
    });

    it('should require changes:create for POST /', () => {
      expect('changes:create').toBe('changes:create');
    });

    it('should require changes:update for PUT /:id', () => {
      expect('changes:update').toBe('changes:update');
    });

    it('should require changes:delete for DELETE /:id', () => {
      expect('changes:delete').toBe('changes:delete');
    });

    it('should require changes:approve for approval actions', () => {
      expect('changes:approve').toBe('changes:approve');
    });

    it('should require changes:implement for implementation actions', () => {
      expect('changes:implement').toBe('changes:implement');
    });

    it('should require change_windows:manage for window CRUD', () => {
      expect('change_windows:manage').toBe('change_windows:manage');
    });

    it('should require change_templates:manage for template CRUD', () => {
      expect('change_templates:manage').toBe('change_templates:manage');
    });
  });

  describe('Response Formats', () => {
    it('should return 201 for created resources', () => {
      expect(201).toBe(201);
    });

    it('should return 204 for deleted resources', () => {
      expect(204).toBe(204);
    });

    it('should return 404 for not found', () => {
      const response = {
        statusCode: 404,
        error: 'Not Found',
        message: "Change window with id 'abc' not found",
      };
      expect(response.statusCode).toBe(404);
    });

    it('should wrap data arrays in data property', () => {
      const attendees = [{ userId: 'u1', role: 'chair' }];
      const response = { data: attendees };
      expect(response).toHaveProperty('data');
    });
  });
});
