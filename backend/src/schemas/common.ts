import { z } from 'zod';

/** Reusable building blocks shared by all endpoint schemas. */
export const uuidSchema = z.string().uuid();
export const idParamSchema = z.object({ id: uuidSchema });
const emptyAsUndefined = (v: unknown) => (v === '' ? undefined : v);
const optionalInt = (min: number, max: number) =>
  z.preprocess(emptyAsUndefined, z.coerce.number().int().min(min).max(max).optional());

export const paginationQuerySchema = z.object({
  page: optionalInt(1, 1_000_000),
  perPage: optionalInt(1, 200),
  per_page: optionalInt(1, 200),
  limit: optionalInt(1, 200),
  sort: z.string().max(100).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type IdParams = z.infer<typeof idParamSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
