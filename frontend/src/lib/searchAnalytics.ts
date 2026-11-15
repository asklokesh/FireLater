import { api } from './api';

export interface SearchAnalytics {
  from: string;
  to: string;
  topSearches: Array<{ query: string; count: number }>;
  zeroResultSearches: Array<{ query: string; count: number }>;
  averageResultCount: number;
  searchesPerDay: Array<{ date: string; count: number }>;
}

export const searchAnalyticsApi = {
  getAnalytics: async (range: number | { from?: string; to?: string }): Promise<SearchAnalytics> => {
    const params =
      typeof range === 'number'
        ? {
            from: new Date(Date.now() - range * 24 * 60 * 60 * 1000).toISOString(),
            to: new Date().toISOString(),
          }
        : range;
    const response = await api.get('/v1/search/analytics', { params });
    return response.data;
  },
};
