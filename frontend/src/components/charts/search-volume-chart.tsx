'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export interface SearchVolumePoint {
  day: string;
  count: number;
}

interface SearchVolumeChartProps {
  data: SearchVolumePoint[];
  height?: number;
  className?: string;
}

export function SearchVolumeChart({ data, height = 300, className = '' }: SearchVolumeChartProps) {
  if (data.length === 0) {
    return (
      <div className={`text-sm text-secondary ${className}`}>No search volume data</div>
    );
  }
  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" name="Searches" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
