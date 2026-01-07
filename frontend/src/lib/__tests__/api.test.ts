import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

// Mock axios
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxios),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    defaults: {
      headers: { common: {} },
    },
  };
  return { default: mockAxios };
});

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

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Management', () => {
    it('should set access token in localStorage', async () => {
      const { setAccessToken } = await import('../api');

      setAccessToken('test-token');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('accessToken', 'test-token');
    });

    it('should remove access token when set to null', async () => {
      const { setAccessToken } = await import('../api');

      setAccessToken(null);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
    });

    it('should get access token from localStorage', async () => {
      localStorageMock.store['accessToken'] = 'stored-token';
      const { getAccessToken } = await import('../api');

      const token = getAccessToken();

      expect(token).toBe('stored-token');
    });

    it('should return null when no token exists', async () => {
      const { getAccessToken } = await import('../api');

      const token = getAccessToken();

      expect(token).toBeNull();
    });
  });

  describe('Tenant Slug Management', () => {
    it('should get tenant slug from localStorage', async () => {
      localStorageMock.store['tenantSlug'] = 'test-tenant';
      const { getTenantSlug } = await import('../api');

      const slug = getTenantSlug();

      expect(slug).toBe('test-tenant');
    });

    it('should set tenant slug in localStorage', async () => {
      const { setTenantSlug } = await import('../api');

      setTenantSlug('new-tenant');

      expect(localStorageMock.setItem).toHaveBeenCalledWith('tenantSlug', 'new-tenant');
    });

    it('should remove tenant slug when set to null', async () => {
      const { setTenantSlug } = await import('../api');

      setTenantSlug(null);

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('tenantSlug');
    });

    it('should return null when no tenant slug exists', async () => {
      const { getTenantSlug } = await import('../api');

      const slug = getTenantSlug();

      expect(slug).toBeNull();
    });
  });

  describe('CSRF Token Management', () => {
    it('should fetch and cache CSRF token', async () => {
      const mockAxios = await import('axios');
      (mockAxios.default.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { csrfToken: 'csrf-test-token' },
      });

      const { fetchCsrfToken } = await import('../api');

      const token = await fetchCsrfToken();

      expect(token).toBe('csrf-test-token');
    });

    it('should return empty string on CSRF fetch error', async () => {
      const mockAxios = await import('axios');
      (mockAxios.default.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { fetchCsrfToken } = await import('../api');

      const token = await fetchCsrfToken();

      expect(token).toBe('');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should return cached CSRF token', async () => {
      const mockAxios = await import('axios');
      (mockAxios.default.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { csrfToken: 'cached-token' },
      });

      const { fetchCsrfToken, getCsrfToken } = await import('../api');

      await fetchCsrfToken();
      const cachedToken = getCsrfToken();

      expect(cachedToken).toBe('cached-token');
    });
  });

  describe('API Instance Configuration', () => {
    it('should create axios instance with correct base config', async () => {
      const mockAxios = await import('axios');

      await import('../api');

      expect(mockAxios.default.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: expect.any(String),
          headers: {
            'Content-Type': 'application/json',
          },
          withCredentials: true,
        })
      );
    });

    it('should register request interceptor', async () => {
      const mockAxios = await import('axios');
      const mockInstance = mockAxios.default.create();

      await import('../api');

      expect(mockInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should register response interceptor', async () => {
      const mockAxios = await import('axios');
      const mockInstance = mockAxios.default.create();

      await import('../api');

      expect(mockInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });
});

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    vi.resetModules();
  });

  describe('login', () => {
    it('should call login endpoint with credentials', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { accessToken: 'new-token', user: { id: '1', name: 'Test' } },
      });

      const result = await authApi.login('test-tenant', 'test@example.com', 'password123');

      expect(api.post).toHaveBeenCalledWith('/v1/auth/login', {
        tenant: 'test-tenant',
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result).toEqual({ accessToken: 'new-token', user: { id: '1', name: 'Test' } });
    });
  });

  describe('register', () => {
    it('should call register endpoint with data', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      const registerData = {
        tenantName: 'Test Company',
        tenantSlug: 'test-company',
        adminName: 'Admin User',
        adminEmail: 'admin@test.com',
        adminPassword: 'securepassword',
      };

      await authApi.register(registerData);

      expect(api.post).toHaveBeenCalledWith('/v1/auth/register', registerData);
    });
  });

  describe('logout', () => {
    it('should call logout endpoint and clear tokens', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await authApi.logout();

      expect(api.post).toHaveBeenCalledWith('/v1/auth/logout');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('tenantSlug');
    });

    it('should clear tokens even if logout API fails', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      await authApi.logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('accessToken');
    });
  });

  describe('me', () => {
    it('should call me endpoint', async () => {
      const { authApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: '1', name: 'Test User', email: 'test@example.com' },
      });

      const result = await authApi.me();

      expect(api.get).toHaveBeenCalledWith('/v1/auth/me');
      expect(result).toEqual({ id: '1', name: 'Test User', email: 'test@example.com' });
    });
  });

  describe('changePassword', () => {
    it('should call password change endpoint', async () => {
      const { authApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await authApi.changePassword('oldpass', 'newpass');

      expect(api.put).toHaveBeenCalledWith('/v1/auth/password', {
        oldPassword: 'oldpass',
        newPassword: 'newpass',
      });
    });
  });

  describe('forgotPassword', () => {
    it('should call forgot password endpoint', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await authApi.forgotPassword('test-tenant', 'test@example.com');

      expect(api.post).toHaveBeenCalledWith('/v1/auth/forgot-password', {
        tenant: 'test-tenant',
        email: 'test@example.com',
      });
    });
  });

  describe('resetPassword', () => {
    it('should call reset password endpoint', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await authApi.resetPassword('test-tenant', 'reset-token', 'newpassword');

      expect(api.post).toHaveBeenCalledWith('/v1/auth/reset-password', {
        tenant: 'test-tenant',
        token: 'reset-token',
        newPassword: 'newpassword',
      });
    });
  });

  describe('verifyEmail', () => {
    it('should call verify email endpoint', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await authApi.verifyEmail('test-tenant', 'verify-token');

      expect(api.post).toHaveBeenCalledWith('/v1/auth/verify-email', {
        tenant: 'test-tenant',
        token: 'verify-token',
      });
    });
  });

  describe('resendVerification', () => {
    it('should call resend verification endpoint', async () => {
      const { authApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await authApi.resendVerification('test-tenant', 'test@example.com');

      expect(api.post).toHaveBeenCalledWith('/v1/auth/resend-verification', {
        tenant: 'test-tenant',
        email: 'test@example.com',
      });
    });
  });
});

