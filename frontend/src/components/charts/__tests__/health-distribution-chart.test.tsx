import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  HealthDistributionChart,
  HealthDonutChart,
  HealthIndicator,
} from '../health-distribution-chart';

describe('HealthDistributionChart', () => {
  const mockData = [
    { range: 'critical', count: 5, percentage: 10 },
    { range: 'poor', count: 8, percentage: 16 },
    { range: 'fair', count: 12, percentage: 24 },
    { range: 'good', count: 15, percentage: 30 },
    { range: 'excellent', count: 10, percentage: 20 },
  ];

  describe('Empty State', () => {
    it('renders empty state when data is empty', () => {
      render(<HealthDistributionChart data={[]} />);
      expect(screen.getByText('No data available')).toBeInTheDocument();
    });

    it('renders custom title in empty state', () => {
      render(<HealthDistributionChart data={[]} title="Custom Health Title" />);
      expect(screen.getByText('Custom Health Title')).toBeInTheDocument();
    });

    it('does not render stats when data is empty', () => {
      render(<HealthDistributionChart data={[]} />);
      expect(screen.queryByText('Total Apps')).not.toBeInTheDocument();
    });
  });

  describe('Basic Rendering', () => {
    it('renders the component with default title', () => {
      render(<HealthDistributionChart data={mockData} />);
      expect(screen.getByText('Application Health Distribution')).toBeInTheDocument();
    });

    it('renders custom title', () => {
      render(<HealthDistributionChart data={mockData} title="My Health Chart" />);
      expect(screen.getByText('My Health Chart')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <HealthDistributionChart data={mockData} className="custom-class" />
      );
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });
  });

  describe('Summary Statistics', () => {
    it('displays total apps count', () => {
      render(<HealthDistributionChart data={mockData} />);
      expect(screen.getByText('Total Apps')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument(); // 5+8+12+15+10
    });

    it('displays healthy apps count', () => {
      render(<HealthDistributionChart data={mockData} />);
      expect(screen.getByText('Healthy')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument(); // 15+10 (good+excellent)
    });

    it('displays critical apps count', () => {
      render(<HealthDistributionChart data={mockData} />);
      expect(screen.getByText('Critical')).toBeInTheDocument();
      // Use getAllByText to handle multiple instances of '5'
      const fiveElements = screen.getAllByText('5');
      expect(fiveElements.length).toBeGreaterThan(0);
    });

    it('calculates healthy percentage correctly', () => {
      render(<HealthDistributionChart data={mockData} />);
      // 25 healthy out of 50 total = 50%
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('handles zero total gracefully', () => {
      const zeroData = [
        { range: 'critical', count: 0, percentage: 0 },
        { range: 'poor', count: 0, percentage: 0 },
      ];
      render(<HealthDistributionChart data={zeroData} />);
      // Should show 0 for total apps
      const zeroElements = screen.getAllByText('0');
      expect(zeroElements.length).toBeGreaterThan(0);
    });
  });

  describe('Health Range Legend', () => {
    it('displays all health range labels', () => {
      render(<HealthDistributionChart data={mockData} />);
      expect(screen.getByText('Critical (0-25)')).toBeInTheDocument();
      expect(screen.getByText('Poor (26-50)')).toBeInTheDocument();
      expect(screen.getByText('Fair (51-75)')).toBeInTheDocument();
      expect(screen.getByText('Good (76-90)')).toBeInTheDocument();
      expect(screen.getByText('Excellent (91-100)')).toBeInTheDocument();
    });

    it('displays count for each range', () => {
      render(<HealthDistributionChart data={mockData} />);
      // All counts should be visible in the legend
      const countElements = screen.getAllByText('5');
      expect(countElements.length).toBeGreaterThan(0);
    });

    it('displays percentages when showPercentages is true', () => {
      render(<HealthDistributionChart data={mockData} showPercentages={true} />);
      expect(screen.getByText('10.0%')).toBeInTheDocument(); // critical
      expect(screen.getByText('16.0%')).toBeInTheDocument(); // poor
    });

    it('does not display percentages when showPercentages is false', () => {
      render(<HealthDistributionChart data={mockData} showPercentages={false} />);
      // Should not show the detailed percentages in legend
      expect(screen.queryByText('10.0%')).not.toBeInTheDocument();
    });

    it('displays zero count for missing ranges', () => {
      const partialData = [
        { range: 'critical', count: 5, percentage: 100 },
      ];
      render(<HealthDistributionChart data={partialData} />);
      // Other ranges should show 0
      expect(screen.getByText('Poor (26-50)')).toBeInTheDocument();
    });
  });

  describe('Horizontal Stacked Bar', () => {
    it('renders bar segments for non-zero counts', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      // Check for stacked bar container
      const stackedBar = container.querySelector('.h-8.flex.rounded-lg.overflow-hidden');
      expect(stackedBar).toBeInTheDocument();
    });

    it('does not render segments for zero counts', () => {
      const zeroData = [
        { range: 'critical', count: 0, percentage: 0 },
        { range: 'poor', count: 10, percentage: 100 },
      ];
      const { container } = render(<HealthDistributionChart data={zeroData} />);
      const stackedBar = container.querySelector('.h-8.flex.rounded-lg.overflow-hidden');
      // Should only have segments for non-zero counts
      expect(stackedBar?.children.length).toBe(1);
    });

    it('applies correct color classes to segments', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      // Check for red background (critical)
      expect(container.querySelector('.bg-red-500')).toBeInTheDocument();
      // Check for green background (good/excellent)
      expect(container.querySelector('.bg-green-600')).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('renders Server icon in total apps stat', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      // Lucide icons render as SVG elements
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('renders CheckCircle icon in healthy stat', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      // Multiple CheckCircle icons should be present
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(2);
    });

    it('renders XCircle icon in critical stat', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(3);
    });
  });

  describe('Styling', () => {
    it('applies white background to container', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      expect(container.querySelector('.bg-white')).toBeInTheDocument();
    });

    it('applies rounded corners to container', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      expect(container.querySelector('.rounded-lg')).toBeInTheDocument();
    });

    it('applies shadow to container', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      expect(container.querySelector('.shadow')).toBeInTheDocument();
    });

    it('applies border to header', () => {
      const { container } = render(<HealthDistributionChart data={mockData} />);
      expect(container.querySelector('.border-b')).toBeInTheDocument();
    });
  });
});

