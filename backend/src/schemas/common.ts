import { z } from 'zod';

/** Reusable building blocks shared by all endpoint schemas. */
export const uuidSchema = z.string().uuid();
export const idParamSchema = z.object({ id: uuidSchema });
/**
 * Free-form identifier from a path segment (not a UUID): non-empty, up to 255 chars,
 * no whitespace, slashes or angle brackets. Used for VARCHAR reference columns.
 */
export const textIdSchema = z.string().min(1).max(255).regex(/^[^\s/\\<>]+$/, 'Must not contain whitespace, slashes or angle brackets');
const emptyAsUndefined = (v: unknown) => (v === '' ? undefined : v);
/** Optional integer query value; an empty value (`?days=`) counts as not provided. */
export const optionalInt = (min: number, max: number) =>
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

/** GET route that reads no query keys (the convention paging keys are still checked next to it). */
export const noQuerySchema = z.object({}).passthrough();
/** POST route that takes no body: none, or an empty JSON object. */
export const noBodySchema = z.object({}).strict().optional();