describe('Issues API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('list', () => {
    it('should call issues list endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
      });

      await issuesApi.list();

      expect(api.get).toHaveBeenCalledWith('/v1/issues', { params: undefined });
    });

    it('should pass query params to issues list', async () => {
      const { issuesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: {} },
      });

      await issuesApi.list({ page: 2, limit: 10, state: 'open' });

      expect(api.get).toHaveBeenCalledWith('/v1/issues', {
        params: { page: 2, limit: 10, state: 'open' },
      });
    });
  });

  describe('get', () => {
    it('should call issue get endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', title: 'Test Issue' },
      });

      const result = await issuesApi.get('issue-1');

      expect(api.get).toHaveBeenCalledWith('/v1/issues/issue-1');
      expect(result).toEqual({ id: 'issue-1', title: 'Test Issue' });
    });
  });

  describe('create', () => {
    it('should call issue create endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'new-issue', title: 'New Issue' },
      });

      const createData = {
        title: 'New Issue',
        description: 'Issue description',
        priority: 'high' as const,
      };

      await issuesApi.create(createData);

      expect(api.post).toHaveBeenCalledWith('/v1/issues', createData);
    });
  });

  describe('update', () => {
    it('should call issue update endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', title: 'Updated Issue' },
      });

      await issuesApi.update('issue-1', { title: 'Updated Issue' });

      expect(api.put).toHaveBeenCalledWith('/v1/issues/issue-1', { title: 'Updated Issue' });
    });
  });

  describe('addComment', () => {
    it('should call add comment endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'comment-1', content: 'Test comment' },
      });

      await issuesApi.addComment('issue-1', 'Test comment', false);

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/comments', {
        content: 'Test comment',
        isInternal: false,
      });
    });

    it('should support internal comments', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'comment-1', content: 'Internal note' },
      });

      await issuesApi.addComment('issue-1', 'Internal note', true);

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/comments', {
        content: 'Internal note',
        isInternal: true,
      });
    });
  });

  describe('changeStatus', () => {
    it('should call status change endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', status: 'in_progress' },
      });

      await issuesApi.changeStatus('issue-1', 'in_progress', 'Starting work');

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/status', {
        status: 'in_progress',
        reason: 'Starting work',
      });
    });
  });

  describe('assign', () => {
    it('should call assign endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', assigned_to: 'user-1' },
      });

      await issuesApi.assign('issue-1', 'user-1', 'group-1');

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/assign', {
        assignedTo: 'user-1',
        assignedGroup: 'group-1',
      });
    });
  });

  describe('resolve', () => {
    it('should call resolve endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', status: 'resolved' },
      });

      await issuesApi.resolve('issue-1', 'FIXED', 'Applied patch');

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/resolve', {
        resolutionCode: 'FIXED',
        resolutionNotes: 'Applied patch',
      });
    });
  });

  describe('close', () => {
    it('should call close endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', status: 'closed' },
      });

      await issuesApi.close('issue-1');

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/close');
    });
  });

  describe('reopen', () => {
    it('should call reopen endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'issue-1', status: 'new' },
      });

      await issuesApi.reopen('issue-1');

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/reopen');
    });
  });

  describe('delete', () => {
    it('should call delete endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await issuesApi.delete('issue-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/issues/issue-1');
    });
  });

  describe('getComments', () => {
    it('should call get comments endpoint', async () => {
      const { issuesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'comment-1', content: 'Test' }],
      });

      const result = await issuesApi.getComments('issue-1');

      expect(api.get).toHaveBeenCalledWith('/v1/issues/issue-1/comments');
      expect(result).toEqual([{ id: 'comment-1', content: 'Test' }]);
    });
  });

  describe('Problem linking', () => {
    it('should get linked problem', async () => {
      const { issuesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'problem-1', title: 'Related Problem' },
      });

      const result = await issuesApi.getLinkedProblem('issue-1');

      expect(api.get).toHaveBeenCalledWith('/v1/issues/issue-1/problem');
      expect(result).toEqual({ id: 'problem-1', title: 'Related Problem' });
    });

    it('should link issue to problem', async () => {
      const { issuesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await issuesApi.linkToProblem('issue-1', 'problem-1', 'related_to', 'Similar symptoms');

      expect(api.post).toHaveBeenCalledWith('/v1/issues/issue-1/problem', {
        problemId: 'problem-1',
        relationshipType: 'related_to',
        notes: 'Similar symptoms',
      });
    });

    it('should unlink issue from problem', async () => {
      const { issuesApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await issuesApi.unlinkFromProblem('issue-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/issues/issue-1/problem');
    });
  });
});

describe('Problems API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('list', () => {
    it('should call problems list endpoint with params', async () => {
      const { problemsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: {} },
      });

      await problemsApi.list({ status: 'investigating', priority: 'high' });

      expect(api.get).toHaveBeenCalledWith('/v1/problems', {
        params: { status: 'investigating', priority: 'high' },
      });
    });
  });

  describe('get', () => {
    it('should call problem get endpoint', async () => {
      const { problemsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'problem-1', title: 'Test Problem' },
      });

      const result = await problemsApi.get('problem-1');

      expect(api.get).toHaveBeenCalledWith('/v1/problems/problem-1');
      expect(result.title).toBe('Test Problem');
    });
  });

  describe('create', () => {
    it('should call problem create endpoint', async () => {
      const { problemsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'new-problem' },
      });

      await problemsApi.create({
        title: 'New Problem',
        description: 'Problem description',
        priority: 'critical',
        problemType: 'reactive',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/problems', expect.objectContaining({
        title: 'New Problem',
        priority: 'critical',
      }));
    });
  });

  describe('update', () => {
    it('should call problem update endpoint', async () => {
      const { problemsApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'problem-1' },
      });

      await problemsApi.update('problem-1', { rootCause: 'Memory leak' });

      expect(api.put).toHaveBeenCalledWith('/v1/problems/problem-1', { rootCause: 'Memory leak' });
    });
  });

  describe('changeStatus', () => {
    it('should call status change endpoint', async () => {
      const { problemsApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'problem-1', status: 'root_cause_identified' },
      });

      await problemsApi.changeStatus('problem-1', 'root_cause_identified', 'Found the root cause');

      expect(api.put).toHaveBeenCalledWith('/v1/problems/problem-1/status', {
        status: 'root_cause_identified',
        reason: 'Found the root cause',
      });
    });
  });

  describe('comments', () => {
    it('should get comments', async () => {
      const { problemsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'comment-1' }],
      });

      await problemsApi.getComments('problem-1');

      expect(api.get).toHaveBeenCalledWith('/v1/problems/problem-1/comments');
    });

    it('should add comment', async () => {
      const { problemsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'comment-1' },
      });

      await problemsApi.addComment('problem-1', 'Test comment', true);

      expect(api.post).toHaveBeenCalledWith('/v1/problems/problem-1/comments', {
        content: 'Test comment',
        isInternal: true,
      });
    });
  });

  describe('worklogs', () => {
    it('should get worklogs', async () => {
      const { problemsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'worklog-1' }],
      });

      await problemsApi.getWorklogs('problem-1');

      expect(api.get).toHaveBeenCalledWith('/v1/problems/problem-1/worklogs');
    });

    it('should add worklog', async () => {
      const { problemsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'worklog-1' },
      });

      await problemsApi.addWorklog('problem-1', 60, 'Investigated logs', 'analysis');

      expect(api.post).toHaveBeenCalledWith('/v1/problems/problem-1/worklogs', {
        timeSpent: 60,
        description: 'Investigated logs',
        workType: 'analysis',
      });
    });
  });

  describe('linked issues', () => {
    it('should get linked issues', async () => {
      const { problemsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'issue-1' }],
      });

      await problemsApi.getLinkedIssues('problem-1');

      expect(api.get).toHaveBeenCalledWith('/v1/problems/problem-1/issues');
    });

    it('should link issue to problem', async () => {
      const { problemsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await problemsApi.linkIssue('problem-1', 'issue-1', 'caused_by', 'Root cause found');

      expect(api.post).toHaveBeenCalledWith('/v1/problems/problem-1/issues', {
        issueId: 'issue-1',
        relationshipType: 'caused_by',
        notes: 'Root cause found',
      });
    });

    it('should unlink issue from problem', async () => {
      const { problemsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await problemsApi.unlinkIssue('problem-1', 'issue-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/problems/problem-1/issues/issue-1');
    });
  });

  describe('history and conversion', () => {
    it('should get problem history', async () => {
      const { problemsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ type: 'status_change' }],
      });

      await problemsApi.getHistory('problem-1');

      expect(api.get).toHaveBeenCalledWith('/v1/problems/problem-1/history');
    });

    it('should convert to known error', async () => {
      const { problemsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { is_known_error: true },
      });

      await problemsApi.convertToKnownError('problem-1');

      expect(api.post).toHaveBeenCalledWith('/v1/problems/problem-1/convert-to-known-error');
    });
  });
});

