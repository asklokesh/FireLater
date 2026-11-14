'use client';

import { useEffect, useState } from 'react';
import { searchAnalyticsApi, SearchAnalyticsResponse } from '@/lib/api';
import { SearchVolumeChart } from '@/components/charts/search-volume-chart';
import { PageLoading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';

const RANGES = [7, 30, 90];

function QueryTable({
  title,
  description,
  rows,
  emptyText,
}: {
  title: string;
  description?: string;
  rows: Array<{ query: string; count: number }>;
  emptyText: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {description && <p className="text-sm text-muted mb-3">{description}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{emptyText}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2">Query</th>
              <th className="py-2 text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.query} className="border-t border-border">
                <td className="py-2">{r.query}</td>
                <td className="py-2 text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<SearchAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchAnalyticsApi
      .get(days)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setData(null);
        if (err?.response?.status === 403) {
          setError('You do not have permission to view search analytics. The reports:read permission is required.');
        } else {
          setError('Failed to load search analytics. Please try again.');
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
    data &&
    data.totalSearches === 0 &&
    data.topQueries.length === 0 &&
    data.zeroResultQueries.length === 0 &&
    data.volumeByDay.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Search Analytics</h1>
        <label className="flex items-center gap-2 text-sm text-secondary">
          Time range
          <select
            aria-label="Time range"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border border-border rounded-lg bg-surface px-2 py-1"
          >
            {RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <PageLoading text="Loading search analytics..." />
      ) : error ? (
        <div role="alert" className="border border-error rounded-xl p-4 text-sm text-error">
          {error}
        </div>
      ) : !data || isEmpty ? (
        <EmptyState
          title="No search data"
          description="No searches were recorded in the selected time range."
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="bg-surface border border-border rounded-xl p-5">
              <p className="text-sm text-muted">Total searches</p>
              <p data-testid="total-searches" className="text-2xl font-bold text-foreground">
                {data.totalSearches}
              </p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5">
              <p className="text-sm text-muted">Unique users</p>
              <p data-testid="unique-users" className="text-2xl font-bold text-foreground">
                {data.uniqueUsers}
              </p>
            </div>
          </div>

          <SearchVolumeChart data={data.volumeByDay} />

          <div className="grid gap-4 lg:grid-cols-2">
            <QueryTable
              title="Top queries"
              rows={data.topQueries}
              emptyText="No queries recorded."
            />
            <QueryTable
              title="Zero-result queries"
              description="Content or synonym gaps: searches that returned no results."
              rows={data.zeroResultQueries}
              emptyText="No zero-result queries."
            />
          </div>
        </>
      )}
    </div>
  );
}
