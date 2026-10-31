import { api } from './api';

// Saved filters are stored per tenant (tenant_id resolved server-side) and per user.
export type SearchEntity = 'issues' | 'problems' | 'changes' | 'requests';

export interface SearchHit {
  id: string;
  number: string;
  title: string;
  snippet: string | null;
  status: string | null;
  rank: number;
  created_at: string;
}

export interface SearchParams {
  entity: SearchEntity;
  q?: string;
  status?: string;
  priority?: string;
  category?: string;
  limit?: number;
  offset?: number;
}

export interface FacetBucket {
  value: string | null;
  count: number;
}

export interface SearchStats {
  popular: Array<{ query_text: string; count: number }>;
  zeroResults: Array<{ query_text: string; count: number }>;
  daily: Array<{ day: string; count: number }>;
  totals: { searches: number; users: number; avgDurationMs: number | null };
}

export const searchApi = {
  search: async (params: SearchParams): Promise<{ data: SearchHit[]; total: number; limit: number; offset: number }> =>
    (await api.get('/v1/search', { params })).data,
  facets: async (params: SearchParams): Promise<{ facets: Record<string, FacetBucket[]> }> =>
    (await api.get('/v1/search/facets', { params })).data,
  suggest: async (prefix: string): Promise<{ suggestions: string[] }> =>
    (await api.get('/v1/search/suggest', { params: { prefix } })).data,
  analytics: async (days = 30): Promise<SearchStats> =>
    (await api.get('/v1/search/analytics', { params: { days } })).data,
};