describe('Changes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('list', () => {
    it('should call changes list with params', async () => {
      const { changesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: {} },
      });

      await changesApi.list({ status: 'review', riskLevel: 'high' });

      expect(api.get).toHaveBeenCalledWith('/v1/changes', {
        params: { status: 'review', riskLevel: 'high' },
      });
    });
  });

  describe('get', () => {
    it('should call change get endpoint', async () => {
      const { changesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'change-1', title: 'Test Change' },
      });

      await changesApi.get('change-1');

      expect(api.get).toHaveBeenCalledWith('/v1/changes/change-1');
    });
  });

  describe('create', () => {
    it('should call change create endpoint', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'new-change' },
      });

      await changesApi.create({
        title: 'New Change',
        type: 'normal',
        riskLevel: 'medium',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/changes', expect.objectContaining({
        title: 'New Change',
        type: 'normal',
        riskLevel: 'medium',
      }));
    });
  });

  describe('workflow actions', () => {
    it('should submit change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'submitted' },
      });

      await changesApi.submit('change-1');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/submit');
    });

    it('should approve change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'approved' },
      });

      await changesApi.approve('change-1', 'Looks good');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/approve', { comments: 'Looks good' });
    });

    it('should reject change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'rejected' },
      });

      await changesApi.reject('change-1', 'Missing test plan');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/reject', { reason: 'Missing test plan' });
    });

    it('should schedule change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'scheduled' },
      });

      await changesApi.schedule('change-1', '2024-01-20', '2024-01-21');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/schedule', {
        plannedStart: '2024-01-20',
        plannedEnd: '2024-01-21',
      });
    });

    it('should start change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'implementing' },
      });

      await changesApi.start('change-1');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/start');
    });

    it('should complete change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'completed' },
      });

      await changesApi.complete('change-1', 'Successfully deployed');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/complete', { outcomeNotes: 'Successfully deployed' });
    });

    it('should fail change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'failed' },
      });

      await changesApi.fail('change-1', 'Database migration failed');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/fail', { outcomeNotes: 'Database migration failed' });
    });

    it('should rollback change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'rolled_back' },
      });

      await changesApi.rollback('change-1', 'Performance issues detected');

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/rollback', { outcomeNotes: 'Performance issues detected' });
    });

    it('should cancel change', async () => {
      const { changesApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'cancelled' },
      });

      await changesApi.cancel('change-1', 'No longer needed');

      expect(api.delete).toHaveBeenCalledWith('/v1/changes/change-1', { data: { reason: 'No longer needed' } });
    });
  });

  describe('comments and approvals', () => {
    it('should get change comments', async () => {
      const { changesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'comment-1' }],
      });

      await changesApi.getComments('change-1');

      expect(api.get).toHaveBeenCalledWith('/v1/changes/change-1/comments');
    });

    it('should add comment to change', async () => {
      const { changesApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'comment-1' },
      });

      await changesApi.addComment('change-1', 'Review comment', true);

      expect(api.post).toHaveBeenCalledWith('/v1/changes/change-1/comments', {
        content: 'Review comment',
        isInternal: true,
      });
    });

    it('should get approvals', async () => {
      const { changesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'approval-1', status: 'pending' }],
      });

      await changesApi.getApprovals('change-1');

      expect(api.get).toHaveBeenCalledWith('/v1/changes/change-1/approvals');
    });

    it('should get change history', async () => {
      const { changesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ type: 'status_change' }],
      });

      await changesApi.getHistory('change-1');

      expect(api.get).toHaveBeenCalledWith('/v1/changes/change-1/history');
    });

    it('should get tasks', async () => {
      const { changesApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'task-1' }],
      });

      await changesApi.getTasks('change-1');

      expect(api.get).toHaveBeenCalledWith('/v1/changes/change-1/tasks');
    });
  });
});

describe('Applications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('list', () => {
    it('should list applications with params', async () => {
      const { applicationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [], pagination: {} },
      });

      await applicationsApi.list({ tier: 'P1', status: 'active' });

      expect(api.get).toHaveBeenCalledWith('/v1/applications', {
        params: { tier: 'P1', status: 'active' },
      });
    });
  });

  describe('get', () => {
    it('should get application by id', async () => {
      const { applicationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'app-1', name: 'CRM' },
      });

      await applicationsApi.get('app-1');

      expect(api.get).toHaveBeenCalledWith('/v1/applications/app-1');
    });
  });

  describe('create', () => {
    it('should create application', async () => {
      const { applicationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'new-app' },
      });

      await applicationsApi.create({
        name: 'New App',
        tier: 'P2',
        criticality: 'business_critical',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/applications', expect.objectContaining({
        name: 'New App',
        tier: 'P2',
      }));
    });
  });

  describe('update', () => {
    it('should update application', async () => {
      const { applicationsApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'app-1' },
      });

      await applicationsApi.update('app-1', { status: 'deprecated' });

      expect(api.put).toHaveBeenCalledWith('/v1/applications/app-1', { status: 'deprecated' });
    });
  });

  describe('delete', () => {
    it('should delete application', async () => {
      const { applicationsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await applicationsApi.delete('app-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/applications/app-1');
    });
  });

  describe('health', () => {
    it('should get application health', async () => {
      const { applicationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { healthScore: 95, status: 'healthy' },
      });

      await applicationsApi.getHealth('app-1');

      expect(api.get).toHaveBeenCalledWith('/v1/applications/app-1/health');
    });
  });
});

describe('Catalog API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should list catalog items', async () => {
    const { catalogApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    await catalogApi.listItems({ category: 'hardware' });

    expect(api.get).toHaveBeenCalledWith('/v1/catalog/items', { params: { category: 'hardware' } });
  });

  it('should get catalog item', async () => {
    const { catalogApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'item-1' },
    });

    await catalogApi.getItem('item-1');

    expect(api.get).toHaveBeenCalledWith('/v1/catalog/items/item-1');
  });

  it('should submit request for catalog item', async () => {
    const { catalogApi, api } = await import('../api');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'request-1' },
    });

    await catalogApi.submitRequest('item-1', { quantity: 2 });

    expect(api.post).toHaveBeenCalledWith('/v1/requests', {
      catalogItemId: 'item-1',
      formData: { quantity: 2 },
    });
  });
});

describe('Notifications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should list notifications', async () => {
    const { notificationsApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    await notificationsApi.list({ unreadOnly: true });

    expect(api.get).toHaveBeenCalledWith('/v1/notifications', { params: { unreadOnly: true } });
  });

  it('should mark notification as read', async () => {
    const { notificationsApi, api } = await import('../api');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true },
    });

    await notificationsApi.markRead('notification-1');

    expect(api.post).toHaveBeenCalledWith('/v1/notifications/notification-1/read');
  });

  it('should mark all notifications as read', async () => {
    const { notificationsApi, api } = await import('../api');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true },
    });

    await notificationsApi.markAllRead();

    expect(api.post).toHaveBeenCalledWith('/v1/notifications/mark-all-read');
  });

  it('should get unread count', async () => {
    const { notificationsApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { count: 5 },
    });

    await notificationsApi.getUnreadCount();

    expect(api.get).toHaveBeenCalledWith('/v1/notifications/unread-count');
  });

  it('should delete notification', async () => {
    const { notificationsApi, api } = await import('../api');
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await notificationsApi.delete('notification-1');

    expect(api.delete).toHaveBeenCalledWith('/v1/notifications/notification-1');
  });
});

