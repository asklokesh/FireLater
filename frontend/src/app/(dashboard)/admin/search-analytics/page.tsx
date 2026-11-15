'use client';

import { useState, useEffect } from 'react';
import { BarChart2, AlertCircle } from 'lucide-react';
import { searchApi } from '@/lib/api';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchVolumeChart } from '@/components/charts/search-volume-chart';

interface SearchAnalytics {
  period_days: number;
  total_searches: number;
  unique_queries: number;
  zero_result_rate: number;
  avg_took_ms: number;
  top_queries: { query: string; count: number; avg_results: number }[];
  zero_result_queries: { query: string; count: number }[];
  daily: { date: string; count: number }[];
}

const PERIODS = [7, 30, 90];

export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SearchAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchApi
      .analytics(days)
      .then((res: SearchAnalytics) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load search analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const changePeriod = (value: number) => {
    setLoading(true);
    setError(null);
    setDays(value);
  };

  const cards = data
    ? [
        { label: 'Total Searches', value: String(data.total_searches) },
        { label: 'Unique Queries', value: String(data.unique_queries) },
        { label: 'Zero-Result Rate', value: `${(data.zero_result_rate * 100).toFixed(1)}%` },
        { label: 'Avg Latency', value: `${Math.round(data.avg_took_ms)} ms` },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Search Analytics</h1>
          <p className="text-sm text-secondary">How people use search</p>
        </div>
        <select
          aria-label="Period"
          value={days}
          onChange={(e) => changePeriod(Number(e.target.value))}
          className="px-3 py-2 border border-border rounded-lg bg-surface text-sm"
        >
          {PERIODS.map((p) => (
            <option key={p} value={p}>
              Last {p} days
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <PageLoading text="Loading search analytics..." />
      ) : error ? (
        <EmptyState icon={AlertCircle} title="Unable to load analytics" description={error} />
      ) : !data || data.total_searches === 0 ? (
        <EmptyState
          icon={BarChart2}
          title="No searches yet"
          description="No searches were recorded in this period."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-surface border border-border rounded-xl p-5">
                <p className="text-sm text-muted">{c.label}</p>
                <p className="text-2xl font-bold text-foreground" data-testid={`card-${c.label}`}>
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          <SearchVolumeChart data={data.daily} />

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-surface border border-border rounded-xl">
              <h2 className="px-6 py-4 border-b border-border text-base font-semibold">Top Queries</h2>
              <table className="w-full text-sm" aria-label="Top queries">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="px-6 py-2">Query</th>
                    <th className="px-6 py-2">Count</th>
                    <th className="px-6 py-2">Avg Results</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_queries.map((q) => (
                    <tr key={q.query} className="border-t border-border">
                      <td className="px-6 py-2">{q.query}</td>
                      <td className="px-6 py-2">{q.count}</td>
                      <td className="px-6 py-2">{q.avg_results}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-surface border border-border rounded-xl">
              <h2 className="px-6 py-4 border-b border-border text-base font-semibold">
                Zero-Result Queries
              </h2>
              <table className="w-full text-sm" aria-label="Zero-result queries">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="px-6 py-2">Query</th>
                    <th className="px-6 py-2">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {data.zero_result_queries.map((q) => (
                    <tr key={q.query} className="border-t border-border">
                      <td className="px-6 py-2">{q.query}</td>
                      <td className="px-6 py-2">{q.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
