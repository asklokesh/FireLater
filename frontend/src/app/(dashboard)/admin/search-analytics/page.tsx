'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { searchAnalyticsApi, type SearchAnalytics } from '@/lib/searchAnalytics';

const RANGES = [7, 30, 90];

function QueryList({ title, items }: { title: string; items: SearchAnalytics['topSearches'] }) {
  return (
    <div className="rounded-lg border p-4">
      <h2 className="font-semibold mb-2">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">No searches</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.query} className="flex justify-between text-sm">
              <Link href={`/search?q=${encodeURIComponent(i.query)}`} className="text-blue-600 hover:underline">
                {i.query}
              </Link>
              <span>{i.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [result, setResult] = useState<{
    days: number;
    data: SearchAnalytics | null;
    error: string | null;
    forbidden: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    searchAnalyticsApi
      .getAnalytics(days)
      .then((d) => {
        if (!cancelled) setResult({ days, data: d, error: null, forbidden: false });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } } | null)?.response?.status;
        if (status === 403) setResult({ days, data: null, error: null, forbidden: true });
        else setResult({ days, data: null, error: 'Failed to load search analytics', forbidden: false });
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const loading = !result || result.days !== days;
  const data = result?.data ?? null;
  const error = result?.error ?? null;
  const forbidden = result?.forbidden ?? false;

  const isEmpty =
    !!data &&
    data.topSearches.length === 0 &&
    data.zeroResultSearches.length === 0 &&
    data.searchesPerDay.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Search Analytics</h1>
        <select
          aria-label="Date range"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="border rounded px-2 py-1"
        >
          {RANGES.map((r) => (
            <option key={r} value={r}>
              Last {r} days
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p>Loading search analytics...</p>
      ) : forbidden ? (
        <div role="alert">Access denied. You do not have permission to view search analytics.</div>
      ) : error ? (
        <div role="alert">{error}</div>
      ) : !data || isEmpty ? (
        <p>No search data for this period.</p>
      ) : (
        <>
          <div className="rounded-lg border p-4">
            <div className="text-sm text-gray-500">Average result count</div>
            <div className="text-2xl font-bold" data-testid="avg-result-count">
              {data.averageResultCount.toFixed(1)}
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <h2 className="font-semibold mb-2">Searches per day</h2>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.searchesPerDay}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <QueryList title="Top searches" items={data.topSearches} />
            <QueryList title="Zero-result searches" items={data.zeroResultSearches} />
          </div>
        </>
      )}
    </div>
  );
}