describe('Users API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should list users', async () => {
    const { usersApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    await usersApi.list({ search: 'john' });

    expect(api.get).toHaveBeenCalledWith('/v1/users', { params: { search: 'john' } });
  });

  it('should get user by id', async () => {
    const { usersApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'user-1', name: 'John Doe' },
    });

    await usersApi.get('user-1');

    expect(api.get).toHaveBeenCalledWith('/v1/users/user-1');
  });
});

describe('Groups API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should list groups', async () => {
    const { groupsApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    await groupsApi.list({ type: 'team' });

    expect(api.get).toHaveBeenCalledWith('/v1/groups', { params: { type: 'team' } });
  });

  it('should get group by id', async () => {
    const { groupsApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'group-1', name: 'Support Team' },
    });

    await groupsApi.get('group-1');

    expect(api.get).toHaveBeenCalledWith('/v1/groups/group-1');
  });

  it('should create group', async () => {
    const { groupsApi, api } = await import('../api');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'new-group' },
    });

    await groupsApi.create({
      name: 'New Team',
      type: 'team',
      description: 'A new team',
    });

    expect(api.post).toHaveBeenCalledWith('/v1/groups', expect.objectContaining({
      name: 'New Team',
      type: 'team',
    }));
  });

  it('should update group', async () => {
    const { groupsApi, api } = await import('../api');
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'group-1' },
    });

    await groupsApi.update('group-1', { name: 'Updated Team' });

    expect(api.put).toHaveBeenCalledWith('/v1/groups/group-1', { name: 'Updated Team' });
  });

  it('should delete group', async () => {
    const { groupsApi, api } = await import('../api');
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await groupsApi.delete('group-1');

    expect(api.delete).toHaveBeenCalledWith('/v1/groups/group-1');
  });

  it('should get group members', async () => {
    const { groupsApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'member-1' }],
    });

    await groupsApi.getMembers('group-1');

    expect(api.get).toHaveBeenCalledWith('/v1/groups/group-1/members');
  });

  it('should add member to group', async () => {
    const { groupsApi, api } = await import('../api');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true },
    });

    await groupsApi.addMember('group-1', 'user-1', 'lead');

    expect(api.post).toHaveBeenCalledWith('/v1/groups/group-1/members', {
      userId: 'user-1',
      role: 'lead',
    });
  });

  it('should remove member from group', async () => {
    const { groupsApi, api } = await import('../api');
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await groupsApi.removeMember('group-1', 'user-1');

    expect(api.delete).toHaveBeenCalledWith('/v1/groups/group-1/members/user-1');
  });
});

describe('Roles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should list roles', async () => {
    const { rolesApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'role-1', name: 'admin' }],
    });

    await rolesApi.list();

    expect(api.get).toHaveBeenCalledWith('/v1/roles');
  });

  it('should get role by id', async () => {
    const { rolesApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'role-1', name: 'admin' },
    });

    await rolesApi.get('role-1');

    expect(api.get).toHaveBeenCalledWith('/v1/roles/role-1');
  });

  it('should create role', async () => {
    const { rolesApi, api } = await import('../api');
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'new-role' },
    });

    await rolesApi.create({
      name: 'custom_role',
      displayName: 'Custom Role',
      permissionIds: ['perm-1', 'perm-2'],
    });

    expect(api.post).toHaveBeenCalledWith('/v1/roles', expect.objectContaining({
      name: 'custom_role',
      displayName: 'Custom Role',
    }));
  });

  it('should update role', async () => {
    const { rolesApi, api } = await import('../api');
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { id: 'role-1' },
    });

    await rolesApi.update('role-1', { displayName: 'Updated Role' });

    expect(api.put).toHaveBeenCalledWith('/v1/roles/role-1', { displayName: 'Updated Role' });
  });

  it('should get permissions', async () => {
    const { rolesApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'perm-1', name: 'issues.read' }],
    });

    await rolesApi.getPermissions();

    expect(api.get).toHaveBeenCalledWith('/v1/roles/permissions');
  });
});

describe('Reports API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('templates', () => {
    it('should list templates', async () => {
      const { reportsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await reportsApi.listTemplates({ report_type: 'issues' });

      expect(api.get).toHaveBeenCalledWith('/v1/reports/templates', {
        params: { report_type: 'issues' },
      });
    });

    it('should get template', async () => {
      const { reportsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'template-1' },
      });

      await reportsApi.getTemplate('template-1');

      expect(api.get).toHaveBeenCalledWith('/v1/reports/templates/template-1');
    });

    it('should create template', async () => {
      const { reportsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { template: { id: 'new-template' } },
      });

      await reportsApi.createTemplate({
        name: 'Issue Report',
        type: 'issues',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/reports/templates', expect.objectContaining({
        name: 'Issue Report',
        reportType: 'issues',
      }));
    });

    it('should delete template', async () => {
      const { reportsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await reportsApi.deleteTemplate('template-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/reports/templates/template-1');
    });
  });

  describe('executions', () => {
    it('should execute report', async () => {
      const { reportsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { executionId: 'exec-1' },
      });

      await reportsApi.execute('template-1', { outputFormat: 'csv' });

      expect(api.post).toHaveBeenCalledWith('/v1/reports/execute', {
        templateId: 'template-1',
        outputFormat: 'csv',
      });
    });

    it('should preview report', async () => {
      const { reportsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { rows: [] },
      });

      await reportsApi.preview('template-1', { dateRange: '7d' });

      expect(api.post).toHaveBeenCalledWith('/v1/reports/templates/template-1/preview', {
        parameters: { dateRange: '7d' },
      });
    });

    it('should list executions', async () => {
      const { reportsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await reportsApi.listExecutions({ status: 'completed' });

      expect(api.get).toHaveBeenCalledWith('/v1/reports/executions', {
        params: expect.objectContaining({ status: 'completed' }),
      });
    });

    it('should get execution', async () => {
      const { reportsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'exec-1', status: 'completed' },
      });

      await reportsApi.getExecution('exec-1');

      expect(api.get).toHaveBeenCalledWith('/v1/reports/executions/exec-1');
    });
  });

  describe('schedules', () => {
    it('should list schedules', async () => {
      const { reportsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await reportsApi.listSchedules();

      expect(api.get).toHaveBeenCalledWith('/v1/reports/schedules', { params: undefined });
    });

    it('should create schedule', async () => {
      const { reportsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'schedule-1' },
      });

      await reportsApi.createSchedule({
        templateId: 'template-1',
        name: 'Daily Report',
        scheduleType: 'daily',
        deliveryMethod: 'email',
        recipients: ['admin@example.com'],
      });

      expect(api.post).toHaveBeenCalledWith('/v1/reports/schedules', expect.objectContaining({
        templateId: 'template-1',
        name: 'Daily Report',
      }));
    });

    it('should delete schedule', async () => {
      const { reportsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await reportsApi.deleteSchedule('schedule-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/reports/schedules/schedule-1');
    });
  });

  describe('widgets', () => {
    it('should list widgets', async () => {
      const { reportsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'widget-1' }],
      });

      await reportsApi.listWidgets();

      expect(api.get).toHaveBeenCalledWith('/v1/reports/widgets');
    });

    it('should create widget', async () => {
      const { reportsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'widget-1' },
      });

      await reportsApi.createWidget({
        widgetType: 'chart',
        dataSource: 'issues',
        chartType: 'bar',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/reports/widgets', expect.objectContaining({
        widgetType: 'chart',
        dataSource: 'issues',
      }));
    });

    it('should delete widget', async () => {
      const { reportsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await reportsApi.deleteWidget('widget-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/reports/widgets/widget-1');
    });
  });
});

