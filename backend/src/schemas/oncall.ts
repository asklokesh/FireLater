import { z } from 'zod';

export const createScheduleSchema = z.object({
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

export const updateScheduleSchema = z.object({
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

export const addToRotationSchema = z.object({
  userId: z.string().uuid(),
  position: z.number().int().min(1).optional(),
});

export const createShiftSchema = z.object({
  userId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  shiftType: z.enum(['primary', 'secondary']).optional(),
  layer: z.number().int().min(1).max(10).optional(),
});

export const createOverrideSchema = z.object({
  userId: z.string().uuid(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  reason: z.string().max(500).optional(),
  originalUserId: z.string().uuid().optional(),
});

export const createPolicySchema = z.object({
  name: z.string().min(2).max(255),
  description: z.string().max(1000).optional(),
  repeatCount: z.number().int().min(1).max(10).optional(),
  repeatDelayMinutes: z.number().int().min(1).max(60).optional(),
  isDefault: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updatePolicySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  description: z.string().max(1000).optional(),
  repeatCount: z.number().int().min(1).max(10).optional(),
  repeatDelayMinutes: z.number().int().min(1).max(60).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const addStepSchema = z.object({
  stepNumber: z.number().int().min(1).optional(),
  delayMinutes: z.number().int().min(0).max(120).optional(),
  notifyType: z.enum(['schedule', 'user', 'group']),
  scheduleId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  notificationChannels: z.array(z.enum(['email', 'sms', 'slack', 'phone'])).optional(),
});

export const createShiftSwapSchema = z.object({
  scheduleId: z.string().uuid(),
  originalStart: z.string().datetime(),
  originalEnd: z.string().datetime(),
  offeredToUserId: z.string().uuid().optional(),
  originalShiftId: z.string().uuid().optional(),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const updateShiftSwapSchema = z.object({
  reason: z.string().max(500).optional(),
  offeredToUserId: z.string().uuid().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const swapResponseSchema = z.object({
  message: z.string().max(500).optional(),
});

export const adminApproveSchema = z.object({
  accepterUserId: z.string().uuid().optional(),
});

// Parameter validation schemas
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const idRotationParamSchema = z.object({
  id: z.string().uuid(),
  rotationId: z.string().uuid(),
});

export const idShiftParamSchema = z.object({
  id: z.string().uuid(),
  shiftId: z.string().uuid(),
});

export const idAppParamSchema = z.object({
  id: z.string().uuid(),
  applicationId: z.string().uuid(),
});

export const idStepParamSchema = z.object({
  id: z.string().uuid(),
  stepId: z.string().uuid(),
});

export const scheduleIdParamSchema = z.object({
  scheduleId: z.string().uuid(),
});

export const scheduleIdTokenParamSchema = z.object({
  scheduleId: z.string().uuid(),
  token: z.string().min(1),
});
