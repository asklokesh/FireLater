import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import {
  LoadingSpinner,
  PageLoading,
  TableLoading,
  CardLoading,
  InlineLoading,
} from '../loading';

describe('LoadingSpinner Component', () => {
  it('renders spinner with default size', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('svg');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('animate-spin');
  });

  it('renders small size spinner', () => {
    render(<LoadingSpinner size="sm" />);
    const spinner = document.querySelector('svg');
    expect(spinner).toHaveClass('h-4');
    expect(spinner).toHaveClass('w-4');
  });

  it('renders medium size spinner', () => {
    render(<LoadingSpinner size="md" />);
    const spinner = document.querySelector('svg');
    expect(spinner).toHaveClass('h-8');
    expect(spinner).toHaveClass('w-8');
  });

  it('renders large size spinner', () => {
    render(<LoadingSpinner size="lg" />);
    const spinner = document.querySelector('svg');
    expect(spinner).toHaveClass('h-12');
    expect(spinner).toHaveClass('w-12');
  });

  it('displays text when provided', () => {
    render(<LoadingSpinner text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('does not display text when not provided', () => {
    render(<LoadingSpinner />);
    const container = document.querySelector('.text-sm');
    expect(container).not.toBeInTheDocument();
  });

  it('renders in fullScreen mode', () => {
    const { container } = render(<LoadingSpinner fullScreen />);
    const fullScreenDiv = container.querySelector('.min-h-screen');
    expect(fullScreenDiv).toBeInTheDocument();
    expect(fullScreenDiv).toHaveClass('flex');
    expect(fullScreenDiv).toHaveClass('items-center');
    expect(fullScreenDiv).toHaveClass('justify-center');
  });

  it('renders inline when fullScreen is false', () => {
    const { container } = render(<LoadingSpinner fullScreen={false} />);
    const fullScreenDiv = container.querySelector('.min-h-screen');
    expect(fullScreenDiv).not.toBeInTheDocument();
  });

  it('spinner has correct color', () => {
    render(<LoadingSpinner />);
    const spinner = document.querySelector('svg');
    expect(spinner).toHaveClass('text-blue-600');
  });
});

describe('PageLoading Component', () => {
  it('renders with default text', () => {
    render(<PageLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<PageLoading text="Loading page..." />);
    expect(screen.getByText('Loading page...')).toBeInTheDocument();
  });

  it('uses large spinner size', () => {
    render(<PageLoading />);
    const spinner = document.querySelector('svg');
    expect(spinner).toHaveClass('h-12');
    expect(spinner).toHaveClass('w-12');
  });

  it('has minimum height container', () => {
    const { container } = render(<PageLoading />);
    const pageContainer = container.querySelector('.min-h-\\[400px\\]');
    expect(pageContainer).toBeInTheDocument();
  });

  it('centers content', () => {
    const { container } = render(<PageLoading />);
    const pageContainer = container.querySelector('.min-h-\\[400px\\]');
    expect(pageContainer).toHaveClass('flex');
    expect(pageContainer).toHaveClass('items-center');
    expect(pageContainer).toHaveClass('justify-center');
  });
});

describe('TableLoading Component', () => {
  it('renders with default rows and columns', () => {
    const { container } = render(<TableLoading />);
    const rows = container.querySelectorAll('.flex.gap-4.mb-3');
    expect(rows).toHaveLength(5); // default rows
  });

  it('renders with custom number of rows', () => {
    const { container } = render(<TableLoading rows={3} />);
    const rows = container.querySelectorAll('.flex.gap-4.mb-3');
    expect(rows).toHaveLength(3);
  });

  it('renders with custom number of columns', () => {
    const { container } = render(<TableLoading rows={1} columns={6} />);
    const firstRow = container.querySelector('.flex.gap-4.mb-3');
    const columns = firstRow?.querySelectorAll('.h-8');
    expect(columns).toHaveLength(6);
  });

  it('has animate-pulse class', () => {
    const { container } = render(<TableLoading />);
    const animatedDiv = container.querySelector('.animate-pulse');
    expect(animatedDiv).toBeInTheDocument();
  });

  it('renders header skeleton', () => {
    const { container } = render(<TableLoading />);
    const header = container.querySelector('.h-10.bg-gray-200');
    expect(header).toBeInTheDocument();
  });

  it('applies correct skeleton styling', () => {
    const { container } = render(<TableLoading rows={1} columns={1} />);
    const cell = container.querySelector('.h-8.bg-gray-100');
    expect(cell).toBeInTheDocument();
    expect(cell).toHaveClass('rounded');
    expect(cell).toHaveClass('flex-1');
  });
});

describe('CardLoading Component', () => {
  it('renders with default card count', () => {
    const { container } = render(<CardLoading />);
    const cards = container.querySelectorAll('.animate-pulse.bg-white');
    expect(cards).toHaveLength(3);
  });

  it('renders with custom card count', () => {
    const { container } = render(<CardLoading count={5} />);
    const cards = container.querySelectorAll('.animate-pulse.bg-white');
    expect(cards).toHaveLength(5);
  });

  it('uses grid layout', () => {
    const { container } = render(<CardLoading />);
    const grid = container.querySelector('.grid');
    expect(grid).toHaveClass('gap-4');
    expect(grid).toHaveClass('md:grid-cols-2');
    expect(grid).toHaveClass('lg:grid-cols-3');
  });

  it('cards have correct styling', () => {
    const { container } = render(<CardLoading count={1} />);
    const card = container.querySelector('.animate-pulse.bg-white');
    expect(card).toHaveClass('rounded-lg');
    expect(card).toHaveClass('p-6');
    expect(card).toHaveClass('shadow-sm');
  });

  it('renders skeleton lines inside cards', () => {
    const { container } = render(<CardLoading count={1} />);
    const card = container.querySelector('.animate-pulse.bg-white');
    const skeletonLines = card?.querySelectorAll('.bg-gray-200, .bg-gray-100');
    expect(skeletonLines!.length).toBeGreaterThan(0);
  });

  it('renders zero cards when count is 0', () => {
    const { container } = render(<CardLoading count={0} />);
    const cards = container.querySelectorAll('.animate-pulse.bg-white');
    expect(cards).toHaveLength(0);
  });
});

describe('InlineLoading Component', () => {
  it('renders with default text', () => {
    render(<InlineLoading />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom text', () => {
    render(<InlineLoading text="Processing..." />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('renders as inline-flex', () => {
    const { container } = render(<InlineLoading />);
    const span = container.querySelector('.inline-flex');
    expect(span).toBeInTheDocument();
  });

  it('includes spinner icon', () => {
    const { container } = render(<InlineLoading />);
    const spinner = container.querySelector('svg');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('animate-spin');
  });

  it('spinner has small size', () => {
    const { container } = render(<InlineLoading />);
    const spinner = container.querySelector('svg');
    expect(spinner).toHaveClass('h-3');
    expect(spinner).toHaveClass('w-3');
  });

  it('has correct text styling', () => {
    const { container } = render(<InlineLoading />);
    const span = container.querySelector('.inline-flex');
    expect(span).toHaveClass('text-sm');
    expect(span).toHaveClass('text-gray-500');
  });

  it('aligns items with gap', () => {
    const { container } = render(<InlineLoading />);
    const span = container.querySelector('.inline-flex');
    expect(span).toHaveClass('items-center');
    expect(span).toHaveClass('gap-2');
  });
});
