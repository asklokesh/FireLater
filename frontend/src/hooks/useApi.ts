'use client';

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import {
  issuesApi,
  problemsApi,
  changesApi,
  applicationsApi,
  catalogApi,
  notificationsApi,
  usersApi,
  groupsApi,
  reportsApi,
  dashboardApi,
  cloudApi,
  oncallApi,
  kbApi,
  slaApi,
  workflowApi,
  assetApi,
  emailApi,
  integrationsApi,
} from '@/lib/api';

// Types
export interface IssueActivity {
  id: string;
  type: string;
  content?: string;
  description?: string;
  user: { id: string; name: string };
  created_at: string;
}

export interface Issue {
  id: string;
  issue_number: string;
  title: string;
  description?: string;
  status: 'new' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  severity?: 'S1' | 'S2' | 'S3' | 'S4';
  urgency?: 'immediate' | 'high' | 'medium' | 'low';
  impact?: 'widespread' | 'significant' | 'moderate' | 'minor';
  assigned_to?: string;
  assignee_name?: string;
  assignee_email?: string;
  assigned_group?: string;
  assigned_group_name?: string;
  reporter_id?: string;
  reporter_name?: string;
  reporter_email?: string;
  application_id?: string;
  application_name?: string;
  application_app_id?: string;
  sla_breached?: boolean;
  sla_breached_at?: string;
  first_response_at?: string;
  resolved_at?: string;
  resolved_by?: string;
  resolver_name?: string;
  closed_at?: string;
  created_at: string;
  updated_at: string;
  activities?: IssueActivity[];
}

export interface Problem {
  id: string;
  problem_number: string;
  title: string;
  description?: string;
  status: 'new' | 'assigned' | 'investigating' | 'root_cause_identified' | 'known_error' | 'resolved' | 'closed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  impact?: 'widespread' | 'significant' | 'moderate' | 'minor';
  urgency?: 'immediate' | 'high' | 'medium' | 'low';
  problem_type: 'reactive' | 'proactive';
  is_known_error?: boolean;
  root_cause?: string;
  workaround?: string;
  resolution?: string;
  resolution_code?: string;
  assigned_to?: string;
  assignee_name?: string;
  assignee_email?: string;
  assigned_group?: string;
  assigned_group_name?: string;
  reporter_id?: string;
  reporter_name?: string;
  reporter_email?: string;
  application_id?: string;
  application_name?: string;
  category_id?: string;
  category_name?: string;
  linked_issues_count?: number;
  resolved_at?: string;
  resolved_by?: string;
  resolver_name?: string;
  closed_at?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface ProblemActivity {
  id: string;
  type: string;
  content?: string;
  description?: string;
  user: { id: string; name: string };
  created_at: string;
}

export interface ProblemComment {
  id: string;
  content: string;
  is_internal?: boolean;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export interface ProblemWorklog {
  id: string;
  time_spent: number;
  description: string;
  work_type?: string;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export interface LinkedIssue {
  id: string;
  issue_id: string;
  issue_number: string;
  issue_title: string;
  issue_status: string;
  issue_priority: string;
  relationship_type: string;
  notes?: string;
  linked_at: string;
  linked_by_name?: string;
}

export interface ChangeApproval {
  id: string;
  approver: { id: string; name: string; email?: string };
  status: string;
  comments?: string;
  approved_at?: string;
}

export interface ChangeActivity {
  id: string;
  type: string;
  description?: string;
  content?: string;
  user: { id: string; name: string };
  created_at: string;
}

export interface Change {
  id: string;
  change_number: string;
  title: string;
  description?: string;
  justification?: string;
  type: 'standard' | 'normal' | 'emergency';
  status: 'draft' | 'submitted' | 'review' | 'approved' | 'rejected' | 'scheduled' | 'implementing' | 'completed' | 'failed' | 'rolled_back' | 'cancelled';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  impact?: 'none' | 'minor' | 'moderate' | 'significant' | 'major';
  urgency?: 'low' | 'medium' | 'high';
  requester_id?: string;
  requester_name?: string;
  requester_email?: string;
  implementer_id?: string;
  implementer_name?: string;
  implementer_email?: string;
  assigned_group?: string;
  assigned_group_name?: string;
  application_id?: string;
  application_name?: string;
  environment_id?: string;
  environment_name?: string;
  template_id?: string;
  template_name?: string;
  planned_start?: string;
  planned_end?: string;
  actual_start?: string;
  actual_end?: string;
  downtime_minutes?: number;
  implementation_plan?: string;
  rollback_plan?: string;
  test_plan?: string;
  communication_plan?: string;
  outcome?: 'successful' | 'failed' | 'rolled_back';
  outcome_notes?: string;
  cab_required?: boolean;
  cab_date?: string;
  cab_notes?: string;
  created_at: string;
  updated_at: string;
  approvals?: ChangeApproval[];
  activities?: ChangeActivity[];
}

export interface Application {
  id: string;
  app_id: string;
  name: string;
  description?: string;
  tier: 'P1' | 'P2' | 'P3' | 'P4';
  status: 'active' | 'inactive' | 'deprecated';
  lifecycle_stage?: 'development' | 'staging' | 'production' | 'sunset';
  owner_user_id?: string;
  owner_user_name?: string;
  owner_user_email?: string;
  owner_group_id?: string;
  owner_group_name?: string;
  support_group_id?: string;
  support_group_name?: string;
  business_unit?: string;
  criticality?: 'mission_critical' | 'business_critical' | 'business_operational' | 'administrative';
  tags?: string[];
  metadata?: Record<string, unknown>;
  health_score?: number;
  health_score_updated_at?: string;
  environment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  status: string;
  last_login?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
  link?: string;
}

export interface CatalogItemOption {
  id: string;
  name: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  choices?: { value: string; label: string }[];
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  category: { id: string; name: string };
  estimated_time?: string;
  estimatedTime?: string;
  approval_required: boolean;
  approvalRequired?: boolean;
  active: boolean;
  includes?: string[];
  options?: CatalogItemOption[];
  requirements?: string[];
  popularity?: number;
  relatedItems?: { id: string; name: string; estimatedTime: string }[];
}

export interface DashboardStats {
  openIssues: number;
  pendingChanges: number;
  activeApplications: number;
  healthScore: number;
  issuesByPriority: { priority: number; count: number }[];
  recentActivity: { id: string; type: string; description: string; created_at: string }[];
}

// Query Keys
export const queryKeys = {
  issues: {
    all: ['issues'] as const,
    list: (params?: Record<string, unknown>) => ['issues', 'list', params] as const,
    detail: (id: string) => ['issues', 'detail', id] as const,
  },
  problems: {
    all: ['problems'] as const,
    list: (params?: Record<string, unknown>) => ['problems', 'list', params] as const,
    detail: (id: string) => ['problems', 'detail', id] as const,
  },
  changes: {
    all: ['changes'] as const,
    list: (params?: Record<string, unknown>) => ['changes', 'list', params] as const,
    detail: (id: string) => ['changes', 'detail', id] as const,
  },
  applications: {
    all: ['applications'] as const,
    list: (params?: Record<string, unknown>) => ['applications', 'list', params] as const,
    detail: (id: string) => ['applications', 'detail', id] as const,
  },
  users: {
    all: ['users'] as const,
    list: (params?: Record<string, unknown>) => ['users', 'list', params] as const,
    detail: (id: string) => ['users', 'detail', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (params?: Record<string, unknown>) => ['notifications', 'list', params] as const,
  },
  catalog: {
    items: (params?: Record<string, unknown>) => ['catalog', 'items', params] as const,
    item: (id: string) => ['catalog', 'item', id] as const,
    requests: (params?: Record<string, unknown>) => ['catalog', 'requests', params] as const,
  },
  dashboard: ['dashboard'] as const,
  groups: ['groups'] as const,
  reports: ['reports'] as const,
};

// Issues Hooks
export function useIssues(params?: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  assignedTo?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: queryKeys.issues.list(params),
    queryFn: () => issuesApi.list(params),
  });
}

export function useIssue(id: string, options?: Omit<UseQueryOptions<Issue>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.issues.detail(id),
    queryFn: () => issuesApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      priority?: 'critical' | 'high' | 'medium' | 'low';
      severity?: 'S1' | 'S2' | 'S3' | 'S4';
      impact?: 'widespread' | 'significant' | 'moderate' | 'minor';
      urgency?: 'immediate' | 'high' | 'medium' | 'low';
      applicationId?: string;
      assignedTo?: string;
      assignedGroup?: string;
    }) => issuesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: Partial<{
        title: string;
        description: string;
        priority: 'critical' | 'high' | 'medium' | 'low';
        severity: 'S1' | 'S2' | 'S3' | 'S4';
        assignedTo: string;
        assignedGroup: string;
        applicationId: string;
      }>
    }) => issuesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useAddIssueComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, isInternal = false }: { id: string; content: string; isInternal?: boolean }) =>
      issuesApi.addComment(id, content, isInternal),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.issues.detail(id), 'comments'] });
    },
  });
}

