import { z } from 'zod';

export const workflowConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'ends_with',
    'greater_than',
    'less_than',
    'is_empty',
    'is_not_empty',
    'in_list',
    'not_in_list',
  ]),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  logical_operator: z.enum(['AND', 'OR']).optional(),
});

export const workflowActionSchema = z.object({
  action_type: z.enum([
    'set_field',
    'assign_to_user',
    'assign_to_group',
    'change_status',
    'change_priority',
    'add_comment',
    'send_notification',
    'send_email',
    'escalate',
    'link_to_problem',
    'create_task',
  ]),
  parameters: z.record(z.unknown()),
  order: z.number().int().min(0),
});

export const createWorkflowRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  entityType: z.enum(['issue', 'problem', 'change', 'request']),
  triggerType: z.enum(['on_create', 'on_update', 'on_status_change', 'on_assignment', 'scheduled']),
  isActive: z.boolean().optional(),
  conditions: z.array(workflowConditionSchema),
  actions: z.array(workflowActionSchema),
  executionOrder: z.number().int().min(0).optional(),
  stopOnMatch: z.boolean().optional(),
});

export const updateWorkflowRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  conditions: z.array(workflowConditionSchema).optional(),
  actions: z.array(workflowActionSchema).optional(),
  executionOrder: z.number().int().min(0).optional(),
  stopOnMatch: z.boolean().optional(),
});


export type WorkflowConditionInput = z.infer<typeof workflowConditionSchema>;
export type WorkflowActionInput = z.infer<typeof workflowActionSchema>;
export type CreateWorkflowRuleInput = z.infer<typeof createWorkflowRuleSchema>;
export type UpdateWorkflowRuleInput = z.infer<typeof updateWorkflowRuleSchema>;

export const testRuleSchema = z.object({ entityData: z.record(z.unknown()) }).passthrough();
