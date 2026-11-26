import { z } from 'zod';

export const createRequestSchema = z.object({
  catalogItemId: z.string().uuid(),
  requestedForId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  formData: z.record(z.unknown()),
  notes: z.string().max(2000).optional(),
  costCenter: z.string().max(100).optional(),
});

export const updateRequestSchema = z.object({
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  formData: z.record(z.unknown()).optional(),
  notes: z.string().max(2000).optional(),
  costCenter: z.string().max(100).optional(),
});

export const assignRequestSchema = z.object({
  assignedTo: z.string().uuid(),
});

export const approvalActionSchema = z.object({
  comments: z.string().max(2000).optional(),
});

export const cancelRequestSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export const completeRequestSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const addCommentSchema = z.object({
  content: z.string().min(1).max(5000),
  isInternal: z.boolean().optional(),
});

// Parameter validation schemas
export const requestIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const requestApprovalParamSchema = z.object({
  id: z.string().uuid(),
  approvalId: z.string().uuid(),
});

// Query parameter validation schema
export const listRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  status: z.enum(['submitted', 'pending_approval', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  requester_id: z.string().uuid().optional(),
  requested_for_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  catalog_item_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});
