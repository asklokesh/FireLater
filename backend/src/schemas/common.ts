import { z } from 'zod';

/**
 * Reusable building blocks for endpoint schemas.
 * Domain schemas (users.ts, issues.ts, ...) should compose these.
 */
export const uuid = z.string().uuid();

export const idParamSchema = z.object({ id: uuid });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(100).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const searchQuerySchema = z.object({
  search: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
});

export const priorityEnum = z.enum(['critical', 'high', 'medium', 'low']);
