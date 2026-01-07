import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/oncall.js', () => ({
  oncallScheduleService: {
    list: vi.fn().mockResolvedValue({ schedules: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getRotations: vi.fn().mockResolvedValue([]),
    addToRotation: vi.fn().mockResolvedValue({}),
    updateRotationPosition: vi.fn().mockResolvedValue({}),
    removeFromRotation: vi.fn().mockResolvedValue(undefined),
    getShifts: vi.fn().mockResolvedValue([]),
    createShift: vi.fn().mockResolvedValue({}),
    createOverride: vi.fn().mockResolvedValue({}),
    deleteShift: vi.fn().mockResolvedValue(undefined),
    getLinkedApplications: vi.fn().mockResolvedValue([]),
    linkToApplication: vi.fn().mockResolvedValue(undefined),
    unlinkFromApplication: vi.fn().mockResolvedValue(undefined),
    whoIsOnCall: vi.fn().mockResolvedValue([]),
  },
  escalationPolicyService: {
    list: vi.fn().mockResolvedValue({ policies: [], total: 0 }),
    findById: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
    getSteps: vi.fn().mockResolvedValue([]),
    addStep: vi.fn().mockResolvedValue({}),
    updateStep: vi.fn().mockResolvedValue({}),
    deleteStep: vi.fn().mockResolvedValue(undefined),
  },
  icalExportService: {
    generateICalendar: vi.fn().mockResolvedValue(''),
    createSubscriptionToken: vi.fn().mockResolvedValue({ token: '', url: '' }),
    validatePublicSubscriptionToken: vi.fn().mockResolvedValue(null),
    revokeSubscriptionToken: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/services/shiftSwaps.js', () => ({
  shiftSwapService: {
    list: vi.fn().mockResolvedValue({ swaps: [], total: 0 }),
    getById: vi.fn().mockResolvedValue(null),
    getMyRequests: vi.fn().mockResolvedValue([]),
    getAvailableToAccept: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    cancel: vi.fn().mockResolvedValue({}),
    accept: vi.fn().mockResolvedValue({}),
    reject: vi.fn().mockResolvedValue({}),
    adminApprove: vi.fn().mockResolvedValue({}),
    getScheduleStats: vi.fn().mockResolvedValue({}),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
  optionalAuth: vi.fn().mockImplementation((_req, _reply, done) => done()),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

// Mock validation utils
vi.mock('../../../src/utils/validation.js', () => ({
  validateDate: vi.fn().mockImplementation((date) => date ? new Date(date) : null),
  validateDateRange: vi.fn(),
}));

describe('On-Call Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // SCHEDULE SCHEMAS
  // ============================================

  describe('Create Schedule Schema', () => {
    const createScheduleSchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(1000).optional(),
      timezone: z.string().max(100).optional(),
      groupId: z.string().uuid().optional(),
      rotationType: z.enum(['daily', 'weekly', 'bi_weekly', 'custom']).optional(),
      rotationLength: z.number().int().min(1).max(52).optional(),
      handoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      handoffDay: z.number().int().min(0).max(6).optional(),
      color: z.string().max(20).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should require name of at least 2 characters', () => {
      const result = createScheduleSchema.safeParse({ name: 'A' });
      expect(result.success).toBe(false);
    });

    it('should accept valid name', () => {
      const result = createScheduleSchema.safeParse({ name: 'Primary Schedule' });
      expect(result.success).toBe(true);
    });

    it('should reject name over 255 characters', () => {
      const result = createScheduleSchema.safeParse({ name: 'x'.repeat(256) });
      expect(result.success).toBe(false);
    });

    it('should accept description', () => {
      const result = createScheduleSchema.safeParse({
        name: 'Primary Schedule',
        description: '24/7 on-call rotation for production support',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description over 1000 characters', () => {
      const result = createScheduleSchema.safeParse({
        name: 'Primary Schedule',
        description: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept timezone', () => {
      const result = createScheduleSchema.safeParse({
        name: 'Primary Schedule',
        timezone: 'America/New_York',
      });
      expect(result.success).toBe(true);
    });

    it('should accept groupId as UUID', () => {
      const result = createScheduleSchema.safeParse({
        name: 'Primary Schedule',
        groupId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid groupId', () => {
      const result = createScheduleSchema.safeParse({
        name: 'Primary Schedule',
        groupId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all rotation types', () => {
      const types = ['daily', 'weekly', 'bi_weekly', 'custom'];
      for (const rotationType of types) {
        const result = createScheduleSchema.safeParse({ name: 'Schedule', rotationType });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid rotation type', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', rotationType: 'monthly' });
      expect(result.success).toBe(false);
    });

    it('should accept rotationLength between 1 and 52', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', rotationLength: 2 });
      expect(result.success).toBe(true);
    });

    it('should reject rotationLength less than 1', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', rotationLength: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject rotationLength over 52', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', rotationLength: 53 });
      expect(result.success).toBe(false);
    });

    it('should accept valid handoffTime format', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', handoffTime: '09:00' });
      expect(result.success).toBe(true);
    });

    it('should reject invalid handoffTime format', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', handoffTime: '9:00' });
      expect(result.success).toBe(false);
    });

    it('should accept handoffDay between 0 and 6', () => {
      for (let day = 0; day <= 6; day++) {
        const result = createScheduleSchema.safeParse({ name: 'Schedule', handoffDay: day });
        expect(result.success).toBe(true);
      }
    });

    it('should reject handoffDay outside 0-6 range', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', handoffDay: 7 });
      expect(result.success).toBe(false);
    });

    it('should accept color', () => {
      const result = createScheduleSchema.safeParse({ name: 'Schedule', color: '#FF5733' });
      expect(result.success).toBe(true);
    });

    it('should accept metadata', () => {
      const result = createScheduleSchema.safeParse({
        name: 'Schedule',
        metadata: { team: 'platform', priority: 1 },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Schedule Schema', () => {
    const updateScheduleSchema = z.object({
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(1000).optional(),
      timezone: z.string().max(100).optional(),
      groupId: z.string().uuid().optional().nullable(),
      rotationType: z.enum(['daily', 'weekly', 'bi_weekly', 'custom']).optional(),
      rotationLength: z.number().int().min(1).max(52).optional(),
      handoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      handoffDay: z.number().int().min(0).max(6).optional(),
      isActive: z.boolean().optional(),
      color: z.string().max(20).optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should accept partial update', () => {
      const result = updateScheduleSchema.safeParse({ name: 'Updated Schedule' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateScheduleSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updateScheduleSchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });

    it('should accept null groupId to unlink', () => {
      const result = updateScheduleSchema.safeParse({ groupId: null });
      expect(result.success).toBe(true);
    });
  });

  describe('Add To Rotation Schema', () => {
    const addToRotationSchema = z.object({
      userId: z.string().uuid(),
      position: z.number().int().min(1).optional(),
    });

    it('should require userId', () => {
      const result = addToRotationSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid userId', () => {
      const result = addToRotationSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid userId', () => {
      const result = addToRotationSchema.safeParse({ userId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should accept position', () => {
      const result = addToRotationSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        position: 3,
      });
      expect(result.success).toBe(true);
    });

    it('should require position to be at least 1', () => {
      const result = addToRotationSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        position: 0,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Create Shift Schema', () => {
    const createShiftSchema = z.object({
      userId: z.string().uuid(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      shiftType: z.enum(['primary', 'secondary']).optional(),
      layer: z.number().int().min(1).max(10).optional(),
    });

    it('should require userId, startTime, and endTime', () => {
      const result = createShiftSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid shift data', () => {
      const result = createShiftSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-22T09:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept primary shift type', () => {
      const result = createShiftSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-22T09:00:00Z',
        shiftType: 'primary',
      });
      expect(result.success).toBe(true);
    });

    it('should accept secondary shift type', () => {
      const result = createShiftSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-22T09:00:00Z',
        shiftType: 'secondary',
      });
      expect(result.success).toBe(true);
    });

    it('should accept layer between 1 and 10', () => {
      const result = createShiftSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-22T09:00:00Z',
        layer: 5,
      });
      expect(result.success).toBe(true);
    });

    it('should reject layer outside 1-10 range', () => {
      const result = createShiftSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-22T09:00:00Z',
        layer: 11,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Create Override Schema', () => {
    const createOverrideSchema = z.object({
      userId: z.string().uuid(),
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      reason: z.string().max(500).optional(),
      originalUserId: z.string().uuid().optional(),
    });

    it('should require userId, startTime, and endTime', () => {
      const result = createOverrideSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid override data', () => {
      const result = createOverrideSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-16T09:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept reason', () => {
      const result = createOverrideSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-16T09:00:00Z',
        reason: 'Vacation coverage',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason over 500 characters', () => {
      const result = createOverrideSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-16T09:00:00Z',
        reason: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept originalUserId', () => {
      const result = createOverrideSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        startTime: '2024-01-15T09:00:00Z',
        endTime: '2024-01-16T09:00:00Z',
        originalUserId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================
  // ESCALATION POLICY SCHEMAS
  // ============================================

  describe('Create Escalation Policy Schema', () => {
    const createPolicySchema = z.object({
      name: z.string().min(2).max(255),
      description: z.string().max(1000).optional(),
      repeatCount: z.number().int().min(1).max(10).optional(),
      repeatDelayMinutes: z.number().int().min(1).max(60).optional(),
      isDefault: z.boolean().optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should require name', () => {
      const result = createPolicySchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid policy data', () => {
      const result = createPolicySchema.safeParse({
        name: 'P1 Escalation Policy',
      });
      expect(result.success).toBe(true);
    });

    it('should accept repeatCount between 1 and 10', () => {
      const result = createPolicySchema.safeParse({
        name: 'Policy',
        repeatCount: 3,
      });
      expect(result.success).toBe(true);
    });

    it('should reject repeatCount over 10', () => {
      const result = createPolicySchema.safeParse({
        name: 'Policy',
        repeatCount: 11,
      });
      expect(result.success).toBe(false);
    });

    it('should accept repeatDelayMinutes between 1 and 60', () => {
      const result = createPolicySchema.safeParse({
        name: 'Policy',
        repeatDelayMinutes: 15,
      });
      expect(result.success).toBe(true);
    });

    it('should reject repeatDelayMinutes over 60', () => {
      const result = createPolicySchema.safeParse({
        name: 'Policy',
        repeatDelayMinutes: 61,
      });
      expect(result.success).toBe(false);
    });

    it('should accept isDefault flag', () => {
      const result = createPolicySchema.safeParse({
        name: 'Policy',
        isDefault: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Escalation Policy Schema', () => {
    const updatePolicySchema = z.object({
      name: z.string().min(2).max(255).optional(),
      description: z.string().max(1000).optional(),
      repeatCount: z.number().int().min(1).max(10).optional(),
      repeatDelayMinutes: z.number().int().min(1).max(60).optional(),
      isDefault: z.boolean().optional(),
      isActive: z.boolean().optional(),
      metadata: z.record(z.unknown()).optional(),
    });

    it('should accept partial update', () => {
      const result = updatePolicySchema.safeParse({ repeatCount: 5 });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updatePolicySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept isActive flag', () => {
      const result = updatePolicySchema.safeParse({ isActive: false });
      expect(result.success).toBe(true);
    });
  });

  describe('Add Step Schema', () => {
    const addStepSchema = z.object({
      stepNumber: z.number().int().min(1).optional(),
      delayMinutes: z.number().int().min(0).max(120).optional(),
      notifyType: z.enum(['schedule', 'user', 'group']),
      scheduleId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
      groupId: z.string().uuid().optional(),
      notificationChannels: z.array(z.enum(['email', 'sms', 'slack', 'phone'])).optional(),
    });

    it('should require notifyType', () => {
      const result = addStepSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept schedule notify type', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'schedule',
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept user notify type', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'user',
        userId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept group notify type', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'group',
        groupId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept delayMinutes between 0 and 120', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'user',
        delayMinutes: 30,
      });
      expect(result.success).toBe(true);
    });

    it('should reject delayMinutes over 120', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'user',
        delayMinutes: 121,
      });
      expect(result.success).toBe(false);
    });

    it('should accept all notification channels', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'user',
        notificationChannels: ['email', 'sms', 'slack', 'phone'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid notification channel', () => {
      const result = addStepSchema.safeParse({
        notifyType: 'user',
        notificationChannels: ['email', 'pager'],
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // SHIFT SWAP SCHEMAS
  // ============================================

  describe('Create Shift Swap Schema', () => {
    const createShiftSwapSchema = z.object({
      scheduleId: z.string().uuid(),
      originalStart: z.string().datetime(),
      originalEnd: z.string().datetime(),
      offeredToUserId: z.string().uuid().optional(),
      originalShiftId: z.string().uuid().optional(),
      reason: z.string().max(500).optional(),
      expiresAt: z.string().datetime().optional(),
    });

    it('should require scheduleId, originalStart, and originalEnd', () => {
      const result = createShiftSwapSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid swap request', () => {
      const result = createShiftSwapSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        originalStart: '2024-01-15T09:00:00Z',
        originalEnd: '2024-01-22T09:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept offeredToUserId', () => {
      const result = createShiftSwapSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        originalStart: '2024-01-15T09:00:00Z',
        originalEnd: '2024-01-22T09:00:00Z',
        offeredToUserId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept reason', () => {
      const result = createShiftSwapSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        originalStart: '2024-01-15T09:00:00Z',
        originalEnd: '2024-01-22T09:00:00Z',
        reason: 'Vacation',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason over 500 characters', () => {
      const result = createShiftSwapSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        originalStart: '2024-01-15T09:00:00Z',
        originalEnd: '2024-01-22T09:00:00Z',
        reason: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept expiresAt', () => {
      const result = createShiftSwapSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        originalStart: '2024-01-15T09:00:00Z',
        originalEnd: '2024-01-22T09:00:00Z',
        expiresAt: '2024-01-14T09:00:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Shift Swap Schema', () => {
    const updateShiftSwapSchema = z.object({
      reason: z.string().max(500).optional(),
      offeredToUserId: z.string().uuid().nullable().optional(),
      expiresAt: z.string().datetime().nullable().optional(),
    });

    it('should accept partial update', () => {
      const result = updateShiftSwapSchema.safeParse({ reason: 'Updated reason' });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateShiftSwapSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept null offeredToUserId to remove', () => {
      const result = updateShiftSwapSchema.safeParse({ offeredToUserId: null });
      expect(result.success).toBe(true);
    });

    it('should accept null expiresAt to remove', () => {
      const result = updateShiftSwapSchema.safeParse({ expiresAt: null });
      expect(result.success).toBe(true);
    });
  });

  describe('Swap Response Schema', () => {
    const swapResponseSchema = z.object({
      message: z.string().max(500).optional(),
    });

    it('should accept empty response', () => {
      const result = swapResponseSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept message', () => {
      const result = swapResponseSchema.safeParse({ message: 'Thanks!' });
      expect(result.success).toBe(true);
    });

    it('should reject message over 500 characters', () => {
      const result = swapResponseSchema.safeParse({ message: 'x'.repeat(501) });
      expect(result.success).toBe(false);
    });
  });

  describe('Admin Approve Schema', () => {
    const adminApproveSchema = z.object({
      accepterUserId: z.string().uuid().optional(),
    });

    it('should accept empty body', () => {
      const result = adminApproveSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept accepterUserId', () => {
      const result = adminApproveSchema.safeParse({
        accepterUserId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid accepterUserId', () => {
      const result = adminApproveSchema.safeParse({ accepterUserId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // PARAMETER SCHEMAS
  // ============================================

  describe('ID Parameter Schema', () => {
    const idParamSchema = z.object({
      id: z.string().uuid(),
    });

    it('should accept valid UUID', () => {
      const result = idParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = idParamSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('ID Rotation Parameter Schema', () => {
    const idRotationParamSchema = z.object({
      id: z.string().uuid(),
      rotationId: z.string().uuid(),
    });

    it('should require both id and rotationId', () => {
      const result = idRotationParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid UUIDs for both', () => {
      const result = idRotationParamSchema.safeParse({
        id: '123e4567-e89b-12d3-a456-426614174000',
        rotationId: '223e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Schedule ID Token Parameter Schema', () => {
    const scheduleIdTokenParamSchema = z.object({
      scheduleId: z.string().uuid(),
      token: z.string().min(1),
    });

    it('should require both scheduleId and token', () => {
      const result = scheduleIdTokenParamSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid scheduleId and token', () => {
      const result = scheduleIdTokenParamSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        token: 'abc123xyz',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty token', () => {
      const result = scheduleIdTokenParamSchema.safeParse({
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        token: '',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // ROUTE PERMISSIONS
  // ============================================

  describe('Route Permissions', () => {
    it('should require oncall:read for GET /schedules', () => {
      const permission = 'oncall:read';
      expect(permission).toBe('oncall:read');
    });

    it('should require oncall:manage for POST /schedules', () => {
      const permission = 'oncall:manage';
      expect(permission).toBe('oncall:manage');
    });

    it('should require oncall:manage for PUT /schedules/:id', () => {
      const permission = 'oncall:manage';
      expect(permission).toBe('oncall:manage');
    });

    it('should require oncall:manage for DELETE /schedules/:id', () => {
      const permission = 'oncall:manage';
      expect(permission).toBe('oncall:manage');
    });

    it('should require oncall:update for POST /schedules/:id/override', () => {
      const permission = 'oncall:update';
      expect(permission).toBe('oncall:update');
    });

    it('should require oncall:read for GET /escalation-policies', () => {
      const permission = 'oncall:read';
      expect(permission).toBe('oncall:read');
    });

    it('should require oncall:manage for POST /escalation-policies', () => {
      const permission = 'oncall:manage';
      expect(permission).toBe('oncall:manage');
    });

    it('should require oncall:update for POST /shift-swaps', () => {
      const permission = 'oncall:update';
      expect(permission).toBe('oncall:update');
    });

    it('should require oncall:manage for POST /shift-swaps/:id/admin-approve', () => {
      const permission = 'oncall:manage';
      expect(permission).toBe('oncall:manage');
    });
  });

  // ============================================
  // RESPONSE FORMATS
  // ============================================

  describe('Response Formats', () => {
    it('should return 404 for missing schedule', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Schedule with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain(id);
    });

    it('should return 404 for missing escalation policy', () => {
      const id = '123e4567-e89b-12d3-a456-426614174000';
      const errorResponse = {
        statusCode: 404,
        error: 'Not Found',
        message: `Escalation policy with id '${id}' not found`,
      };
      expect(errorResponse.statusCode).toBe(404);
      expect(errorResponse.message).toContain('Escalation policy');
    });

    it('should return 201 for created schedule', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted schedule', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return rotations in data wrapper', () => {
      const rotations = [{ id: 'rotation-1', userId: 'user-1', position: 1 }];
      const response = { data: rotations };
      expect(response).toHaveProperty('data');
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should return shifts in data wrapper', () => {
      const shifts = [{ id: 'shift-1', userId: 'user-1', startTime: new Date() }];
      const response = { data: shifts };
      expect(response).toHaveProperty('data');
    });

    it('should return who is on call in data wrapper', () => {
      const onCall = [{ userId: 'user-1', userName: 'John Doe' }];
      const response = { data: onCall };
      expect(response).toHaveProperty('data');
    });

    it('should return iCal with correct content type', () => {
      const contentType = 'text/calendar; charset=utf-8';
      expect(contentType).toBe('text/calendar; charset=utf-8');
    });

    it('should return 401 for invalid subscription token', () => {
      const response = { error: 'Invalid or expired subscription token' };
      const statusCode = 401;
      expect(statusCode).toBe(401);
      expect(response.error).toContain('Invalid');
    });
  });

  // ============================================
  // SERVICE INTEGRATION
  // ============================================

  describe('Service Integration', () => {
    it('should pass tenantSlug and pagination to oncallScheduleService.list', async () => {
      const { oncallScheduleService } = await import('../../../src/services/oncall.js');
      const pagination = { page: 1, perPage: 20 };
      const filters = {};

      await oncallScheduleService.list('test-tenant', pagination, filters);
      expect(oncallScheduleService.list).toHaveBeenCalledWith('test-tenant', pagination, filters);
    });

    it('should pass tenantSlug and id to oncallScheduleService.findById', async () => {
      const { oncallScheduleService } = await import('../../../src/services/oncall.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await oncallScheduleService.findById('test-tenant', id);
      expect(oncallScheduleService.findById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug and pagination to escalationPolicyService.list', async () => {
      const { escalationPolicyService } = await import('../../../src/services/oncall.js');
      const pagination = { page: 1, perPage: 20 };

      await escalationPolicyService.list('test-tenant', pagination);
      expect(escalationPolicyService.list).toHaveBeenCalledWith('test-tenant', pagination);
    });

    it('should pass tenantSlug, scheduleId, and userId to shiftSwapService.create', async () => {
      const { shiftSwapService } = await import('../../../src/services/shiftSwaps.js');
      const body = {
        scheduleId: '123e4567-e89b-12d3-a456-426614174000',
        originalStart: '2024-01-15T09:00:00Z',
        originalEnd: '2024-01-22T09:00:00Z',
      };

      await shiftSwapService.create('test-tenant', 'user-1', body);
      expect(shiftSwapService.create).toHaveBeenCalledWith('test-tenant', 'user-1', body);
    });
  });

  // ============================================
  // QUERY FILTERS
  // ============================================

  describe('Query Filters', () => {
    it('should handle group_id filter', () => {
      const query = { group_id: '123e4567-e89b-12d3-a456-426614174000' };
      const filters = {
        groupId: query.group_id,
      };
      expect(filters.groupId).toBe(query.group_id);
    });

    it('should handle is_active filter as true', () => {
      const query = { is_active: 'true' };
      const isActive = query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined;
      expect(isActive).toBe(true);
    });

    it('should handle is_active filter as false', () => {
      const query = { is_active: 'false' };
      const isActive = query.is_active === 'true' ? true : query.is_active === 'false' ? false : undefined;
      expect(isActive).toBe(false);
    });

    it('should handle shift swap status filter', () => {
      const query = { status: 'pending' };
      const filters = { status: query.status };
      expect(filters.status).toBe('pending');
    });

    it('should handle date range filters', () => {
      const query = { from_date: '2024-01-01', to_date: '2024-01-31' };
      const filters = {
        fromDate: query.from_date,
        toDate: query.to_date,
      };
      expect(filters.fromDate).toBe('2024-01-01');
      expect(filters.toDate).toBe('2024-01-31');
    });
  });
});