export function useChangeIssueStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      issuesApi.changeStatus(id, status, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useAssignIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assignedTo, assignedGroup }: { id: string; assignedTo?: string; assignedGroup?: string }) =>
      issuesApi.assign(id, assignedTo, assignedGroup),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useResolveIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolutionCode, resolutionNotes }: { id: string; resolutionCode: string; resolutionNotes: string }) =>
      issuesApi.resolve(id, resolutionCode, resolutionNotes),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useCloseIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => issuesApi.close(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useReopenIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => issuesApi.reopen(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export function useDeleteIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => issuesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.all });
    },
  });
}

export interface IssueComment {
  id: string;
  content: string;
  is_internal?: boolean;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export function useIssueComments(issueId: string) {
  return useQuery({
    queryKey: [...queryKeys.issues.detail(issueId), 'comments'],
    queryFn: () => issuesApi.getComments(issueId),
    enabled: !!issueId,
  });
}

// Issue-Problem Linking
export interface LinkedProblem extends Problem {
  relationship_type?: 'caused_by' | 'related_to' | 'duplicate_of';
  linked_at?: string;
  link_notes?: string;
  linked_by_name?: string;
}

export function useIssueLinkedProblem(issueId: string) {
  return useQuery({
    queryKey: [...queryKeys.issues.detail(issueId), 'problem'],
    queryFn: () => issuesApi.getLinkedProblem(issueId),
    enabled: !!issueId,
  });
}

export function useLinkIssueToProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, problemId, relationshipType, notes }: {
      issueId: string;
      problemId: string;
      relationshipType?: string;
      notes?: string;
    }) => issuesApi.linkToProblem(issueId, problemId, relationshipType, notes),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(variables.issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

export function useUnlinkIssueFromProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (issueId: string) => issuesApi.unlinkFromProblem(issueId),
    onSuccess: (_, issueId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

// Problems Hooks
export function useProblems(params?: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  assignedTo?: string;
  assignedGroup?: string;
  applicationId?: string;
  search?: string;
  isKnownError?: boolean;
  problemType?: string;
}) {
  return useQuery({
    queryKey: queryKeys.problems.list(params),
    queryFn: () => problemsApi.list(params),
  });
}

export function useProblem(id: string, options?: Omit<UseQueryOptions<Problem>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.problems.detail(id),
    queryFn: () => problemsApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      priority?: 'critical' | 'high' | 'medium' | 'low';
      impact?: 'widespread' | 'significant' | 'moderate' | 'minor';
      urgency?: 'immediate' | 'high' | 'medium' | 'low';
      categoryId?: string;
      problemType?: 'reactive' | 'proactive';
      applicationId?: string;
      assignedTo?: string;
      assignedGroup?: string;
      tags?: string[];
    }) => problemsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

export function useUpdateProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: Partial<{
        title: string;
        description: string;
        priority: 'critical' | 'high' | 'medium' | 'low';
        impact: 'widespread' | 'significant' | 'moderate' | 'minor';
        urgency: 'immediate' | 'high' | 'medium' | 'low';
        categoryId: string;
        assignedTo: string | null;
        assignedGroup: string | null;
        applicationId: string | null;
        rootCause: string;
        workaround: string;
        resolution: string;
        resolutionCode: string;
        tags: string[];
      }>
    }) => problemsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

export function useDeleteProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => problemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

export function useChangeProblemStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: string; reason?: string }) =>
      problemsApi.changeStatus(id, status, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

export function useAssignProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string }) =>
      problemsApi.assign(id, assigneeId),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

export function useProblemComments(problemId: string) {
  return useQuery({
    queryKey: [...queryKeys.problems.detail(problemId), 'comments'],
    queryFn: () => problemsApi.getComments(problemId),
    enabled: !!problemId,
  });
}

export function useAddProblemComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, isInternal = false }: { id: string; content: string; isInternal?: boolean }) =>
      problemsApi.addComment(id, content, isInternal),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(id) });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.problems.detail(id), 'comments'] });
    },
  });
}

export function useProblemWorklogs(problemId: string) {
  return useQuery({
    queryKey: [...queryKeys.problems.detail(problemId), 'worklogs'],
    queryFn: () => problemsApi.getWorklogs(problemId),
    enabled: !!problemId,
  });
}

export function useAddProblemWorklog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, timeSpent, description, workType }: { id: string; timeSpent: number; description: string; workType?: string }) =>
      problemsApi.addWorklog(id, timeSpent, description, workType),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(id) });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.problems.detail(id), 'worklogs'] });
    },
  });
}

export function useProblemLinkedIssues(problemId: string) {
  return useQuery({
    queryKey: [...queryKeys.problems.detail(problemId), 'issues'],
    queryFn: () => problemsApi.getLinkedIssues(problemId),
    enabled: !!problemId,
  });
}

export function useProblemHistory(problemId: string) {
  return useQuery({
    queryKey: [...queryKeys.problems.detail(problemId), 'history'],
    queryFn: () => problemsApi.getHistory(problemId),
    enabled: !!problemId,
  });
}

export function useConvertToKnownError() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => problemsApi.convertToKnownError(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.problems.all });
    },
  });
}

// Changes Hooks
export function useChanges(params?: { page?: number; limit?: number; status?: string; type?: string; riskLevel?: string }) {
  return useQuery({
    queryKey: queryKeys.changes.list(params),
    queryFn: () => changesApi.list(params),
  });
}

export function useChange(id: string, options?: Omit<UseQueryOptions<Change>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.changes.detail(id),
    queryFn: () => changesApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      justification?: string;
      type?: 'standard' | 'normal' | 'emergency';
      riskLevel?: 'low' | 'medium' | 'high' | 'critical';
      impact?: 'none' | 'minor' | 'moderate' | 'significant' | 'major';
      applicationId?: string;
      plannedStart?: string;
      plannedEnd?: string;
      implementationPlan?: string;
      rollbackPlan?: string;
      testPlan?: string;
    }) => changesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.all });
    },
  });
}

export function useUpdateChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: Partial<{
        title: string;
        description: string;
        justification: string;
        type: 'standard' | 'normal' | 'emergency';
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        impact: 'none' | 'minor' | 'moderate' | 'significant' | 'major';
        applicationId: string;
        plannedStart: string;
        plannedEnd: string;
        implementationPlan: string;
        rollbackPlan: string;
        testPlan: string;
        assignedGroup: string;
        implementerId: string;
      }>;
    }) => changesApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.all });
    },
  });
}

export function useApproveChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) =>
      changesApi.approve(id, comments),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.all });
    },
  });
}

export function useRejectChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      changesApi.reject(id, reason),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.all });
    },
  });
}

export interface ChangeComment {
  id: string;
  content: string;
  is_internal?: boolean;
  user_id?: string;
  user_name?: string;
  created_at: string;
}

export function useChangeComments(changeId: string) {
  return useQuery({
    queryKey: [...queryKeys.changes.detail(changeId), 'comments'],
    queryFn: () => changesApi.getComments(changeId),
    enabled: !!changeId,
  });
}

export function useAddChangeComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, isInternal = false }: { id: string; content: string; isInternal?: boolean }) =>
      changesApi.addComment(id, content, isInternal),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.changes.detail(id) });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.changes.detail(id), 'comments'] });
    },
  });
}

// Applications Hooks
export function useApplications(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.applications.list(params),
    queryFn: () => applicationsApi.list(params),
  });
}

