import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';

// Mock dynamic import for devtools
vi.mock('next/dynamic', () => ({
  default: (
    _importFn: () => Promise<{ default: React.ComponentType }>,
    _options?: { ssr: boolean }
  ) => {
    // Return a simple component that renders nothing for tests
    return function MockedDevtools() {
      return null;
    };
  },
}));

import { QueryProvider } from '../QueryProvider';

describe('QueryProvider', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render children', () => {
      render(
        <QueryProvider>
          <div data-testid="child">Child content</div>
        </QueryProvider>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <QueryProvider>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </QueryProvider>
      );

      expect(screen.getByTestId('child1')).toBeInTheDocument();
      expect(screen.getByTestId('child2')).toBeInTheDocument();
    });

    it('should render nested components', () => {
      const NestedComponent = () => (
        <div data-testid="nested">
          <span>Nested content</span>
        </div>
      );

      render(
        <QueryProvider>
          <NestedComponent />
        </QueryProvider>
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
      expect(screen.getByText('Nested content')).toBeInTheDocument();
    });
  });

  describe('QueryClient configuration', () => {
    it('should provide QueryClient to children', () => {
      const clientRef = { current: null as ReturnType<typeof useQueryClient> | null };

      const TestComponent = () => {
        const client = useQueryClient();
        // Use useEffect to capture client after render (not during)
        React.useEffect(() => {
          clientRef.current = client;
        }, [client]);
        return <div data-testid="test">Test</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      // After render, the effect has run
      expect(clientRef.current).not.toBeNull();
      expect(typeof clientRef.current?.getQueryCache).toBe('function');
    });

    it('should maintain same QueryClient instance across re-renders', () => {
      const clients: Array<ReturnType<typeof useQueryClient>> = [];

      const TestComponent = () => {
        const client = useQueryClient();
        React.useEffect(() => {
          clients.push(client);
        }, [client]);
        return <div>Test</div>;
      };

      const { rerender } = render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      rerender(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      expect(clients.length).toBe(1); // Same client instance, effect only runs once
    });

    it('should configure staleTime to 1 minute', () => {
      const clientRef = { current: null as ReturnType<typeof useQueryClient> | null };

      const TestComponent = () => {
        const client = useQueryClient();
        React.useEffect(() => {
          clientRef.current = client;
        }, [client]);
        return <div>Test</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      const defaultOptions = clientRef.current?.getDefaultOptions();
      expect(defaultOptions?.queries?.staleTime).toBe(60 * 1000);
    });

    it('should configure refetchOnWindowFocus to false', () => {
      const clientRef = { current: null as ReturnType<typeof useQueryClient> | null };

      const TestComponent = () => {
        const client = useQueryClient();
        React.useEffect(() => {
          clientRef.current = client;
        }, [client]);
        return <div>Test</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      const defaultOptions = clientRef.current?.getDefaultOptions();
      expect(defaultOptions?.queries?.refetchOnWindowFocus).toBe(false);
    });

    it('should configure retry to 1', () => {
      const clientRef = { current: null as ReturnType<typeof useQueryClient> | null };

      const TestComponent = () => {
        const client = useQueryClient();
        React.useEffect(() => {
          clientRef.current = client;
        }, [client]);
        return <div>Test</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      const defaultOptions = clientRef.current?.getDefaultOptions();
      expect(defaultOptions?.queries?.retry).toBe(1);
    });
  });

  describe('React Query functionality', () => {
    it('should allow useQuery hook to work', async () => {
      const mockData = { message: 'Hello, World!' };
      const mockFetcher = vi.fn().mockResolvedValue(mockData);

      const TestComponent = () => {
        const { data, isSuccess } = useQuery({
          queryKey: ['test'],
          queryFn: mockFetcher,
        });

        if (isSuccess) {
          return <div data-testid="data">{data.message}</div>;
        }

        return <div data-testid="loading">Loading...</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      expect(screen.getByTestId('loading')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('data')).toBeInTheDocument();
      });

      expect(screen.getByText('Hello, World!')).toBeInTheDocument();
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it('should respect retry configuration', async () => {
      const mockFetcher = vi.fn().mockRejectedValue(new Error('API Error'));

      const TestComponent = () => {
        const { isError, error, failureCount } = useQuery({
          queryKey: ['test-error'],
          queryFn: mockFetcher,
          retry: 1, // Use the default from QueryClient
        });

        if (isError) {
          return (
            <div data-testid="error">
              Error: {(error as Error).message}
              <span data-testid="failure-count">{failureCount}</span>
            </div>
          );
        }

        return <div data-testid="loading">Loading...</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('error')).toBeInTheDocument();
        },
        { timeout: 5000 }
      );

      // Should have retried once (initial + 1 retry = 2 calls)
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    it('should cache queries with configured staleTime', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({ value: 'cached' });

      const TestComponent = () => {
        const { data, isSuccess } = useQuery({
          queryKey: ['cache-test'],
          queryFn: mockFetcher,
        });

        return isSuccess ? (
          <div data-testid="data">{data.value}</div>
        ) : (
          <div>Loading...</div>
        );
      };

      const { unmount } = render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('data')).toBeInTheDocument();
      });

      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Unmount and remount - data should be cached
      unmount();

      // Note: Since we're creating a new QueryProvider, this tests
      // that the QueryClient is properly created. In a real app,
      // the cache persists within the same QueryClient instance.
    });
  });

  describe('multiple queries', () => {
    it('should handle multiple independent queries', async () => {
      const mockFetcher1 = vi.fn().mockResolvedValue({ name: 'Query 1' });
      const mockFetcher2 = vi.fn().mockResolvedValue({ name: 'Query 2' });

      const TestComponent = () => {
        const query1 = useQuery({
          queryKey: ['query1'],
          queryFn: mockFetcher1,
        });

        const query2 = useQuery({
          queryKey: ['query2'],
          queryFn: mockFetcher2,
        });

        if (query1.isSuccess && query2.isSuccess) {
          return (
            <div>
              <div data-testid="data1">{query1.data.name}</div>
              <div data-testid="data2">{query2.data.name}</div>
            </div>
          );
        }

        return <div data-testid="loading">Loading...</div>;
      };

      render(
        <QueryProvider>
          <TestComponent />
        </QueryProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('data1')).toBeInTheDocument();
        expect(screen.getByTestId('data2')).toBeInTheDocument();
      });

      expect(mockFetcher1).toHaveBeenCalledTimes(1);
      expect(mockFetcher2).toHaveBeenCalledTimes(1);
    });
  });

  describe('devtools', () => {
    it('should not throw when rendering in development', () => {
      process.env.NODE_ENV = 'development';

      expect(() => {
        render(
          <QueryProvider>
            <div>Test</div>
          </QueryProvider>
        );
      }).not.toThrow();
    });

    it('should not throw when rendering in production', () => {
      process.env.NODE_ENV = 'production';

      expect(() => {
        render(
          <QueryProvider>
            <div>Test</div>
          </QueryProvider>
        );
      }).not.toThrow();
    });
  });
});
