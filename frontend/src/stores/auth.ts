import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi, setAccessToken, setTenantSlug, getTenantSlug, getAccessToken } from '@/lib/api';

interface User {
  id: string;
  email: string;
  name: string;
  tenantSlug: string;
  roles: string[];
}

interface AuthState {
  user: User | null;
  tenantSlug: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  _hasHydrated: boolean;

  login: (tenant: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      tenantSlug: null,
      isLoading: true,
      isAuthenticated: false,
      error: null,
      _hasHydrated: false,

      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state });
      },

      login: async (tenant: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.login(tenant, email, password);
          setAccessToken(response.accessToken);
          setTenantSlug(tenant);

          set({
            user: { ...response.user, tenantSlug: tenant },
            tenantSlug: tenant,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : 'Login failed';
          set({ error: message, isLoading: false });
          throw error;
        }
      },

      logout: async () => {
        set({ isLoading: true });
        try {
          await authApi.logout();
        } catch {
          // Ignore logout errors
        } finally {
          setAccessToken(null);
          setTenantSlug(null);
          set({
            user: null,
            tenantSlug: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      checkAuth: async () => {
        const { isAuthenticated, tenantSlug: storedTenant } = get();
        const tenant = storedTenant || getTenantSlug();
        const token = getAccessToken();

        // If we have stored auth state and a token, trust it initially
        // This prevents unnecessary API calls on every page load
        if (isAuthenticated && tenant && token) {
          set({ isLoading: false });
          // Validate session in background without blocking UI
          try {
            const user = await authApi.me();
            set({
              user: { ...user, tenantSlug: tenant },
              tenantSlug: tenant,
              isAuthenticated: true,
            });
          } catch {
            // Token might be expired but refresh interceptor should handle it
            // Only logout if we get a definitive auth failure after refresh attempt
            set({
              user: null,
              tenantSlug: null,
              isAuthenticated: false,
            });
          }
          return;
        }

        // No stored auth state or token - need to validate
        set({ isLoading: true });
        try {
          if (!tenant) {
            throw new Error('No tenant context');
          }
          const user = await authApi.me();
          set({
            user: { ...user, tenantSlug: tenant },
            tenantSlug: tenant,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        tenantSlug: state.tenantSlug,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state, error) => {
        // When store has rehydrated from storage, mark as hydrated
        if (error) {
          console.error('Auth store hydration error:', error);
        }
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);
