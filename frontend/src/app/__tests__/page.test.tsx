import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// Mock auth store
const mockCheckAuth = vi.fn();
vi.mock('@/stores/auth', () => ({
  useAuthStore: vi.fn(() => ({
    isAuthenticated: false,
    isLoading: true,
    checkAuth: mockCheckAuth,
  })),
}));

import Home from '../page';
import { useAuthStore } from '@/stores/auth';

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockClear();
    mockCheckAuth.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render loading spinner', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      checkAuth: mockCheckAuth,
    } as any);

    const { container } = render(<Home />);

    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('should call checkAuth on mount', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      checkAuth: mockCheckAuth,
    } as any);

    render(<Home />);

    expect(mockCheckAuth).toHaveBeenCalled();
  });

  it('should redirect to dashboard when authenticated', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      checkAuth: mockCheckAuth,
    } as any);

    render(<Home />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('should redirect to login when not authenticated', async () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      checkAuth: mockCheckAuth,
    } as any);

    render(<Home />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });
  });

  it('should not redirect while loading', () => {
    vi.mocked(useAuthStore).mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      checkAuth: mockCheckAuth,
    } as any);

    render(<Home />);

    expect(mockPush).not.toHaveBeenCalled();
  });
});
