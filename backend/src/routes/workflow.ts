// Add at the top of the file with other imports
import { z } from 'zod';

// Add validation schemas for workflow triggers and transitions
const workflowTriggerSchema = z.object({
  type: z.enum(['request_created', 'request_updated', 'request_status_changed', 'scheduled']),
  config: z.record(z.unknown()).optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than']),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })).optional(),
});

const workflowTransitionSchema = z.object({
  fromStatus: z.string().optional(),
  toStatus: z.string(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.enum(['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than']),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })).optional(),
  actions: z.array(z.object({
    type: z.enum(['update_field', 'send_notification', 'create_task', 'assign_user']),
    config: z.record(z.unknown()),
  })),
});