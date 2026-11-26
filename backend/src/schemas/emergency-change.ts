import { z } from 'zod';

export const createEmergencyChangeSchema = z.object({
  title: z.string().min(5).max(500),
  description: z.string().min(1).max(10000),
  emergencyJustification: z.string().min(10).max(5000),
  linkedIncidentId: z.string().min(1).max(255),
  implementerId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
});

export const postHocReviewSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(5000).optional(),
});

export const listQuerySchema = z.object({
  post_review_status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});


export type CreateEmergencyChangeInput = z.infer<typeof createEmergencyChangeSchema>;
export type PostHocReviewInput = z.infer<typeof postHocReviewSchema>;
export type ListQueryInput = z.infer<typeof listQuerySchema>;
export type IdParamInput = z.infer<typeof idParamSchema>;