export function useApplication(id: string, options?: Omit<UseQueryOptions<Application>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: queryKeys.applications.detail(id),
    queryFn: () => applicationsApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      tier: 'P1' | 'P2' | 'P3' | 'P4';
      description?: string;
      status?: 'active' | 'inactive' | 'deprecated';
      lifecycleStage?: 'development' | 'staging' | 'production' | 'sunset';
      ownerUserId?: string;
      ownerGroupId?: string;
      supportGroupId?: string;
      businessUnit?: string;
      criticality?: 'mission_critical' | 'business_critical' | 'business_operational' | 'administrative';
      tags?: string[];
      metadata?: Record<string, unknown>;
    }) => applicationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
    },
  });
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: Partial<{
        name: string;
        tier: 'P1' | 'P2' | 'P3' | 'P4';
        description: string;
        status: 'active' | 'inactive' | 'deprecated';
        lifecycleStage: 'development' | 'staging' | 'production' | 'sunset';
        ownerUserId: string;
        ownerGroupId: string;
        supportGroupId: string;
        businessUnit: string;
        criticality: 'mission_critical' | 'business_critical' | 'business_operational' | 'administrative';
        tags: string[];
        metadata: Record<string, unknown>;
      }>
    }) => applicationsApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
    },
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => applicationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
    },
  });
}

export function useApplicationHealth(id: string) {
  return useQuery({
    queryKey: [...queryKeys.applications.detail(id), 'health'],
    queryFn: () => applicationsApi.getHealth(id),
    enabled: !!id,
  });
}

// Catalog Hooks
export function useCatalogItems(params?: { page?: number; limit?: number; category?: string }) {
  return useQuery({
    queryKey: queryKeys.catalog.items(params),
    queryFn: () => catalogApi.listItems(params),
  });
}

export function useCatalogItem(id: string) {
  return useQuery({
    queryKey: queryKeys.catalog.item(id),
    queryFn: () => catalogApi.getItem(id),
    enabled: !!id,
  });
}

export function useSubmitCatalogRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, formData }: { itemId: string; formData: Record<string, unknown> }) =>
      catalogApi.submitRequest(itemId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.requests() });
    },
  });
}

export function useCatalogRequests(params?: { page?: number; limit?: number; state?: string }) {
  return useQuery({
    queryKey: queryKeys.catalog.requests(params),
    queryFn: () => catalogApi.listRequests(params),
  });
}

// Users Hooks
export function useUsers(params?: { page?: number; limit?: number; search?: string }) {
  return useQuery({
    queryKey: queryKeys.users.list(params),
    queryFn: () => usersApi.list(params),
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => usersApi.get(id),
    enabled: !!id,
  });
}

// Groups Hooks
export function useGroups(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.groups,
    queryFn: () => groupsApi.list(params),
  });
}

// Notifications Hooks
export function useNotifications(params?: { page?: number; limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => notificationsApi.list(params),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

// Reports Hooks
export const reportQueryKeys = {
  templates: {
    all: ['reports', 'templates'] as const,
    list: (params?: Record<string, unknown>) => ['reports', 'templates', 'list', params] as const,
    detail: (id: string) => ['reports', 'templates', 'detail', id] as const,
  },
  executions: {
    all: ['reports', 'executions'] as const,
    list: (params?: Record<string, unknown>) => ['reports', 'executions', 'list', params] as const,
    detail: (id: string) => ['reports', 'executions', 'detail', id] as const,
  },
  schedules: {
    all: ['reports', 'schedules'] as const,
    list: (params?: Record<string, unknown>) => ['reports', 'schedules', 'list', params] as const,
    detail: (id: string) => ['reports', 'schedules', 'detail', id] as const,
  },
  saved: ['reports', 'saved'] as const,
  widgets: ['reports', 'widgets'] as const,
};

export function useReportTemplates(params?: { page?: number; limit?: number; report_type?: string }) {
  return useQuery({
    queryKey: reportQueryKeys.templates.list(params),
    queryFn: () => reportsApi.listTemplates(params),
  });
}

export function useReportTemplate(id: string) {
  return useQuery({
    queryKey: reportQueryKeys.templates.detail(id),
    queryFn: () => reportsApi.getTemplate(id),
    enabled: !!id,
  });
}

export function useCreateReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof reportsApi.createTemplate>[0]) =>
      reportsApi.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.templates.all });
    },
  });
}

export function useDeleteReportTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.templates.all });
    },
  });
}

export function useExecuteReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, options }: { templateId: string; options?: Parameters<typeof reportsApi.execute>[1] }) =>
      reportsApi.execute(templateId, options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.executions.all });
    },
  });
}

export function useReportExecutions(params?: { templateId?: string; status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: reportQueryKeys.executions.list(params),
    queryFn: () => reportsApi.listExecutions(params),
  });
}

export function useReportExecution(id: string) {
  return useQuery({
    queryKey: reportQueryKeys.executions.detail(id),
    queryFn: () => reportsApi.getExecution(id),
    enabled: !!id,
  });
}

export function useReportSchedules(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: reportQueryKeys.schedules.list(params),
    queryFn: () => reportsApi.listSchedules(params),
  });
}

export function useReportSchedule(id: string) {
  return useQuery({
    queryKey: reportQueryKeys.schedules.detail(id),
    queryFn: () => reportsApi.getSchedule(id),
    enabled: !!id,
  });
}

export function useCreateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof reportsApi.createSchedule>[0]) =>
      reportsApi.createSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.schedules.all });
    },
  });
}

export function useUpdateReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      reportsApi.updateSchedule(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.schedules.detail(id) });
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.schedules.all });
    },
  });
}

export function useDeleteReportSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.schedules.all });
    },
  });
}

export function useSavedReports() {
  return useQuery({
    queryKey: reportQueryKeys.saved,
    queryFn: () => reportsApi.listSaved(),
  });
}

export function useCreateSavedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof reportsApi.createSaved>[0]) =>
      reportsApi.createSaved(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.saved });
    },
  });
}

export function useDeleteSavedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteSaved(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.saved });
    },
  });
}

export function useDashboardWidgets() {
  return useQuery({
    queryKey: reportQueryKeys.widgets,
    queryFn: () => reportsApi.listWidgets(),
  });
}

export function useCreateDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof reportsApi.createWidget>[0]) =>
      reportsApi.createWidget(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.widgets });
    },
  });
}

export function useUpdateDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      reportsApi.updateWidget(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.widgets });
    },
  });
}

export function useDeleteDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reportsApi.deleteWidget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reportQueryKeys.widgets });
    },
  });
}

// Dashboard Hooks
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => dashboardApi.getOverview(),
  });
}

export function useDashboardMobile() {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'mobile'],
    queryFn: () => dashboardApi.getMobileSummary(),
  });
}

export function useIssueTrends(days?: number) {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'issue-trends', days],
    queryFn: () => dashboardApi.getIssueTrends(days),
  });
}

export function useIssuesByPriority() {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'issues-by-priority'],
    queryFn: () => dashboardApi.getIssuesByPriority(),
  });
}

export function useRecentActivity(limit?: number) {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'activity', limit],
    queryFn: () => dashboardApi.getRecentActivity(limit),
  });
}

export function useUpcomingChanges(days?: number) {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'upcoming-changes', days],
    queryFn: () => dashboardApi.getUpcomingChanges(days),
  });
}

export function useHealthDistribution() {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'health-distribution'],
    queryFn: () => dashboardApi.getHealthDistribution(),
  });
}

export function useCriticalApplications(limit?: number) {
  return useQuery({
    queryKey: [...queryKeys.dashboard, 'critical-apps', limit],
    queryFn: () => dashboardApi.getCriticalApplications(limit),
  });
}

// Cloud Hooks
export const cloudQueryKeys = {
  accounts: {
    all: ['cloud', 'accounts'] as const,
    list: (params?: Record<string, unknown>) => ['cloud', 'accounts', 'list', params] as const,
    detail: (id: string) => ['cloud', 'accounts', 'detail', id] as const,
  },
  resources: {
    all: ['cloud', 'resources'] as const,
    list: (params?: Record<string, unknown>) => ['cloud', 'resources', 'list', params] as const,
    detail: (id: string) => ['cloud', 'resources', 'detail', id] as const,
    types: ['cloud', 'resources', 'types'] as const,
    byApplication: (appId: string) => ['cloud', 'resources', 'application', appId] as const,
  },
  costs: {
    all: ['cloud', 'costs'] as const,
    list: (params?: Record<string, unknown>) => ['cloud', 'costs', 'list', params] as const,
    byApplication: (appId: string) => ['cloud', 'costs', 'application', appId] as const,
  },
  mappingRules: ['cloud', 'mapping-rules'] as const,
};

export function useCloudAccounts(params?: { page?: number; limit?: number; provider?: string; status?: string }) {
  return useQuery({
    queryKey: cloudQueryKeys.accounts.list(params),
    queryFn: () => cloudApi.listAccounts(params),
  });
}

