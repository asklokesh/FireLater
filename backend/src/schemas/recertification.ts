import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  scopeType: z.enum(['all_users', 'role', 'group', 'resource']),
  scopeValue: z.string().max(255).optional(),
  ownerId: z.string().min(1).max(100),
  ownerEmail: z.string().email().optional(),
  dueDate: z.string().min(1).max(64),
}).passthrough();

export const decideItemSchema = z.object({
  decision: z.enum(['approved', 'revoked', 'delegated']),
  comment: z.string().max(5000).optional(),
}).passthrough();

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type DecideItemInput = z.infer<typeof decideItemSchema>;
