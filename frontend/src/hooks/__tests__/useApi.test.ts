import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock all API modules
vi.mock('@/lib/api', () => ({
  issuesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    addComment: vi.fn(),
    getComments: vi.fn(),
    changeStatus: vi.fn(),
    assign: vi.fn(),
    resolve: vi.fn(),
    close: vi.fn(),
    reopen: vi.fn(),
    getLinkedProblem: vi.fn(),
    linkToProblem: vi.fn(),
    unlinkFromProblem: vi.fn(),
  },
  problemsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    changeStatus: vi.fn(),
    assign: vi.fn(),
    getComments: vi.fn(),
    addComment: vi.fn(),
    getWorklogs: vi.fn(),
    addWorklog: vi.fn(),
    getLinkedIssues: vi.fn(),
    getHistory: vi.fn(),
    convertToKnownError: vi.fn(),
  },
  changesApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    getComments: vi.fn(),
    addComment: vi.fn(),
  },
  applicationsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getHealth: vi.fn(),
  },
  catalogApi: {
    listItems: vi.fn(),
    getItem: vi.fn(),
    submitRequest: vi.fn(),
    listRequests: vi.fn(),
  },
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
  usersApi: {
    list: vi.fn(),
    get: vi.fn(),
  },
  groupsApi: {
    list: vi.fn(),
  },
  reportsApi: {
    listTemplates: vi.fn(),
    getTemplate: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    execute: vi.fn(),
    listExecutions: vi.fn(),
    getExecution: vi.fn(),
    listSchedules: vi.fn(),
    getSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    listSaved: vi.fn(),
    createSaved: vi.fn(),
    deleteSaved: vi.fn(),
    listWidgets: vi.fn(),
    createWidget: vi.fn(),
    updateWidget: vi.fn(),
    deleteWidget: vi.fn(),
  },
  dashboardApi: {
    getOverview: vi.fn(),
    getMobileSummary: vi.fn(),
    getIssueTrends: vi.fn(),
    getIssuesByPriority: vi.fn(),
    getRecentActivity: vi.fn(),
    getUpcomingChanges: vi.fn(),
    getHealthDistribution: vi.fn(),
    getCriticalApplications: vi.fn(),
  },
  cloudApi: {
    listAccounts: vi.fn(),
    getAccount: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    testAccountConnection: vi.fn(),
    listResources: vi.fn(),
    getResource: vi.fn(),
    getResourceTypes: vi.fn(),
    getResourcesByApplication: vi.fn(),
    mapResourceToApplication: vi.fn(),
    unmapResource: vi.fn(),
    getCosts: vi.fn(),
    getCostsByApplication: vi.fn(),
    listMappingRules: vi.fn(),
    createMappingRule: vi.fn(),
    deleteMappingRule: vi.fn(),
    applyMappingRules: vi.fn(),
  },
  oncallApi: {
    listSchedules: vi.fn(),
    getSchedule: vi.fn(),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    deleteSchedule: vi.fn(),
    getRotations: vi.fn(),
    addToRotation: vi.fn(),
    removeFromRotation: vi.fn(),
    getShifts: vi.fn(),
    createShift: vi.fn(),
    deleteShift: vi.fn(),
    createOverride: vi.fn(),
    whoIsOnCall: vi.fn(),
    listPolicies: vi.fn(),
    getPolicy: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    getPolicySteps: vi.fn(),
    addPolicyStep: vi.fn(),
    updatePolicyStep: vi.fn(),
    deletePolicyStep: vi.fn(),
    listSwaps: vi.fn(),
    getSwap: vi.fn(),
    getMySwapRequests: vi.fn(),
    getAvailableSwaps: vi.fn(),
    createSwapRequest: vi.fn(),
    updateSwapRequest: vi.fn(),
    cancelSwapRequest: vi.fn(),
    acceptSwap: vi.fn(),
    rejectSwap: vi.fn(),
    adminApproveSwap: vi.fn(),
  },
  kbApi: {
    listArticles: vi.fn(),
    getArticle: vi.fn(),
    getArticleBySlug: vi.fn(),
    searchArticles: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    deleteArticle: vi.fn(),
    submitForReview: vi.fn(),
    publishArticle: vi.fn(),
    archiveArticle: vi.fn(),
    revertToDraft: vi.fn(),
    submitFeedback: vi.fn(),
    getArticleHistory: vi.fn(),
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    getArticlesForProblem: vi.fn(),
    getArticlesForIssue: vi.fn(),
    linkArticle: vi.fn(),
  },
  slaApi: {
    listPolicies: vi.fn(),
    getPolicy: vi.fn(),
    createPolicy: vi.fn(),
    updatePolicy: vi.fn(),
    deletePolicy: vi.fn(),
    createTarget: vi.fn(),
    updateTarget: vi.fn(),
    deleteTarget: vi.fn(),
    getStats: vi.fn(),
    getConfig: vi.fn(),
  },
  workflowApi: {
    listRules: vi.fn(),
    getRule: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    toggleRule: vi.fn(),
    testRule: vi.fn(),
    getLogs: vi.fn(),
    getFields: vi.fn(),
    getActions: vi.fn(),
  },
  assetApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getRelationships: vi.fn(),
    createRelationship: vi.fn(),
    deleteRelationship: vi.fn(),
    getIssues: vi.fn(),
    linkToIssue: vi.fn(),
    unlinkFromIssue: vi.fn(),
    getChanges: vi.fn(),
    getStats: vi.fn(),
  },
  emailApi: {
    listConfigs: vi.fn(),
    getConfig: vi.fn(),
    createConfig: vi.fn(),
    updateConfig: vi.fn(),
    deleteConfig: vi.fn(),
    getLogs: vi.fn(),
    testEmail: vi.fn(),
    getWebhookUrls: vi.fn(),
  },
  integrationsApi: {
    listApiKeys: vi.fn(),
    getApiKey: vi.fn(),
    createApiKey: vi.fn(),
    updateApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    validateApiKey: vi.fn(),
    listWebhookEvents: vi.fn(),
    listWebhooks: vi.fn(),
    getWebhook: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    deleteWebhook: vi.fn(),
    testWebhook: vi.fn(),
    getWebhookDeliveries: vi.fn(),
    listTypes: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    test: vi.fn(),
    getLogs: vi.fn(),
  },
  requestsApi: {
    list: vi.fn(),
    get: vi.fn(),
    getMyRequests: vi.fn(),
    getAssigned: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    assign: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    getApprovals: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    delegate: vi.fn(),
    delegateApproval: vi.fn(),
    getComments: vi.fn(),
    addComment: vi.fn(),
    getHistory: vi.fn(),
  },
  cabMeetingsApi: {
    list: vi.fn(),
    get: vi.fn(),
    getUpcoming: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    getAttendees: vi.fn(),
    addAttendee: vi.fn(),
    removeAttendee: vi.fn(),
    updateAttendeeStatus: vi.fn(),
    getChanges: vi.fn(),
    addChange: vi.fn(),
    removeChange: vi.fn(),
    reorderChanges: vi.fn(),
    generateAgenda: vi.fn(),
    updateAgenda: vi.fn(),
    getDecisions: vi.fn(),
    recordDecision: vi.fn(),
    getActionItems: vi.fn(),
    addActionItem: vi.fn(),
    updateActionItem: vi.fn(),
    deleteActionItem: vi.fn(),
    getMinutes: vi.fn(),
    saveMinutes: vi.fn(),
    distributeMinutes: vi.fn(),
  },
}));

