'use client';

import { useState } from 'react';
import { useSearchAnalytics } from '@/hooks/useApi';

/** Search analytics dashboard: popular queries, zero-result queries, volume. */
export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, error } = useSearchAnalytics(days);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Search Analytics</h1>
        <select
          aria-label="Time range"
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      {isLoading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600">Failed to load search analytics.</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="text-sm text-gray-500">Total searches</div>
              <div className="text-2xl font-semibold">{data.totalSearches}</div>
            </div>
            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="text-sm text-gray-500">Average duration</div>
              <div className="text-2xl font-semibold">
                {data.avgDurationMs === null ? 'n/a' : `${Math.round(data.avgDurationMs)} ms`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-md border border-gray-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">Popular searches</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th>Query</th>
                    <th>Count</th>
                    <th>Avg results</th>
                  </tr>
                </thead>
                <tbody>
                  {data.popularSearches.map((p) => (
                    <tr key={p.query}>
                      <td>{p.query}</td>
                      <td>{p.count}</td>
                      <td>{p.avg_results}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="rounded-md border border-gray-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">Searches with no results</h2>
              <ul className="text-sm">
                {data.zeroResultSearches.map((z) => (
                  <li key={z.query} className="flex justify-between">
                    <span>{z.query}</span>
                    <span className="text-gray-500">{z.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          <section className="rounded-md border border-gray-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Searches per day</h2>
            <ul className="text-sm">
              {data.searchesPerDay.map((d) => (
                <li key={d.day} className="flex justify-between">
                  <span>{d.day}</span>
                  <span>{d.count}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
