import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import { userEvent } from '@testing-library/user-event';
import { DropdownMenu, DropdownMenuItem, DropdownMenuDivider } from '../dropdown-menu';

describe('DropdownMenu Component', () => {
  beforeEach(() => {
    // Create a mock for getBoundingClientRect
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      top: 100,
      left: 200,
      bottom: 150,
      right: 300,
      width: 100,
      height: 50,
      x: 200,
      y: 100,
      toJSON: () => {},
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders trigger element', () => {
      render(
        <DropdownMenu trigger={<button>Open Menu</button>}>
          <div>Menu Content</div>
        </DropdownMenu>
      );

      expect(screen.getByText('Open Menu')).toBeInTheDocument();
    });

    it('does not render menu initially', () => {
      render(
        <DropdownMenu trigger={<button>Open</button>}>
          <div>Hidden Menu</div>
        </DropdownMenu>
      );

      expect(screen.queryByText('Hidden Menu')).not.toBeInTheDocument();
    });

    it('renders menu when trigger clicked', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu trigger={<button>Open</button>}>
          <div>Visible Menu</div>
        </DropdownMenu>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByText('Visible Menu')).toBeInTheDocument();
      });
    });
  });

  describe('Menu Interactions', () => {
    it('toggles menu on trigger click', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu trigger={<button>Toggle</button>}>
          <div>Menu Content</div>
        </DropdownMenu>
      );

      // Open menu
      await user.click(screen.getByText('Toggle'));
      await waitFor(() => {
        expect(screen.getByText('Menu Content')).toBeInTheDocument();
      });

      // Close menu
      await user.click(screen.getByText('Toggle'));
      await waitFor(() => {
        expect(screen.queryByText('Menu Content')).not.toBeInTheDocument();
      });
    });

    it('closes menu when clicking outside', async () => {
      const user = userEvent.setup();

      render(
        <div>
          <DropdownMenu trigger={<button>Open</button>}>
            <div>Menu Content</div>
          </DropdownMenu>
          <div data-testid="outside">Outside</div>
        </div>
      );

      // Open menu
      await user.click(screen.getByText('Open'));
      await waitFor(() => {
        expect(screen.getByText('Menu Content')).toBeInTheDocument();
      });

      // Click outside
      await user.click(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByText('Menu Content')).not.toBeInTheDocument();
      });
    });

    it('closes menu on Escape key', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu trigger={<button>Open</button>}>
          <div>Menu Content</div>
        </DropdownMenu>
      );

      // Open menu
      await user.click(screen.getByText('Open'));
      await waitFor(() => {
        expect(screen.getByText('Menu Content')).toBeInTheDocument();
      });

      // Press Escape
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByText('Menu Content')).not.toBeInTheDocument();
      });
    });

    it('prevents event propagation on trigger click', async () => {
      const parentClick = vi.fn();
      const user = userEvent.setup();

      render(
        <div onClick={parentClick}>
          <DropdownMenu trigger={<button>Open</button>}>
            <div>Menu</div>
          </DropdownMenu>
        </div>
      );

      await user.click(screen.getByText('Open'));

      // Parent click should not be called due to stopPropagation
      expect(parentClick).not.toHaveBeenCalled();
    });
  });

  // Portal tests skipped - happy-dom doesn't fully support portals
  // These would work in jsdom or real browser testing
  describe('Menu Positioning (Portal-dependent, skipped)', () => {
    it.skip('positions menu via portal', () => {
      // Requires full DOM support for portals
    });
  });

  describe('Accessibility', () => {
    it('menu has role="menu"', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu trigger={<button>Open</button>}>
          <div>Menu</div>
        </DropdownMenu>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });
    });

    it('menu has correct aria-orientation', async () => {
      const user = userEvent.setup();

      render(
        <DropdownMenu trigger={<button>Open</button>}>
          <div>Menu</div>
        </DropdownMenu>
      );

      await user.click(screen.getByText('Open'));

      await waitFor(() => {
        const menu = screen.getByRole('menu');
        expect(menu).toHaveAttribute('aria-orientation', 'vertical');
      });
    });
  });
});

