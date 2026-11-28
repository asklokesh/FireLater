import { z } from 'zod';

export const createArticleSchema = z.object({
  title: z.string().min(5).max(500),
  content: z.string().min(1),
  summary: z.string().max(1000).optional(),
  type: z.enum(['how_to', 'faq', 'troubleshooting', 'policy', 'best_practice']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['internal', 'public', 'restricted']).optional(),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  relatedProblemId: z.string().uuid().optional(),
  relatedIssueId: z.string().uuid().optional(),
});

export const updateArticleSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  content: z.string().min(1).optional(),
  summary: z.string().max(1000).optional(),
  type: z.enum(['how_to', 'faq', 'troubleshooting', 'policy', 'best_practice']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['internal', 'public', 'restricted']).optional(),
  categoryId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export const articleFeedbackSchema = z.object({
  isHelpful: z.boolean(),
  comment: z.string().max(2000).optional(),
});

export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
export type ArticleFeedbackInput = z.infer<typeof articleFeedbackSchema>;
