import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { EmptyState, NoResults } from '../empty-state';
import { FileText } from 'lucide-react';

describe('EmptyState Component', () => {
  describe('Rendering', () => {
    it('renders with title', () => {
      render(<EmptyState title="No items found" />);
      expect(screen.getByText('No items found')).toBeInTheDocument();
    });

    it('renders with description', () => {
      render(
        <EmptyState
          title="No items"
          description="There are currently no items to display"
        />
      );
      expect(screen.getByText('There are currently no items to display')).toBeInTheDocument();
    });

    it('renders without description when not provided', () => {
      render(<EmptyState title="No items" />);
      const container = screen.getByText('No items').closest('div');
      expect(container?.querySelector('.text-sm.text-gray-500')).not.toBeInTheDocument();
    });

    it('renders default icon when none provided', () => {
      const { container } = render(<EmptyState title="Test" />);
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders custom icon when provided', () => {
      const { container } = render(<EmptyState title="Test" icon={FileText} />);
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });

    it('renders children when provided', () => {
      render(
        <EmptyState title="Test">
          <div data-testid="custom-content">Custom content</div>
        </EmptyState>
      );
      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    });
  });

  describe('Action Button', () => {
    it('renders button with onClick handler', () => {
      render(
        <EmptyState
          title="Test"
          action={{
            label: 'Add Item',
            onClick: () => {},
          }}
        />
      );
      expect(screen.getByText('Add Item')).toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders link with href', () => {
      render(
        <EmptyState
          title="Test"
          action={{
            label: 'Go to page',
            href: '/test',
          }}
        />
      );
      const link = screen.getByText('Go to page').closest('a');
      expect(link).toHaveAttribute('href', '/test');
    });

    it('calls onClick when button clicked', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <EmptyState
          title="Test"
          action={{
            label: 'Click me',
            onClick: handleClick,
          }}
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not render action when not provided', () => {
      render(<EmptyState title="Test" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('includes plus icon in action button', () => {
      const { container } = render(
        <EmptyState
          title="Test"
          action={{
            label: 'Add',
            onClick: () => {},
          }}
        />
      );
      const button = screen.getByRole('button');
      const icon = button.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('applies correct container classes', () => {
      const { container } = render(<EmptyState title="Test" />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('flex-col');
      expect(wrapper).toHaveClass('items-center');
      expect(wrapper).toHaveClass('justify-center');
    });

    it('icon wrapper has correct styling', () => {
      const { container } = render(<EmptyState title="Test" />);
      const iconWrapper = container.querySelector('.rounded-full.bg-gray-100');
      expect(iconWrapper).toBeInTheDocument();
      expect(iconWrapper).toHaveClass('w-16');
      expect(iconWrapper).toHaveClass('h-16');
    });

    it('action button has correct styling', () => {
      render(
        <EmptyState
          title="Test"
          action={{
            label: 'Add',
            onClick: () => {},
          }}
        />
      );
      const button = screen.getByRole('button');
      expect(button).toHaveClass('bg-blue-600');
      expect(button).toHaveClass('text-white');
      expect(button).toHaveClass('rounded-lg');
    });
  });
});

describe('NoResults Component', () => {
  describe('Rendering', () => {
    it('renders with default message when no query', () => {
      render(<NoResults />);
      expect(screen.getByText('No results found')).toBeInTheDocument();
      expect(screen.getByText('No items match your current filters.')).toBeInTheDocument();
    });

    it('renders with query in description', () => {
      render(<NoResults query="test search" />);
      expect(
        screen.getByText(/No items match "test search"/)
      ).toBeInTheDocument();
    });

    it('renders clear filters button when onClear provided', () => {
      render(<NoResults onClear={() => {}} />);
      expect(screen.getByText('Clear filters')).toBeInTheDocument();
    });

    it('does not render button when onClear not provided', () => {
      render(<NoResults />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('calls onClear when button clicked', async () => {
      const handleClear = vi.fn();
      const user = userEvent.setup();

      render(<NoResults onClear={handleClear} />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(handleClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('Message Variants', () => {
    it('shows generic message without query', () => {
      render(<NoResults />);
      expect(screen.getByText('No items match your current filters.')).toBeInTheDocument();
    });

    it('shows specific message with query', () => {
      render(<NoResults query="urgent" />);
      expect(screen.getByText(/No items match "urgent"/)).toBeInTheDocument();
      expect(screen.getByText(/Try adjusting your search or filters/)).toBeInTheDocument();
    });

    it('includes query text exactly as provided', () => {
      render(<NoResults query="special-chars-123" />);
      expect(screen.getByText(/special-chars-123/)).toBeInTheDocument();
    });
  });

  describe('Integration with EmptyState', () => {
    it('uses EmptyState component internally', () => {
      render(<NoResults />);
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });

    it('passes correct action to EmptyState when onClear provided', () => {
      const handleClear = vi.fn();
      render(<NoResults onClear={handleClear} />);
      const button = screen.getByRole('button');
      expect(button).toHaveTextContent('Clear filters');
    });

    it('does not pass action to EmptyState when onClear not provided', () => {
      render(<NoResults />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
