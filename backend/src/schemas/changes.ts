import { z } from 'zod';

export const createWindowSchema = z.object({
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

export const createTemplateSchema = z.object({
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

export const createChangeSchema = z.object({
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

export const createTaskSchema = z.object({
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

export const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

export const createCabMeetingSchema = z.object({
  title: z.string().min(2).max(500),
  description: z.string().max(5000).optional(),
  meetingDate: z.string().datetime(),
  meetingEnd: z.string().datetime().optional(),
  location: z.string().max(500).optional(),
  meetingLink: z.string().url().max(1000).optional(),
});

export const addAttendeeSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['chair', 'member', 'guest']).optional(),
});

export const updateAttendeeSchema = z.object({
  status: z.enum(['pending', 'accepted', 'declined', 'attended']),
  notes: z.string().max(2000).optional(),
});

export const addMeetingChangeSchema = z.object({
  changeId: z.string().uuid(),
  timeAllocatedMinutes: z.number().int().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateMeetingChangeSchema = z.object({
  discussionNotes: z.string().max(10000).optional(),
  timeAllocatedMinutes: z.number().int().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const recordDecisionSchema = z.object({
  changeId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected', 'deferred', 'more_info_needed']),
  notes: z.string().max(5000).optional(),
});

export const addActionItemSchema = z.object({
  description: z.string().min(1).max(2000),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export const saveMinutesSchema = z.object({
  minutes: z.string().min(1).max(100000),
});

// Parameter validation schemas
export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const idTaskParamSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
});

export const idUserParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const idChangeParamSchema = z.object({
  id: z.string().uuid(),
  changeId: z.string().uuid(),
});

// Query validation schemas (for future use with stricter validation)
export const _listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  type: z.string().max(50).optional(),
  status: z.string().max(50).optional(),
});

export const _listChangesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().max(50).optional(),
  type: z.string().max(50).optional(),
  application_id: z.string().uuid().optional(),
  requester_id: z.string().uuid().optional(),
  implementer_id: z.string().uuid().optional(),
  risk_level: z.string().max(50).optional(),
});

export const _upcomingQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const _cabMeetingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().max(50).optional(),
  organizer_id: z.string().uuid().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
