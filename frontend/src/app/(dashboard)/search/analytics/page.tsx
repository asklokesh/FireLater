'use client';

import { useState } from 'react';
import { useSearchAnalytics } from '@/hooks/useApi';

interface QueryStat {
  query: string;
  searches: number;
  avg_results?: number;
}

export default function SearchAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSearchAnalytics(days);

  const popular: QueryStat[] = data?.popular ?? [];
  const noResults: QueryStat[] = data?.noResults ?? [];
  const daily: Array<{ day: string; searches: number }> = data?.daily ?? [];
  const max = Math.max(1, ...daily.map((d) => d.searches));

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search analytics</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="border rounded px-2 py-1 text-sm">
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {isLoading ? (
        <p>Loading...</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 font-medium">Searches per day</h2>
            <div className="flex items-end gap-1 h-32">
              {daily.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.searches}`} className="flex-1 bg-blue-500" style={{ height: `${(d.searches / max) * 100}%` }} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-medium">Popular searches</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left"><th>Query</th><th>Searches</th><th>Avg results</th></tr>
              </thead>
              <tbody>
                {popular.map((p) => (
                  <tr key={p.query}><td>{p.query}</td><td>{p.searches}</td><td>{p.avg_results}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2 className="mb-2 font-medium">Searches with no results</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left"><th>Query</th><th>Searches</th></tr>
              </thead>
              <tbody>
                {noResults.map((p) => (
                  <tr key={p.query}><td>{p.query}</td><td>{p.searches}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
