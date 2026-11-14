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

interface SearchVolumeChartProps {
  data: Array<{ date: string; count: number }>;
  title?: string;
  height?: number;
}

export function SearchVolumeChart({
  data,
  title = 'Searches per day',
  height = 300,
}: SearchVolumeChartProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="count" name="Searches" fill="#3b82f6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
