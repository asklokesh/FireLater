import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import {
  ThemeProvider,
  useTheme,
  ThemeToggle,
  ThemeSelector,
} from '../theme-provider';

// Mock component to access theme context
function TestConsumer() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <div data-testid="current-theme">{theme}</div>
      <div data-testid="resolved-theme">{resolvedTheme}</div>
      <button onClick={() => setTheme('light')} data-testid="set-light">
        Set Light
      </button>
      <button onClick={() => setTheme('dark')} data-testid="set-dark">
        Set Dark
      </button>
      <button onClick={() => setTheme('system')} data-testid="set-system">
        Set System
      </button>
      <button onClick={toggleTheme} data-testid="toggle">
        Toggle
      </button>
    </div>
  );
}

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
const createMatchMediaMock = (matches: boolean) => ({
  matches,
  media: '(prefers-color-scheme: dark)',
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorageMock.clear();
    // Default to light mode
    window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(false));
  });

  describe('Basic Rendering', () => {
    it('renders children', () => {
      render(
        <ThemeProvider>
          <div data-testid="child">Test Child</div>
        </ThemeProvider>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('provides theme context to children', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('current-theme')).toBeInTheDocument();
      expect(screen.getByTestId('resolved-theme')).toBeInTheDocument();
    });
  });

  describe('Default Theme', () => {
    it('uses system as default theme', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('current-theme')).toHaveTextContent('system');
    });

    it('respects custom defaultTheme prop', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('loads theme from localStorage if available', () => {
      localStorageMock.setItem('firelater-theme', 'dark');
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('uses custom storageKey', () => {
      localStorageMock.setItem('custom-key', 'light');
      render(
        <ThemeProvider storageKey="custom-key">
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    });
  });

  describe('Theme Resolution', () => {
    it('resolves light theme correctly', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    });

    it('resolves dark theme correctly', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    });

    it('resolves system theme to light when system prefers light', () => {
      window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(false));
      render(
        <ThemeProvider defaultTheme="system">
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    });

    it('resolves system theme to dark when system prefers dark', () => {
      window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(true));
      render(
        <ThemeProvider defaultTheme="system">
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    });
  });

  describe('setTheme Function', () => {
    it('changes theme to light', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('set-light'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    });

    it('changes theme to dark', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('set-dark'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('changes theme to system', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('set-system'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('system');
    });

    it('persists theme to localStorage', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('set-dark'));
      expect(localStorageMock.getItem('firelater-theme')).toBe('dark');
    });

    it('persists theme to custom storage key', () => {
      render(
        <ThemeProvider storageKey="custom-key">
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('set-light'));
      expect(localStorageMock.getItem('custom-key')).toBe('light');
    });
  });

  describe('toggleTheme Function', () => {
    it('toggles from light to dark', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('toggles from dark to light', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    });

    it('toggles from system (light) to dark', () => {
      window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(false));
      render(
        <ThemeProvider defaultTheme="system">
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('toggles from system (dark) to light', () => {
      window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(true));
      render(
        <ThemeProvider defaultTheme="system">
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByTestId('toggle'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
    });
  });

  describe('useTheme Hook', () => {
    it('throws error when used outside ThemeProvider', () => {
      // Suppress console.error for this test
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('useTheme must be used within a ThemeProvider');

      consoleError.mockRestore();
    });

    it('returns theme context when used inside ThemeProvider', () => {
      render(
        <ThemeProvider>
          <TestConsumer />
        </ThemeProvider>
      );
      expect(screen.getByTestId('current-theme')).toBeInTheDocument();
    });
  });
});

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorageMock.clear();
    window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(false));
  });

  describe('Basic Rendering', () => {
    it('renders toggle button', () => {
      render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <ThemeProvider>
          <ThemeToggle className="custom-class" />
        </ThemeProvider>
      );
      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('has appropriate aria-label for light mode', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeToggle />
        </ThemeProvider>
      );
      expect(screen.getByLabelText('Switch to dark mode')).toBeInTheDocument();
    });

    it('has appropriate aria-label for dark mode', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeToggle />
        </ThemeProvider>
      );
      expect(screen.getByLabelText('Switch to light mode')).toBeInTheDocument();
    });
  });

  describe('Icons', () => {
    it('displays moon icon in light mode', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeToggle />
        </ThemeProvider>
      );
      const svg = screen.getByRole('button').querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Moon icon has specific path
      expect(svg?.querySelector('path')).toHaveAttribute('d', expect.stringContaining('21.752'));
    });

    it('displays sun icon in dark mode', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeToggle />
        </ThemeProvider>
      );
      const svg = screen.getByRole('button').querySelector('svg');
      expect(svg).toBeInTheDocument();
      // Sun icon has specific path with "M12 3v2.25m6.364"
      expect(svg?.querySelector('path')).toHaveAttribute('d', expect.stringContaining('M12 3v2.25'));
    });
  });

  describe('Toggle Functionality', () => {
    it('toggles theme when clicked', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeToggle />
          <TestConsumer />
        </ThemeProvider>
      );
      fireEvent.click(screen.getByLabelText('Switch to dark mode'));
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('updates icon after toggle', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeToggle />
        </ThemeProvider>
      );
      const button = screen.getByLabelText('Switch to dark mode');
      fireEvent.click(button);
      const svg = button.querySelector('svg');
      // After toggle to dark, should show sun icon
      expect(svg?.querySelector('path')).toHaveAttribute('d', expect.stringContaining('M12 3v2.25'));
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveClass('p-2', 'rounded-md');
    });
  });
});

describe('ThemeSelector', () => {
  beforeEach(() => {
    localStorageMock.clear();
    window.matchMedia = vi.fn().mockImplementation(() => createMatchMediaMock(false));
  });

  describe('Basic Rendering', () => {
    it('renders select element', () => {
      render(
        <ThemeProvider>
          <ThemeSelector />
        </ThemeProvider>
      );
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      render(
        <ThemeProvider>
          <ThemeSelector className="custom-select" />
        </ThemeProvider>
      );
      expect(screen.getByRole('combobox')).toHaveClass('custom-select');
    });
  });

  describe('Options', () => {
    it('renders all theme options', () => {
      render(
        <ThemeProvider>
          <ThemeSelector />
        </ThemeProvider>
      );
      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Dark')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
    });

    it('has correct option values', () => {
      render(
        <ThemeProvider>
          <ThemeSelector />
        </ThemeProvider>
      );
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(['light', 'dark', 'system']);
    });
  });

  describe('Selection', () => {
    it('displays current theme as selected', () => {
      render(
        <ThemeProvider defaultTheme="dark">
          <ThemeSelector />
        </ThemeProvider>
      );
      expect(screen.getByRole('combobox')).toHaveValue('dark');
    });

    it('changes theme when option is selected', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeSelector />
          <TestConsumer />
        </ThemeProvider>
      );
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'dark' } });
      expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
    });

    it('can select system theme', () => {
      render(
        <ThemeProvider defaultTheme="light">
          <ThemeSelector />
          <TestConsumer />
        </ThemeProvider>
      );
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'system' } });
      expect(screen.getByTestId('current-theme')).toHaveTextContent('system');
    });
  });

  describe('Styling', () => {
    it('applies base styling classes', () => {
      render(
        <ThemeProvider>
          <ThemeSelector />
        </ThemeProvider>
      );
      const select = screen.getByRole('combobox');
      expect(select).toHaveClass('px-3', 'py-2', 'border', 'rounded-md');
    });
  });
});