describe('Dashboard API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should get overview', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { openIssues: 10, pendingChanges: 5 },
    });

    await dashboardApi.getOverview();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard');
  });

  it('should get mobile summary', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { summary: {} },
    });

    await dashboardApi.getMobileSummary();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/mobile');
  });

  it('should get issue trends', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { trends: [] },
    });

    await dashboardApi.getIssueTrends(30);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/trends/issues', { params: { days: 30 } });
  });

  it('should get issues by priority', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ priority: 'high', count: 5 }],
    });

    await dashboardApi.getIssuesByPriority();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/issues/by-priority');
  });

  it('should get issues by status', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ status: 'open', count: 10 }],
    });

    await dashboardApi.getIssuesByStatus();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/issues/by-status');
  });

  it('should get change trends', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { trends: [] },
    });

    await dashboardApi.getChangeTrends(14);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/trends/changes', { params: { days: 14 } });
  });

  it('should get health distribution', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { healthy: 80, warning: 15, critical: 5 },
    });

    await dashboardApi.getHealthDistribution();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/health/distribution');
  });

  it('should get health by tier', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ tier: 'P1', avgHealth: 90 }],
    });

    await dashboardApi.getHealthByTier();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/health/by-tier');
  });

  it('should get critical applications', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'app-1', healthScore: 30 }],
    });

    await dashboardApi.getCriticalApplications(5);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/health/critical', { params: { limit: 5 } });
  });

  it('should get recent activity', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ type: 'issue_created' }],
    });

    await dashboardApi.getRecentActivity(10);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/activity', { params: { limit: 10 } });
  });

  it('should get upcoming changes', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ id: 'change-1' }],
    });

    await dashboardApi.getUpcomingChanges(7);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/changes/upcoming', { params: { days: 7 } });
  });

  it('should get requests by item', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ item: 'Laptop', count: 15 }],
    });

    await dashboardApi.getRequestsByItem(5);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/requests/by-item', { params: { limit: 5 } });
  });

  it('should get SLA compliance', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { complianceRate: 95 },
    });

    await dashboardApi.getSlaCompliance();

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/sla/compliance');
  });

  it('should get cloud cost trends', async () => {
    const { dashboardApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [{ month: '2024-01', cost: 10000 }],
    });

    await dashboardApi.getCloudCostTrends(6);

    expect(api.get).toHaveBeenCalledWith('/v1/dashboard/cloud/costs', { params: { months: 6 } });
  });
});

describe('Cloud API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('accounts', () => {
    it('should list accounts', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await cloudApi.listAccounts({ provider: 'aws' });

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/accounts', {
        params: { provider: 'aws' },
      });
    });

    it('should get account', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'account-1' },
      });

      await cloudApi.getAccount('account-1');

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/accounts/account-1');
    });

    it('should create account', async () => {
      const { cloudApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'new-account' },
      });

      await cloudApi.createAccount({
        provider: 'aws',
        accountId: '123456789012',
        name: 'Production AWS',
        credentialType: 'role_arn',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/cloud/accounts', expect.objectContaining({
        provider: 'aws',
        accountId: '123456789012',
      }));
    });

    it('should delete account', async () => {
      const { cloudApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await cloudApi.deleteAccount('account-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/cloud/accounts/account-1');
    });

    it('should test connection', async () => {
      const { cloudApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { connected: true },
      });

      await cloudApi.testAccountConnection('account-1');

      expect(api.post).toHaveBeenCalledWith('/v1/cloud/accounts/account-1/test');
    });
  });

  describe('resources', () => {
    it('should list resources', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await cloudApi.listResources({ resource_type: 'ec2' });

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/resources', {
        params: { resource_type: 'ec2' },
      });
    });

    it('should get resource types', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: ['ec2', 'rds', 's3'],
      });

      await cloudApi.getResourceTypes();

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/resources/types');
    });

    it('should map resource to application', async () => {
      const { cloudApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await cloudApi.mapResourceToApplication('resource-1', 'app-1', 'prod');

      expect(api.post).toHaveBeenCalledWith('/v1/cloud/resources/resource-1/map', {
        applicationId: 'app-1',
        environmentId: 'prod',
      });
    });

    it('should unmap resource', async () => {
      const { cloudApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await cloudApi.unmapResource('resource-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/cloud/resources/resource-1/map');
    });
  });

  describe('costs', () => {
    it('should get costs', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await cloudApi.getCosts({ period_type: 'monthly' });

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/costs', {
        params: { period_type: 'monthly' },
      });
    });

    it('should get costs by application', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { total: 1000 },
      });

      await cloudApi.getCostsByApplication('app-1', 'monthly');

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/applications/app-1/costs', {
        params: { period_type: 'monthly' },
      });
    });
  });

  describe('mapping rules', () => {
    it('should list mapping rules', async () => {
      const { cloudApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'rule-1' }],
      });

      await cloudApi.listMappingRules();

      expect(api.get).toHaveBeenCalledWith('/v1/cloud/mapping-rules');
    });

    it('should create mapping rule', async () => {
      const { cloudApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'rule-1' },
      });

      await cloudApi.createMappingRule({
        name: 'App Tag Rule',
        tagKey: 'Application',
        applicationId: 'app-1',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/cloud/mapping-rules', expect.objectContaining({
        name: 'App Tag Rule',
        tagKey: 'Application',
      }));
    });

    it('should apply mapping rules', async () => {
      const { cloudApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { mapped: 10 },
      });

      await cloudApi.applyMappingRules();

      expect(api.post).toHaveBeenCalledWith('/v1/cloud/mapping-rules/apply');
    });
  });
});

describe('On-Call API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('schedules', () => {
    it('should list schedules', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await oncallApi.listSchedules({ is_active: true });

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/schedules', {
        params: { is_active: true },
      });
    });

    it('should get schedule', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'schedule-1' },
      });

      await oncallApi.getSchedule('schedule-1');

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1');
    });

    it('should create schedule', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'new-schedule' },
      });

      await oncallApi.createSchedule({
        name: 'IT Support',
        rotationType: 'weekly',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/schedules', expect.objectContaining({
        name: 'IT Support',
        rotationType: 'weekly',
      }));
    });

    it('should delete schedule', async () => {
      const { oncallApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await oncallApi.deleteSchedule('schedule-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1');
    });
  });

  describe('rotations', () => {
    it('should get rotations', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'rotation-1' }],
      });

      await oncallApi.getRotations('schedule-1');

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1/rotations');
    });

    it('should add to rotation', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'rotation-1' },
      });

      await oncallApi.addToRotation('schedule-1', 'user-1', 1);

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1/rotations', {
        userId: 'user-1',
        position: 1,
      });
    });

    it('should remove from rotation', async () => {
      const { oncallApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await oncallApi.removeFromRotation('schedule-1', 'rotation-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1/rotations/rotation-1');
    });
  });

  describe('shifts', () => {
    it('should get shifts', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ id: 'shift-1' }],
      });

      await oncallApi.getShifts('schedule-1', { start_date: '2024-01-01' });

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1/shifts', {
        params: { start_date: '2024-01-01' },
      });
    });

    it('should create shift', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'shift-1' },
      });

      await oncallApi.createShift('schedule-1', {
        userId: 'user-1',
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-16T08:00:00Z',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1/shifts', expect.objectContaining({
        userId: 'user-1',
      }));
    });
  });

  describe('overrides', () => {
    it('should create override', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'override-1' },
      });

      await oncallApi.createOverride('schedule-1', {
        userId: 'user-2',
        startTime: '2024-01-15T08:00:00Z',
        endTime: '2024-01-16T08:00:00Z',
        reason: 'Vacation coverage',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/schedules/schedule-1/override', expect.objectContaining({
        userId: 'user-2',
        reason: 'Vacation coverage',
      }));
    });
  });

  describe('who is on call', () => {
    it('should get who is on call', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [{ user: { id: 'user-1' } }],
      });

      await oncallApi.whoIsOnCall({ application_id: 'app-1' });

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/who-is-on-call', {
        params: { application_id: 'app-1' },
      });
    });
  });

  describe('escalation policies', () => {
    it('should list policies', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await oncallApi.listPolicies();

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/escalation-policies', { params: undefined });
    });

    it('should create policy', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'policy-1' },
      });

      await oncallApi.createPolicy({
        name: 'Critical Escalation',
        repeatCount: 3,
      });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/escalation-policies', expect.objectContaining({
        name: 'Critical Escalation',
      }));
    });

    it('should delete policy', async () => {
      const { oncallApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await oncallApi.deletePolicy('policy-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/oncall/escalation-policies/policy-1');
    });

    it('should add policy step', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'step-1' },
      });

      await oncallApi.addPolicyStep('policy-1', {
        notifyType: 'schedule',
        scheduleId: 'schedule-1',
        delayMinutes: 15,
      });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/escalation-policies/policy-1/steps', expect.objectContaining({
        notifyType: 'schedule',
      }));
    });
  });

  describe('shift swaps', () => {
    it('should list swaps', async () => {
      const { oncallApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await oncallApi.listSwaps({ status: 'pending' });

      expect(api.get).toHaveBeenCalledWith('/v1/oncall/swaps', {
        params: { status: 'pending' },
      });
    });

    it('should create swap request', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'swap-1' },
      });

      await oncallApi.createSwapRequest({
        scheduleId: 'schedule-1',
        originalStart: '2024-01-15T08:00:00Z',
        originalEnd: '2024-01-16T08:00:00Z',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/swaps', expect.objectContaining({
        scheduleId: 'schedule-1',
      }));
    });

    it('should accept swap', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'accepted' },
      });

      await oncallApi.acceptSwap('swap-1', { message: 'Happy to help!' });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/swaps/swap-1/accept', { message: 'Happy to help!' });
    });

    it('should reject swap', async () => {
      const { oncallApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'rejected' },
      });

      await oncallApi.rejectSwap('swap-1', { message: 'Not available' });

      expect(api.post).toHaveBeenCalledWith('/v1/oncall/swaps/swap-1/reject', { message: 'Not available' });
    });
  });
});

