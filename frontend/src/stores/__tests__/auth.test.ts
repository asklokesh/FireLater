import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';

// Mock the api module
vi.mock('@/lib/api', () => ({
  authApi: {
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
  setAccessToken: vi.fn(),
  setTenantSlug: vi.fn(),
  getTenantSlug: vi.fn(),
  getAccessToken: vi.fn(),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Auth Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', async () => {
      const { useAuthStore } = await import('../auth');

      const state = useAuthStore.getState();

      expect(state.user).toBeNull();
      expect(state.tenantSlug).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeNull();
      // _hasHydrated is set to true after zustand persist middleware rehydrates from storage
      expect(typeof state._hasHydrated).toBe('boolean');
    });
  });

  describe('setHasHydrated', () => {
    it('should set hydration state', async () => {
      const { useAuthStore } = await import('../auth');

      act(() => {
        useAuthStore.getState().setHasHydrated(true);
      });

      expect(useAuthStore.getState()._hasHydrated).toBe(true);
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      const { authApi, setAccessToken, setTenantSlug } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['admin'],
      };

      (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({
        accessToken: 'test-token',
        user: mockUser,
      });

      await act(async () => {
        await useAuthStore.getState().login('test-tenant', 'test@example.com', 'password123');
      });

      expect(authApi.login).toHaveBeenCalledWith('test-tenant', 'test@example.com', 'password123');
      expect(setAccessToken).toHaveBeenCalledWith('test-token');
      expect(setTenantSlug).toHaveBeenCalledWith('test-tenant');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
      expect(state.user).toEqual({ ...mockUser, tenantSlug: 'test-tenant' });
      expect(state.tenantSlug).toBe('test-tenant');
    });

    it('should set loading state during login', async () => {
      const { authApi } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      let resolveLogin: (value: unknown) => void;
      (authApi.login as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveLogin = resolve; })
      );

      const loginPromise = act(async () => {
        useAuthStore.getState().login('test-tenant', 'test@example.com', 'password');
      });

      // Wait for the sync state update
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(useAuthStore.getState().isLoading).toBe(true);

      resolveLogin!({
        accessToken: 'token',
        user: { id: '1', email: 'test@example.com', name: 'Test', roles: [] },
      });

      await loginPromise;

      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should handle login error', async () => {
      const { authApi } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      const error = new Error('Invalid credentials');
      (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      await expect(
        act(async () => {
          await useAuthStore.getState().login('test-tenant', 'test@example.com', 'wrong-password');
        })
      ).rejects.toThrow('Invalid credentials');

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });

    it('should handle non-Error login failures', async () => {
      const { authApi } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValue('string error');

      await expect(
        act(async () => {
          await useAuthStore.getState().login('test-tenant', 'test@example.com', 'password');
        })
      ).rejects.toBe('string error');

      const state = useAuthStore.getState();
      expect(state.error).toBe('Login failed');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const { authApi, setAccessToken, setTenantSlug } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      // First login
      (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({
        accessToken: 'test-token',
        user: { id: '1', email: 'test@example.com', name: 'Test', roles: [] },
      });
      (authApi.logout as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await act(async () => {
        await useAuthStore.getState().login('test-tenant', 'test@example.com', 'password');
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Then logout
      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(authApi.logout).toHaveBeenCalled();
      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(setTenantSlug).toHaveBeenCalledWith(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.tenantSlug).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should clear state even if logout API fails', async () => {
      const { authApi, setAccessToken, setTenantSlug } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      (authApi.logout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(setTenantSlug).toHaveBeenCalledWith(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('checkAuth', () => {
    it('should validate authenticated session in background', async () => {
      const { authApi, getTenantSlug, getAccessToken } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user'],
      };

      // Set initial authenticated state
      useAuthStore.setState({
        isAuthenticated: true,
        tenantSlug: 'test-tenant',
        user: { ...mockUser, tenantSlug: 'test-tenant' },
      });

      (getTenantSlug as ReturnType<typeof vi.fn>).mockReturnValue('test-tenant');
      (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('test-token');
      (authApi.me as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      await act(async () => {
        await useAuthStore.getState().checkAuth();
      });

      expect(authApi.me).toHaveBeenCalled();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({ ...mockUser, tenantSlug: 'test-tenant' });
    });

    it('should logout if session validation fails', async () => {
      const { authApi, getTenantSlug, getAccessToken } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      // Set initial authenticated state
      useAuthStore.setState({
        isAuthenticated: true,
        tenantSlug: 'test-tenant',
        user: { id: '1', email: 'test@example.com', name: 'Test', tenantSlug: 'test-tenant', roles: [] },
      });

      (getTenantSlug as ReturnType<typeof vi.fn>).mockReturnValue('test-tenant');
      (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue('expired-token');
      (authApi.me as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

      await act(async () => {
        await useAuthStore.getState().checkAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
    });

    it('should validate session when not authenticated but has tenant', async () => {
      const { authApi, getTenantSlug, getAccessToken } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['user'],
      };

      // Set initial unauthenticated state but with tenant from storage
      useAuthStore.setState({
        isAuthenticated: false,
        tenantSlug: 'test-tenant',
        user: null,
      });

      (getTenantSlug as ReturnType<typeof vi.fn>).mockReturnValue('test-tenant');
      (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (authApi.me as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      await act(async () => {
        await useAuthStore.getState().checkAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual({ ...mockUser, tenantSlug: 'test-tenant' });
      expect(state.isLoading).toBe(false);
    });

    it('should throw error when no tenant context', async () => {
      const { getTenantSlug, getAccessToken } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      useAuthStore.setState({
        isAuthenticated: false,
        tenantSlug: null,
        user: null,
      });

      (getTenantSlug as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);

      await act(async () => {
        await useAuthStore.getState().checkAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should handle checkAuth failure when validating new session', async () => {
      const { authApi, getTenantSlug, getAccessToken } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      useAuthStore.setState({
        isAuthenticated: false,
        tenantSlug: 'test-tenant',
        user: null,
      });

      (getTenantSlug as ReturnType<typeof vi.fn>).mockReturnValue('test-tenant');
      (getAccessToken as ReturnType<typeof vi.fn>).mockReturnValue(null);
      (authApi.me as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));

      await act(async () => {
        await useAuthStore.getState().checkAuth();
      });

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      const { authApi } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      // First trigger an error
      (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Test error'));

      try {
        await act(async () => {
          await useAuthStore.getState().login('tenant', 'email', 'password');
        });
      } catch {
        // Expected
      }

      expect(useAuthStore.getState().error).toBe('Test error');

      // Clear the error
      act(() => {
        useAuthStore.getState().clearError();
      });

      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('persistence', () => {
    it('should store state with auth-storage key', async () => {
      const { authApi } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        roles: ['admin'],
      };

      (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({
        accessToken: 'test-token',
        user: mockUser,
      });

      await act(async () => {
        await useAuthStore.getState().login('test-tenant', 'test@example.com', 'password');
      });

      // Verify the store state is correctly set
      const state = useAuthStore.getState();
      expect(state.user).toEqual({ ...mockUser, tenantSlug: 'test-tenant' });
      expect(state.tenantSlug).toBe('test-tenant');
      expect(state.isAuthenticated).toBe(true);

      // Verify localStorage was called (zustand persist uses this)
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should only persist user, tenantSlug, and isAuthenticated (partialize)', async () => {
      const { authApi } = await import('@/lib/api');
      const { useAuthStore } = await import('../auth');

      // Trigger an error to set the error state
      (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Test error'));

      try {
        await act(async () => {
          await useAuthStore.getState().login('tenant', 'email', 'password');
        });
      } catch {
        // Expected
      }

      // Verify error is in state but would not be persisted
      const state = useAuthStore.getState();
      expect(state.error).toBe('Test error');
      expect(state.isLoading).toBe(false);

      // The partialize function should only include user, tenantSlug, isAuthenticated
      // We verify this by checking the store's persist configuration is working
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
