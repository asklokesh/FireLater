import { z } from 'zod';

export const idSchema = z.string().uuid();

export const idParamsSchema = z.object({
  id: idSchema,
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().max(100).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export type IdParams = z.infer<typeof idParamsSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
