import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IssueTrendsChart, IssueTrendsSparkline } from '../issue-trends-chart';

// Mock recharts components
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children, data }: any) => (
    <div data-testid="area-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-chart-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Area: ({ dataKey, name }: any) => (
    <div data-testid={`area-${dataKey}`} data-name={name} />
  ),
  Bar: ({ dataKey, name }: any) => (
    <div data-testid={`bar-${dataKey}`} data-name={name} />
  ),
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
}));

describe('IssueTrendsChart', () => {
  const mockData = [
    { date: '2024-01-01', opened: 10, resolved: 5, total: 15 },
    { date: '2024-01-02', opened: 8, resolved: 7, total: 16 },
    { date: '2024-01-03', opened: 12, resolved: 6, total: 22 },
    { date: '2024-01-04', opened: 9, resolved: 10, total: 21 },
    { date: '2024-01-05', opened: 15, resolved: 8, total: 28 },
    { date: '2024-01-06', opened: 7, resolved: 12, total: 23 },
    { date: '2024-01-07', opened: 11, resolved: 9, total: 25 },
    { date: '2024-01-08', opened: 10, resolved: 11, total: 24 },
    { date: '2024-01-09', opened: 13, resolved: 7, total: 30 },
    { date: '2024-01-10', opened: 9, resolved: 14, total: 25 },
    { date: '2024-01-11', opened: 16, resolved: 10, total: 31 },
    { date: '2024-01-12', opened: 8, resolved: 12, total: 27 },
    { date: '2024-01-13', opened: 14, resolved: 9, total: 32 },
    { date: '2024-01-14', opened: 10, resolved: 15, total: 27 },
  ];

  describe('Empty State', () => {
    it('renders empty state when data is empty', () => {
      render(<IssueTrendsChart data={[]} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('renders custom title in empty state', () => {
      render(<IssueTrendsChart data={[]} title="Custom Title" />);
      expect(screen.getByText('Custom Title')).toBeInTheDocument();
    });

    it('does not render chart when data is empty', () => {
      render(<IssueTrendsChart data={[]} />);
      expect(screen.queryByTestId('area-chart')).not.toBeInTheDocument();
    });
  });

  describe('Basic Rendering', () => {
    it('renders the component with default title', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByText('Issue Trends')).toBeInTheDocument();
    });

    it('renders custom title', () => {
      render(<IssueTrendsChart data={mockData} title="My Custom Chart" />);
      expect(screen.getByText('My Custom Chart')).toBeInTheDocument();
    });

    it('renders area chart by default', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <IssueTrendsChart data={mockData} className="custom-class" />
      );
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('Chart Type', () => {
    it('renders area chart when chartType is area', () => {
      render(<IssueTrendsChart data={mockData} chartType="area" />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
    });

    it('renders bar chart when chartType is bar', () => {
      render(<IssueTrendsChart data={mockData} chartType="bar" />);
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-opened')).toBeInTheDocument();
      expect(screen.queryByTestId('bar-resolved')).toBeInTheDocument();
    });

    it('renders area chart elements for area type', () => {
      render(<IssueTrendsChart data={mockData} chartType="area" />);
      expect(screen.getByTestId('area-opened')).toBeInTheDocument();
      expect(screen.getByTestId('area-resolved')).toBeInTheDocument();
    });
  });

  describe('Chart Components', () => {
    it('renders responsive container', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders x-axis', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByTestId('x-axis')).toBeInTheDocument();
    });

    it('renders y-axis', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByTestId('y-axis')).toBeInTheDocument();
    });

    it('renders cartesian grid', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByTestId('cartesian-grid')).toBeInTheDocument();
    });

    it('renders tooltip', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByTestId('tooltip')).toBeInTheDocument();
    });

    it('renders legend when showLegend is true', () => {
      render(<IssueTrendsChart data={mockData} showLegend={true} />);
      expect(screen.getByTestId('legend')).toBeInTheDocument();
    });

    it('does not render legend when showLegend is false', () => {
      render(<IssueTrendsChart data={mockData} showLegend={false} />);
      expect(screen.queryByTestId('legend')).not.toBeInTheDocument();
    });
  });

  describe('Statistics Display', () => {
    it('displays opened count for last 7 days', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByText('Opened (7d)')).toBeInTheDocument();
    });

    it('displays resolved count for last 7 days', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByText('Resolved (7d)')).toBeInTheDocument();
    });

    it('displays net change', () => {
      render(<IssueTrendsChart data={mockData} />);
      expect(screen.getByText('Net Change')).toBeInTheDocument();
    });

    it('does not display statistics when data has less than 2 points', () => {
      const singleDataPoint = [{ date: '2024-01-01', opened: 10, resolved: 5, total: 15 }];
      render(<IssueTrendsChart data={singleDataPoint} />);
      expect(screen.queryByText('Opened (7d)')).not.toBeInTheDocument();
    });
  });

  describe('Data Processing', () => {
    it('limits chart data to last 14 days', () => {
      const manyDataPoints = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        opened: 10,
        resolved: 5,
        total: 15,
      }));
      render(<IssueTrendsChart data={manyDataPoints} />);
      const areaChart = screen.getByTestId('area-chart');
      const chartData = JSON.parse(areaChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(14);
    });

    it('formats dates correctly in chart data', () => {
      render(<IssueTrendsChart data={mockData} />);
      const areaChart = screen.getByTestId('area-chart');
      const chartData = JSON.parse(areaChart.getAttribute('data-chart-data') || '[]');
      // Date should be formatted as "Jan 1" style
      expect(chartData[0].date).toMatch(/[A-Z][a-z]{2} \d+/);
    });
  });

  describe('Styling', () => {
    it('applies white background to container', () => {
      const { container } = render(<IssueTrendsChart data={mockData} />);
      const chartContainer = container.querySelector('.bg-white');
      expect(chartContainer).toBeInTheDocument();
    });

    it('applies rounded corners to container', () => {
      const { container } = render(<IssueTrendsChart data={mockData} />);
      const chartContainer = container.querySelector('.rounded-lg');
      expect(chartContainer).toBeInTheDocument();
    });

    it('applies shadow to container', () => {
      const { container } = render(<IssueTrendsChart data={mockData} />);
      const chartContainer = container.querySelector('.shadow');
      expect(chartContainer).toBeInTheDocument();
    });
  });
});

