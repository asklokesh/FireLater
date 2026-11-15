'use client';

import { useState, useEffect } from 'react';
import { Search, Loader2, AlertCircle } from 'lucide-react';
import { getSearchAnalytics, SearchAnalytics } from '@/lib/search-analytics';
import { SearchVolumeChart } from '@/components/charts/search-volume-chart';

const WINDOWS = [7, 30, 90, 365];

function errorMessage(err: unknown): string {
  const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
  if (e?.response?.status === 403) {
    return 'You do not have permission to view search analytics.';
  }
  return e?.response?.data?.message || e?.message || 'Failed to load search analytics.';
}

function QueryList({ title, items, empty }: { title: string; items: { query: string; count: number }[]; empty: string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-secondary">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((q) => (
            <li key={q.query} className="flex justify-between text-sm">
              <span>{q.query}</span>
              <span className="text-secondary">{q.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SearchAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSearchAnalytics(days)
      .then((d) => {
        if (!cancelled) {
          setError(null);
          setData(d);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const isEmpty =
    !!data &&
    data.topQueries.length === 0 &&
    data.zeroResultQueries.length === 0 &&
    data.searchesPerDay.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6" /> Search Analytics
        </h1>
        <label className="text-sm flex items-center gap-2">
          Time window
          <select
            aria-label="Days window"
            value={days}
            onChange={(e) => {
              setLoading(true);
              setError(null);
              setDays(Number(e.target.value));
            }}
            className="border border-border rounded px-2 py-1 bg-surface"
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                Last {w} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-secondary" role="status">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading search analytics...
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="flex items-center gap-2 text-red-600">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {!loading && !error && data && isEmpty && (
        <p className="text-secondary">No search activity in this period.</p>
      )}

      {!loading && !error && data && !isEmpty && (
        <>
          <div className="bg-surface border border-border rounded-lg p-4">
            <div className="text-sm text-secondary">Average result count</div>
            <div className="text-2xl font-semibold" data-testid="avg-result-count">
              {data.averageResultCount.toFixed(1)}
            </div>
          </div>
          <div className="bg-surface border border-border rounded-lg p-4">
            <h2 className="font-semibold mb-3">Searches per day</h2>
            <SearchVolumeChart data={data.searchesPerDay} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <QueryList title="Top queries" items={data.topQueries} empty="No queries" />
            <QueryList title="Zero-result queries" items={data.zeroResultQueries} empty="No zero-result queries" />
          </div>
        </>
      )}
    </div>
  );
}
