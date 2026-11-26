import { z } from 'zod';
import { SEARCH_ENTITY_TYPES, type SearchEntityType } from '../lib/search/entities.js';
import { filterGroupSchema } from '../lib/search/filters.js';
import { MAX_QUERY_LENGTH } from '../lib/search/query-parser.js';

export const MAX_PER_PAGE = 100;

export const entityTypeSchema = z.enum(SEARCH_ENTITY_TYPES as [SearchEntityType, ...SearchEntityType[]]);

export const sortSchema = z.enum(['relevance', 'updated', 'created']);

export const searchBodySchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional(),
  filters: filterGroupSchema.nullable().optional(),
  entityTypes: z.array(entityTypeSchema).max(SEARCH_ENTITY_TYPES.length).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
  sort: sortSchema.optional(),
});

export const searchQuerySchema = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).optional(),
  types: z.string().max(200).optional(),
  filters: z.string().max(10000).optional(),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(MAX_PER_PAGE).optional(),
  sort: sortSchema.optional(),
});

export const suggestQuerySchema = z.object({
  q: z.string().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  queryText: z.string().max(MAX_QUERY_LENGTH).optional(),
  filters: filterGroupSchema.nullable().optional(),
  entityTypes: z.array(entityTypeSchema).max(SEARCH_ENTITY_TYPES.length).optional(),
  isShared: z.boolean().optional(),
});

export const idParamSchema = z.object({ id: z.string().uuid() });


export type EntityTypeInput = z.infer<typeof entityTypeSchema>;
export type SortInput = z.infer<typeof sortSchema>;
export type SearchBodyInput = z.infer<typeof searchBodySchema>;
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
export type SuggestQueryInput = z.infer<typeof suggestQuerySchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type TemplateInput = z.infer<typeof templateSchema>;
export type IdParamInput = z.infer<typeof idParamSchema>;

export const updateTemplateSchema = templateSchema.partial();
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const searchBodyDefaultSchema = searchBodySchema.default({});
export type SearchBodyDefaultInput = z.infer<typeof searchBodyDefaultSchema>;
