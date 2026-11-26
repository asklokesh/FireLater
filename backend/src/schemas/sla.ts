import { z } from 'zod';

export const slaPolicySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  entityType: z.enum(['issue', 'problem', 'change']),
  isDefault: z.boolean().optional(),
  targets: z.array(z.object({
    metricType: z.enum(['response_time', 'resolution_time']),
    priority: z.enum(['critical', 'high', 'medium', 'low']),
    targetMinutes: z.number().int().positive(),
    warningThresholdPercent: z.number().int().min(1).max(100).optional(),
  })).optional(),
});

export const updateSlaPolicySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const slaTargetSchema = z.object({
  metricType: z.enum(['response_time', 'resolution_time']),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  targetMinutes: z.number().int().positive(),
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
});

export const updateSlaTargetSchema = z.object({
  targetMinutes: z.number().int().positive().optional(),
  warningThresholdPercent: z.number().int().min(1).max(100).optional(),
});
