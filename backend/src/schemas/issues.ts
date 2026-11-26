import { z } from 'zod';

export const createIssueSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  issueType: z.enum(['issue', 'problem', 'question']).optional(),
  source: z.enum(['portal', 'email', 'phone', 'monitoring', 'api']).optional(),
  applicationId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
});

export const updateIssueSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  severity: z.enum(['S1', 'S2', 'S3', 'S4']).optional(),
  impact: z.enum(['widespread', 'significant', 'moderate', 'minor']).optional(),
  urgency: z.enum(['immediate', 'high', 'medium', 'low']).optional(),
  categoryId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  environmentId: z.string().uuid().optional(),
  expectedVersion: z.string().max(64).optional(),
});

export const assignSchema = z.object({
  assignedTo: z.string().uuid().optional(),
  assignedGroup: z.string().uuid().optional(),
});

export const resolveSchema = z.object({
  resolutionCode: z.string().min(1).max(100),
  resolutionNotes: z.string().min(1).max(5000),
});

export const statusChangeSchema = z.object({
  status: z.enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']),
  reason: z.string().max(500).optional(),
});

export const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

export const worklogSchema = z.object({
  timeSpent: z.number().min(1).max(1440), // max 24 hours in minutes
  description: z.string().min(1).max(1000),
  workDate: z.string().datetime().optional(),
  billable: z.boolean().optional(),
});

// Parameter validation schemas
export const linkProblemSchema = z.object({
  problemId: z.string().uuid(),
  relationshipType: z.enum(['caused_by', 'related_to', 'duplicate_of']).optional(),
  notes: z.string().max(1000).optional(),
});

export const issueIdParamSchema = z.object({
  id: z.string().uuid(),
});

// Query parameter validation schema
export const listIssuesQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'closed']).optional(),
  priority: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_group: z.string().uuid().optional(),
  application_id: z.string().uuid().optional(),
  reporter_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  sla_breached: z.enum(['true', 'false']).optional(),
}).passthrough(); // keep sort/order etc. for parsePagination

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
export type AssignIssueInput = z.infer<typeof assignSchema>;
export type ResolveIssueInput = z.infer<typeof resolveSchema>;
export type IssueStatusChangeInput = z.infer<typeof statusChangeSchema>;
export type IssueCommentInput = z.infer<typeof commentSchema>;
export type IssueWorklogInput = z.infer<typeof worklogSchema>;
export type IssueIdParams = z.infer<typeof issueIdParamSchema>;
export type ListIssuesQuery = z.infer<typeof listIssuesQuerySchema>;
export type LinkProblemInput = z.infer<typeof linkProblemSchema>;