// Helper to create a test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useApi Hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ====================
  // Query Keys Tests
  // ====================
  describe('queryKeys', () => {
    it('should export query keys for issues', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.issues.all).toEqual(['issues']);
      expect(queryKeys.issues.list({ page: 1 })).toEqual(['issues', 'list', { page: 1 }]);
      expect(queryKeys.issues.detail('123')).toEqual(['issues', 'detail', '123']);
    });

    it('should export query keys for problems', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.problems.all).toEqual(['problems']);
      expect(queryKeys.problems.list({ status: 'open' })).toEqual(['problems', 'list', { status: 'open' }]);
      expect(queryKeys.problems.detail('456')).toEqual(['problems', 'detail', '456']);
    });

    it('should export query keys for changes', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.changes.all).toEqual(['changes']);
      expect(queryKeys.changes.list({ type: 'normal' })).toEqual(['changes', 'list', { type: 'normal' }]);
      expect(queryKeys.changes.detail('789')).toEqual(['changes', 'detail', '789']);
    });

    it('should export query keys for applications', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.applications.all).toEqual(['applications']);
      expect(queryKeys.applications.list()).toEqual(['applications', 'list', undefined]);
      expect(queryKeys.applications.detail('app-1')).toEqual(['applications', 'detail', 'app-1']);
    });

    it('should export query keys for users', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.users.all).toEqual(['users']);
      expect(queryKeys.users.list({ search: 'john' })).toEqual(['users', 'list', { search: 'john' }]);
      expect(queryKeys.users.detail('user-1')).toEqual(['users', 'detail', 'user-1']);
    });

    it('should export query keys for catalog', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.catalog.items()).toEqual(['catalog', 'items', undefined]);
      expect(queryKeys.catalog.item('item-1')).toEqual(['catalog', 'item', 'item-1']);
      expect(queryKeys.catalog.requests({ state: 'pending' })).toEqual(['catalog', 'requests', { state: 'pending' }]);
    });

    it('should export query keys for notifications', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.notifications.all).toEqual(['notifications']);
      expect(queryKeys.notifications.list({ unreadOnly: true })).toEqual(['notifications', 'list', { unreadOnly: true }]);
    });

    it('should export static query keys', async () => {
      const { queryKeys } = await import('../useApi');
      expect(queryKeys.dashboard).toEqual(['dashboard']);
      expect(queryKeys.groups).toEqual(['groups']);
      expect(queryKeys.reports).toEqual(['reports']);
    });
  });

  // ====================
  // Issues Hooks Tests
  // ====================
  describe('Issues Hooks', () => {
    describe('useIssues', () => {
      it('should fetch issues list', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useIssues } = await import('../useApi');

        const mockIssues = [{ id: '1', title: 'Test Issue', issue_number: 'INC-001' }];
        (issuesApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockIssues, total: 1 });

        const { result } = renderHook(() => useIssues(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(issuesApi.list).toHaveBeenCalledWith(undefined);
        expect(result.current.data).toEqual({ items: mockIssues, total: 1 });
      });

      it('should fetch issues with params', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useIssues } = await import('../useApi');

        (issuesApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

        const params = { page: 1, limit: 10, status: 'open', priority: 'high' };
        const { result } = renderHook(() => useIssues(params), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(issuesApi.list).toHaveBeenCalledWith(params);
      });
    });

    describe('useIssue', () => {
      it('should fetch single issue by id', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useIssue } = await import('../useApi');

        const mockIssue = { id: '1', title: 'Test Issue', issue_number: 'INC-001', status: 'new', priority: 'high' };
        (issuesApi.get as ReturnType<typeof vi.fn>).mockResolvedValue(mockIssue);

        const { result } = renderHook(() => useIssue('1'), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(issuesApi.get).toHaveBeenCalledWith('1');
        expect(result.current.data).toEqual(mockIssue);
      });

      it('should not fetch when id is empty', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useIssue } = await import('../useApi');

        const { result } = renderHook(() => useIssue(''), { wrapper: createWrapper() });

        expect(result.current.isPending).toBe(true);
        expect(result.current.fetchStatus).toBe('idle');
        expect(issuesApi.get).not.toHaveBeenCalled();
      });
    });

    describe('useCreateIssue', () => {
      it('should create issue and invalidate queries', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useCreateIssue } = await import('../useApi');

        const newIssue = { id: '1', title: 'New Issue', issue_number: 'INC-001' };
        (issuesApi.create as ReturnType<typeof vi.fn>).mockResolvedValue(newIssue);

        const { result } = renderHook(() => useCreateIssue(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ title: 'New Issue', priority: 'high' });
        });

        expect(issuesApi.create).toHaveBeenCalledWith({ title: 'New Issue', priority: 'high' });
      });
    });

    describe('useUpdateIssue', () => {
      it('should update issue', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useUpdateIssue } = await import('../useApi');

        (issuesApi.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', title: 'Updated Issue' });

        const { result } = renderHook(() => useUpdateIssue(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ id: '1', data: { title: 'Updated Issue' } });
        });

        expect(issuesApi.update).toHaveBeenCalledWith('1', { title: 'Updated Issue' });
      });
    });

    describe('useAddIssueComment', () => {
      it('should add comment to issue', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useAddIssueComment } = await import('../useApi');

        (issuesApi.addComment as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'comment-1' });

        const { result } = renderHook(() => useAddIssueComment(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ id: '1', content: 'Test comment', isInternal: true });
        });

        expect(issuesApi.addComment).toHaveBeenCalledWith('1', 'Test comment', true);
      });
    });

    describe('useChangeIssueStatus', () => {
      it('should change issue status', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useChangeIssueStatus } = await import('../useApi');

        (issuesApi.changeStatus as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', status: 'resolved' });

        const { result } = renderHook(() => useChangeIssueStatus(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ id: '1', status: 'resolved', reason: 'Fixed the bug' });
        });

        expect(issuesApi.changeStatus).toHaveBeenCalledWith('1', 'resolved', 'Fixed the bug');
      });
    });

    describe('useDeleteIssue', () => {
      it('should delete issue', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useDeleteIssue } = await import('../useApi');

        (issuesApi.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

        const { result } = renderHook(() => useDeleteIssue(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('1');
        });

        expect(issuesApi.delete).toHaveBeenCalledWith('1');
      });
    });

    describe('useIssueComments', () => {
      it('should fetch issue comments', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useIssueComments } = await import('../useApi');

        const mockComments = [{ id: '1', content: 'Test comment' }];
        (issuesApi.getComments as ReturnType<typeof vi.fn>).mockResolvedValue(mockComments);

        const { result } = renderHook(() => useIssueComments('issue-1'), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(issuesApi.getComments).toHaveBeenCalledWith('issue-1');
      });
    });

    describe('useLinkIssueToProblem', () => {
      it('should link issue to problem', async () => {
        const { issuesApi } = await import('@/lib/api');
        const { useLinkIssueToProblem } = await import('../useApi');

        (issuesApi.linkToProblem as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useLinkIssueToProblem(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            issueId: 'issue-1',
            problemId: 'problem-1',
            relationshipType: 'caused_by',
            notes: 'Root cause identified',
          });
        });

        expect(issuesApi.linkToProblem).toHaveBeenCalledWith('issue-1', 'problem-1', 'caused_by', 'Root cause identified');
      });
    });
  });

  // ====================
  // Problems Hooks Tests
  // ====================
  describe('Problems Hooks', () => {
    describe('useProblems', () => {
      it('should fetch problems list', async () => {
        const { problemsApi } = await import('@/lib/api');
        const { useProblems } = await import('../useApi');

        const mockProblems = [{ id: '1', title: 'Test Problem', problem_number: 'PRB-001' }];
        (problemsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockProblems, total: 1 });

        const { result } = renderHook(() => useProblems(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(problemsApi.list).toHaveBeenCalled();
      });

      it('should filter problems by known error status', async () => {
        const { problemsApi } = await import('@/lib/api');
        const { useProblems } = await import('../useApi');

        (problemsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

        const { result } = renderHook(() => useProblems({ isKnownError: true }), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(problemsApi.list).toHaveBeenCalledWith({ isKnownError: true });
      });
    });

    describe('useConvertToKnownError', () => {
      it('should convert problem to known error', async () => {
        const { problemsApi } = await import('@/lib/api');
        const { useConvertToKnownError } = await import('../useApi');

        (problemsApi.convertToKnownError as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', is_known_error: true });

        const { result } = renderHook(() => useConvertToKnownError(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('1');
        });

        expect(problemsApi.convertToKnownError).toHaveBeenCalledWith('1');
      });
    });

    describe('useAddProblemWorklog', () => {
      it('should add worklog to problem', async () => {
        const { problemsApi } = await import('@/lib/api');
        const { useAddProblemWorklog } = await import('../useApi');

        (problemsApi.addWorklog as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'worklog-1' });

        const { result } = renderHook(() => useAddProblemWorklog(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            id: '1',
            timeSpent: 120,
            description: 'Investigation work',
            workType: 'analysis',
          });
        });

        expect(problemsApi.addWorklog).toHaveBeenCalledWith('1', 120, 'Investigation work', 'analysis');
      });
    });
  });

  // ====================
  // Changes Hooks Tests
  // ====================
  describe('Changes Hooks', () => {
    describe('useChanges', () => {
      it('should fetch changes list', async () => {
        const { changesApi } = await import('@/lib/api');
        const { useChanges } = await import('../useApi');

        const mockChanges = [{ id: '1', title: 'Test Change', change_number: 'CHG-001' }];
        (changesApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockChanges, total: 1 });

        const { result } = renderHook(() => useChanges(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(changesApi.list).toHaveBeenCalled();
      });
    });

    describe('useApproveChange', () => {
      it('should approve change', async () => {
        const { changesApi } = await import('@/lib/api');
        const { useApproveChange } = await import('../useApi');

        (changesApi.approve as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', status: 'approved' });

        const { result } = renderHook(() => useApproveChange(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ id: '1', comments: 'LGTM' });
        });

        expect(changesApi.approve).toHaveBeenCalledWith('1', 'LGTM');
      });
    });

    describe('useRejectChange', () => {
      it('should reject change with reason', async () => {
        const { changesApi } = await import('@/lib/api');
        const { useRejectChange } = await import('../useApi');

        (changesApi.reject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', status: 'rejected' });

        const { result } = renderHook(() => useRejectChange(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ id: '1', reason: 'Missing rollback plan' });
        });

        expect(changesApi.reject).toHaveBeenCalledWith('1', 'Missing rollback plan');
      });
    });
  });

  // ====================
  // Applications Hooks Tests
  // ====================
  describe('Applications Hooks', () => {
    describe('useApplications', () => {
      it('should fetch applications list', async () => {
        const { applicationsApi } = await import('@/lib/api');
        const { useApplications } = await import('../useApi');

        const mockApps = [{ id: '1', name: 'Test App', tier: 'P1' }];
        (applicationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockApps, total: 1 });

        const { result } = renderHook(() => useApplications(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(applicationsApi.list).toHaveBeenCalled();
      });
    });

    describe('useApplicationHealth', () => {
      it('should fetch application health', async () => {
        const { applicationsApi } = await import('@/lib/api');
        const { useApplicationHealth } = await import('../useApi');

        const mockHealth = { score: 85, issues: 2, incidents: 1 };
        (applicationsApi.getHealth as ReturnType<typeof vi.fn>).mockResolvedValue(mockHealth);

        const { result } = renderHook(() => useApplicationHealth('app-1'), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(applicationsApi.getHealth).toHaveBeenCalledWith('app-1');
        expect(result.current.data).toEqual(mockHealth);
      });
    });
  });

  // ====================
  // Dashboard Hooks Tests
  // ====================
  describe('Dashboard Hooks', () => {
    describe('useDashboard', () => {
      it('should fetch dashboard overview', async () => {
        const { dashboardApi } = await import('@/lib/api');
        const { useDashboard } = await import('../useApi');

        const mockData = { openIssues: 5, pendingChanges: 3, activeApplications: 10, healthScore: 85 };
        (dashboardApi.getOverview as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

        const { result } = renderHook(() => useDashboard(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(dashboardApi.getOverview).toHaveBeenCalled();
        expect(result.current.data).toEqual(mockData);
      });

      it('should support refetch interval for real-time updates', async () => {
        const { dashboardApi } = await import('@/lib/api');
        const { useDashboard } = await import('../useApi');

        (dashboardApi.getOverview as ReturnType<typeof vi.fn>).mockResolvedValue({});

        const { result } = renderHook(
          () => useDashboard({ refetchInterval: 5000 }),
          { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        // Hook supports refetch interval option
        expect(dashboardApi.getOverview).toHaveBeenCalled();
      });

      it('should support enabled option', async () => {
        const { dashboardApi } = await import('@/lib/api');
        const { useDashboard } = await import('../useApi');

        const { result } = renderHook(
          () => useDashboard({ enabled: false }),
          { wrapper: createWrapper() }
        );

        expect(result.current.fetchStatus).toBe('idle');
        expect(dashboardApi.getOverview).not.toHaveBeenCalled();
      });
    });

    describe('useIssueTrends', () => {
      it('should fetch issue trends with days param', async () => {
        const { dashboardApi } = await import('@/lib/api');
        const { useIssueTrends } = await import('../useApi');

        const mockTrends = [{ date: '2024-01-01', count: 5 }];
        (dashboardApi.getIssueTrends as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrends);

        const { result } = renderHook(() => useIssueTrends(30), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(dashboardApi.getIssueTrends).toHaveBeenCalledWith(30);
      });
    });

    describe('useCriticalApplications', () => {
      it('should fetch critical applications with limit', async () => {
        const { dashboardApi } = await import('@/lib/api');
        const { useCriticalApplications } = await import('../useApi');

        const mockApps = [{ id: '1', name: 'Critical App', health_score: 30 }];
        (dashboardApi.getCriticalApplications as ReturnType<typeof vi.fn>).mockResolvedValue(mockApps);

        const { result } = renderHook(() => useCriticalApplications(5), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(dashboardApi.getCriticalApplications).toHaveBeenCalledWith(5);
      });
    });
  });

  // ====================
  // Cloud Hooks Tests
  // ====================
  describe('Cloud Hooks', () => {
    describe('useCloudAccounts', () => {
      it('should fetch cloud accounts', async () => {
        const { cloudApi } = await import('@/lib/api');
        const { useCloudAccounts } = await import('../useApi');

        const mockAccounts = [{ id: '1', name: 'AWS Account', provider: 'aws' }];
        (cloudApi.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockAccounts, total: 1 });

        const { result } = renderHook(() => useCloudAccounts(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(cloudApi.listAccounts).toHaveBeenCalled();
      });

      it('should filter by provider', async () => {
        const { cloudApi } = await import('@/lib/api');
        const { useCloudAccounts } = await import('../useApi');

        (cloudApi.listAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

        const { result } = renderHook(
          () => useCloudAccounts({ provider: 'azure' }),
          { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(cloudApi.listAccounts).toHaveBeenCalledWith({ provider: 'azure' });
      });
    });

    describe('useTestCloudAccountConnection', () => {
      it('should test cloud account connection', async () => {
        const { cloudApi } = await import('@/lib/api');
        const { useTestCloudAccountConnection } = await import('../useApi');

        (cloudApi.testAccountConnection as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useTestCloudAccountConnection(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('account-1');
        });

        expect(cloudApi.testAccountConnection).toHaveBeenCalledWith('account-1');
      });
    });

    describe('useMapCloudResource', () => {
      it('should map resource to application', async () => {
        const { cloudApi } = await import('@/lib/api');
        const { useMapCloudResource } = await import('../useApi');

        (cloudApi.mapResourceToApplication as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMapCloudResource(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            id: 'resource-1',
            applicationId: 'app-1',
            environmentId: 'env-prod',
          });
        });

        expect(cloudApi.mapResourceToApplication).toHaveBeenCalledWith('resource-1', 'app-1', 'env-prod');
      });
    });
  });

  // ====================
  // Oncall Hooks Tests
  // ====================
  describe('Oncall Hooks', () => {
    describe('useWhoIsOnCall', () => {
      it('should fetch current on-call', async () => {
        const { oncallApi } = await import('@/lib/api');
        const { useWhoIsOnCall } = await import('../useApi');

        const mockOnCall = [{ user_id: '1', user_name: 'John', schedule_name: 'Primary' }];
        (oncallApi.whoIsOnCall as ReturnType<typeof vi.fn>).mockResolvedValue(mockOnCall);

        const { result } = renderHook(() => useWhoIsOnCall(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(oncallApi.whoIsOnCall).toHaveBeenCalled();
      });

      it('should filter by schedule_id', async () => {
        const { oncallApi } = await import('@/lib/api');
        const { useWhoIsOnCall } = await import('../useApi');

        (oncallApi.whoIsOnCall as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const { result } = renderHook(
          () => useWhoIsOnCall({ schedule_id: 'schedule-1' }),
          { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(oncallApi.whoIsOnCall).toHaveBeenCalledWith({ schedule_id: 'schedule-1' });
      });
    });

    describe('useAcceptSwap', () => {
      it('should accept shift swap', async () => {
        const { oncallApi } = await import('@/lib/api');
        const { useAcceptSwap } = await import('../useApi');

        (oncallApi.acceptSwap as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useAcceptSwap(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ id: 'swap-1', message: 'Happy to help' });
        });

        expect(oncallApi.acceptSwap).toHaveBeenCalledWith('swap-1', { message: 'Happy to help' });
      });
    });
  });

  // ====================
  // Knowledge Base Hooks Tests
  // ====================
  describe('Knowledge Base Hooks', () => {
    describe('useKBArticles', () => {
      it('should fetch KB articles', async () => {
        const { kbApi } = await import('@/lib/api');
        const { useKBArticles } = await import('../useApi');

        const mockArticles = [{ id: '1', title: 'How to reset password', status: 'published' }];
        (kbApi.listArticles as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockArticles, total: 1 });

        const { result } = renderHook(() => useKBArticles(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(kbApi.listArticles).toHaveBeenCalled();
      });
    });

    describe('useKBSearch', () => {
      it('should search KB articles', async () => {
        const { kbApi } = await import('@/lib/api');
        const { useKBSearch } = await import('../useApi');

        const mockResults = [{ id: '1', title: 'Password Reset Guide', score: 0.95 }];
        (kbApi.searchArticles as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockResults, total: 1 });

        const { result } = renderHook(() => useKBSearch('password reset'), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(kbApi.searchArticles).toHaveBeenCalledWith('password reset', undefined);
      });
    });

    describe('usePublishKBArticle', () => {
      it('should publish article', async () => {
        const { kbApi } = await import('@/lib/api');
        const { usePublishKBArticle } = await import('../useApi');

        (kbApi.publishArticle as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', status: 'published' });

        const { result } = renderHook(() => usePublishKBArticle(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('1');
        });

        expect(kbApi.publishArticle).toHaveBeenCalledWith('1');
      });
    });
  });

  // ====================
  // SLA Hooks Tests
  // ====================
  describe('SLA Hooks', () => {
    describe('useSlaPolicies', () => {
      it('should fetch SLA policies', async () => {
        const { slaApi } = await import('@/lib/api');
        const { useSlaPolicies } = await import('../useApi');

        const mockPolicies = [{ id: '1', name: 'P1 Response', entity_type: 'issue' }];
        (slaApi.listPolicies as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockPolicies, total: 1 });

        const { result } = renderHook(() => useSlaPolicies(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(slaApi.listPolicies).toHaveBeenCalled();
      });

      it('should filter by entity type', async () => {
        const { slaApi } = await import('@/lib/api');
        const { useSlaPolicies } = await import('../useApi');

        (slaApi.listPolicies as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

        const { result } = renderHook(
          () => useSlaPolicies({ entityType: 'issue' }),
          { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(slaApi.listPolicies).toHaveBeenCalledWith({ entityType: 'issue' });
      });
    });

    describe('useSlaStats', () => {
      it('should fetch SLA statistics', async () => {
        const { slaApi } = await import('@/lib/api');
        const { useSlaStats } = await import('../useApi');

        const mockStats = { met: 95, breached: 5, pending: 10 };
        (slaApi.getStats as ReturnType<typeof vi.fn>).mockResolvedValue(mockStats);

        const { result } = renderHook(() => useSlaStats(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(slaApi.getStats).toHaveBeenCalled();
      });
    });
  });

  // ====================
  // Workflow Hooks Tests
  // ====================
  describe('Workflow Hooks', () => {
    describe('useWorkflowRules', () => {
      it('should fetch workflow rules', async () => {
        const { workflowApi } = await import('@/lib/api');
        const { useWorkflowRules } = await import('../useApi');

        const mockRules = [{ id: '1', name: 'Auto-assign rule', is_active: true }];
        (workflowApi.listRules as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockRules, total: 1 });

        const { result } = renderHook(() => useWorkflowRules(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(workflowApi.listRules).toHaveBeenCalled();
      });
    });

    describe('useToggleWorkflowRule', () => {
      it('should toggle workflow rule', async () => {
        const { workflowApi } = await import('@/lib/api');
        const { useToggleWorkflowRule } = await import('../useApi');

        (workflowApi.toggleRule as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', is_active: false });

        const { result } = renderHook(() => useToggleWorkflowRule(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('1');
        });

        expect(workflowApi.toggleRule).toHaveBeenCalledWith('1');
      });
    });

    describe('useTestWorkflowRule', () => {
      it('should test workflow rule', async () => {
        const { workflowApi } = await import('@/lib/api');
        const { useTestWorkflowRule } = await import('../useApi');

        const mockResult = { matched: true, actions_taken: ['send_notification'] };
        (workflowApi.testRule as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

        const { result } = renderHook(() => useTestWorkflowRule(), { wrapper: createWrapper() });

        await act(async () => {
          const testResult = await result.current.mutateAsync({ id: '1', entityData: { title: 'Test' } });
          expect(testResult).toEqual(mockResult);
        });

        expect(workflowApi.testRule).toHaveBeenCalledWith('1', { title: 'Test' });
      });
    });
  });

  // ====================
  // Assets Hooks Tests
  // ====================
  describe('Assets Hooks', () => {
    describe('useAssets', () => {
      it('should fetch assets', async () => {
        const { assetApi } = await import('@/lib/api');
        const { useAssets } = await import('../useApi');

        const mockAssets = [{ id: '1', name: 'Server-01', asset_type: 'hardware' }];
        (assetApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockAssets, total: 1 });

        const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(assetApi.list).toHaveBeenCalled();
      });
    });

    describe('useAssetRelationships', () => {
      it('should fetch asset relationships', async () => {
        const { assetApi } = await import('@/lib/api');
        const { useAssetRelationships } = await import('../useApi');

        const mockRelationships = [{ id: '1', related_asset_id: '2', relationship_type: 'depends_on' }];
        (assetApi.getRelationships as ReturnType<typeof vi.fn>).mockResolvedValue(mockRelationships);

        const { result } = renderHook(() => useAssetRelationships('asset-1'), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(assetApi.getRelationships).toHaveBeenCalledWith('asset-1');
      });
    });
  });

  // ====================
  // Notifications Hooks Tests
  // ====================
  describe('Notifications Hooks', () => {
    describe('useNotifications', () => {
      it('should fetch notifications', async () => {
        const { notificationsApi } = await import('@/lib/api');
        const { useNotifications } = await import('../useApi');

        const mockNotifications = [{ id: '1', title: 'New comment', read: false }];
        (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockNotifications, total: 1 });

        const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(notificationsApi.list).toHaveBeenCalled();
      });

      it('should filter unread only', async () => {
        const { notificationsApi } = await import('@/lib/api');
        const { useNotifications } = await import('../useApi');

        (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

        const { result } = renderHook(
          () => useNotifications({ unreadOnly: true }),
          { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(notificationsApi.list).toHaveBeenCalledWith({ unreadOnly: true });
      });
    });

    describe('useMarkAllNotificationsRead', () => {
      it('should mark all notifications as read', async () => {
        const { notificationsApi } = await import('@/lib/api');
        const { useMarkAllNotificationsRead } = await import('../useApi');

        (notificationsApi.markAllRead as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync();
        });

        expect(notificationsApi.markAllRead).toHaveBeenCalled();
      });
    });
  });

  // ====================
  // CAB Meetings Hooks Tests
  // ====================
  describe('CAB Meetings Hooks', () => {
    describe('useCabMeetings', () => {
      it('should fetch CAB meetings', async () => {
        const { cabMeetingsApi } = await import('@/lib/api');
        const { useCabMeetings } = await import('../useApi');

        const mockMeetings = [{ id: '1', title: 'Weekly CAB', status: 'scheduled' }];
        (cabMeetingsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockMeetings, total: 1 });

        const { result } = renderHook(() => useCabMeetings(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(cabMeetingsApi.list).toHaveBeenCalled();
      });
    });

    describe('useRecordDecision', () => {
      it('should record CAB decision', async () => {
        const { cabMeetingsApi } = await import('@/lib/api');
        const { useRecordDecision } = await import('../useApi');

        (cabMeetingsApi.recordDecision as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'decision-1' });

        const { result } = renderHook(() => useRecordDecision(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            meetingId: 'meeting-1',
            changeId: 'change-1',
            decision: 'approved',
            notes: 'All checks passed',
          });
        });

        expect(cabMeetingsApi.recordDecision).toHaveBeenCalledWith(
          'meeting-1',
          { changeId: 'change-1', decision: 'approved', notes: 'All checks passed' }
        );
      });
    });

    describe('useDistributeMinutes', () => {
      it('should distribute meeting minutes', async () => {
        const { cabMeetingsApi } = await import('@/lib/api');
        const { useDistributeMinutes } = await import('../useApi');

        (cabMeetingsApi.distributeMinutes as ReturnType<typeof vi.fn>).mockResolvedValue({ sent: true });

        const { result } = renderHook(() => useDistributeMinutes(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('meeting-1');
        });

        expect(cabMeetingsApi.distributeMinutes).toHaveBeenCalledWith('meeting-1');
      });
    });
  });

  // ====================
  // Service Requests Hooks Tests
  // ====================
  describe('Service Requests Hooks', () => {
    describe('useServiceRequests', () => {
      it('should fetch service requests', async () => {
        const { requestsApi } = await import('@/lib/api');
        const { useServiceRequests } = await import('../useApi');

        const mockRequests = [{ id: '1', title: 'New laptop request', status: 'pending' }];
        (requestsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockRequests, total: 1 });

        const { result } = renderHook(() => useServiceRequests(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(requestsApi.list).toHaveBeenCalled();
      });
    });

    describe('useDelegateApproval', () => {
      it('should delegate approval to another user', async () => {
        const { requestsApi } = await import('@/lib/api');
        const { useDelegateApproval } = await import('../useApi');

        (requestsApi.delegate as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

        const { result } = renderHook(() => useDelegateApproval(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            requestId: 'request-1',
            approvalId: 'approval-1',
            delegateTo: 'user-2',
            comments: 'Out of office',
          });
        });

        expect(requestsApi.delegate).toHaveBeenCalledWith(
          'request-1',
          'approval-1',
          'user-2',
          'Out of office'
        );
      });
    });
  });

  // ====================
  // Integrations Hooks Tests
  // ====================
  describe('Integrations Hooks', () => {
    describe('useApiKeys', () => {
      it('should fetch API keys', async () => {
        const { integrationsApi } = await import('@/lib/api');
        const { useApiKeys } = await import('../useApi');

        const mockKeys = [{ id: '1', name: 'Production Key', is_active: true }];
        (integrationsApi.listApiKeys as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockKeys, total: 1 });

        const { result } = renderHook(() => useApiKeys(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(integrationsApi.listApiKeys).toHaveBeenCalled();
      });
    });

    describe('useTestWebhook', () => {
      it('should test webhook', async () => {
        const { integrationsApi } = await import('@/lib/api');
        const { useTestWebhook } = await import('../useApi');

        (integrationsApi.testWebhook as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, response_code: 200 });

        const { result } = renderHook(() => useTestWebhook(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync('webhook-1');
        });

        expect(integrationsApi.testWebhook).toHaveBeenCalledWith('webhook-1');
      });
    });
  });

  // ====================
  // Reports Hooks Tests
  // ====================
  describe('Reports Hooks', () => {
    describe('useReportTemplates', () => {
      it('should fetch report templates', async () => {
        const { reportsApi } = await import('@/lib/api');
        const { useReportTemplates } = await import('../useApi');

        const mockTemplates = [{ id: '1', name: 'Monthly Issues Report', report_type: 'issues' }];
        (reportsApi.listTemplates as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockTemplates, total: 1 });

        const { result } = renderHook(() => useReportTemplates(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(reportsApi.listTemplates).toHaveBeenCalled();
      });
    });

    describe('useExecuteReport', () => {
      it('should execute report', async () => {
        const { reportsApi } = await import('@/lib/api');
        const { useExecuteReport } = await import('../useApi');

        (reportsApi.execute as ReturnType<typeof vi.fn>).mockResolvedValue({ execution_id: 'exec-1', status: 'running' });

        const { result } = renderHook(() => useExecuteReport(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            templateId: 'template-1',
            options: { format: 'pdf', date_range: 'last_30_days' },
          });
        });

        expect(reportsApi.execute).toHaveBeenCalledWith('template-1', { format: 'pdf', date_range: 'last_30_days' });
      });
    });
  });

  // ====================
  // Catalog Hooks Tests
  // ====================
  describe('Catalog Hooks', () => {
    describe('useCatalogItems', () => {
      it('should fetch catalog items', async () => {
        const { catalogApi } = await import('@/lib/api');
        const { useCatalogItems } = await import('../useApi');

        const mockItems = [{ id: '1', name: 'New Laptop', category: { id: 'c1', name: 'Hardware' } }];
        (catalogApi.listItems as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockItems, total: 1 });

        const { result } = renderHook(() => useCatalogItems(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(catalogApi.listItems).toHaveBeenCalled();
      });
    });

    describe('useSubmitCatalogRequest', () => {
      it('should submit catalog request', async () => {
        const { catalogApi } = await import('@/lib/api');
        const { useSubmitCatalogRequest } = await import('../useApi');

        (catalogApi.submitRequest as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'req-1', status: 'submitted' });

        const { result } = renderHook(() => useSubmitCatalogRequest(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({
            itemId: 'item-1',
            formData: { urgency: 'high', notes: 'Need this for project X' },
          });
        });

        expect(catalogApi.submitRequest).toHaveBeenCalledWith('item-1', { urgency: 'high', notes: 'Need this for project X' });
      });
    });
  });

  // ====================
  // Users/Groups Hooks Tests
  // ====================
  describe('Users and Groups Hooks', () => {
    describe('useUsers', () => {
      it('should fetch users', async () => {
        const { usersApi } = await import('@/lib/api');
        const { useUsers } = await import('../useApi');

        const mockUsers = [{ id: '1', name: 'John Doe', email: 'john@example.com' }];
        (usersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockUsers, total: 1 });

        const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(usersApi.list).toHaveBeenCalled();
      });

      it('should search users', async () => {
        const { usersApi } = await import('@/lib/api');
        const { useUsers } = await import('../useApi');

        (usersApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [], total: 0 });

        const { result } = renderHook(
          () => useUsers({ search: 'john' }),
          { wrapper: createWrapper() }
        );

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(usersApi.list).toHaveBeenCalledWith({ search: 'john' });
      });
    });

    describe('useGroups', () => {
      it('should fetch groups', async () => {
        const { groupsApi } = await import('@/lib/api');
        const { useGroups } = await import('../useApi');

        const mockGroups = [{ id: '1', name: 'Engineering', type: 'department' }];
        (groupsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockGroups, total: 1 });

        const { result } = renderHook(() => useGroups(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(groupsApi.list).toHaveBeenCalled();
      });
    });
  });

  // ====================
  // Email Hooks Tests
  // ====================
  describe('Email Hooks', () => {
    describe('useEmailConfigs', () => {
      it('should fetch email configs', async () => {
        const { emailApi } = await import('@/lib/api');
        const { useEmailConfigs } = await import('../useApi');

        const mockConfigs = [{ id: '1', provider: 'sendgrid', is_active: true }];
        (emailApi.listConfigs as ReturnType<typeof vi.fn>).mockResolvedValue({ items: mockConfigs, total: 1 });

        const { result } = renderHook(() => useEmailConfigs(), { wrapper: createWrapper() });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(emailApi.listConfigs).toHaveBeenCalled();
      });
    });

    describe('useTestEmail', () => {
      it('should send test email', async () => {
        const { emailApi } = await import('@/lib/api');
        const { useTestEmail } = await import('../useApi');

        (emailApi.testEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ sent: true });

        const { result } = renderHook(() => useTestEmail(), { wrapper: createWrapper() });

        await act(async () => {
          await result.current.mutateAsync({ to: 'test@example.com', subject: 'Test', body: 'Test body' });
        });

        expect(emailApi.testEmail).toHaveBeenCalledWith('test@example.com', 'Test', 'Test body');
      });
    });
  });
});
