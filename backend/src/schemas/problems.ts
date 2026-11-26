import { z } from 'zod';

export const createProblemSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  problemType: z.enum(['reactive', 'proactive']).optional(),
  applicationId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

export const fiveWhyEntrySchema = z.object({
  why: z.string().max(500),
  answer: z.string().max(2000),
});

export const fishboneDiagramSchema = z.record(z.array(z.string().max(500)));

export const rcaDataSchema = z.object({
  fiveWhys: z.array(fiveWhyEntrySchema).max(10).optional(),
  fishbone: fishboneDiagramSchema.optional(),
  summary: z.string().max(5000).optional(),
  analysisDate: z.string().optional(),
  analyzedBy: z.string().optional(),
}).optional();

export const updateProblemSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  assignedGroup: z.string().uuid().nullable().optional(),
  applicationId: z.string().uuid().nullable().optional(),
  rootCause: z.string().max(10000).optional(),
  workaround: z.string().max(10000).optional(),
  resolution: z.string().max(10000).optional(),
  resolutionCode: z.string().max(100).optional(),
  tags: z.array(z.string()).optional(),
  rcaData: rcaDataSchema,
});

export const assignSchema = z.object({
  assigneeId: z.string().uuid(),
});

export const statusChangeSchema = z.object({
  status: z.enum(['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed']),
  reason: z.string().max(500).optional(),
});

export const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

export const worklogSchema = z.object({
  timeSpent: z.number().min(1).max(1440),
  description: z.string().min(1).max(1000),
  workType: z.enum(['analysis', 'investigation', 'documentation', 'testing', 'implementation', 'other']).optional(),
});

export const linkIssueSchema = z.object({
  issueId: z.string().uuid(),
  relationshipType: z.enum(['caused_by', 'related_to', 'duplicate_of']).optional(),
  notes: z.string().max(1000).optional(),
});

export const problemIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const problemIssueParamSchema = z.object({
  id: z.string().uuid(),
  issueId: z.string().uuid(),
});

export const listProblemsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['new', 'assigned', 'investigating', 'root_cause_identified', 'known_error', 'resolved', 'closed']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_group: z.string().uuid().optional(),
  application_id: z.string().uuid().optional(),
  reporter_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  is_known_error: z.enum(['true', 'false']).optional(),
  problem_type: z.enum(['reactive', 'proactive']).optional(),
});

export const costBreakdownSchema = z.object({
  labor_hours: z.number().min(0).optional(),
  labor_rate: z.number().min(0).optional(),
  revenue_loss: z.number().min(0).optional(),
  recovery_costs: z.number().min(0).optional(),
  third_party_costs: z.number().min(0).optional(),
  customer_credits: z.number().min(0).optional(),
  other: z.number().min(0).optional(),
}).optional().nullable();

export const _financialImpactSchema = z.object({
  estimated: z.number().min(0).nullable().optional(),
  actual: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().max(5000).nullable().optional(),
  costBreakdown: costBreakdownSchema,
});
