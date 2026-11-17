'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSearchAnalytics } from '@/hooks/useSearch';
import { ENTITY_LABELS } from '@/lib/search';
import type { SearchEntityType } from '@/lib/api';

const RANGES = [7, 30, 90] as const;

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-surface rounded-xl shadow-sm p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function QueryTable({
  title,
  rows,
  empty,
  showAvg,
}: {
  title: string;
  rows: Array<{ query: string; count: number; avgResults?: number }>;
  empty: string;
  showAvg?: boolean;
}) {
  return (
    <div className="bg-surface rounded-xl shadow-sm p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-medium">Query</th>
              <th className="pb-2 font-medium text-right">Searches</th>
              {showAvg && <th className="pb-2 font-medium text-right">Avg results</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.query} className="border-t border-border">
                <td className="py-2 pr-2">
                  <Link href={`/search?q=${encodeURIComponent(r.query)}`} className="text-foreground hover:text-primary break-all">
                    {r.query}
                  </Link>
                </td>
                <td className="py-2 text-right tabular-nums">{r.count}</td>
                {showAvg && <td className="py-2 text-right tabular-nums">{r.avgResults}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function SearchAnalyticsPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, error } = useSearchAnalytics(days);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link href="/search" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to search
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Search Analytics</h1>
          <p className="mt-1 text-sm text-muted">What people search for and where search comes up empty.</p>
        </div>
        <div className="flex rounded-lg border border-border-strong overflow-hidden" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`px-3 py-1.5 text-sm ${days === r ? 'bg-primary text-primary-fg' : 'bg-surface text-secondary hover:bg-surface-hover'}`}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading analytics" />
        </div>
      )}

      {error && (
        <div className="bg-error-subtle rounded-xl p-6 text-center" role="alert">
          <AlertTriangle className="h-8 w-8 text-error mx-auto mb-2" />
          <p className="text-error">Could not load search analytics. You need report or admin read access.</p>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatTile label="Searches" value={data.totals.searches.toLocaleString()} />
            <StatTile label="Unique users" value={data.totals.uniqueUsers.toLocaleString()} />
            <StatTile label="Avg results" value={data.totals.avgResults.toLocaleString()} />
            <StatTile
              label="Zero-result rate"
              value={`${(data.totals.zeroResultRate * 100).toFixed(1)}%`}
              hint={`${data.totals.zeroResultSearches.toLocaleString()} searches`}
            />
            <StatTile label="Avg response" value={`${data.totals.avgDurationMs} ms`} />
          </div>

          <div className="bg-surface rounded-xl shadow-sm p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Searches per day</h2>
            {data.searchesPerDay.length === 0 ? (
              <p className="text-sm text-muted">No searches in this period.</p>
            ) : (
              <div className="h-64" data-testid="searches-per-day-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.searchesPerDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e6dd" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={36} />
                    <Tooltip />
                    <Bar dataKey="count" name="Searches" fill="#c96442" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <QueryTable title="Top searches" rows={data.topQueries} empty="No searches yet." showAvg />
            <QueryTable
              title="Searches with no results"
              rows={data.zeroResultQueries}
              empty="Every search found something."
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-surface rounded-xl shadow-sm p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Record types searched</h2>
              {data.entityTypeUsage.length === 0 ? (
                <p className="text-sm text-muted">No data.</p>
              ) : (
                <ul className="space-y-2">
                  {data.entityTypeUsage.map((u) => {
                    const max = data.entityTypeUsage[0].count || 1;
                    return (
                      <li key={u.entityType} className="text-sm">
                        <div className="flex justify-between">
                          <span>{ENTITY_LABELS[u.entityType as SearchEntityType] ?? u.entityType}</span>
                          <span className="tabular-nums text-muted">{u.count}</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-background">
                          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(u.count / max) * 100}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="bg-surface rounded-xl shadow-sm p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3">Most used saved searches</h2>
              {data.topTemplates.length === 0 ? (
                <p className="text-sm text-muted">No saved searches have been used yet.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {data.topTemplates.map((t) => (
                    <li key={t.id} className="flex justify-between">
                      <span className="truncate">{t.name}</span>
                      <span className="tabular-nums text-muted">{t.useCount}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
