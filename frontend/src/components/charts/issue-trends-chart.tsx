'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

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
}

// Note: This component requires recharts to be installed
// Run: npm install recharts
// After installation, uncomment the recharts import and replace the placeholder chart

export function IssueTrendsChart({
  data,
  title = 'Issue Trends',
  showLegend = true,
  height = 300,
  className = '',
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

  // Calculate chart bounds for the placeholder
  const chartBounds = useMemo(() => {
    if (data.length === 0) return { maxValue: 10, minValue: 0 };
    const values = data.flatMap((d) => [d.opened, d.resolved, d.total]);
    return {
      maxValue: Math.max(...values, 1),
      minValue: Math.min(...values),
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

        {/* Placeholder Chart - Replace with Recharts when installed */}
        <div style={{ height }} className="relative border border-gray-200 rounded-lg overflow-hidden">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between py-2 text-xs text-gray-500">
            <span>{chartBounds.maxValue}</span>
            <span>{Math.round(chartBounds.maxValue / 2)}</span>
            <span>{chartBounds.minValue}</span>
          </div>

          {/* Chart area */}
          <div className="absolute left-12 right-0 top-0 bottom-6 flex items-end space-x-1 px-2">
            {data.slice(-14).map((point, index) => {
              const openedHeight = (point.opened / chartBounds.maxValue) * 100;
              const resolvedHeight = (point.resolved / chartBounds.maxValue) * 100;

              return (
                <div key={index} className="flex-1 flex space-x-0.5" title={`${formatDate(point.date)}: ${point.opened} opened, ${point.resolved} resolved`}>
                  <div
                    className="flex-1 bg-red-400 rounded-t opacity-75 hover:opacity-100 transition-opacity"
                    style={{ height: `${openedHeight}%` }}
                  />
                  <div
                    className="flex-1 bg-green-400 rounded-t opacity-75 hover:opacity-100 transition-opacity"
                    style={{ height: `${resolvedHeight}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="absolute left-12 right-0 bottom-0 h-6 flex justify-between px-2 text-xs text-gray-500">
            {data.slice(-14).filter((_, i) => i % 2 === 0).map((point, index) => (
              <span key={index}>{formatDate(point.date)}</span>
            ))}
          </div>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="flex items-center justify-center space-x-6 mt-4">
            <div className="flex items-center">
              <div className="h-3 w-3 bg-red-400 rounded mr-2" />
              <span className="text-sm text-gray-600">Opened</span>
            </div>
            <div className="flex items-center">
              <div className="h-3 w-3 bg-green-400 rounded mr-2" />
              <span className="text-sm text-gray-600">Resolved</span>
            </div>
          </div>
        )}

        {/* Install Note */}
        <p className="text-xs text-gray-400 text-center mt-4">
          For enhanced charts, install recharts: npm install recharts
        </p>
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

  const values = data.slice(-7).map((d) => d[type]);
  const max = Math.max(...values, 1);

  return (
    <div className={`flex items-end space-x-0.5 h-8 ${className}`}>
      {values.map((value, index) => (
        <div
          key={index}
          className={`flex-1 rounded-t ${
            type === 'opened' ? 'bg-red-300' :
            type === 'resolved' ? 'bg-green-300' : 'bg-blue-300'
          }`}
          style={{ height: `${(value / max) * 100}%` }}
        />
      ))}
    </div>
  );
}