export function useCloudAccount(id: string) {
  return useQuery({
    queryKey: cloudQueryKeys.accounts.detail(id),
    queryFn: () => cloudApi.getAccount(id),
    enabled: !!id,
  });
}

export function useCreateCloudAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cloudApi.createAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.accounts.all });
    },
  });
}

export function useUpdateCloudAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof cloudApi.updateAccount>[1] }) =>
      cloudApi.updateAccount(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.accounts.detail(id) });
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.accounts.all });
    },
  });
}

export function useDeleteCloudAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cloudApi.deleteAccount(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.accounts.all });
    },
  });
}

export function useTestCloudAccountConnection() {
  return useMutation({
    mutationFn: (id: string) => cloudApi.testAccountConnection(id),
  });
}

export function useCloudResources(params?: {
  page?: number;
  limit?: number;
  cloud_account_id?: string;
  resource_type?: string;
  application_id?: string;
  region?: string;
}) {
  return useQuery({
    queryKey: cloudQueryKeys.resources.list(params),
    queryFn: () => cloudApi.listResources(params),
  });
}

export function useCloudResource(id: string) {
  return useQuery({
    queryKey: cloudQueryKeys.resources.detail(id),
    queryFn: () => cloudApi.getResource(id),
    enabled: !!id,
  });
}

export function useCloudResourceTypes() {
  return useQuery({
    queryKey: cloudQueryKeys.resources.types,
    queryFn: () => cloudApi.getResourceTypes(),
  });
}

export function useCloudResourcesByApplication(applicationId: string) {
  return useQuery({
    queryKey: cloudQueryKeys.resources.byApplication(applicationId),
    queryFn: () => cloudApi.getResourcesByApplication(applicationId),
    enabled: !!applicationId,
  });
}

export function useMapCloudResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, applicationId, environmentId }: { id: string; applicationId: string; environmentId?: string }) =>
      cloudApi.mapResourceToApplication(id, applicationId, environmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.resources.all });
    },
  });
}

export function useUnmapCloudResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cloudApi.unmapResource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.resources.all });
    },
  });
}

export function useCloudCosts(params?: { page?: number; limit?: number; cloud_account_id?: string; period_type?: string }) {
  return useQuery({
    queryKey: cloudQueryKeys.costs.list(params),
    queryFn: () => cloudApi.getCosts(params),
  });
}

export function useCloudCostsByApplication(applicationId: string, periodType?: string) {
  return useQuery({
    queryKey: cloudQueryKeys.costs.byApplication(applicationId),
    queryFn: () => cloudApi.getCostsByApplication(applicationId, periodType),
    enabled: !!applicationId,
  });
}

export function useCloudMappingRules() {
  return useQuery({
    queryKey: cloudQueryKeys.mappingRules,
    queryFn: () => cloudApi.listMappingRules(),
  });
}

export function useCreateCloudMappingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cloudApi.createMappingRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.mappingRules });
    },
  });
}

export function useDeleteCloudMappingRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cloudApi.deleteMappingRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.mappingRules });
    },
  });
}

export function useApplyCloudMappingRules() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cloudApi.applyMappingRules(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: cloudQueryKeys.resources.all });
    },
  });
}

// On-Call Hooks
export const oncallQueryKeys = {
  schedules: {
    all: ['oncall', 'schedules'] as const,
    list: (params?: Record<string, unknown>) => ['oncall', 'schedules', 'list', params] as const,
    detail: (id: string) => ['oncall', 'schedules', 'detail', id] as const,
    rotations: (id: string) => ['oncall', 'schedules', id, 'rotations'] as const,
    shifts: (id: string, params?: Record<string, unknown>) => ['oncall', 'schedules', id, 'shifts', params] as const,
    applications: (id: string) => ['oncall', 'schedules', id, 'applications'] as const,
  },
  policies: {
    all: ['oncall', 'policies'] as const,
    list: (params?: Record<string, unknown>) => ['oncall', 'policies', 'list', params] as const,
    detail: (id: string) => ['oncall', 'policies', 'detail', id] as const,
    steps: (id: string) => ['oncall', 'policies', id, 'steps'] as const,
  },
  whoIsOnCall: (params?: Record<string, unknown>) => ['oncall', 'who-is-on-call', params] as const,
};

export function useOncallSchedules(params?: { page?: number; limit?: number; group_id?: string; is_active?: boolean }) {
  return useQuery({
    queryKey: oncallQueryKeys.schedules.list(params),
    queryFn: () => oncallApi.listSchedules(params),
  });
}

export function useOncallSchedule(id: string) {
  return useQuery({
    queryKey: oncallQueryKeys.schedules.detail(id),
    queryFn: () => oncallApi.getSchedule(id),
    enabled: !!id,
  });
}

export function useCreateOncallSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: oncallApi.createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.all });
    },
  });
}

export function useUpdateOncallSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof oncallApi.updateSchedule>[1] }) =>
      oncallApi.updateSchedule(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.detail(id) });
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.all });
    },
  });
}

export function useDeleteOncallSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => oncallApi.deleteSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.all });
    },
  });
}

export function useOncallRotations(scheduleId: string) {
  return useQuery({
    queryKey: oncallQueryKeys.schedules.rotations(scheduleId),
    queryFn: () => oncallApi.getRotations(scheduleId),
    enabled: !!scheduleId,
  });
}

export function useAddToRotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, userId, position }: { scheduleId: string; userId: string; position?: number }) =>
      oncallApi.addToRotation(scheduleId, userId, position),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.rotations(scheduleId) });
    },
  });
}

export function useRemoveFromRotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, rotationId }: { scheduleId: string; rotationId: string }) =>
      oncallApi.removeFromRotation(scheduleId, rotationId),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.rotations(scheduleId) });
    },
  });
}

export function useOncallShifts(scheduleId: string, params?: { start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: oncallQueryKeys.schedules.shifts(scheduleId, params),
    queryFn: () => oncallApi.getShifts(scheduleId, params),
    enabled: !!scheduleId,
  });
}

export function useCreateOncallShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: string; data: Parameters<typeof oncallApi.createShift>[1] }) =>
      oncallApi.createShift(scheduleId, data),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.shifts(scheduleId) });
    },
  });
}

export function useDeleteOncallShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, shiftId }: { scheduleId: string; shiftId: string }) =>
      oncallApi.deleteShift(scheduleId, shiftId),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.shifts(scheduleId) });
    },
  });
}

export function useCreateOncallOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: string; data: Parameters<typeof oncallApi.createOverride>[1] }) =>
      oncallApi.createOverride(scheduleId, data),
    onSuccess: (_, { scheduleId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.schedules.shifts(scheduleId) });
    },
  });
}

export function useWhoIsOnCall(params?: { schedule_id?: string; application_id?: string }) {
  return useQuery({
    queryKey: oncallQueryKeys.whoIsOnCall(params),
    queryFn: () => oncallApi.whoIsOnCall(params),
  });
}

export function useEscalationPolicies(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: oncallQueryKeys.policies.list(params),
    queryFn: () => oncallApi.listPolicies(params),
  });
}

export function useEscalationPolicy(id: string) {
  return useQuery({
    queryKey: oncallQueryKeys.policies.detail(id),
    queryFn: () => oncallApi.getPolicy(id),
    enabled: !!id,
  });
}

export function useCreateEscalationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: oncallApi.createPolicy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.all });
    },
  });
}

export function useUpdateEscalationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof oncallApi.updatePolicy>[1] }) =>
      oncallApi.updatePolicy(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.detail(id) });
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.all });
    },
  });
}

export function useDeleteEscalationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => oncallApi.deletePolicy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.all });
    },
  });
}

export function usePolicySteps(policyId: string) {
  return useQuery({
    queryKey: oncallQueryKeys.policies.steps(policyId),
    queryFn: () => oncallApi.getPolicySteps(policyId),
    enabled: !!policyId,
  });
}

export function useAddPolicyStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, data }: { policyId: string; data: Parameters<typeof oncallApi.addPolicyStep>[1] }) =>
      oncallApi.addPolicyStep(policyId, data),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.steps(policyId) });
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.detail(policyId) });
    },
  });
}

export function useUpdatePolicyStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, stepId, data }: { policyId: string; stepId: string; data: Parameters<typeof oncallApi.updatePolicyStep>[2] }) =>
      oncallApi.updatePolicyStep(policyId, stepId, data),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.steps(policyId) });
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.detail(policyId) });
    },
  });
}

