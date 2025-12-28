'use client';

import { useMemo } from 'react';
import { Server, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface HealthDistributionData {
  range: string;
  count: number;
  percentage: number;
}

interface HealthDistributionChartProps {
  data: HealthDistributionData[];
  title?: string;
  showPercentages?: boolean;
  className?: string;
}

// Health score ranges and their configurations
const healthRanges = {
  critical: { label: 'Critical (0-25)', color: 'bg-red-500', textColor: 'text-red-600', icon: XCircle },
  poor: { label: 'Poor (26-50)', color: 'bg-orange-500', textColor: 'text-orange-600', icon: AlertTriangle },
  fair: { label: 'Fair (51-75)', color: 'bg-yellow-500', textColor: 'text-yellow-600', icon: AlertTriangle },
  good: { label: 'Good (76-90)', color: 'bg-green-400', textColor: 'text-green-500', icon: CheckCircle },
  excellent: { label: 'Excellent (91-100)', color: 'bg-green-600', textColor: 'text-green-700', icon: CheckCircle },
};

export function HealthDistributionChart({
  data,
  title = 'Application Health Distribution',
  showPercentages = true,
  className = '',
}: HealthDistributionChartProps) {
  // Calculate totals
  const totals = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.count, 0);
    const healthy = data
      .filter((d) => ['good', 'excellent'].includes(d.range))
      .reduce((sum, d) => sum + d.count, 0);
    const critical = data
      .filter((d) => d.range === 'critical')
      .reduce((sum, d) => sum + d.count, 0);

    return {
      total,
      healthy,
      critical,
      healthyPercentage: total > 0 ? (healthy / total) * 100 : 0,
    };
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
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Server className="h-5 w-5 text-gray-400 mr-2" />
              <span className="text-2xl font-bold text-gray-900">{totals.total}</span>
            </div>
            <p className="text-sm text-gray-500">Total Apps</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
              <span className="text-2xl font-bold text-green-600">{totals.healthy}</span>
            </div>
            <p className="text-sm text-green-600">Healthy</p>
            <p className="text-xs text-green-500">{totals.healthyPercentage.toFixed(0)}%</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <XCircle className="h-5 w-5 text-red-500 mr-2" />
              <span className="text-2xl font-bold text-red-600">{totals.critical}</span>
            </div>
            <p className="text-sm text-red-600">Critical</p>
          </div>
        </div>

        {/* Horizontal Stacked Bar */}
        <div className="mb-6">
          <div className="h-8 flex rounded-lg overflow-hidden">
            {data.map((item) => {
              const config = healthRanges[item.range as keyof typeof healthRanges];
              if (!config || item.count === 0) return null;

              return (
                <div
                  key={item.range}
                  className={`${config.color} flex items-center justify-center transition-all hover:opacity-80`}
                  style={{ width: `${item.percentage}%` }}
                  title={`${config.label}: ${item.count} apps (${item.percentage.toFixed(1)}%)`}
                >
                  {item.percentage > 10 && (
                    <span className="text-white text-xs font-medium">{item.count}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend / Distribution List */}
        <div className="space-y-3">
          {Object.entries(healthRanges).map(([key, config]) => {
            const item = data.find((d) => d.range === key);
            const count = item?.count || 0;
            const percentage = item?.percentage || 0;
            const Icon = config.icon;

            return (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`h-3 w-3 rounded ${config.color} mr-3`} />
                  <Icon className={`h-4 w-4 ${config.textColor} mr-2`} />
                  <span className="text-sm text-gray-700">{config.label}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium text-gray-900">{count}</span>
                  {showPercentages && (
                    <span className="text-sm text-gray-500 w-12 text-right">
                      {percentage.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Donut chart representation
interface HealthDonutChartProps {
  data: HealthDistributionData[];
  size?: number;
  className?: string;
}

export function HealthDonutChart({ data, size = 120, className = '' }: HealthDonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const healthyCount = data
    .filter((d) => ['good', 'excellent'].includes(d.range))
    .reduce((sum, d) => sum + d.count, 0);
  const healthyPercentage = total > 0 ? (healthyCount / total) * 100 : 0;

  // Calculate SVG donut segments
  const segments = useMemo(() => {
    const circumference = 2 * Math.PI * 45; // radius = 45

    return data.reduce<{ offset: number; length: number; color: string }[]>(
      (acc, item) => {
        const config = healthRanges[item.range as keyof typeof healthRanges];
        const segmentLength = (item.percentage / 100) * circumference;
        const currentOffset = acc.length > 0
          ? acc[acc.length - 1].offset + acc[acc.length - 1].length
          : 0;

        acc.push({
          offset: currentOffset,
          length: segmentLength,
          color: config?.color.replace('bg-', '') || 'gray-400',
        });

        return acc;
      },
      []
    );
  }, [data]);

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="10"
          />
          {/* Segments - simplified without recharts */}
          {segments.map((segment, index) => (
            <circle
              key={index}
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={getColorValue(segment.color)}
              strokeWidth="10"
              strokeDasharray={`${segment.length} ${2 * Math.PI * 45}`}
              strokeDashoffset={-segment.offset}
              className="transition-all"
            />
          ))}
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-900">{healthyPercentage.toFixed(0)}%</span>
          <span className="text-xs text-gray-500">Healthy</span>
        </div>
      </div>
    </div>
  );
}

// Mini health indicator for cards
interface HealthIndicatorProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function HealthIndicator({ score, size = 'md', showLabel = true }: HealthIndicatorProps) {
  const getHealthConfig = (value: number) => {
    if (value <= 25) return { label: 'Critical', color: 'text-red-600', bg: 'bg-red-100' };
    if (value <= 50) return { label: 'Poor', color: 'text-orange-600', bg: 'bg-orange-100' };
    if (value <= 75) return { label: 'Fair', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    if (value <= 90) return { label: 'Good', color: 'text-green-500', bg: 'bg-green-100' };
    return { label: 'Excellent', color: 'text-green-700', bg: 'bg-green-100' };
  };

  const config = getHealthConfig(score);

  const sizeClasses = {
    sm: 'h-6 w-12 text-xs',
    md: 'h-8 w-16 text-sm',
    lg: 'h-10 w-20 text-base',
  };

  return (
    <div className="flex items-center space-x-2">
      <div className={`${sizeClasses[size]} ${config.bg} ${config.color} font-medium rounded flex items-center justify-center`}>
        {score}%
      </div>
      {showLabel && (
        <span className={`text-sm ${config.color}`}>{config.label}</span>
      )}
    </div>
  );
}

// Helper function to convert Tailwind color class to actual color value
function getColorValue(colorClass: string): string {
  const colorMap: Record<string, string> = {
    'red-500': '#ef4444',
    'orange-500': '#f97316',
    'yellow-500': '#eab308',
    'green-400': '#4ade80',
    'green-600': '#16a34a',
    'gray-400': '#9ca3af',
  };
  return colorMap[colorClass] || '#9ca3af';
}
