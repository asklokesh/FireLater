import { z } from 'zod';

// Parameter validation schemas
export const tierParamSchema = z.object({
  tier: z.enum(['P1', 'P2', 'P3', 'P4']),
});

export const applicationIdParamSchema = z.object({
  applicationId: z.string().uuid(),
});

// Query validation schemas (for future use with stricter validation)
export const _listScoresQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

export const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

// Update config schema
export const updateConfigSchema = z.object({
  slaWeight: z.number().min(0).max(100).optional(),
  issueWeight: z.number().min(0).max(100).optional(),
  changeWeight: z.number().min(0).max(100).optional(),
  incidentWeight: z.number().min(0).max(100).optional(),
});
