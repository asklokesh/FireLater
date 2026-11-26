import { z } from 'zod';
import { textIdSchema } from './common.js';

/** regulatory_clocks.incident_id is VARCHAR(255) (migration 034): incident references such as INC-1001. */
export const incidentRefParamSchema = z.object({ incidentId: textIdSchema });

export const classifyIncidentSchema = z.object({
  classification: z.string().min(1).max(50),
  detectedAt: z.string().datetime().optional(),
});

export const recordNotificationSchema = z.object({
  actorId: z.string().min(1).max(255),
  recipient: z.string().min(1).max(255),
  evidence: z.string().min(1).max(5000),
});

export const summaryQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const createFrameworkSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

export const createDeadlineSchema = z.object({
  deadlineType: z.string().min(1).max(50),
  incidentClassification: z.string().max(50).optional(),
  hoursFromDetection: z.number().int().positive(),
  description: z.string().max(2000).optional(),
});


export type ClassifyIncidentInput = z.infer<typeof classifyIncidentSchema>;
export type RecordNotificationInput = z.infer<typeof recordNotificationSchema>;
export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>;
export type CreateFrameworkInput = z.infer<typeof createFrameworkSchema>;
export type CreateDeadlineInput = z.infer<typeof createDeadlineSchema>;