export function useDeletePolicyStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, stepId }: { policyId: string; stepId: string }) =>
      oncallApi.deletePolicyStep(policyId, stepId),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.steps(policyId) });
      queryClient.invalidateQueries({ queryKey: oncallQueryKeys.policies.detail(policyId) });
    },
  });
}

// ================================
// KNOWLEDGE BASE HOOKS
// ================================

// KB Types
export type KBArticleStatus = 'draft' | 'review' | 'published' | 'archived';
export type KBArticleType = 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error';
export type KBArticleVisibility = 'public' | 'internal' | 'restricted';

export interface KBArticle {
  id: string;
  article_number: string;
  title: string;
  slug: string;
  content: string;
  summary?: string;
  type: KBArticleType;
  status: KBArticleStatus;
  visibility: KBArticleVisibility;
  category_id?: string;
  category_name?: string;
  author_id: string;
  author_name?: string;
  author_email?: string;
  reviewer_id?: string;
  reviewer_name?: string;
  published_at?: string;
  published_by?: string;
  view_count: number;
  helpful_count: number;
  not_helpful_count: number;
  related_problem_id?: string;
  related_problem_number?: string;
  related_problem_title?: string;
  related_issue_id?: string;
  related_issue_number?: string;
  related_issue_title?: string;
  tags?: string[];
  keywords?: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface KBCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parent_id?: string;
  icon?: string;
  sort_order: number;
  article_count: number;
  created_at: string;
  updated_at: string;
}

export interface KBArticleHistory {
  id: string;
  article_id: string;
  version?: number;
  changed_by: string;
  changed_by_name?: string;
  action: string;
  content_snapshot?: string;
  created_at: string;
}

// KB Query Keys
export const kbQueryKeys = {
  articles: {
    all: ['kb', 'articles'] as const,
    list: (params?: Record<string, unknown>) => ['kb', 'articles', 'list', params] as const,
    detail: (id: string) => ['kb', 'articles', 'detail', id] as const,
    history: (id: string) => ['kb', 'articles', id, 'history'] as const,
  },
  categories: ['kb', 'categories'] as const,
  search: (query: string) => ['kb', 'search', query] as const,
  forProblem: (problemId: string) => ['kb', 'problem', problemId] as const,
  forIssue: (issueId: string) => ['kb', 'issue', issueId] as const,
};

// KB Hooks - Articles
export function useKBArticles(params?: {
  page?: number;
  limit?: number;
  status?: KBArticleStatus;
  type?: KBArticleType;
  visibility?: KBArticleVisibility;
  categoryId?: string;
  authorId?: string;
  search?: string;
  tag?: string;
  publishedOnly?: boolean;
}) {
  return useQuery({
    queryKey: kbQueryKeys.articles.list(params),
    queryFn: () => kbApi.listArticles(params),
  });
}

export function useKBArticle(id: string, options?: Omit<UseQueryOptions<KBArticle>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: kbQueryKeys.articles.detail(id),
    queryFn: () => kbApi.getArticle(id),
    enabled: !!id,
    ...options,
  });
}

export function useKBArticleBySlug(slug: string) {
  return useQuery({
    queryKey: ['kb', 'articles', 'slug', slug],
    queryFn: () => kbApi.getArticleBySlug(slug),
    enabled: !!slug,
  });
}

export function useKBSearch(query: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: kbQueryKeys.search(query),
    queryFn: () => kbApi.searchArticles(query, params),
    enabled: !!query,
  });
}

export function useCreateKBArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      content: string;
      summary?: string;
      type?: KBArticleType;
      visibility?: KBArticleVisibility;
      categoryId?: string;
      tags?: string[];
      keywords?: string[];
      relatedProblemId?: string;
      relatedIssueId?: string;
    }) => kbApi.createArticle(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

export function useUpdateKBArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        title?: string;
        content?: string;
        summary?: string;
        type?: KBArticleType;
        visibility?: KBArticleVisibility;
        categoryId?: string | null;
        tags?: string[];
        keywords?: string[];
      };
    }) => kbApi.updateArticle(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

export function useDeleteKBArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbApi.deleteArticle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

// Article Status Actions
export function useSubmitKBArticleForReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbApi.submitForReview(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

export function usePublishKBArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbApi.publishArticle(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

export function useArchiveKBArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbApi.archiveArticle(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

export function useRevertKBArticleToDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbApi.revertToDraft(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

// Feedback
export function useSubmitKBFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isHelpful, comment }: { id: string; isHelpful: boolean; comment?: string }) =>
      kbApi.submitFeedback(id, isHelpful, comment),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
    },
  });
}

// History
export function useKBArticleHistory(articleId: string) {
  return useQuery({
    queryKey: kbQueryKeys.articles.history(articleId),
    queryFn: () => kbApi.getArticleHistory(articleId),
    enabled: !!articleId,
  });
}

// Categories
export function useKBCategories() {
  return useQuery({
    queryKey: kbQueryKeys.categories,
    queryFn: () => kbApi.listCategories(),
  });
}

export function useCreateKBCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      parentId?: string;
      icon?: string;
      sortOrder?: number;
    }) => kbApi.createCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.categories });
    },
  });
}

export function useUpdateKBCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        parentId?: string | null;
        icon?: string;
        sortOrder?: number;
      };
    }) => kbApi.updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.categories });
    },
  });
}

export function useDeleteKBCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => kbApi.deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.categories });
    },
  });
}

// Related Articles
export function useKBArticlesForProblem(problemId: string) {
  return useQuery({
    queryKey: kbQueryKeys.forProblem(problemId),
    queryFn: () => kbApi.getArticlesForProblem(problemId),
    enabled: !!problemId,
  });
}

export function useKBArticlesForIssue(issueId: string) {
  return useQuery({
    queryKey: kbQueryKeys.forIssue(issueId),
    queryFn: () => kbApi.getArticlesForIssue(issueId),
    enabled: !!issueId,
  });
}

export function useLinkKBArticle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, problemId, issueId }: { id: string; problemId?: string; issueId?: string }) =>
      kbApi.linkArticle(id, { problemId, issueId }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.detail(id) });
      queryClient.invalidateQueries({ queryKey: kbQueryKeys.articles.all });
    },
  });
}

// ================================
// SLA MANAGEMENT HOOKS
// ================================

// SLA Types
export type SlaEntityType = 'issue' | 'problem' | 'change';
export type SlaMetricType = 'response_time' | 'resolution_time';
export type SlaPriority = 'critical' | 'high' | 'medium' | 'low';

export interface SlaPolicy {
  id: string;
  name: string;
  description?: string;
  entity_type: SlaEntityType;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SlaTarget {
  id: string;
  policy_id: string;
  metric_type: SlaMetricType;
  priority: SlaPriority;
  target_minutes: number;
  warning_threshold_percent?: number;
  created_at: string;
  updated_at: string;
}

export interface SlaPolicyWithTargets extends SlaPolicy {
  targets: SlaTarget[];
}

export interface SlaStats {
  total: number;
  met: number;
  breached: number;
  met_percentage: number;
  avg_response_time_minutes?: number;
  avg_resolution_time_minutes?: number;
  by_priority: {
    priority: SlaPriority;
    total: number;
    met: number;
    breached: number;
  }[];
}

export interface SlaConfig {
  response_time: Record<SlaPriority, number>;
  resolution_time: Record<SlaPriority, number>;
}

// SLA Query Keys
export const slaQueryKeys = {
  policies: {
    all: ['sla', 'policies'] as const,
    list: (params?: Record<string, unknown>) => ['sla', 'policies', 'list', params] as const,
    detail: (id: string) => ['sla', 'policies', 'detail', id] as const,
  },
  targets: {
    all: ['sla', 'targets'] as const,
    byPolicy: (policyId: string) => ['sla', 'targets', 'policy', policyId] as const,
  },
  stats: (params?: Record<string, unknown>) => ['sla', 'stats', params] as const,
  config: (entityType?: string) => ['sla', 'config', entityType] as const,
};

// SLA Hooks - Policies
export function useSlaPolicies(params?: { entityType?: SlaEntityType; isActive?: boolean }) {
  return useQuery({
    queryKey: slaQueryKeys.policies.list(params),
    queryFn: () => slaApi.listPolicies(params),
  });
}

export function useSlaPolicy(id: string, options?: Omit<UseQueryOptions<SlaPolicyWithTargets>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: slaQueryKeys.policies.detail(id),
    queryFn: () => slaApi.getPolicy(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateSlaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      entityType: SlaEntityType;
      isDefault?: boolean;
      targets?: {
        metricType: SlaMetricType;
        priority: SlaPriority;
        targetMinutes: number;
        warningThresholdPercent?: number;
      }[];
    }) => slaApi.createPolicy(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.all });
    },
  });
}

