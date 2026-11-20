'use client';

import { useState, useEffect, useCallback } from 'react';
import { Database, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

interface QueryStatRow {
  fingerprint: string;
  sample: string;
  count: number;
  errors: number;
  avgMs: number;
  maxMs: number;
  avgRows: number;
  slowCount: number;
}

interface SlowEntry {
  fingerprint: string;
  query: string;
  durationMs: number;
  rowCount: number | null;
  at: string;
}

interface Recommendation {
  table: string;
  columns: string[];
  reason: string;
  statement: string;
  queries: number;
}

interface Overview {
  summary: {
    totalQueries: number;
    totalErrors: number;
    slowQueries: number;
    slowThresholdMs: number;
    uniqueFingerprints: number;
  };
  mostFrequent: QueryStatRow[];
  slowest: QueryStatRow[];
  recentSlow: SlowEntry[];
  recommendations: Recommendation[];
}

function StatTable({ rows }: { rows: QueryStatRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500">No queries recorded yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-4">Query</th>
            <th className="py-2 pr-4">Calls</th>
            <th className="py-2 pr-4">Avg ms</th>
            <th className="py-2 pr-4">Max ms</th>
            <th className="py-2 pr-4">Avg rows</th>
            <th className="py-2 pr-4">Slow</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fingerprint} className="border-b align-top">
              <td className="py-2 pr-4 font-mono text-xs max-w-xl break-all">{r.sample}</td>
              <td className="py-2 pr-4">{r.count}</td>
              <td className="py-2 pr-4">{r.avgMs}</td>
              <td className="py-2 pr-4">{r.maxMs}</td>
              <td className="py-2 pr-4">{r.avgRows}</td>
              <td className="py-2 pr-4">{r.slowCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function QueryAnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get('/v1/query-analytics', { params: { limit: 20 } });
      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load query analytics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6" /> Query Analytics
        </h1>
        <Button onClick={load} disabled={isLoading} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" /> Refresh
        </Button>
      </div>

      {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
      {error && (
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded p-4">
              <div className="text-sm text-gray-500">Total queries</div>
              <div className="text-xl font-semibold">{data.summary.totalQueries}</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-sm text-gray-500">Slow (&gt;{data.summary.slowThresholdMs}ms)</div>
              <div className="text-xl font-semibold">{data.summary.slowQueries}</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-sm text-gray-500">Errors</div>
              <div className="text-xl font-semibold">{data.summary.totalErrors}</div>
            </div>
            <div className="border rounded p-4">
              <div className="text-sm text-gray-500">Unique queries</div>
              <div className="text-xl font-semibold">{data.summary.uniqueFingerprints}</div>
            </div>
          </div>

          <section>
            <h2 className="text-lg font-semibold mb-2">Slowest queries</h2>
            <StatTable rows={data.slowest} />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Most frequent queries</h2>
            <StatTable rows={data.mostFrequent} />
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Index recommendations</h2>
            {data.recommendations.length === 0 ? (
              <p className="text-sm text-gray-500">No recommendations.</p>
            ) : (
              <ul className="space-y-2">
                {data.recommendations.map((r) => (
                  <li key={r.statement} className="border rounded p-3">
                    <div className="text-sm">{r.reason}</div>
                    <code className="text-xs font-mono">{r.statement}</code>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-2">Recent slow queries</h2>
            {data.recentSlow.length === 0 ? (
              <p className="text-sm text-gray-500">None.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {data.recentSlow.map((s, i) => (
                  <li key={`${s.at}-${i}`} className="font-mono text-xs break-all">
                    {s.durationMs}ms — {s.query}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
