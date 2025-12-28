import { z } from 'zod';
import type { PaginationParams, PaginatedResponse } from '../types/index.js';

export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  per_page: z.coerce.number().min(1).max(100).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export function parsePagination(query: unknown): PaginationParams {
  const parsed = paginationSchema.parse(query);
  return {
    page: parsed.page,
    perPage: parsed.per_page,
    sort: parsed.sort,
    order: parsed.order,
  };
}

export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResponse<T> {
  return {
    data,
    pagination: {
      page: params.page,
      perPage: params.perPage,
      total,
      totalPages: Math.ceil(total / params.perPage),
    },
  };
}

export function getOffset(params: PaginationParams): number {
  return (params.page - 1) * params.perPage;
}
