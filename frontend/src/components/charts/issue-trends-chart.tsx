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
    if (change > 5) return <TrendingUp className="h-4 w-4 text-red-500" />;
    if (change < -5) return <TrendingDown className="h-4 w-4 text-green-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
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
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <h3 className="text-lg font-medium text-gray-900 mb-4">{title}</h3>
        <div className="flex items-center justify-center h-48 text-gray-500">
          No data available
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      </div>

      <div className="p-6">
        {/* Statistics Summary */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className="text-2xl font-bold text-gray-900">{stats.recentOpened}</span>
                {getTrendIcon(stats.openedChange)}
              </div>
              <p className="text-sm text-gray-500">Opened (7d)</p>
              {stats.openedChange !== 0 && (
                <p className={`text-xs ${stats.openedChange > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {stats.openedChange > 0 ? '+' : ''}{stats.openedChange.toFixed(1)}%
                </p>
              )}
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className="text-2xl font-bold text-gray-900">{stats.recentResolved}</span>
                {getTrendIcon(-stats.resolvedChange)}
              </div>
              <p className="text-sm text-gray-500">Resolved (7d)</p>
              {stats.resolvedChange !== 0 && (
                <p className={`text-xs ${stats.resolvedChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {stats.resolvedChange > 0 ? '+' : ''}{stats.resolvedChange.toFixed(1)}%
                </p>
              )}
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center space-x-1">
                <span className={`text-2xl font-bold ${stats.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.netChange >= 0 ? '+' : ''}{stats.netChange}
                </span>
              </div>
              <p className="text-sm text-gray-500">Net Change</p>
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
                    <stop offset="5%" stopColor="#f87171" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f87171" stopOpacity={0.1} />
                  </linearGradient>
                  <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                {showLegend && <Legend />}
                <Area
                  type="monotone"
                  dataKey="opened"
                  name="Opened"
                  stroke="#f87171"
                  fillOpacity={1}
                  fill="url(#colorOpened)"
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#4ade80"
                  fillOpacity={1}
                  fill="url(#colorResolved)"
                />
              </AreaChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                {showLegend && <Legend />}
                <Bar dataKey="opened" name="Opened" fill="#f87171" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#4ade80" radius={[4, 4, 0, 0]} />
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