describe('Knowledge Base API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('articles', () => {
    it('should list articles with params', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await kbApi.listArticles({ categoryId: 'cat-1', publishedOnly: true });

      expect(api.get).toHaveBeenCalledWith('/v1/kb', {
        params: { categoryId: 'cat-1', publishedOnly: true },
      });
    });

    it('should get article by id', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'article-1' },
      });

      await kbApi.getArticle('article-1');

      expect(api.get).toHaveBeenCalledWith('/v1/kb/article-1');
    });

    it('should get article by slug', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { slug: 'how-to-reset-password' },
      });

      await kbApi.getArticleBySlug('how-to-reset-password');

      expect(api.get).toHaveBeenCalledWith('/v1/kb/slug/how-to-reset-password');
    });

    it('should search articles', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await kbApi.searchArticles('password reset', { page: 1, limit: 10 });

      expect(api.get).toHaveBeenCalledWith('/v1/kb/search', {
        params: { q: 'password reset', page: 1, limit: 10 },
      });
    });

    it('should create article', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'article-1' },
      });

      await kbApi.createArticle({
        title: 'How to Reset Password',
        content: 'Step 1...',
        type: 'how_to',
        visibility: 'public',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/kb', expect.objectContaining({
        title: 'How to Reset Password',
        type: 'how_to',
      }));
    });

    it('should update article', async () => {
      const { kbApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'article-1' },
      });

      await kbApi.updateArticle('article-1', { title: 'Updated Title' });

      expect(api.put).toHaveBeenCalledWith('/v1/kb/article-1', { title: 'Updated Title' });
    });

    it('should delete article', async () => {
      const { kbApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await kbApi.deleteArticle('article-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/kb/article-1');
    });
  });

  describe('article status', () => {
    it('should submit for review', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'pending_review' },
      });

      await kbApi.submitForReview('article-1');

      expect(api.post).toHaveBeenCalledWith('/v1/kb/article-1/submit-for-review');
    });

    it('should publish article', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'published' },
      });

      await kbApi.publishArticle('article-1');

      expect(api.post).toHaveBeenCalledWith('/v1/kb/article-1/publish');
    });

    it('should archive article', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'archived' },
      });

      await kbApi.archiveArticle('article-1');

      expect(api.post).toHaveBeenCalledWith('/v1/kb/article-1/archive');
    });

    it('should revert to draft', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { status: 'draft' },
      });

      await kbApi.revertToDraft('article-1');

      expect(api.post).toHaveBeenCalledWith('/v1/kb/article-1/revert-to-draft');
    });
  });

  describe('feedback and history', () => {
    it('should submit feedback', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'feedback-1' },
      });

      await kbApi.submitFeedback('article-1', true, 'Very helpful!');

      expect(api.post).toHaveBeenCalledWith('/v1/kb/article-1/feedback', {
        isHelpful: true,
        comment: 'Very helpful!',
      });
    });

    it('should get article history', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await kbApi.getArticleHistory('article-1');

      expect(api.get).toHaveBeenCalledWith('/v1/kb/article-1/history');
    });

    it('should link article', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { linked: true },
      });

      await kbApi.linkArticle('article-1', { problemId: 'problem-1' });

      expect(api.post).toHaveBeenCalledWith('/v1/kb/article-1/link', { problemId: 'problem-1' });
    });
  });

  describe('categories', () => {
    it('should list categories', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await kbApi.listCategories();

      expect(api.get).toHaveBeenCalledWith('/v1/kb/categories');
    });

    it('should create category', async () => {
      const { kbApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'cat-1' },
      });

      await kbApi.createCategory({
        name: 'Troubleshooting',
        description: 'Common troubleshooting guides',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/kb/categories', expect.objectContaining({
        name: 'Troubleshooting',
      }));
    });

    it('should update category', async () => {
      const { kbApi, api } = await import('../api');
      (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'cat-1' },
      });

      await kbApi.updateCategory('cat-1', { name: 'Updated Category' });

      expect(api.put).toHaveBeenCalledWith('/v1/kb/categories/cat-1', { name: 'Updated Category' });
    });

    it('should delete category', async () => {
      const { kbApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await kbApi.deleteCategory('cat-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/kb/categories/cat-1');
    });
  });

  describe('related articles', () => {
    it('should get articles for problem', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await kbApi.getArticlesForProblem('problem-1');

      expect(api.get).toHaveBeenCalledWith('/v1/kb/problem/problem-1');
    });

    it('should get articles for issue', async () => {
      const { kbApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await kbApi.getArticlesForIssue('issue-1');

      expect(api.get).toHaveBeenCalledWith('/v1/kb/issue/issue-1');
    });
  });
});

describe('Settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should get settings', async () => {
    const { settingsApi, api } = await import('../api');
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { name: 'Acme Corp' },
    });

    await settingsApi.get();

    expect(api.get).toHaveBeenCalledWith('/v1/settings');
  });

  it('should update settings', async () => {
    const { settingsApi, api } = await import('../api');
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { name: 'Updated Corp' },
    });

    await settingsApi.update({ name: 'Updated Corp', billingEmail: 'billing@example.com' });

    expect(api.put).toHaveBeenCalledWith('/v1/settings', {
      name: 'Updated Corp',
      billingEmail: 'billing@example.com',
    });
  });
});

