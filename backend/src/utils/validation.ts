import { z } from 'zod';

// Centralized tenant slug validation
export const isValidTenantSlug = (slug: string): boolean => {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$/.test(slug) && slug.length <= 63;
};

// Centralized search parameter validation schema
export const searchParamsSchema = z.object({
  query: z.string().max(500).optional(),
  filters: z.record(z.string(), z.string()).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});