describe('IssueTrendsSparkline', () => {
  const mockData = [
    { date: '2024-01-01', opened: 10, resolved: 5, total: 15 },
    { date: '2024-01-02', opened: 8, resolved: 7, total: 16 },
    { date: '2024-01-03', opened: 12, resolved: 6, total: 22 },
    { date: '2024-01-04', opened: 9, resolved: 10, total: 21 },
    { date: '2024-01-05', opened: 15, resolved: 8, total: 28 },
    { date: '2024-01-06', opened: 7, resolved: 12, total: 23 },
    { date: '2024-01-07', opened: 11, resolved: 9, total: 25 },
  ];

  describe('Basic Rendering', () => {
    it('renders sparkline with opened type', () => {
      render(<IssueTrendsSparkline data={mockData} type="opened" />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders sparkline with resolved type', () => {
      render(<IssueTrendsSparkline data={mockData} type="resolved" />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('renders sparkline with total type', () => {
      render(<IssueTrendsSparkline data={mockData} type="total" />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });

    it('returns null when data is empty', () => {
      const { container } = render(<IssueTrendsSparkline data={[]} type="opened" />);
      expect(container.firstChild).toBeNull();
    });

    it('applies custom className', () => {
      const { container } = render(
        <IssueTrendsSparkline data={mockData} type="opened" className="custom-class" />
      );
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('Data Processing', () => {
    it('limits data to last 7 days', () => {
      const manyDataPoints = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        opened: 10,
        resolved: 5,
        total: 15,
      }));
      render(<IssueTrendsSparkline data={manyDataPoints} type="opened" />);
      const areaChart = screen.getByTestId('area-chart');
      const chartData = JSON.parse(areaChart.getAttribute('data-chart-data') || '[]');
      expect(chartData).toHaveLength(7);
    });

    it('extracts correct value for opened type', () => {
      render(<IssueTrendsSparkline data={mockData} type="opened" />);
      const areaChart = screen.getByTestId('area-chart');
      const chartData = JSON.parse(areaChart.getAttribute('data-chart-data') || '[]');
      expect(chartData[0].value).toBe(10);
    });

    it('extracts correct value for resolved type', () => {
      render(<IssueTrendsSparkline data={mockData} type="resolved" />);
      const areaChart = screen.getByTestId('area-chart');
      const chartData = JSON.parse(areaChart.getAttribute('data-chart-data') || '[]');
      expect(chartData[0].value).toBe(5);
    });

    it('extracts correct value for total type', () => {
      render(<IssueTrendsSparkline data={mockData} type="total" />);
      const areaChart = screen.getByTestId('area-chart');
      const chartData = JSON.parse(areaChart.getAttribute('data-chart-data') || '[]');
      expect(chartData[0].value).toBe(15);
    });
  });

  describe('Chart Components', () => {
    it('renders area chart', () => {
      render(<IssueTrendsSparkline data={mockData} type="opened" />);
      expect(screen.getByTestId('area-chart')).toBeInTheDocument();
    });

    it('renders responsive container', () => {
      render(<IssueTrendsSparkline data={mockData} type="opened" />);
      expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies h-8 height class', () => {
      const { container } = render(
        <IssueTrendsSparkline data={mockData} type="opened" />
      );
      expect(container.querySelector('.h-8')).toBeInTheDocument();
    });
  });
});