describe('SLA API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('policies', () => {
    it('should list policies with filters', async () => {
      const { slaApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await slaApi.listPolicies({ entityType: 'issue', isActive: true });

      expect(api.get).toHaveBeenCalledWith('/v1/sla/policies?entityType=issue&isActive=true');
    });

    it('should get policy', async () => {
      const { slaApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'policy-1' },
      });

      await slaApi.getPolicy('policy-1');

      expect(api.get).toHaveBeenCalledWith('/v1/sla/policies/policy-1');
    });

    it('should create policy', async () => {
      const { slaApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'policy-1' },
      });

      await slaApi.createPolicy({
        name: 'Critical SLA',
        entityType: 'issue',
        targets: [{
          metricType: 'response_time',
          priority: 'critical',
          targetMinutes: 15,
        }],
      });

      expect(api.post).toHaveBeenCalledWith('/v1/sla/policies', expect.objectContaining({
        name: 'Critical SLA',
      }));
    });

    it('should update policy', async () => {
      const { slaApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'policy-1' },
      });

      await slaApi.updatePolicy('policy-1', { name: 'Updated SLA' });

      expect(api.patch).toHaveBeenCalledWith('/v1/sla/policies/policy-1', { name: 'Updated SLA' });
    });

    it('should delete policy', async () => {
      const { slaApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await slaApi.deletePolicy('policy-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/sla/policies/policy-1');
    });
  });

  describe('targets', () => {
    it('should create target', async () => {
      const { slaApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'target-1' },
      });

      await slaApi.createTarget('policy-1', {
        metricType: 'resolution_time',
        priority: 'high',
        targetMinutes: 240,
      });

      expect(api.post).toHaveBeenCalledWith('/v1/sla/policies/policy-1/targets', expect.objectContaining({
        metricType: 'resolution_time',
      }));
    });

    it('should update target', async () => {
      const { slaApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'target-1' },
      });

      await slaApi.updateTarget('target-1', { targetMinutes: 180 });

      expect(api.patch).toHaveBeenCalledWith('/v1/sla/targets/target-1', { targetMinutes: 180 });
    });

    it('should delete target', async () => {
      const { slaApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await slaApi.deleteTarget('target-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/sla/targets/target-1');
    });
  });

  describe('stats and config', () => {
    it('should get stats', async () => {
      const { slaApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { compliance: 95 },
      });

      await slaApi.getStats({ entityType: 'issue', startDate: '2024-01-01' });

      expect(api.get).toHaveBeenCalledWith('/v1/sla/stats?entityType=issue&startDate=2024-01-01');
    });

    it('should get config', async () => {
      const { slaApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { businessHours: {} },
      });

      await slaApi.getConfig('issue');

      expect(api.get).toHaveBeenCalledWith('/v1/sla/config?entityType=issue');
    });
  });
});

describe('Asset API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('assets CRUD', () => {
    it('should list assets with filters', async () => {
      const { assetApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await assetApi.list({ assetType: 'hardware', status: 'active' });

      expect(api.get).toHaveBeenCalledWith('/v1/assets', {
        params: { assetType: 'hardware', status: 'active' },
      });
    });

    it('should get asset', async () => {
      const { assetApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'asset-1' },
      });

      await assetApi.get('asset-1');

      expect(api.get).toHaveBeenCalledWith('/v1/assets/asset-1');
    });

    it('should create asset', async () => {
      const { assetApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'asset-1' },
      });

      await assetApi.create({
        name: 'Dell Laptop',
        assetType: 'hardware',
        category: 'laptop',
        manufacturer: 'Dell',
        serialNumber: 'ABC123',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/assets', expect.objectContaining({
        name: 'Dell Laptop',
        assetType: 'hardware',
      }));
    });

    it('should update asset', async () => {
      const { assetApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'asset-1' },
      });

      await assetApi.update('asset-1', { status: 'maintenance' });

      expect(api.patch).toHaveBeenCalledWith('/v1/assets/asset-1', { status: 'maintenance' });
    });

    it('should delete asset', async () => {
      const { assetApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await assetApi.delete('asset-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/assets/asset-1');
    });
  });

  describe('relationships', () => {
    it('should get relationships', async () => {
      const { assetApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await assetApi.getRelationships('asset-1');

      expect(api.get).toHaveBeenCalledWith('/v1/assets/asset-1/relationships');
    });

    it('should create relationship', async () => {
      const { assetApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'rel-1' },
      });

      await assetApi.createRelationship('asset-1', {
        childAssetId: 'asset-2',
        relationshipType: 'contains',
      });

      expect(api.post).toHaveBeenCalledWith('/v1/assets/asset-1/relationships', {
        childAssetId: 'asset-2',
        relationshipType: 'contains',
      });
    });

    it('should delete relationship', async () => {
      const { assetApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await assetApi.deleteRelationship('rel-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/assets/relationships/rel-1');
    });
  });

  describe('issue links', () => {
    it('should get issues', async () => {
      const { assetApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await assetApi.getIssues('asset-1');

      expect(api.get).toHaveBeenCalledWith('/v1/assets/asset-1/issues');
    });

    it('should link to issue', async () => {
      const { assetApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { linked: true },
      });

      await assetApi.linkToIssue('asset-1', 'issue-1');

      expect(api.post).toHaveBeenCalledWith('/v1/assets/asset-1/issues/issue-1');
    });

    it('should unlink from issue', async () => {
      const { assetApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await assetApi.unlinkFromIssue('asset-1', 'issue-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/assets/asset-1/issues/issue-1');
    });
  });

  describe('changes and stats', () => {
    it('should get changes', async () => {
      const { assetApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await assetApi.getChanges('asset-1');

      expect(api.get).toHaveBeenCalledWith('/v1/assets/asset-1/changes');
    });

    it('should get stats', async () => {
      const { assetApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { total: 100 },
      });

      await assetApi.getStats();

      expect(api.get).toHaveBeenCalledWith('/v1/assets/stats/overview');
    });
  });
});

