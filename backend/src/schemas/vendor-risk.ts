import { z } from 'zod';
import { textIdSchema, uuidSchema } from './common.js';

/** vendor_application_links.application_id is VARCHAR(255) (migration 036), not a UUID. */
export const appRefParamSchema = z.object({ appId: textIdSchema });
export const vendorAppLinkParamSchema = z.object({ id: uuidSchema, appId: textIdSchema });

export const createVendorSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  website: z.string().url().max(500).optional(),
  riskTier: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  criticality: z.enum(['mission_critical', 'important', 'standard', 'non_critical']).optional(),
  contractReviewDate: z.string().date().optional(),
  assessmentReviewDate: z.string().date().optional(),
  primaryContactName: z.string().max(255).optional(),
  primaryContactEmail: z.string().email().max(255).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(10000).optional(),
});

export const updateVendorSchema = createVendorSchema.partial();

export const linkApplicationSchema = z.object({
  applicationId: z.string().min(1).max(255),
  dependencyType: z.enum(['service', 'component', 'hosting', 'support', 'licensing']).optional(),
  notes: z.string().max(2000).optional(),
});

export const createReviewSchema = z.object({
  reviewType: z.enum(['contract', 'security_assessment', 'due_diligence', 'annual_review']),
  dueDate: z.string().date(),
  reviewerId: z.string().max(255).optional(),
  reviewerEmail: z.string().email().max(255).optional(),
});

export const updateReviewSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'overdue']).optional(),
  completedDate: z.string().date().optional(),
  findings: z.string().max(10000).optional(),
  riskScore: z.number().int().min(1).max(10).optional(),
});


export type CreateVendorInput = z.infer<typeof createVendorSchema>;
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
export type LinkApplicationInput = z.infer<typeof linkApplicationSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