export function useUpdateSlaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        isDefault?: boolean;
        isActive?: boolean;
      };
    }) => slaApi.updatePolicy(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.detail(id) });
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.all });
    },
  });
}

export function useDeleteSlaPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => slaApi.deletePolicy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.all });
    },
  });
}

// SLA Hooks - Targets
export function useCreateSlaTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, data }: {
      policyId: string;
      data: {
        metricType: SlaMetricType;
        priority: SlaPriority;
        targetMinutes: number;
        warningThresholdPercent?: number;
      };
    }) => slaApi.createTarget(policyId, data),
    onSuccess: (_, { policyId }) => {
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.detail(policyId) });
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.targets.byPolicy(policyId) });
    },
  });
}

export function useUpdateSlaTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        targetMinutes?: number;
        warningThresholdPercent?: number;
      };
    }) => slaApi.updateTarget(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.all });
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.targets.all });
    },
  });
}

export function useDeleteSlaTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => slaApi.deleteTarget(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.policies.all });
      queryClient.invalidateQueries({ queryKey: slaQueryKeys.targets.all });
    },
  });
}

// SLA Hooks - Stats & Config
export function useSlaStats(params?: {
  entityType?: 'issue' | 'problem';
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: slaQueryKeys.stats(params),
    queryFn: () => slaApi.getStats(params),
  });
}

export function useSlaConfig(entityType?: 'issue' | 'problem') {
  return useQuery({
    queryKey: slaQueryKeys.config(entityType),
    queryFn: () => slaApi.getConfig(entityType),
  });
}

// ================================
// WORKFLOW AUTOMATION HOOKS
// ================================

// Workflow Types
export type WorkflowEntityType = 'issue' | 'problem' | 'change' | 'request';
export type WorkflowTriggerType = 'on_create' | 'on_update' | 'on_status_change' | 'on_assignment' | 'scheduled';
export type WorkflowConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'
  | 'in_list'
  | 'not_in_list';
export type WorkflowActionType =
  | 'set_field'
  | 'assign_to_user'
  | 'assign_to_group'
  | 'change_status'
  | 'change_priority'
  | 'add_comment'
  | 'send_notification'
  | 'send_email'
  | 'escalate'
  | 'link_to_problem'
  | 'create_task';

export interface WorkflowCondition {
  id?: string;
  field: string;
  operator: WorkflowConditionOperator;
  value: string | number | boolean | string[];
  logical_operator?: 'AND' | 'OR';
}

export interface WorkflowAction {
  id?: string;
  action_type: WorkflowActionType;
  parameters: Record<string, unknown>;
  order: number;
}

export interface WorkflowRule {
  id: string;
  name: string;
  description?: string;
  entity_type: WorkflowEntityType;
  trigger_type: WorkflowTriggerType;
  is_active: boolean;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  execution_order: number;
  stop_on_match?: boolean;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecutionLog {
  id: string;
  rule_id: string;
  rule_name: string;
  entity_type: WorkflowEntityType;
  entity_id: string;
  trigger_type: WorkflowTriggerType;
  conditions_matched: boolean;
  actions_executed: WorkflowAction[];
  execution_time_ms: number;
  error?: string;
  executed_at: string;
}

export interface WorkflowField {
  field: string;
  label: string;
  type: 'text' | 'select' | 'user' | 'group';
}

export interface WorkflowActionMeta {
  action_type: WorkflowActionType;
  label: string;
  description: string;
}

// Workflow Query Keys
export const workflowQueryKeys = {
  rules: {
    all: ['workflow', 'rules'] as const,
    list: (params?: Record<string, unknown>) => ['workflow', 'rules', 'list', params] as const,
    detail: (id: string) => ['workflow', 'rules', 'detail', id] as const,
  },
  logs: {
    all: ['workflow', 'logs'] as const,
    list: (params?: Record<string, unknown>) => ['workflow', 'logs', 'list', params] as const,
  },
  fields: (entityType: string) => ['workflow', 'fields', entityType] as const,
  actions: (entityType: string) => ['workflow', 'actions', entityType] as const,
};

// Workflow Hooks - Rules
export function useWorkflowRules(params?: {
  entityType?: WorkflowEntityType;
  triggerType?: WorkflowTriggerType;
  isActive?: boolean;
}) {
  return useQuery({
    queryKey: workflowQueryKeys.rules.list(params),
    queryFn: () => workflowApi.listRules(params),
  });
}

export function useWorkflowRule(id: string, options?: Omit<UseQueryOptions<WorkflowRule>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: workflowQueryKeys.rules.detail(id),
    queryFn: () => workflowApi.getRule(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      entityType: WorkflowEntityType;
      triggerType: WorkflowTriggerType;
      isActive?: boolean;
      conditions: Omit<WorkflowCondition, 'id'>[];
      actions: Omit<WorkflowAction, 'id'>[];
      executionOrder?: number;
      stopOnMatch?: boolean;
    }) => workflowApi.createRule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.rules.all });
    },
  });
}

export function useUpdateWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        isActive?: boolean;
        conditions?: Omit<WorkflowCondition, 'id'>[];
        actions?: Omit<WorkflowAction, 'id'>[];
        executionOrder?: number;
        stopOnMatch?: boolean;
      };
    }) => workflowApi.updateRule(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.rules.detail(id) });
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.rules.all });
    },
  });
}

export function useDeleteWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.rules.all });
    },
  });
}

export function useToggleWorkflowRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.toggleRule(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.rules.detail(id) });
      queryClient.invalidateQueries({ queryKey: workflowQueryKeys.rules.all });
    },
  });
}

export function useTestWorkflowRule() {
  return useMutation({
    mutationFn: ({ id, entityData }: { id: string; entityData: Record<string, unknown> }) =>
      workflowApi.testRule(id, entityData),
  });
}

// Workflow Hooks - Execution Logs
export function useWorkflowLogs(params?: {
  ruleId?: string;
  entityType?: WorkflowEntityType;
  entityId?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: workflowQueryKeys.logs.list(params),
    queryFn: () => workflowApi.getLogs(params),
  });
}

// Workflow Hooks - Metadata
export function useWorkflowFields(entityType: string) {
  return useQuery({
    queryKey: workflowQueryKeys.fields(entityType),
    queryFn: () => workflowApi.getFields(entityType),
    enabled: !!entityType,
  });
}

export function useWorkflowActions(entityType: string) {
  return useQuery({
    queryKey: workflowQueryKeys.actions(entityType),
    queryFn: () => workflowApi.getActions(entityType),
    enabled: !!entityType,
  });
}

// ================================
// ASSET MANAGEMENT / CMDB HOOKS
// ================================

// Asset Types
export type AssetType = 'hardware' | 'software' | 'network' | 'cloud' | 'virtual' | 'other';
export type AssetStatus = 'active' | 'inactive' | 'maintenance' | 'retired' | 'disposed' | 'ordered' | 'in_storage';
export type AssetCategory =
  | 'server'
  | 'workstation'
  | 'laptop'
  | 'mobile'
  | 'printer'
  | 'network_device'
  | 'storage'
  | 'software_license'
  | 'saas_subscription'
  | 'virtual_machine'
  | 'container'
  | 'database'
  | 'application'
  | 'other';

export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  description?: string;
  asset_type: AssetType;
  category: AssetCategory;
  status: AssetStatus;
  location?: string;
  department?: string;
  owner_id?: string;
  owner_name?: string;
  owner_email?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  assigned_to_email?: string;
  manufacturer?: string;
  model?: string;
  serial_number?: string;
  version?: string;
  license_type?: string;
  license_count?: number;
  license_expiry?: string;
  purchase_date?: string;
  purchase_cost?: number;
  warranty_expiry?: string;
  vendor?: string;
  po_number?: string;
  ip_address?: string;
  mac_address?: string;
  hostname?: string;
  attributes?: Record<string, unknown>;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AssetRelationship {
  id: string;
  parent_asset_id: string;
  parent_asset_name?: string;
  parent_asset_tag?: string;
  child_asset_id: string;
  child_asset_name?: string;
  child_asset_tag?: string;
  relationship_type: string;
  created_at: string;
}

