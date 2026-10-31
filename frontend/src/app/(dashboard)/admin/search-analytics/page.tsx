'use client';

import { useState } from 'react';
import { useSearchStats } from '@/hooks/useApi';

// Search analytics dashboard: popular queries, zero-result queries and volume.
export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useSearchStats(days);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Search Analytics</h1>
        <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border px-2 py-1">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {isLoading && <p>Loading...</p>}
      {error && <p className="text-red-600">Failed to load search analytics</p>}
      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md border p-4"><div className="text-sm text-gray-500">Searches</div><div className="text-2xl">{data.totals.searches}</div></div>
            <div className="rounded-md border p-4"><div className="text-sm text-gray-500">Users</div><div className="text-2xl">{data.totals.users}</div></div>
            <div className="rounded-md border p-4"><div className="text-sm text-gray-500">Avg duration (ms)</div><div className="text-2xl">{data.totals.avgDurationMs !== null ? Math.round(data.totals.avgDurationMs) : '-'}</div></div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <section>
              <h2 className="mb-2 font-semibold">Popular queries</h2>
              <ul>{data.popular.map((p) => <li key={p.query_text} className="flex justify-between border-b py-1"><span>{p.query_text}</span><span>{p.count}</span></li>)}</ul>
            </section>
            <section>
              <h2 className="mb-2 font-semibold">Queries with zero results</h2>
              <ul>{data.zeroResults.map((p) => <li key={p.query_text} className="flex justify-between border-b py-1"><span>{p.query_text}</span><span>{p.count}</span></li>)}</ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