describe('DropdownMenuItem Component', () => {
  describe('Basic Rendering', () => {
    it('renders menu item', () => {
      render(<DropdownMenuItem>Item Text</DropdownMenuItem>);
      expect(screen.getByText('Item Text')).toBeInTheDocument();
    });

    it('renders as button element', () => {
      render(<DropdownMenuItem>Item</DropdownMenuItem>);
      expect(screen.getByRole('menuitem')).toBeInTheDocument();
      expect(screen.getByRole('menuitem').tagName).toBe('BUTTON');
    });

    it('renders children content', () => {
      render(
        <DropdownMenuItem>
          <span>Icon</span>
          <span>Label</span>
        </DropdownMenuItem>
      );

      expect(screen.getByText('Icon')).toBeInTheDocument();
      expect(screen.getByText('Label')).toBeInTheDocument();
    });
  });

  describe('Interactions', () => {
    it('calls onClick when clicked', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<DropdownMenuItem onClick={handleClick}>Click Me</DropdownMenuItem>);

      await user.click(screen.getByRole('menuitem'));

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not call onClick when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <DropdownMenuItem onClick={handleClick} disabled>
          Disabled
        </DropdownMenuItem>
      );

      await user.click(screen.getByRole('menuitem'));

      expect(handleClick).not.toHaveBeenCalled();
    });

    it('prevents event propagation', async () => {
      const parentClick = vi.fn();
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(
        <div onClick={parentClick}>
          <DropdownMenuItem onClick={handleClick}>Item</DropdownMenuItem>
        </div>
      );

      await user.click(screen.getByRole('menuitem'));

      expect(handleClick).toHaveBeenCalledTimes(1);
      expect(parentClick).not.toHaveBeenCalled();
    });
  });

  describe('Variants', () => {
    it('renders default variant', () => {
      render(<DropdownMenuItem>Default</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('text-gray-700');
      expect(item).toHaveClass('hover:bg-gray-100');
    });

    it('renders danger variant', () => {
      render(<DropdownMenuItem variant="danger">Delete</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('text-red-600');
      expect(item).toHaveClass('hover:bg-red-50');
    });
  });

  describe('Disabled State', () => {
    it('disables button when disabled prop is true', () => {
      render(<DropdownMenuItem disabled>Disabled</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toBeDisabled();
    });

    it('applies disabled opacity', () => {
      render(<DropdownMenuItem disabled>Disabled</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('opacity-50');
    });

    it('applies not-allowed cursor when disabled', () => {
      render(<DropdownMenuItem disabled>Disabled</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('cursor-not-allowed');
    });
  });

  describe('Styling', () => {
    it('applies base classes', () => {
      render(<DropdownMenuItem>Item</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('flex');
      expect(item).toHaveClass('items-center');
      expect(item).toHaveClass('w-full');
      expect(item).toHaveClass('px-4');
      expect(item).toHaveClass('py-2');
    });

    it('has correct text size', () => {
      render(<DropdownMenuItem>Item</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('text-sm');
    });

    it('has cursor-pointer class', () => {
      render(<DropdownMenuItem>Item</DropdownMenuItem>);
      const item = screen.getByRole('menuitem');
      expect(item).toHaveClass('cursor-pointer');
    });
  });

  describe('Accessibility', () => {
    it('has role="menuitem"', () => {
      render(<DropdownMenuItem>Item</DropdownMenuItem>);
      expect(screen.getByRole('menuitem')).toBeInTheDocument();
    });

    it('is keyboard accessible', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();

      render(<DropdownMenuItem onClick={handleClick}>Item</DropdownMenuItem>);

      const item = screen.getByRole('menuitem');
      item.focus();
      await user.keyboard('{Enter}');

      expect(handleClick).toHaveBeenCalled();
    });
  });
});

describe('DropdownMenuDivider Component', () => {
  it('renders divider', () => {
    const { container } = render(<DropdownMenuDivider />);
    const divider = container.querySelector('.border-t');
    expect(divider).toBeInTheDocument();
  });

  it('applies correct styling', () => {
    const { container } = render(<DropdownMenuDivider />);
    const divider = container.querySelector('.border-t');
    expect(divider).toHaveClass('border-t');
    expect(divider).toHaveClass('border-gray-100');
    expect(divider).toHaveClass('my-1');
  });

  it('renders as div element', () => {
    const { container } = render(<DropdownMenuDivider />);
    const divider = container.querySelector('.border-t');
    expect(divider?.tagName).toBe('DIV');
  });
});

describe('DropdownMenu Integration', () => {
  it('works with DropdownMenuItem children', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(
      <DropdownMenu trigger={<button>Menu</button>}>
        <DropdownMenuItem onClick={handleClick}>Action</DropdownMenuItem>
      </DropdownMenu>
    );

    await user.click(screen.getByText('Menu'));

    await waitFor(() => {
      expect(screen.getByText('Action')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Action'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it.skip('renders divider between menu items (portal-dependent)', () => {
    // Requires full portal support
  });

  it('supports multiple menu items', async () => {
    const user = userEvent.setup();

    render(
      <DropdownMenu trigger={<button>Menu</button>}>
        <DropdownMenuItem>Option 1</DropdownMenuItem>
        <DropdownMenuItem>Option 2</DropdownMenuItem>
        <DropdownMenuItem>Option 3</DropdownMenuItem>
      </DropdownMenu>
    );

    await user.click(screen.getByText('Menu'));

    await waitFor(() => {
      expect(screen.getByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
      expect(screen.getByText('Option 3')).toBeInTheDocument();
    });
  });
});
