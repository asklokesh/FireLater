'use client';

import { useState } from 'react';
import { useSearchAnalytics } from '@/hooks/useSearch';

/** Search analytics dashboard: popular searches, zero-result searches and daily volume. */
export default function SearchAnalyticsDashboardPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError } = useSearchAnalytics(days);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search analytics dashboard</h1>
        <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded border px-2 py-1 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      {isError && <p className="text-sm text-red-600">Failed to load search analytics.</p>}
      {data && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <section className="rounded-md border p-4">
            <h2 className="mb-2 font-semibold">Popular searches</h2>
            <table className="w-full text-sm">
              <tbody>
                {data.popularSearches.map((r) => (
                  <tr key={r.query}><td className="truncate">{r.query}</td><td className="text-right">{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-md border p-4">
            <h2 className="mb-2 font-semibold">Searches with no results</h2>
            <table className="w-full text-sm">
              <tbody>
                {data.zeroResultSearches.map((r) => (
                  <tr key={r.query}><td className="truncate">{r.query}</td><td className="text-right">{r.count}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-md border p-4">
            <h2 className="mb-2 font-semibold">Daily volume</h2>
            <table className="w-full text-sm">
              <tbody>
                {data.daily.map((r) => (
                  <tr key={r.day}><td>{r.day}</td><td className="text-right">{r.searches}</td><td className="text-right text-gray-500">{r.avg_ms} ms</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
