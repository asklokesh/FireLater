'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface SearchVolumePoint {
  date: string;
  count: number;
}

interface SearchVolumeChartProps {
  data: SearchVolumePoint[];
  title?: string;
  height?: number;
  className?: string;
}

export function SearchVolumeChart({
  data,
  title = 'Daily Search Volume',
  height = 300,
  className = '',
}: SearchVolumeChartProps) {
  const chartData = useMemo(
    () =>
      data.map((point) => ({
        ...point,
        label: new Date(point.date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
      })),
    [data]
  );

  return (
    <div className={`bg-surface border border-border rounded-xl shadow-sm ${className}`}>
      <div className="px-6 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-6">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-muted">No data available</div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e6dd" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#8a857c' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e8e6dd' }}
                />
                <YAxis
                  allowDecimals={false}
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
                  }}
                />
                <Bar dataKey="count" name="Searches" fill="#c96442" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
