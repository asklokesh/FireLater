import { api } from './api';

export interface QueryCount {
  query: string;
  count: number;
}

export interface DayCount {
  day: string;
  count: number;
}

export interface SearchAnalytics {
  topQueries: QueryCount[];
  zeroResultQueries: QueryCount[];
  searchesPerDay: DayCount[];
  averageResultCount: number;
}

export async function getSearchAnalytics(days: number): Promise<SearchAnalytics> {
  const response = await api.get('/v1/search/analytics', { params: { days } });
  return response.data;
}