describe('Workflow API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('rules', () => {
    it('should list rules with filters', async () => {
      const { workflowApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await workflowApi.listRules({ entityType: 'issue', isActive: true });

      expect(api.get).toHaveBeenCalledWith('/v1/workflows/rules?entityType=issue&isActive=true');
    });

    it('should get rule', async () => {
      const { workflowApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'rule-1' },
      });

      await workflowApi.getRule('rule-1');

      expect(api.get).toHaveBeenCalledWith('/v1/workflows/rules/rule-1');
    });

    it('should create rule', async () => {
      const { workflowApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'rule-1' },
      });

      await workflowApi.createRule({
        name: 'Auto-assign Critical',
        entityType: 'issue',
        triggerType: 'on_create',
        conditions: [{ field: 'priority', operator: 'equals', value: 'critical' }],
        actions: [{ action_type: 'assign', parameters: { groupId: 'group-1' }, order: 1 }],
      });

      expect(api.post).toHaveBeenCalledWith('/v1/workflows/rules', expect.objectContaining({
        name: 'Auto-assign Critical',
      }));
    });

    it('should update rule', async () => {
      const { workflowApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'rule-1' },
      });

      await workflowApi.updateRule('rule-1', { name: 'Updated Rule' });

      expect(api.patch).toHaveBeenCalledWith('/v1/workflows/rules/rule-1', { name: 'Updated Rule' });
    });

    it('should delete rule', async () => {
      const { workflowApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await workflowApi.deleteRule('rule-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/workflows/rules/rule-1');
    });

    it('should toggle rule', async () => {
      const { workflowApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { isActive: false },
      });

      await workflowApi.toggleRule('rule-1');

      expect(api.post).toHaveBeenCalledWith('/v1/workflows/rules/rule-1/toggle');
    });

    it('should test rule', async () => {
      const { workflowApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { matched: true, actions: [] },
      });

      await workflowApi.testRule('rule-1', { priority: 'critical' });

      expect(api.post).toHaveBeenCalledWith('/v1/workflows/rules/rule-1/test', {
        entityData: { priority: 'critical' },
      });
    });
  });

  describe('logs and metadata', () => {
    it('should get logs', async () => {
      const { workflowApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await workflowApi.getLogs({ ruleId: 'rule-1', page: 1 });

      expect(api.get).toHaveBeenCalledWith('/v1/workflows/logs?ruleId=rule-1&page=1');
    });

    it('should get fields', async () => {
      const { workflowApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await workflowApi.getFields('issue');

      expect(api.get).toHaveBeenCalledWith('/v1/workflows/fields/issue');
    });

    it('should get actions', async () => {
      const { workflowApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await workflowApi.getActions('issue');

      expect(api.get).toHaveBeenCalledWith('/v1/workflows/actions/issue');
    });
  });
});

describe('Integrations API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('metadata', () => {
    it('should get webhook events', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await integrationsApi.getWebhookEvents();

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/webhooks/events');
    });

    it('should get integration types', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await integrationsApi.getIntegrationTypes();

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/types');
    });
  });

  describe('API keys', () => {
    it('should list API keys', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await integrationsApi.listApiKeys({ includeInactive: true });

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/api-keys', {
        params: { includeInactive: true },
      });
    });

    it('should get API key', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'key-1' },
      });

      await integrationsApi.getApiKey('key-1');

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/api-keys/key-1');
    });

    it('should create API key', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'key-1', key: 'sk_...' },
      });

      await integrationsApi.createApiKey({
        name: 'Production API Key',
        permissions: ['read:issues', 'write:issues'],
      });

      expect(api.post).toHaveBeenCalledWith('/v1/integrations/api-keys', expect.objectContaining({
        name: 'Production API Key',
      }));
    });

    it('should update API key', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'key-1' },
      });

      await integrationsApi.updateApiKey('key-1', { isActive: false });

      expect(api.patch).toHaveBeenCalledWith('/v1/integrations/api-keys/key-1', { isActive: false });
    });

    it('should delete API key', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await integrationsApi.deleteApiKey('key-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/integrations/api-keys/key-1');
    });

    it('should validate API key', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { valid: true },
      });

      await integrationsApi.validateApiKey('sk_test_123');

      expect(api.post).toHaveBeenCalledWith('/v1/integrations/api-keys/validate', { key: 'sk_test_123' });
    });
  });

  describe('webhooks', () => {
    it('should list webhooks', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await integrationsApi.listWebhooks();

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/webhooks', { params: undefined });
    });

    it('should get webhook', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'webhook-1' },
      });

      await integrationsApi.getWebhook('webhook-1');

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/webhooks/webhook-1');
    });

    it('should create webhook', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'webhook-1' },
      });

      await integrationsApi.createWebhook({
        name: 'Slack Notifications',
        url: 'https://hooks.slack.com/...',
        events: ['issue.created', 'issue.resolved'],
      });

      expect(api.post).toHaveBeenCalledWith('/v1/integrations/webhooks', expect.objectContaining({
        name: 'Slack Notifications',
      }));
    });

    it('should update webhook', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'webhook-1' },
      });

      await integrationsApi.updateWebhook('webhook-1', { isActive: false });

      expect(api.patch).toHaveBeenCalledWith('/v1/integrations/webhooks/webhook-1', { isActive: false });
    });

    it('should delete webhook', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await integrationsApi.deleteWebhook('webhook-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/integrations/webhooks/webhook-1');
    });

    it('should test webhook', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { success: true },
      });

      await integrationsApi.testWebhook('webhook-1');

      expect(api.post).toHaveBeenCalledWith('/v1/integrations/webhooks/webhook-1/test');
    });

    it('should get webhook deliveries', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await integrationsApi.getWebhookDeliveries('webhook-1', { status: 'failed' });

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/webhooks/webhook-1/deliveries', {
        params: { status: 'failed' },
      });
    });
  });

  describe('third-party integrations', () => {
    it('should list integrations', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await integrationsApi.listIntegrations({ type: 'jira' });

      expect(api.get).toHaveBeenCalledWith('/v1/integrations', { params: { type: 'jira' } });
    });

    it('should get integration', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'int-1' },
      });

      await integrationsApi.getIntegration('int-1');

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/int-1');
    });

    it('should create integration', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'int-1' },
      });

      await integrationsApi.createIntegration({
        name: 'Jira Integration',
        type: 'jira',
        syncEnabled: true,
      });

      expect(api.post).toHaveBeenCalledWith('/v1/integrations', expect.objectContaining({
        name: 'Jira Integration',
      }));
    });

    it('should update integration', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'int-1' },
      });

      await integrationsApi.updateIntegration('int-1', { syncEnabled: false });

      expect(api.patch).toHaveBeenCalledWith('/v1/integrations/int-1', { syncEnabled: false });
    });

    it('should delete integration', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await integrationsApi.deleteIntegration('int-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/integrations/int-1');
    });

    it('should test integration', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { connected: true },
      });

      await integrationsApi.testIntegration('int-1');

      expect(api.post).toHaveBeenCalledWith('/v1/integrations/int-1/test');
    });

    it('should get integration logs', async () => {
      const { integrationsApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await integrationsApi.getIntegrationLogs('int-1', { direction: 'inbound' });

      expect(api.get).toHaveBeenCalledWith('/v1/integrations/int-1/logs', {
        params: { direction: 'inbound' },
      });
    });
  });
});

describe('Email API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('configs', () => {
    it('should list configs', async () => {
      const { emailApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
      });

      await emailApi.listConfigs();

      expect(api.get).toHaveBeenCalledWith('/v1/email/configs');
    });

    it('should get config', async () => {
      const { emailApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'config-1' },
      });

      await emailApi.getConfig('config-1');

      expect(api.get).toHaveBeenCalledWith('/v1/email/configs/config-1');
    });

    it('should create config', async () => {
      const { emailApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'config-1' },
      });

      await emailApi.createConfig({
        name: 'Support Inbox',
        emailAddress: 'support@example.com',
        provider: 'sendgrid',
        autoReplyEnabled: true,
      });

      expect(api.post).toHaveBeenCalledWith('/v1/email/configs', expect.objectContaining({
        name: 'Support Inbox',
        provider: 'sendgrid',
      }));
    });

    it('should update config', async () => {
      const { emailApi, api } = await import('../api');
      (api.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'config-1' },
      });

      await emailApi.updateConfig('config-1', { isActive: false });

      expect(api.patch).toHaveBeenCalledWith('/v1/email/configs/config-1', { isActive: false });
    });

    it('should delete config', async () => {
      const { emailApi, api } = await import('../api');
      (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await emailApi.deleteConfig('config-1');

      expect(api.delete).toHaveBeenCalledWith('/v1/email/configs/config-1');
    });
  });

  describe('logs and testing', () => {
    it('should get logs', async () => {
      const { emailApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { data: [] },
      });

      await emailApi.getLogs({ configId: 'config-1', success: false });

      expect(api.get).toHaveBeenCalledWith('/v1/email/logs', {
        params: { configId: 'config-1', success: false },
      });
    });

    it('should test email', async () => {
      const { emailApi, api } = await import('../api');
      (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { sent: true },
      });

      await emailApi.testEmail('test@example.com', 'Test Subject', 'Test body');

      expect(api.post).toHaveBeenCalledWith('/v1/email/test', {
        to: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test body',
      });
    });

    it('should get webhook URLs', async () => {
      const { emailApi, api } = await import('../api');
      (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { sendgrid: '...', mailgun: '...' },
      });

      await emailApi.getWebhookUrls();

      expect(api.get).toHaveBeenCalledWith('/v1/email/webhook-urls');
    });
  });
});