export interface AssetStats {
  total: number;
  by_type: Record<AssetType, number>;
  by_status: Record<AssetStatus, number>;
  by_category: Record<string, number>;
  warranty_expiring_soon: number;
  license_expiring_soon: number;
}

// Asset Query Keys
export const assetQueryKeys = {
  assets: {
    all: ['assets'] as const,
    list: (params?: Record<string, unknown>) => ['assets', 'list', params] as const,
    detail: (id: string) => ['assets', 'detail', id] as const,
    relationships: (id: string) => ['assets', id, 'relationships'] as const,
    issues: (id: string) => ['assets', id, 'issues'] as const,
    changes: (id: string) => ['assets', id, 'changes'] as const,
  },
  stats: ['assets', 'stats'] as const,
};

// Asset Hooks
export function useAssets(params?: {
  page?: number;
  limit?: number;
  assetType?: AssetType;
  category?: AssetCategory;
  status?: AssetStatus;
  search?: string;
  ownerId?: string;
  assignedToId?: string;
  department?: string;
}) {
  return useQuery({
    queryKey: assetQueryKeys.assets.list(params),
    queryFn: () => assetApi.list(params),
  });
}

export function useAsset(id: string, options?: Omit<UseQueryOptions<Asset>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: assetQueryKeys.assets.detail(id),
    queryFn: () => assetApi.get(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      assetType: AssetType;
      category: AssetCategory;
      status?: AssetStatus;
      location?: string;
      department?: string;
      ownerId?: string;
      assignedToId?: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      version?: string;
      licenseType?: string;
      licenseCount?: number;
      licenseExpiry?: string;
      purchaseDate?: string;
      purchaseCost?: number;
      warrantyExpiry?: string;
      vendor?: string;
      poNumber?: string;
      ipAddress?: string;
      macAddress?: string;
      hostname?: string;
      attributes?: Record<string, unknown>;
    }) => assetApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.all });
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.stats });
    },
  });
}

export function useUpdateAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string | null;
        status?: AssetStatus;
        location?: string | null;
        department?: string | null;
        ownerId?: string | null;
        assignedToId?: string | null;
        manufacturer?: string | null;
        model?: string | null;
        serialNumber?: string | null;
        version?: string | null;
        licenseType?: string | null;
        licenseCount?: number | null;
        licenseExpiry?: string | null;
        purchaseDate?: string | null;
        purchaseCost?: number | null;
        warrantyExpiry?: string | null;
        vendor?: string | null;
        poNumber?: string | null;
        ipAddress?: string | null;
        macAddress?: string | null;
        hostname?: string | null;
        attributes?: Record<string, unknown>;
      };
    }) => assetApi.update(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.detail(id) });
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.all });
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.stats });
    },
  });
}

export function useDeleteAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.all });
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.stats });
    },
  });
}

// Asset Relationships
export function useAssetRelationships(assetId: string) {
  return useQuery({
    queryKey: assetQueryKeys.assets.relationships(assetId),
    queryFn: () => assetApi.getRelationships(assetId),
    enabled: !!assetId,
  });
}

export function useCreateAssetRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, childAssetId, relationshipType }: {
      assetId: string;
      childAssetId: string;
      relationshipType: string;
    }) => assetApi.createRelationship(assetId, { childAssetId, relationshipType }),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.relationships(assetId) });
    },
  });
}

export function useDeleteAssetRelationship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (relationshipId: string) => assetApi.deleteRelationship(relationshipId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.all });
    },
  });
}

// Asset Issue Links
export function useAssetIssues(assetId: string) {
  return useQuery({
    queryKey: assetQueryKeys.assets.issues(assetId),
    queryFn: () => assetApi.getIssues(assetId),
    enabled: !!assetId,
  });
}

export function useLinkAssetToIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, issueId }: { assetId: string; issueId: string }) =>
      assetApi.linkToIssue(assetId, issueId),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.issues(assetId) });
    },
  });
}

export function useUnlinkAssetFromIssue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ assetId, issueId }: { assetId: string; issueId: string }) =>
      assetApi.unlinkFromIssue(assetId, issueId),
    onSuccess: (_, { assetId }) => {
      queryClient.invalidateQueries({ queryKey: assetQueryKeys.assets.issues(assetId) });
    },
  });
}

// Asset Change Links
export function useAssetChanges(assetId: string) {
  return useQuery({
    queryKey: assetQueryKeys.assets.changes(assetId),
    queryFn: () => assetApi.getChanges(assetId),
    enabled: !!assetId,
  });
}

// Asset Statistics
export function useAssetStats() {
  return useQuery({
    queryKey: assetQueryKeys.stats,
    queryFn: () => assetApi.getStats(),
  });
}

// ================================
// EMAIL INTEGRATION HOOKS
// ================================

// Email Types
export type EmailProvider = 'sendgrid' | 'mailgun' | 'postmark' | 'smtp';

export interface EmailConfig {
  id: string;
  name: string;
  email_address: string;
  provider: EmailProvider;
  is_active: boolean;
  default_priority: 'low' | 'medium' | 'high' | 'critical';
  default_application_id?: string;
  default_application_name?: string;
  default_assigned_group?: string;
  default_assigned_group_name?: string;
  auto_reply_enabled: boolean;
  auto_reply_template?: string;
  spam_filter_enabled: boolean;
  allowed_domains: string[];
  blocked_domains: string[];
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface EmailLog {
  id: string;
  email_config_id?: string;
  email_config_name?: string;
  from_email: string;
  from_name?: string;
  to_email: string;
  subject?: string;
  message_id?: string;
  in_reply_to?: string;
  action: 'created_issue' | 'added_comment' | 'rejected_spam' | 'rejected_config_disabled' | 'rejected_no_config' | 'error';
  issue_id?: string;
  issue_number?: string;
  success: boolean;
  error_message?: string;
  created_at: string;
}

export interface WebhookUrls {
  sendgrid: string;
  mailgun: string;
  generic: string;
  instructions: {
    sendgrid: string;
    mailgun: string;
    generic: string;
  };
}

// Email Query Keys
export const emailQueryKeys = {
  configs: {
    all: ['email', 'configs'] as const,
    list: () => ['email', 'configs', 'list'] as const,
    detail: (id: string) => ['email', 'configs', 'detail', id] as const,
  },
  logs: {
    all: ['email', 'logs'] as const,
    list: (params?: Record<string, unknown>) => ['email', 'logs', 'list', params] as const,
  },
  webhookUrls: ['email', 'webhook-urls'] as const,
};

// Email Hooks - Configs
export function useEmailConfigs() {
  return useQuery({
    queryKey: emailQueryKeys.configs.list(),
    queryFn: () => emailApi.listConfigs(),
  });
}

export function useEmailConfig(id: string, options?: Omit<UseQueryOptions<EmailConfig>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: emailQueryKeys.configs.detail(id),
    queryFn: () => emailApi.getConfig(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateEmailConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      emailAddress: string;
      provider: EmailProvider;
      defaultPriority?: 'low' | 'medium' | 'high' | 'critical';
      defaultApplicationId?: string;
      defaultAssignedGroup?: string;
      autoReplyEnabled?: boolean;
      autoReplyTemplate?: string;
      spamFilterEnabled?: boolean;
      allowedDomains?: string[];
      blockedDomains?: string[];
    }) => emailApi.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailQueryKeys.configs.all });
    },
  });
}

export function useUpdateEmailConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        isActive?: boolean;
        defaultPriority?: 'low' | 'medium' | 'high' | 'critical';
        defaultApplicationId?: string | null;
        defaultAssignedGroup?: string | null;
        autoReplyEnabled?: boolean;
        autoReplyTemplate?: string | null;
        spamFilterEnabled?: boolean;
        allowedDomains?: string[];
        blockedDomains?: string[];
      };
    }) => emailApi.updateConfig(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: emailQueryKeys.configs.detail(id) });
      queryClient.invalidateQueries({ queryKey: emailQueryKeys.configs.all });
    },
  });
}

export function useDeleteEmailConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => emailApi.deleteConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailQueryKeys.configs.all });
    },
  });
}

// Email Hooks - Logs
export function useEmailLogs(params?: {
  configId?: string;
  action?: string;
  success?: boolean;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: emailQueryKeys.logs.list(params),
    queryFn: () => emailApi.getLogs(params),
  });
}

