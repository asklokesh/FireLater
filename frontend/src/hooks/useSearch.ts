import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { searchApi, type SavedSearchInput, type SearchRequest } from '@/lib/api';

export const searchKeys = {
  all: ['search'] as const,
  results: (req: SearchRequest) => ['search', 'results', req] as const,
  suggest: (q: string) => ['search', 'suggest', q] as const,
  fields: ['search', 'fields'] as const,
  history: ['search', 'history'] as const,
  templates: ['search', 'templates'] as const,
  analytics: (days: number) => ['search', 'analytics', days] as const,
};

export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function useSearchResults(request: SearchRequest, enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: searchKeys.results(request),
    queryFn: async () => {
      const result = await searchApi.search(request);
      // A new search changes the user's recent history.
      queryClient.invalidateQueries({ queryKey: searchKeys.history });
      return result;
    },
    enabled,
    // A 4xx means the query itself is invalid; retrying cannot help.
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status !== undefined && status >= 400 && status < 500) return false;
      return failureCount < 1;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useSearchSuggestions(prefix: string) {
  const q = prefix.trim();
  return useQuery({
    queryKey: searchKeys.suggest(q),
    queryFn: () => searchApi.suggest(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
}

export function useSearchFields() {
  return useQuery({ queryKey: searchKeys.fields, queryFn: searchApi.fields, staleTime: 5 * 60_000 });
}

export function useSearchHistory() {
  return useQuery({ queryKey: searchKeys.history, queryFn: () => searchApi.history(10) });
}

export function useClearSearchHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: searchApi.clearHistory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: searchKeys.history }),
  });
}

export function useSavedSearches() {
  return useQuery({ queryKey: searchKeys.templates, queryFn: searchApi.listTemplates });
}

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SavedSearchInput) => searchApi.createTemplate(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: searchKeys.templates }),
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => searchApi.deleteTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: searchKeys.templates }),
  });
}

export function useRecordSavedSearchUse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => searchApi.useTemplate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: searchKeys.templates }),
  });
}

export function useSearchAnalytics(days: number) {
  return useQuery({ queryKey: searchKeys.analytics(days), queryFn: () => searchApi.analytics(days) });
}
