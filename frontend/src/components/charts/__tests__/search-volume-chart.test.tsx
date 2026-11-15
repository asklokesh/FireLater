import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SearchVolumeChart } from '../search-volume-chart';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>{children}</div>
  ),
  Bar: ({ dataKey }: any) => <div data-testid={`bar-${dataKey}`} />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
}));

describe('SearchVolumeChart', () => {
  it('renders bar chart with data', () => {
    const data = [{ day: '2024-01-01', count: 3 }];
    render(<SearchVolumeChart data={data} />);
    expect(screen.getByTestId('bar-chart').getAttribute('data-chart-data')).toBe(JSON.stringify(data));
    expect(screen.getByTestId('bar-count')).toBeInTheDocument();
  });

  it('renders empty message without data', () => {
    render(<SearchVolumeChart data={[]} />);
    expect(screen.getByText('No search volume data')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });
});
