'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface FilterCondition {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'not_null';
  value?: unknown;
}

export interface FilterGroup {
  operator: 'AND' | 'OR';
  conditions: Array<FilterCondition | FilterGroup>;
}

export interface SearchRequest {
  q?: string;
  filterGroup?: FilterGroup;
  page?: number;
  perPage?: number;
}

export interface SearchResult {
  id: string;
  issue_number: string;
  title: string;
  status: string;
  priority: string;
  category_id: string | null;
  created_at: string;
  rank: number;
  headline: string | null;
}

export interface FacetCount { value: string | null; count: number }

export interface FilterTemplate {
  id: string;
  name: string;
  description: string | null;
  query: string | null;
  filter_group: FilterGroup;
  is_shared: boolean;
}

export const searchApi = {
  search: async (req: SearchRequest) => (await api.post('/v1/search', req)).data as {
    data: SearchResult[];
    pagination: { page: number; perPage: number; total: number; totalPages: number };
  },
  facets: async (req: SearchRequest) =>
    (await api.post('/v1/search/facets', req)).data as { facets: Record<string, FacetCount[]> },
  suggest: async (prefix: string) =>
    (await api.get('/v1/search/suggest', { params: { prefix } })).data as { recentSearches: string[]; titles: string[] },
  history: async () => (await api.get('/v1/search/history')).data as { data: Array<{ query: string; last_searched_at: string; times: number }> },
  listTemplates: async () => (await api.get('/v1/search/templates')).data as { data: FilterTemplate[] },
  saveTemplate: async (body: { name: string; query?: string; filterGroup?: FilterGroup; isShared?: boolean }) =>
    (await api.post('/v1/search/templates', body)).data as FilterTemplate,
  deleteTemplate: async (id: string) => { await api.delete(`/v1/search/templates/${id}`); },
  analytics: async (days: number) => (await api.get('/v1/search/analytics', { params: { days } })).data as {
    popularSearches: Array<{ query: string; count: number; avg_results: number }>;
    zeroResultSearches: Array<{ query: string; count: number }>;
    daily: Array<{ day: string; searches: number; avg_ms: number }>;
  },
};

export function useSearch(req: SearchRequest, enabled = true) {
  return useQuery({ queryKey: ['search', req], queryFn: () => searchApi.search(req), enabled });
}

export function useSearchFacets(req: SearchRequest, enabled = true) {
  return useQuery({ queryKey: ['search', 'facets', req], queryFn: () => searchApi.facets(req), enabled });
}

export function useSearchSuggestions(prefix: string) {
  return useQuery({
    queryKey: ['search', 'suggest', prefix],
    queryFn: () => searchApi.suggest(prefix),
    enabled: prefix.trim().length >= 2,
  });
}

export function useFilterTemplates() {
  return useQuery({ queryKey: ['search', 'templates'], queryFn: searchApi.listTemplates });
}

export function useSaveFilterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: searchApi.saveTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search', 'templates'] }),
  });
}

export function useDeleteFilterTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: searchApi.deleteTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search', 'templates'] }),
  });
}

export function useSearchAnalytics(days = 30) {
  return useQuery({ queryKey: ['search', 'analytics', days], queryFn: () => searchApi.analytics(days) });
}