// Email Hooks - Test & Webhooks
export function useTestEmail() {
  return useMutation({
    mutationFn: ({ to, subject, body }: { to: string; subject?: string; body?: string }) =>
      emailApi.testEmail(to, subject, body),
  });
}

export function useWebhookUrls() {
  return useQuery({
    queryKey: emailQueryKeys.webhookUrls,
    queryFn: () => emailApi.getWebhookUrls(),
  });
}

// ================================
// INTEGRATIONS (WEBHOOKS, API KEYS) HOOKS
// ================================

// Integration Types
export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  key_prefix: string;
  permissions: string[];
  rate_limit: number;
  is_active: boolean;
  expires_at?: string;
  last_used_at?: string;
  usage_count: number;
  ip_whitelist: string[];
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Webhook {
  id: string;
  name: string;
  description?: string;
  url: string;
  secret?: string;
  events: string[];
  filters: Record<string, unknown>;
  is_active: boolean;
  retry_count: number;
  retry_delay: number;
  timeout: number;
  custom_headers: Record<string, string>;
  last_triggered_at?: string;
  success_count: number;
  failure_count: number;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id?: string;
  event: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed';
  response_status?: number;
  response_body?: string;
  response_headers?: Record<string, string>;
  attempt_count: number;
  next_retry_at?: string;
  delivered_at?: string;
  error_message?: string;
  created_at: string;
}

export interface Integration {
  id: string;
  name: string;
  type: string;
  description?: string;
  config: Record<string, unknown>;
  credentials: Record<string, unknown>;
  is_active: boolean;
  connection_status: 'pending' | 'connected' | 'failed';
  last_sync_at?: string;
  last_error?: string;
  sync_enabled: boolean;
  sync_interval: number;
  sync_direction: 'inbound' | 'outbound' | 'both';
  field_mappings: Record<string, unknown>;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface IntegrationSyncLog {
  id: string;
  integration_id?: string;
  direction: 'inbound' | 'outbound';
  entity_type: string;
  entity_id?: string;
  external_id?: string;
  action: 'create' | 'update' | 'delete';
  status: 'success' | 'failed';
  error_message?: string;
  payload?: Record<string, unknown>;
  response?: Record<string, unknown>;
  created_at: string;
}

export interface IntegrationType {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  configFields: { name: string; type: string; label: string; required: boolean }[];
}

// Integrations Query Keys
export const integrationsQueryKeys = {
  apiKeys: {
    all: ['integrations', 'api-keys'] as const,
    list: (params?: Record<string, unknown>) => ['integrations', 'api-keys', 'list', params] as const,
    detail: (id: string) => ['integrations', 'api-keys', 'detail', id] as const,
  },
  webhooks: {
    all: ['integrations', 'webhooks'] as const,
    list: (params?: Record<string, unknown>) => ['integrations', 'webhooks', 'list', params] as const,
    detail: (id: string) => ['integrations', 'webhooks', 'detail', id] as const,
    deliveries: (id: string, params?: Record<string, unknown>) => ['integrations', 'webhooks', id, 'deliveries', params] as const,
    events: ['integrations', 'webhooks', 'events'] as const,
  },
  integrations: {
    all: ['integrations', 'integrations'] as const,
    list: (params?: Record<string, unknown>) => ['integrations', 'integrations', 'list', params] as const,
    detail: (id: string) => ['integrations', 'integrations', 'detail', id] as const,
    logs: (id: string, params?: Record<string, unknown>) => ['integrations', 'integrations', id, 'logs', params] as const,
    types: ['integrations', 'integrations', 'types'] as const,
  },
};

// API Keys Hooks
export function useApiKeys(params?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: integrationsQueryKeys.apiKeys.list(params),
    queryFn: () => integrationsApi.listApiKeys(params),
  });
}

export function useApiKey(id: string, options?: Omit<UseQueryOptions<ApiKey>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: integrationsQueryKeys.apiKeys.detail(id),
    queryFn: () => integrationsApi.getApiKey(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      permissions?: string[];
      rateLimit?: number;
      expiresAt?: string;
      ipWhitelist?: string[];
    }) => integrationsApi.createApiKey(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.apiKeys.all });
    },
  });
}

export function useUpdateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string | null;
        permissions?: string[];
        rateLimit?: number;
        isActive?: boolean;
        expiresAt?: string | null;
        ipWhitelist?: string[];
      };
    }) => integrationsApi.updateApiKey(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.apiKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.apiKeys.all });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.apiKeys.all });
    },
  });
}

export function useValidateApiKey() {
  return useMutation({
    mutationFn: (key: string) => integrationsApi.validateApiKey(key),
  });
}

// Webhooks Hooks
export function useWebhookEvents() {
  return useQuery({
    queryKey: integrationsQueryKeys.webhooks.events,
    queryFn: () => integrationsApi.getWebhookEvents(),
  });
}

export function useWebhooks(params?: { includeInactive?: boolean }) {
  return useQuery({
    queryKey: integrationsQueryKeys.webhooks.list(params),
    queryFn: () => integrationsApi.listWebhooks(params),
  });
}

export function useWebhook(id: string, options?: Omit<UseQueryOptions<Webhook>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: integrationsQueryKeys.webhooks.detail(id),
    queryFn: () => integrationsApi.getWebhook(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      url: string;
      secret?: string;
      events: string[];
      filters?: Record<string, unknown>;
      retryCount?: number;
      retryDelay?: number;
      timeout?: number;
      customHeaders?: Record<string, string>;
    }) => integrationsApi.createWebhook(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.webhooks.all });
    },
  });
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string | null;
        url?: string;
        secret?: string | null;
        events?: string[];
        filters?: Record<string, unknown>;
        isActive?: boolean;
        retryCount?: number;
        retryDelay?: number;
        timeout?: number;
        customHeaders?: Record<string, string>;
      };
    }) => integrationsApi.updateWebhook(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.webhooks.detail(id) });
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.webhooks.all });
    },
  });
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.webhooks.all });
    },
  });
}

export function useTestWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.testWebhook(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.webhooks.detail(id) });
    },
  });
}

export function useWebhookDeliveries(webhookId: string, params?: { status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: integrationsQueryKeys.webhooks.deliveries(webhookId, params),
    queryFn: () => integrationsApi.getWebhookDeliveries(webhookId, params),
    enabled: !!webhookId,
  });
}

// Integrations (Third-party) Hooks
export function useIntegrationTypes() {
  return useQuery({
    queryKey: integrationsQueryKeys.integrations.types,
    queryFn: () => integrationsApi.getIntegrationTypes(),
  });
}

export function useIntegrations(params?: { type?: string; includeInactive?: boolean }) {
  return useQuery({
    queryKey: integrationsQueryKeys.integrations.list(params),
    queryFn: () => integrationsApi.listIntegrations(params),
  });
}

export function useIntegration(id: string, options?: Omit<UseQueryOptions<Integration>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: integrationsQueryKeys.integrations.detail(id),
    queryFn: () => integrationsApi.getIntegration(id),
    enabled: !!id,
    ...options,
  });
}

export function useCreateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      type: string;
      description?: string;
      config?: Record<string, unknown>;
      credentials?: Record<string, unknown>;
      syncEnabled?: boolean;
      syncInterval?: number;
      syncDirection?: 'inbound' | 'outbound' | 'both';
      fieldMappings?: Record<string, unknown>;
    }) => integrationsApi.createIntegration(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.integrations.all });
    },
  });
}

export function useUpdateIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        description?: string | null;
        config?: Record<string, unknown>;
        credentials?: Record<string, unknown>;
        isActive?: boolean;
        syncEnabled?: boolean;
        syncInterval?: number;
        syncDirection?: 'inbound' | 'outbound' | 'both';
        fieldMappings?: Record<string, unknown>;
      };
    }) => integrationsApi.updateIntegration(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.integrations.detail(id) });
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.integrations.all });
    },
  });
}

export function useDeleteIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.deleteIntegration(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.integrations.all });
    },
  });
}

export function useTestIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => integrationsApi.testIntegration(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: integrationsQueryKeys.integrations.detail(id) });
    },
  });
}

export function useIntegrationLogs(integrationId: string, params?: { direction?: string; status?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: integrationsQueryKeys.integrations.logs(integrationId, params),
    queryFn: () => integrationsApi.getIntegrationLogs(integrationId, params),
    enabled: !!integrationId,
  });
}