describe('HealthDonutChart', () => {
  const mockData = [
    { range: 'critical', count: 5, percentage: 10 },
    { range: 'poor', count: 8, percentage: 16 },
    { range: 'fair', count: 12, percentage: 24 },
    { range: 'good', count: 15, percentage: 30 },
    { range: 'excellent', count: 10, percentage: 20 },
  ];

  describe('Basic Rendering', () => {
    it('renders donut chart', () => {
      const { container } = render(<HealthDonutChart data={mockData} />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <HealthDonutChart data={mockData} className="custom-class" />
      );
      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('uses default size of 120', () => {
      const { container } = render(<HealthDonutChart data={mockData} />);
      const sizedContainer = container.querySelector('[style*="width"]');
      expect(sizedContainer).toBeInTheDocument();
    });

    it('respects custom size prop', () => {
      const { container } = render(<HealthDonutChart data={mockData} size={200} />);
      const sizedContainer = container.querySelector('[style*="width"]');
      expect(sizedContainer).toHaveStyle({ width: '200px', height: '200px' });
    });
  });

  describe('SVG Rendering', () => {
    it('renders SVG viewBox correctly', () => {
      const { container } = render(<HealthDonutChart data={mockData} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('viewBox', '0 0 100 100');
    });

    it('renders background circle', () => {
      const { container } = render(<HealthDonutChart data={mockData} />);
      const circles = container.querySelectorAll('circle');
      expect(circles.length).toBeGreaterThan(0);
    });

    it('renders segment circles for each data point', () => {
      const { container } = render(<HealthDonutChart data={mockData} />);
      const circles = container.querySelectorAll('circle');
      // Should have 1 background circle + 5 segment circles
      expect(circles.length).toBe(6);
    });

    it('applies rotation transform to svg', () => {
      const { container } = render(<HealthDonutChart data={mockData} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('transform', '-rotate-90');
    });
  });

  describe('Center Label', () => {
    it('displays healthy percentage in center', () => {
      render(<HealthDonutChart data={mockData} />);
      // 25 healthy (15+10) out of 50 total = 50%
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('displays "Healthy" label', () => {
      render(<HealthDonutChart data={mockData} />);
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });

    it('handles zero total gracefully', () => {
      const zeroData = [{ range: 'critical', count: 0, percentage: 0 }];
      render(<HealthDonutChart data={zeroData} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('calculates percentage for all healthy apps', () => {
      const allHealthyData = [
        { range: 'good', count: 30, percentage: 60 },
        { range: 'excellent', count: 20, percentage: 40 },
      ];
      render(<HealthDonutChart data={allHealthyData} />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('calculates percentage for no healthy apps', () => {
      const noHealthyData = [
        { range: 'critical', count: 30, percentage: 60 },
        { range: 'poor', count: 20, percentage: 40 },
      ];
      render(<HealthDonutChart data={noHealthyData} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('Data Processing', () => {
    it('filters healthy apps correctly (good + excellent)', () => {
      render(<HealthDonutChart data={mockData} />);
      // 15 good + 10 excellent = 25 healthy
      expect(screen.getByText('50%')).toBeInTheDocument(); // 25/50
    });

    it('excludes critical, poor, fair from healthy count', () => {
      const unhealthyData = [
        { range: 'critical', count: 100, percentage: 100 },
      ];
      render(<HealthDonutChart data={unhealthyData} />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });
});

describe('HealthIndicator', () => {
  describe('Basic Rendering', () => {
    it('renders indicator with score', () => {
      render(<HealthIndicator score={85} />);
      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('displays label by default', () => {
      render(<HealthIndicator score={85} />);
      expect(screen.getByText('Good')).toBeInTheDocument();
    });

    it('hides label when showLabel is false', () => {
      render(<HealthIndicator score={85} showLabel={false} />);
      expect(screen.queryByText('Good')).not.toBeInTheDocument();
    });
  });

  describe('Health Score Classification', () => {
    it('classifies score 0-25 as Critical', () => {
      render(<HealthIndicator score={20} />);
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('classifies score 26-50 as Poor', () => {
      render(<HealthIndicator score={40} />);
      expect(screen.getByText('Poor')).toBeInTheDocument();
    });

    it('classifies score 51-75 as Fair', () => {
      render(<HealthIndicator score={60} />);
      expect(screen.getByText('Fair')).toBeInTheDocument();
    });

    it('classifies score 76-90 as Good', () => {
      render(<HealthIndicator score={85} />);
      expect(screen.getByText('Good')).toBeInTheDocument();
    });

    it('classifies score 91-100 as Excellent', () => {
      render(<HealthIndicator score={95} />);
      expect(screen.getByText('Excellent')).toBeInTheDocument();
    });

    it('handles boundary value 25 correctly', () => {
      render(<HealthIndicator score={25} />);
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('handles boundary value 50 correctly', () => {
      render(<HealthIndicator score={50} />);
      expect(screen.getByText('Poor')).toBeInTheDocument();
    });

    it('handles boundary value 75 correctly', () => {
      render(<HealthIndicator score={75} />);
      expect(screen.getByText('Fair')).toBeInTheDocument();
    });

    it('handles boundary value 90 correctly', () => {
      render(<HealthIndicator score={90} />);
      expect(screen.getByText('Good')).toBeInTheDocument();
    });

    it('handles maximum score 100 correctly', () => {
      render(<HealthIndicator score={100} />);
      expect(screen.getByText('Excellent')).toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('renders small size', () => {
      const { container } = render(<HealthIndicator score={85} size="sm" />);
      expect(container.querySelector('.h-6')).toBeInTheDocument();
      expect(container.querySelector('.w-12')).toBeInTheDocument();
    });

    it('renders medium size by default', () => {
      const { container } = render(<HealthIndicator score={85} />);
      expect(container.querySelector('.h-8')).toBeInTheDocument();
      expect(container.querySelector('.w-16')).toBeInTheDocument();
    });

    it('renders large size', () => {
      const { container } = render(<HealthIndicator score={85} size="lg" />);
      expect(container.querySelector('.h-10')).toBeInTheDocument();
      expect(container.querySelector('.w-20')).toBeInTheDocument();
    });
  });

  describe('Color Styling', () => {
    it('applies red color for critical score', () => {
      const { container } = render(<HealthIndicator score={20} />);
      expect(container.querySelector('.text-red-600')).toBeInTheDocument();
      expect(container.querySelector('.bg-red-100')).toBeInTheDocument();
    });

    it('applies orange color for poor score', () => {
      const { container } = render(<HealthIndicator score={40} />);
      expect(container.querySelector('.text-orange-600')).toBeInTheDocument();
      expect(container.querySelector('.bg-orange-100')).toBeInTheDocument();
    });

    it('applies yellow color for fair score', () => {
      const { container } = render(<HealthIndicator score={60} />);
      expect(container.querySelector('.text-yellow-600')).toBeInTheDocument();
      expect(container.querySelector('.bg-yellow-100')).toBeInTheDocument();
    });

    it('applies green color for good score', () => {
      const { container } = render(<HealthIndicator score={85} />);
      expect(container.querySelector('.text-green-500')).toBeInTheDocument();
      expect(container.querySelector('.bg-green-100')).toBeInTheDocument();
    });

    it('applies green color for excellent score', () => {
      const { container } = render(<HealthIndicator score={95} />);
      expect(container.querySelector('.text-green-700')).toBeInTheDocument();
      expect(container.querySelector('.bg-green-100')).toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('renders score and label in flex container', () => {
      const { container } = render(<HealthIndicator score={85} />);
      expect(container.querySelector('.flex.items-center')).toBeInTheDocument();
    });

    it('applies rounded styling to score badge', () => {
      const { container } = render(<HealthIndicator score={85} />);
      expect(container.querySelector('.rounded')).toBeInTheDocument();
    });

    it('centers content in score badge', () => {
      const { container } = render(<HealthIndicator score={85} />);
      const badge = container.querySelector('.flex.items-center.justify-center');
      expect(badge).toBeInTheDocument();
    });
  });
});
