'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
} from 'recharts';

interface TrendDataPoint {
  date: string;
  opened: number;
  resolved: number;
  total: number;
}

interface IssueTrendsChartProps {
  data: TrendDataPoint[];
  title?: string;
  showLegend?: boolean;
  height?: number;
  className?: string;
  chartType?: 'area' | 'bar';
}

export function IssueTrendsChart({
  data,
  title = 'Issue Trends',
  showLegend = true,
  height = 300,
  className = '',
  chartType = 'area',
}: IssueTrendsChartProps) {
  // Calculate statistics
  const stats = useMemo(() => {
    if (data.length < 2) return null;

    const recent = data.slice(-7);
    const previous = data.slice(-14, -7);

    const recentOpened = recent.reduce((sum, d) => sum + d.opened, 0);
    const previousOpened = previous.reduce((sum, d) => sum + d.opened, 0);

    const recentResolved = recent.reduce((sum, d) => sum + d.resolved, 0);
    const previousResolved = previous.reduce((sum, d) => sum + d.resolved, 0);

    const openedChange = previousOpened > 0
      ? ((recentOpened - previousOpened) / previousOpened) * 100
      : 0;
    const resolvedChange = previousResolved > 0
      ? ((recentResolved - previousResolved) / previousResolved) * 100
      : 0;

    return {
      recentOpened,
      previousOpened,
      openedChange,
      recentResolved,
      previousResolved,
      resolvedChange,
      netChange: recentResolved - recentOpened,
    };
  }, [data]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getTrendIcon = (change: number) => {
    if (change > 5) return <TrendingUp className="h-4 w-4 text-error" />;
    if (change < -5) return <TrendingDown className="h-4 w-4 text-success" />;
    return <Minus className="h-4 w-4 text-muted" />;
  };

  // Format data for recharts
  const chartData = useMemo(() => {
    return data.slice(-14).map((point) => ({
      ...point,
      date: formatDate(point.date),
    }));
  }, [data]);

  if (data.length === 0) {
    return (
      <div className={`bg-surface border border-border rounded-xl p-5 shadow-sm ${className}`}>
        <h3 className="text-base font-semibold text-foreground mb-4">{title}</h3>
        <div className="flex items-center justify-center h-48 text-muted">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-surface border border-border rounded-xl shadow-sm ${className}`}>
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>

      <div className="p-6">
        {/* Statistics Summary */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className="text-2xl font-bold text-foreground">{stats.recentOpened}</span>
                {getTrendIcon(stats.openedChange)}
              </div>
              <p className="text-sm text-muted">Opened (7d)</p>
              {stats.openedChange !== 0 && (
                <p className={`text-xs ${stats.openedChange > 0 ? 'text-error' : 'text-success'}`}>
                  {stats.openedChange > 0 ? '+' : ''}{stats.openedChange.toFixed(1)}%
                </p>
              )}
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className="text-2xl font-bold text-foreground">{stats.recentResolved}</span>
                {getTrendIcon(-stats.resolvedChange)}
              </div>
              <p className="text-sm text-muted">Resolved (7d)</p>
              {stats.resolvedChange !== 0 && (
                <p className={`text-xs ${stats.resolvedChange > 0 ? 'text-success' : 'text-error'}`}>
                  {stats.resolvedChange > 0 ? '+' : ''}{stats.resolvedChange.toFixed(1)}%
                </p>
              )}
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className={`text-2xl font-bold ${stats.netChange >= 0 ? 'text-success' : 'text-error'}`}>
                  {stats.netChange >= 0 ? '+' : ''}{stats.netChange}
                </span>
              </div>
              <p className="text-sm text-muted">Net Change</p>
            </div>
          </div>
        )}

        {/* Recharts Chart */}
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c96442" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#c96442" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3f7d52" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3f7d52" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6dd" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#8a857c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e8e6dd' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#8a857c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e8e6dd' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e8e6dd',
                    borderRadius: '10px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                {showLegend && <Legend />}
                <Area
                  type="monotone"
                  dataKey="opened"
                  name="Opened"
                  stroke="#c96442"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorOpened)"
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#3f7d52"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorResolved)"
                />
              </AreaChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6dd" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#8a857c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e8e6dd' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#8a857c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e8e6dd' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e8e6dd',
                    borderRadius: '10px',
                    fontSize: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
                {showLegend && <Legend />}
                <Bar dataKey="opened" name="Opened" fill="#c96442" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#3f7d52" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// Mini sparkline version for dashboard cards
interface IssueTrendsSparklineProps {
  data: TrendDataPoint[];
  type: 'opened' | 'resolved' | 'total';
  className?: string;
}

export function IssueTrendsSparkline({ data, type, className = '' }: IssueTrendsSparklineProps) {
  if (data.length === 0) return null;

  const sparklineData = data.slice(-7).map((d, index) => ({
    index,
    value: d[type],
  }));

  const color = type === 'opened' ? '#f87171' : type === 'resolved' ? '#4ade80' : '#60a5fa';

  return (
    <div className={`h-8 ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={sparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparkline-${type}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.6} />
              <stop offset="95%" stopColor={color} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fillOpacity={1}
            fill={`url(#sparkline-${type})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
