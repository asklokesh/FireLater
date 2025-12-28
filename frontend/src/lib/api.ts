import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Warn if API URL is not configured in production
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
if (!process.env.NEXT_PUBLIC_API_URL && typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  console.warn('[FireLater] NEXT_PUBLIC_API_URL is not configured. API calls will default to localhost which will likely fail in production.');
}

// Create axios instance
export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Token storage
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('accessToken', token);
  } else {
    localStorage.removeItem('accessToken');
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== 'undefined') {
    accessToken = localStorage.getItem('accessToken');
  }
  return accessToken;
}

// Request interceptor to add auth header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper to get stored tenant slug
export function getTenantSlug(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('tenantSlug');
  }
  return null;
}

export function setTenantSlug(tenant: string | null) {
  if (typeof window !== 'undefined') {
    if (tenant) {
      localStorage.setItem('tenantSlug', tenant);
    } else {
      localStorage.removeItem('tenantSlug');
    }
  }
}

// Response interceptor for error handling and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // If 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && originalRequest && !originalRequest.headers['X-Retry']) {
      try {
        const tenant = getTenantSlug();
        // Backend uses httpOnly cookie for refresh token, but also accepts it in body
        // We send tenant which is required by backend
        if (tenant) {
          const response = await axios.post(
            `${API_URL}/v1/auth/refresh`,
            { tenant, refreshToken: '' }, // refreshToken will come from httpOnly cookie
            { withCredentials: true }
          );

          const { accessToken: newToken } = response.data;
          setAccessToken(newToken);

          // Retry the original request
          originalRequest.headers['X-Retry'] = 'true';
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        }
      } catch {
        // Refresh failed, logout user
        setAccessToken(null);
        setTenantSlug(null);
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

// API Types
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Auth API
export const authApi = {
  login: async (tenant: string, email: string, password: string) => {
    const response = await api.post('/v1/auth/login', { tenant, email, password });
    return response.data;
  },

  register: async (data: {
    tenantName: string;
    tenantSlug: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) => {
    const response = await api.post('/v1/auth/register', data);
    return response.data;
  },

  logout: async () => {
    try {
      await api.post('/v1/auth/logout');
    } catch {
      // Ignore logout errors - server uses httpOnly cookie
    }
    setAccessToken(null);
    localStorage.removeItem('tenantSlug');
  },

  me: async () => {
    const response = await api.get('/v1/auth/me');
    return response.data;
  },

  changePassword: async (oldPassword: string, newPassword: string) => {
    const response = await api.put('/v1/auth/password', { oldPassword, newPassword });
    return response.data;
  },

  forgotPassword: async (tenant: string, email: string) => {
    const response = await api.post('/v1/auth/forgot-password', { tenant, email });
    return response.data;
  },

  resetPassword: async (tenant: string, token: string, newPassword: string) => {
    const response = await api.post('/v1/auth/reset-password', { tenant, token, newPassword });
    return response.data;
  },

  verifyEmail: async (tenant: string, token: string) => {
    const response = await api.post('/v1/auth/verify-email', { tenant, token });
    return response.data;
  },

  resendVerification: async (tenant: string, email: string) => {
    const response = await api.post('/v1/auth/resend-verification', { tenant, email });
    return response.data;
  },
};

// Issues API
export const issuesApi = {
  list: async (params?: { page?: number; limit?: number; state?: string; assignedTo?: string }) => {
    const response = await api.get('/v1/issues', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/issues/${id}`);
    return response.data;
  },

  create: async (data: {
    title: string;
    description?: string;
    priority?: 'critical' | 'high' | 'medium' | 'low';
    severity?: 'S1' | 'S2' | 'S3' | 'S4';
    impact?: 'widespread' | 'significant' | 'moderate' | 'minor';
    urgency?: 'immediate' | 'high' | 'medium' | 'low';
    applicationId?: string;
    assignedTo?: string;
    assignedGroup?: string;
  }) => {
    const response = await api.post('/v1/issues', data);
    return response.data;
  },

  update: async (id: string, data: Partial<{
    title: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    severity: 'S1' | 'S2' | 'S3' | 'S4';
    assignedTo: string;
    assignedGroup: string;
    applicationId: string;
  }>) => {
    const response = await api.put(`/v1/issues/${id}`, data);
    return response.data;
  },

  addComment: async (id: string, content: string, isInternal: boolean = false) => {
    const response = await api.post(`/v1/issues/${id}/comments`, { content, isInternal });
    return response.data;
  },

  changeStatus: async (id: string, status: string, reason?: string) => {
    const response = await api.post(`/v1/issues/${id}/status`, { status, reason });
    return response.data;
  },

  assign: async (id: string, assignedTo?: string, assignedGroup?: string) => {
    const response = await api.post(`/v1/issues/${id}/assign`, { assignedTo, assignedGroup });
    return response.data;
  },

  resolve: async (id: string, resolutionCode: string, resolutionNotes: string) => {
    const response = await api.post(`/v1/issues/${id}/resolve`, { resolutionCode, resolutionNotes });
    return response.data;
  },

  close: async (id: string) => {
    const response = await api.post(`/v1/issues/${id}/close`);
    return response.data;
  },

  reopen: async (id: string) => {
    const response = await api.post(`/v1/issues/${id}/reopen`);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/v1/issues/${id}`);
  },

  getComments: async (id: string) => {
    const response = await api.get(`/v1/issues/${id}/comments`);
    return response.data;
  },

  // Linked Problem
  getLinkedProblem: async (id: string) => {
    const response = await api.get(`/v1/issues/${id}/problem`);
    return response.data;
  },

  linkToProblem: async (id: string, problemId: string, relationshipType?: string, notes?: string) => {
    const response = await api.post(`/v1/issues/${id}/problem`, { problemId, relationshipType, notes });
    return response.data;
  },

  unlinkFromProblem: async (id: string) => {
    await api.delete(`/v1/issues/${id}/problem`);
  },
};

// Problems API
export const problemsApi = {
  list: async (params?: {
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
  }) => {
    const response = await api.get('/v1/problems', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/problems/${id}`);
    return response.data;
  },

  create: async (data: {
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
  }) => {
    const response = await api.post('/v1/problems', data);
    return response.data;
  },

  update: async (id: string, data: Partial<{
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
  }>) => {
    const response = await api.put(`/v1/problems/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/v1/problems/${id}`);
  },

  changeStatus: async (id: string, status: string, reason?: string) => {
    const response = await api.put(`/v1/problems/${id}/status`, { status, reason });
    return response.data;
  },

  assign: async (id: string, assigneeId: string) => {
    const response = await api.post(`/v1/problems/${id}/assign`, { assigneeId });
    return response.data;
  },

  getComments: async (id: string) => {
    const response = await api.get(`/v1/problems/${id}/comments`);
    return response.data;
  },

  addComment: async (id: string, content: string, isInternal: boolean = false) => {
    const response = await api.post(`/v1/problems/${id}/comments`, { content, isInternal });
    return response.data;
  },

  getWorklogs: async (id: string) => {
    const response = await api.get(`/v1/problems/${id}/worklogs`);
    return response.data;
  },

  addWorklog: async (id: string, timeSpent: number, description: string, workType?: string) => {
    const response = await api.post(`/v1/problems/${id}/worklogs`, { timeSpent, description, workType });
    return response.data;
  },

  getLinkedIssues: async (id: string) => {
    const response = await api.get(`/v1/problems/${id}/issues`);
    return response.data;
  },

  linkIssue: async (id: string, issueId: string, relationshipType?: string, notes?: string) => {
    const response = await api.post(`/v1/problems/${id}/issues`, { issueId, relationshipType, notes });
    return response.data;
  },

  unlinkIssue: async (id: string, issueId: string) => {
    await api.delete(`/v1/problems/${id}/issues/${issueId}`);
  },

  getHistory: async (id: string) => {
    const response = await api.get(`/v1/problems/${id}/history`);
    return response.data;
  },

  convertToKnownError: async (id: string) => {
    const response = await api.post(`/v1/problems/${id}/convert-to-known-error`);
    return response.data;
  },
};

// Changes API
export const changesApi = {
  list: async (params?: { page?: number; limit?: number; status?: string; type?: string; riskLevel?: string; start_date?: string; end_date?: string }) => {
    const response = await api.get('/v1/changes', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/changes/${id}`);
    return response.data;
  },

  create: async (data: {
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
  }) => {
    const response = await api.post('/v1/changes', data);
    return response.data;
  },

  update: async (id: string, data: Partial<{
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
  }>) => {
    const response = await api.put(`/v1/changes/${id}`, data);
    return response.data;
  },

  submit: async (id: string) => {
    const response = await api.post(`/v1/changes/${id}/submit`);
    return response.data;
  },

  approve: async (id: string, comments?: string) => {
    const response = await api.post(`/v1/changes/${id}/approve`, { comments });
    return response.data;
  },

  reject: async (id: string, reason: string) => {
    const response = await api.post(`/v1/changes/${id}/reject`, { reason });
    return response.data;
  },

  schedule: async (id: string, plannedStart?: string, plannedEnd?: string) => {
    const response = await api.post(`/v1/changes/${id}/schedule`, { plannedStart, plannedEnd });
    return response.data;
  },

  start: async (id: string) => {
    const response = await api.post(`/v1/changes/${id}/start`);
    return response.data;
  },

  complete: async (id: string, outcomeNotes?: string) => {
    const response = await api.post(`/v1/changes/${id}/complete`, { outcomeNotes });
    return response.data;
  },

  fail: async (id: string, outcomeNotes: string) => {
    const response = await api.post(`/v1/changes/${id}/fail`, { outcomeNotes });
    return response.data;
  },

  rollback: async (id: string, outcomeNotes: string) => {
    const response = await api.post(`/v1/changes/${id}/rollback`, { outcomeNotes });
    return response.data;
  },

  cancel: async (id: string, reason?: string) => {
    const response = await api.delete(`/v1/changes/${id}`, { data: { reason } });
    return response.data;
  },

  getComments: async (id: string) => {
    const response = await api.get(`/v1/changes/${id}/comments`);
    return response.data;
  },

  addComment: async (id: string, content: string, isInternal: boolean = false) => {
    const response = await api.post(`/v1/changes/${id}/comments`, { content, isInternal });
    return response.data;
  },

  getApprovals: async (id: string) => {
    const response = await api.get(`/v1/changes/${id}/approvals`);
    return response.data;
  },

  getHistory: async (id: string) => {
    const response = await api.get(`/v1/changes/${id}/history`);
    return response.data;
  },

  getTasks: async (id: string) => {
    const response = await api.get(`/v1/changes/${id}/tasks`);
    return response.data;
  },
};

// Applications API
export const applicationsApi = {
  list: async (params?: { page?: number; limit?: number; tier?: string; status?: string; search?: string }) => {
    const response = await api.get('/v1/applications', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/applications/${id}`);
    return response.data;
  },

  create: async (data: {
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
  }) => {
    const response = await api.post('/v1/applications', data);
    return response.data;
  },

  update: async (id: string, data: Partial<{
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
  }>) => {
    const response = await api.put(`/v1/applications/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/v1/applications/${id}`);
  },

  getHealth: async (id: string) => {
    const response = await api.get(`/v1/applications/${id}/health`);
    return response.data;
  },
};

// Catalog API
export const catalogApi = {
  listItems: async (params?: { page?: number; limit?: number; category?: string }) => {
    const response = await api.get('/v1/catalog/items', { params });
    return response.data;
  },

  getItem: async (id: string) => {
    const response = await api.get(`/v1/catalog/items/${id}`);
    return response.data;
  },

  submitRequest: async (itemId: string, formData: Record<string, unknown>) => {
    const response = await api.post('/v1/requests', { catalogItemId: itemId, formData: formData });
    return response.data;
  },

  listRequests: async (params?: { page?: number; limit?: number; state?: string }) => {
    const response = await api.get('/v1/requests', { params });
    return response.data;
  },
};

// Service Requests API
export const requestsApi = {
  list: async (params?: { page?: number; limit?: number; status?: string; priority?: string }) => {
    const response = await api.get('/v1/requests', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/requests/${id}`);
    return response.data;
  },

  create: async (data: {
    catalogItemId: string;
    requestedForId?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    formData: Record<string, unknown>;
    notes?: string;
    costCenter?: string;
  }) => {
    const response = await api.post('/v1/requests', data);
    return response.data;
  },

  update: async (id: string, data: {
    priority?: 'low' | 'medium' | 'high' | 'critical';
    formData?: Record<string, unknown>;
    notes?: string;
    costCenter?: string;
  }) => {
    const response = await api.put(`/v1/requests/${id}`, data);
    return response.data;
  },

  assign: async (id: string, assignedTo: string) => {
    const response = await api.post(`/v1/requests/${id}/assign`, { assignedTo });
    return response.data;
  },

  start: async (id: string) => {
    const response = await api.post(`/v1/requests/${id}/start`);
    return response.data;
  },

  complete: async (id: string, notes?: string) => {
    const response = await api.post(`/v1/requests/${id}/complete`, { notes });
    return response.data;
  },

  cancel: async (id: string, reason: string) => {
    const response = await api.post(`/v1/requests/${id}/cancel`, { reason });
    return response.data;
  },

  getApprovals: async (id: string) => {
    const response = await api.get(`/v1/requests/${id}/approvals`);
    return response.data;
  },

  approve: async (id: string, approvalId: string, comments?: string) => {
    const response = await api.post(`/v1/requests/${id}/approvals/${approvalId}/approve`, { comments });
    return response.data;
  },

  reject: async (id: string, approvalId: string, comments?: string) => {
    const response = await api.post(`/v1/requests/${id}/approvals/${approvalId}/reject`, { comments });
    return response.data;
  },

  getComments: async (id: string) => {
    const response = await api.get(`/v1/requests/${id}/comments`);
    return response.data;
  },

  addComment: async (id: string, content: string, isInternal?: boolean) => {
    const response = await api.post(`/v1/requests/${id}/comments`, { content, isInternal });
    return response.data;
  },

  getHistory: async (id: string) => {
    const response = await api.get(`/v1/requests/${id}/history`);
    return response.data;
  },

  getMyRequests: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get('/v1/requests/my', { params });
    return response.data;
  },

  getAssigned: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get('/v1/requests/assigned', { params });
    return response.data;
  },
};

// Notifications API
export const notificationsApi = {
  list: async (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const response = await api.get('/v1/notifications', { params });
    return response.data;
  },

  markRead: async (id: string) => {
    const response = await api.post(`/v1/notifications/${id}/read`);
    return response.data;
  },

  markAllRead: async () => {
    const response = await api.post('/v1/notifications/mark-all-read');
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get('/v1/notifications/unread-count');
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/v1/notifications/${id}`);
  },
};

// Users API
export const usersApi = {
  list: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get('/v1/users', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/users/${id}`);
    return response.data;
  },
};

// Groups API
export const groupsApi = {
  list: async (params?: { page?: number; limit?: number; type?: string; search?: string }) => {
    const response = await api.get('/v1/groups', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/groups/${id}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    type?: 'team' | 'department' | 'distribution';
    parentId?: string;
    managerId?: string;
    email?: string;
  }) => {
    const response = await api.post('/v1/groups', data);
    return response.data;
  },

  update: async (id: string, data: {
    name?: string;
    description?: string;
    type?: 'team' | 'department' | 'distribution';
    parentId?: string | null;
    managerId?: string | null;
    email?: string;
  }) => {
    const response = await api.put(`/v1/groups/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/v1/groups/${id}`);
  },

  getMembers: async (id: string) => {
    const response = await api.get(`/v1/groups/${id}/members`);
    return response.data;
  },

  addMember: async (id: string, userId: string, role?: 'member' | 'lead') => {
    const response = await api.post(`/v1/groups/${id}/members`, { userId, role });
    return response.data;
  },

  removeMember: async (id: string, userId: string) => {
    await api.delete(`/v1/groups/${id}/members/${userId}`);
  },
};

// Roles API
export const rolesApi = {
  list: async () => {
    const response = await api.get('/v1/roles');
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/roles/${id}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    displayName: string;
    description?: string;
    permissionIds?: string[];
  }) => {
    const response = await api.post('/v1/roles', data);
    return response.data;
  },

  update: async (id: string, data: {
    displayName?: string;
    description?: string;
    permissionIds?: string[];
  }) => {
    const response = await api.put(`/v1/roles/${id}`, data);
    return response.data;
  },

  getPermissions: async () => {
    const response = await api.get('/v1/roles/permissions');
    return response.data;
  },
};

// Reports API
export const reportsApi = {
  // Templates
  listTemplates: async (params?: { page?: number; limit?: number; report_type?: string }) => {
    const response = await api.get('/v1/reports/templates', { params });
    return response.data;
  },

  getTemplate: async (id: string) => {
    const response = await api.get(`/v1/reports/templates/${id}`);
    return response.data;
  },

  createTemplate: async (data: {
    name: string;
    description?: string;
    type: string;
    queryConfig?: {
      dataSource: string;
      columns: { field: string; label: string; aggregation?: string }[];
      filters: { field: string; operator: string; value: unknown; value2?: unknown }[];
      sort?: { field: string; direction: 'asc' | 'desc' } | null;
    };
    outputFormat?: string[];
    parameters?: { name: string; type: string; defaultValue?: unknown }[];
    columns?: string[];
    filters?: Record<string, unknown>;
  }) => {
    const response = await api.post('/v1/reports/templates', data);
    return response.data;
  },

  updateTemplate: async (id: string, data: Record<string, unknown>) => {
    const response = await api.put(`/v1/reports/templates/${id}`, data);
    return response.data;
  },

  deleteTemplate: async (id: string) => {
    await api.delete(`/v1/reports/templates/${id}`);
  },

  // Executions
  execute: async (templateId: string, options?: {
    outputFormat?: string;
    dateRangeStart?: string;
    dateRangeEnd?: string;
    filters?: Record<string, unknown>;
  }) => {
    const response = await api.post('/v1/reports/execute', { templateId, ...options });
    return response.data;
  },

  preview: async (templateId: string, parameters?: Record<string, unknown>) => {
    const response = await api.post(`/v1/reports/templates/${templateId}/preview`, { parameters });
    return response.data;
  },

  listExecutions: async (params?: { templateId?: string; status?: string; page?: number; limit?: number }) => {
    const response = await api.get('/v1/reports/executions', { params: {
      template_id: params?.templateId,
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
    } });
    return response.data;
  },

  getExecution: async (executionId: string) => {
    const response = await api.get(`/v1/reports/executions/${executionId}`);
    return response.data;
  },

  // Scheduled Reports
  listSchedules: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get('/v1/reports/schedules', { params });
    return response.data;
  },

  getSchedule: async (id: string) => {
    const response = await api.get(`/v1/reports/schedules/${id}`);
    return response.data;
  },

  createSchedule: async (data: {
    templateId: string;
    name: string;
    description?: string;
    scheduleType: 'daily' | 'weekly' | 'monthly' | 'custom';
    cronExpression?: string;
    timezone?: string;
    deliveryMethod: 'email' | 'webhook' | 'slack';
    recipients: string[];
    emailSubject?: string;
    emailBody?: string;
    webhookUrl?: string;
    slackChannel?: string;
    outputFormat?: string;
    customFilters?: Record<string, unknown>;
    dateRangeType?: string;
  }) => {
    const response = await api.post('/v1/reports/schedules', data);
    return response.data;
  },

  updateSchedule: async (id: string, data: Record<string, unknown>) => {
    const response = await api.put(`/v1/reports/schedules/${id}`, data);
    return response.data;
  },

  deleteSchedule: async (id: string) => {
    await api.delete(`/v1/reports/schedules/${id}`);
  },

  // Saved Reports
  listSaved: async () => {
    const response = await api.get('/v1/reports/saved');
    return response.data;
  },

  createSaved: async (data: {
    name: string;
    description?: string;
    reportType: string;
    filters?: Record<string, unknown>;
    groupings?: string[];
    dateRangeType?: string;
    chartType?: string;
    sortBy?: string;
    sortOrder?: string;
  }) => {
    const response = await api.post('/v1/reports/saved', data);
    return response.data;
  },

  deleteSaved: async (id: string) => {
    await api.delete(`/v1/reports/saved/${id}`);
  },

  // Dashboard Widgets
  listWidgets: async () => {
    const response = await api.get('/v1/reports/widgets');
    return response.data;
  },

  createWidget: async (data: {
    widgetType: 'chart' | 'stat' | 'table' | 'list';
    title?: string;
    positionX?: number;
    positionY?: number;
    width?: number;
    height?: number;
    dataSource: string;
    filters?: Record<string, unknown>;
    refreshInterval?: number;
    chartType?: 'line' | 'bar' | 'pie' | 'donut' | 'area';
    chartConfig?: Record<string, unknown>;
    colorScheme?: string;
    showLegend?: boolean;
  }) => {
    const response = await api.post('/v1/reports/widgets', data);
    return response.data;
  },

  updateWidget: async (id: string, data: Record<string, unknown>) => {
    const response = await api.put(`/v1/reports/widgets/${id}`, data);
    return response.data;
  },

  deleteWidget: async (id: string) => {
    await api.delete(`/v1/reports/widgets/${id}`);
  },
};

// Dashboard API
export const dashboardApi = {
  getOverview: async () => {
    const response = await api.get('/v1/dashboard');
    return response.data;
  },

  getMobileSummary: async () => {
    const response = await api.get('/v1/dashboard/mobile');
    return response.data;
  },

  getIssueTrends: async (days?: number) => {
    const response = await api.get('/v1/dashboard/trends/issues', { params: { days } });
    return response.data;
  },

  getIssuesByPriority: async () => {
    const response = await api.get('/v1/dashboard/issues/by-priority');
    return response.data;
  },

  getIssuesByStatus: async () => {
    const response = await api.get('/v1/dashboard/issues/by-status');
    return response.data;
  },

  getChangeTrends: async (days?: number) => {
    const response = await api.get('/v1/dashboard/trends/changes', { params: { days } });
    return response.data;
  },

  getHealthDistribution: async () => {
    const response = await api.get('/v1/dashboard/health/distribution');
    return response.data;
  },

  getHealthByTier: async () => {
    const response = await api.get('/v1/dashboard/health/by-tier');
    return response.data;
  },

  getCriticalApplications: async (limit?: number) => {
    const response = await api.get('/v1/dashboard/health/critical', { params: { limit } });
    return response.data;
  },

  getRecentActivity: async (limit?: number) => {
    const response = await api.get('/v1/dashboard/activity', { params: { limit } });
    return response.data;
  },

  getUpcomingChanges: async (days?: number) => {
    const response = await api.get('/v1/dashboard/changes/upcoming', { params: { days } });
    return response.data;
  },

  getRequestsByItem: async (limit?: number) => {
    const response = await api.get('/v1/dashboard/requests/by-item', { params: { limit } });
    return response.data;
  },

  getSlaCompliance: async () => {
    const response = await api.get('/v1/dashboard/sla/compliance');
    return response.data;
  },

  getCloudCostTrends: async (months?: number) => {
    const response = await api.get('/v1/dashboard/cloud/costs', { params: { months } });
    return response.data;
  },
};

// Cloud API
export const cloudApi = {
  // Cloud Accounts
  listAccounts: async (params?: { page?: number; limit?: number; provider?: string; status?: string }) => {
    const response = await api.get('/v1/cloud/accounts', { params });
    return response.data;
  },

  getAccount: async (id: string) => {
    const response = await api.get(`/v1/cloud/accounts/${id}`);
    return response.data;
  },

  createAccount: async (data: {
    provider: 'aws' | 'azure' | 'gcp';
    accountId: string;
    name: string;
    description?: string;
    credentialType: 'access_key' | 'role_arn' | 'service_account';
    credentials?: Record<string, unknown>;
    roleArn?: string;
    externalId?: string;
    syncEnabled?: boolean;
    syncInterval?: number;
    regions?: string[];
  }) => {
    const response = await api.post('/v1/cloud/accounts', data);
    return response.data;
  },

  updateAccount: async (id: string, data: {
    name?: string;
    description?: string;
    credentialType?: 'access_key' | 'role_arn' | 'service_account';
    credentials?: Record<string, unknown>;
    syncEnabled?: boolean;
    syncInterval?: number;
    regions?: string[];
  }) => {
    const response = await api.put(`/v1/cloud/accounts/${id}`, data);
    return response.data;
  },

  deleteAccount: async (id: string) => {
    await api.delete(`/v1/cloud/accounts/${id}`);
  },

  testAccountConnection: async (id: string) => {
    const response = await api.post(`/v1/cloud/accounts/${id}/test`);
    return response.data;
  },

  // Cloud Resources
  listResources: async (params?: {
    page?: number;
    limit?: number;
    cloud_account_id?: string;
    resource_type?: string;
    application_id?: string;
    region?: string;
  }) => {
    const response = await api.get('/v1/cloud/resources', { params });
    return response.data;
  },

  getResourceTypes: async () => {
    const response = await api.get('/v1/cloud/resources/types');
    return response.data;
  },

  getResource: async (id: string) => {
    const response = await api.get(`/v1/cloud/resources/${id}`);
    return response.data;
  },

  mapResourceToApplication: async (id: string, applicationId: string, environmentId?: string) => {
    const response = await api.post(`/v1/cloud/resources/${id}/map`, { applicationId, environmentId });
    return response.data;
  },

  unmapResource: async (id: string) => {
    const response = await api.delete(`/v1/cloud/resources/${id}/map`);
    return response.data;
  },

  getResourcesByApplication: async (applicationId: string) => {
    const response = await api.get(`/v1/cloud/applications/${applicationId}/resources`);
    return response.data;
  },

  // Cloud Costs
  getCosts: async (params?: { page?: number; limit?: number; cloud_account_id?: string; period_type?: string }) => {
    const response = await api.get('/v1/cloud/costs', { params });
    return response.data;
  },

  getCostsByApplication: async (applicationId: string, periodType?: string) => {
    const response = await api.get(`/v1/cloud/applications/${applicationId}/costs`, { params: { period_type: periodType } });
    return response.data;
  },

  // Mapping Rules
  listMappingRules: async () => {
    const response = await api.get('/v1/cloud/mapping-rules');
    return response.data;
  },

  createMappingRule: async (data: {
    name: string;
    description?: string;
    priority?: number;
    provider?: 'aws' | 'azure' | 'gcp';
    resourceType?: string;
    tagKey: string;
    tagValuePattern?: string;
    applicationId: string;
    environmentType?: string;
  }) => {
    const response = await api.post('/v1/cloud/mapping-rules', data);
    return response.data;
  },

  deleteMappingRule: async (id: string) => {
    await api.delete(`/v1/cloud/mapping-rules/${id}`);
  },

  applyMappingRules: async () => {
    const response = await api.post('/v1/cloud/mapping-rules/apply');
    return response.data;
  },
};

// On-Call API
export const oncallApi = {
  // Schedules
  listSchedules: async (params?: { page?: number; limit?: number; group_id?: string; is_active?: boolean }) => {
    const response = await api.get('/v1/oncall/schedules', { params });
    return response.data;
  },

  getSchedule: async (id: string) => {
    const response = await api.get(`/v1/oncall/schedules/${id}`);
    return response.data;
  },

  createSchedule: async (data: {
    name: string;
    description?: string;
    timezone?: string;
    groupId?: string;
    rotationType?: 'daily' | 'weekly' | 'bi_weekly' | 'custom';
    rotationLength?: number;
    handoffTime?: string;
    handoffDay?: number;
    color?: string;
  }) => {
    const response = await api.post('/v1/oncall/schedules', data);
    return response.data;
  },

  updateSchedule: async (id: string, data: {
    name?: string;
    description?: string;
    timezone?: string;
    groupId?: string | null;
    rotationType?: 'daily' | 'weekly' | 'bi_weekly' | 'custom';
    rotationLength?: number;
    handoffTime?: string;
    handoffDay?: number;
    isActive?: boolean;
    color?: string;
  }) => {
    const response = await api.put(`/v1/oncall/schedules/${id}`, data);
    return response.data;
  },

  deleteSchedule: async (id: string) => {
    await api.delete(`/v1/oncall/schedules/${id}`);
  },

  // Rotations
  getRotations: async (scheduleId: string) => {
    const response = await api.get(`/v1/oncall/schedules/${scheduleId}/rotations`);
    return response.data;
  },

  addToRotation: async (scheduleId: string, userId: string, position?: number) => {
    const response = await api.post(`/v1/oncall/schedules/${scheduleId}/rotations`, { userId, position });
    return response.data;
  },

  updateRotationPosition: async (scheduleId: string, rotationId: string, position: number) => {
    const response = await api.put(`/v1/oncall/schedules/${scheduleId}/rotations/${rotationId}`, { position });
    return response.data;
  },

  removeFromRotation: async (scheduleId: string, rotationId: string) => {
    await api.delete(`/v1/oncall/schedules/${scheduleId}/rotations/${rotationId}`);
  },

  // Shifts
  getShifts: async (scheduleId: string, params?: { start_date?: string; end_date?: string }) => {
    const response = await api.get(`/v1/oncall/schedules/${scheduleId}/shifts`, { params });
    return response.data;
  },

  createShift: async (scheduleId: string, data: {
    userId: string;
    startTime: string;
    endTime: string;
    shiftType?: 'primary' | 'secondary';
    layer?: number;
  }) => {
    const response = await api.post(`/v1/oncall/schedules/${scheduleId}/shifts`, data);
    return response.data;
  },

  deleteShift: async (scheduleId: string, shiftId: string) => {
    await api.delete(`/v1/oncall/schedules/${scheduleId}/shifts/${shiftId}`);
  },

  // Overrides
  createOverride: async (scheduleId: string, data: {
    userId: string;
    startTime: string;
    endTime: string;
    reason?: string;
    originalUserId?: string;
  }) => {
    const response = await api.post(`/v1/oncall/schedules/${scheduleId}/override`, data);
    return response.data;
  },

  // Schedule Applications
  getScheduleApplications: async (scheduleId: string) => {
    const response = await api.get(`/v1/oncall/schedules/${scheduleId}/applications`);
    return response.data;
  },

  linkScheduleToApplication: async (scheduleId: string, applicationId: string) => {
    await api.post(`/v1/oncall/schedules/${scheduleId}/applications`, { applicationId });
  },

  unlinkScheduleFromApplication: async (scheduleId: string, applicationId: string) => {
    await api.delete(`/v1/oncall/schedules/${scheduleId}/applications/${applicationId}`);
  },

  // Who is On Call
  whoIsOnCall: async (params?: { schedule_id?: string; application_id?: string }) => {
    const response = await api.get('/v1/oncall/who-is-on-call', { params });
    return response.data;
  },

  // Escalation Policies
  listPolicies: async (params?: { page?: number; limit?: number }) => {
    const response = await api.get('/v1/oncall/escalation-policies', { params });
    return response.data;
  },

  getPolicy: async (id: string) => {
    const response = await api.get(`/v1/oncall/escalation-policies/${id}`);
    return response.data;
  },

  createPolicy: async (data: {
    name: string;
    description?: string;
    repeatCount?: number;
    repeatDelayMinutes?: number;
    isDefault?: boolean;
  }) => {
    const response = await api.post('/v1/oncall/escalation-policies', data);
    return response.data;
  },

  updatePolicy: async (id: string, data: {
    name?: string;
    description?: string;
    repeatCount?: number;
    repeatDelayMinutes?: number;
    isDefault?: boolean;
    isActive?: boolean;
  }) => {
    const response = await api.put(`/v1/oncall/escalation-policies/${id}`, data);
    return response.data;
  },

  deletePolicy: async (id: string) => {
    await api.delete(`/v1/oncall/escalation-policies/${id}`);
  },

  // Policy Steps
  getPolicySteps: async (policyId: string) => {
    const response = await api.get(`/v1/oncall/escalation-policies/${policyId}/steps`);
    return response.data;
  },

  addPolicyStep: async (policyId: string, data: {
    stepNumber?: number;
    delayMinutes?: number;
    notifyType: 'schedule' | 'user' | 'group';
    scheduleId?: string;
    userId?: string;
    groupId?: string;
    notificationChannels?: ('email' | 'sms' | 'slack' | 'phone')[];
  }) => {
    const response = await api.post(`/v1/oncall/escalation-policies/${policyId}/steps`, data);
    return response.data;
  },

  updatePolicyStep: async (policyId: string, stepId: string, data: {
    stepNumber?: number;
    delayMinutes?: number;
    notifyType?: 'schedule' | 'user' | 'group';
    scheduleId?: string;
    userId?: string;
    groupId?: string;
    notificationChannels?: ('email' | 'sms' | 'slack' | 'phone')[];
  }) => {
    const response = await api.put(`/v1/oncall/escalation-policies/${policyId}/steps/${stepId}`, data);
    return response.data;
  },

  deletePolicyStep: async (policyId: string, stepId: string) => {
    await api.delete(`/v1/oncall/escalation-policies/${policyId}/steps/${stepId}`);
  },
};

// Knowledge Base API
export const kbApi = {
  // Articles
  listArticles: async (params?: {
    page?: number;
    limit?: number;
    status?: 'draft' | 'review' | 'published' | 'archived';
    type?: 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error';
    visibility?: 'public' | 'internal' | 'restricted';
    categoryId?: string;
    authorId?: string;
    search?: string;
    tag?: string;
    publishedOnly?: boolean;
  }) => {
    const response = await api.get('/v1/kb', { params });
    return response.data;
  },

  getArticle: async (id: string) => {
    const response = await api.get(`/v1/kb/${id}`);
    return response.data;
  },

  getArticleBySlug: async (slug: string) => {
    const response = await api.get(`/v1/kb/slug/${slug}`);
    return response.data;
  },

  searchArticles: async (query: string, params?: { page?: number; limit?: number }) => {
    const response = await api.get('/v1/kb/search', { params: { q: query, ...params } });
    return response.data;
  },

  createArticle: async (data: {
    title: string;
    content: string;
    summary?: string;
    type?: 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error';
    visibility?: 'public' | 'internal' | 'restricted';
    categoryId?: string;
    tags?: string[];
    keywords?: string[];
    relatedProblemId?: string;
    relatedIssueId?: string;
  }) => {
    const response = await api.post('/v1/kb', data);
    return response.data;
  },

  updateArticle: async (id: string, data: {
    title?: string;
    content?: string;
    summary?: string;
    type?: 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error';
    visibility?: 'public' | 'internal' | 'restricted';
    categoryId?: string | null;
    tags?: string[];
    keywords?: string[];
  }) => {
    const response = await api.put(`/v1/kb/${id}`, data);
    return response.data;
  },

  deleteArticle: async (id: string) => {
    await api.delete(`/v1/kb/${id}`);
  },

  // Article Status
  submitForReview: async (id: string) => {
    const response = await api.post(`/v1/kb/${id}/submit-for-review`);
    return response.data;
  },

  publishArticle: async (id: string) => {
    const response = await api.post(`/v1/kb/${id}/publish`);
    return response.data;
  },

  archiveArticle: async (id: string) => {
    const response = await api.post(`/v1/kb/${id}/archive`);
    return response.data;
  },

  revertToDraft: async (id: string) => {
    const response = await api.post(`/v1/kb/${id}/revert-to-draft`);
    return response.data;
  },

  // Feedback
  submitFeedback: async (id: string, isHelpful: boolean, comment?: string) => {
    const response = await api.post(`/v1/kb/${id}/feedback`, { isHelpful, comment });
    return response.data;
  },

  // History
  getArticleHistory: async (id: string) => {
    const response = await api.get(`/v1/kb/${id}/history`);
    return response.data;
  },

  // Linking
  linkArticle: async (id: string, data: { problemId?: string; issueId?: string }) => {
    const response = await api.post(`/v1/kb/${id}/link`, data);
    return response.data;
  },

  // Categories
  listCategories: async () => {
    const response = await api.get('/v1/kb/categories');
    return response.data;
  },

  createCategory: async (data: {
    name: string;
    description?: string;
    parentId?: string;
    icon?: string;
    sortOrder?: number;
  }) => {
    const response = await api.post('/v1/kb/categories', data);
    return response.data;
  },

  updateCategory: async (id: string, data: {
    name?: string;
    description?: string;
    parentId?: string | null;
    icon?: string;
    sortOrder?: number;
  }) => {
    const response = await api.put(`/v1/kb/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: string) => {
    await api.delete(`/v1/kb/categories/${id}`);
  },

  // Related articles
  getArticlesForProblem: async (problemId: string) => {
    const response = await api.get(`/v1/kb/problem/${problemId}`);
    return response.data;
  },

  getArticlesForIssue: async (issueId: string) => {
    const response = await api.get(`/v1/kb/issue/${issueId}`);
    return response.data;
  },
};

// Settings API
export const settingsApi = {
  get: async () => {
    const response = await api.get('/v1/settings');
    return response.data;
  },

  update: async (data: {
    name?: string;
    billingEmail?: string;
    settings?: Record<string, unknown>;
  }) => {
    const response = await api.put('/v1/settings', data);
    return response.data;
  },
};

// SLA API
export const slaApi = {
  // Policies
  listPolicies: async (params?: { entityType?: string; isActive?: boolean }) => {
    const searchParams = new URLSearchParams();
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    if (params?.isActive !== undefined) searchParams.append('isActive', String(params.isActive));
    const response = await api.get(`/v1/sla/policies?${searchParams.toString()}`);
    return response.data;
  },

  getPolicy: async (id: string) => {
    const response = await api.get(`/v1/sla/policies/${id}`);
    return response.data;
  },

  createPolicy: async (data: {
    name: string;
    description?: string;
    entityType: 'issue' | 'problem' | 'change';
    isDefault?: boolean;
    targets?: {
      metricType: 'response_time' | 'resolution_time';
      priority: 'critical' | 'high' | 'medium' | 'low';
      targetMinutes: number;
      warningThresholdPercent?: number;
    }[];
  }) => {
    const response = await api.post('/v1/sla/policies', data);
    return response.data;
  },

  updatePolicy: async (id: string, data: {
    name?: string;
    description?: string;
    isDefault?: boolean;
    isActive?: boolean;
  }) => {
    const response = await api.patch(`/v1/sla/policies/${id}`, data);
    return response.data;
  },

  deletePolicy: async (id: string) => {
    await api.delete(`/v1/sla/policies/${id}`);
  },

  // Targets
  createTarget: async (policyId: string, data: {
    metricType: 'response_time' | 'resolution_time';
    priority: 'critical' | 'high' | 'medium' | 'low';
    targetMinutes: number;
    warningThresholdPercent?: number;
  }) => {
    const response = await api.post(`/v1/sla/policies/${policyId}/targets`, data);
    return response.data;
  },

  updateTarget: async (id: string, data: {
    targetMinutes?: number;
    warningThresholdPercent?: number;
  }) => {
    const response = await api.patch(`/v1/sla/targets/${id}`, data);
    return response.data;
  },

  deleteTarget: async (id: string) => {
    await api.delete(`/v1/sla/targets/${id}`);
  },

  // Stats
  getStats: async (params?: { entityType?: 'issue' | 'problem'; startDate?: string; endDate?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    const response = await api.get(`/v1/sla/stats?${searchParams.toString()}`);
    return response.data;
  },

  // Config
  getConfig: async (entityType?: 'issue' | 'problem') => {
    const searchParams = new URLSearchParams();
    if (entityType) searchParams.append('entityType', entityType);
    const response = await api.get(`/v1/sla/config?${searchParams.toString()}`);
    return response.data;
  },
};

// Asset API
export const assetApi = {
  // Assets
  list: async (params?: {
    page?: number;
    limit?: number;
    assetType?: 'hardware' | 'software' | 'network' | 'cloud' | 'virtual' | 'other';
    category?: string;
    status?: 'active' | 'inactive' | 'maintenance' | 'retired' | 'disposed' | 'ordered' | 'in_storage';
    search?: string;
    ownerId?: string;
    assignedToId?: string;
    department?: string;
  }) => {
    const response = await api.get('/v1/assets', { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/v1/assets/${id}`);
    return response.data;
  },

  create: async (data: {
    name: string;
    description?: string;
    assetType: 'hardware' | 'software' | 'network' | 'cloud' | 'virtual' | 'other';
    category: string;
    status?: 'active' | 'inactive' | 'maintenance' | 'retired' | 'disposed' | 'ordered' | 'in_storage';
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
  }) => {
    const response = await api.post('/v1/assets', data);
    return response.data;
  },

  update: async (id: string, data: {
    name?: string;
    description?: string | null;
    status?: 'active' | 'inactive' | 'maintenance' | 'retired' | 'disposed' | 'ordered' | 'in_storage';
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
  }) => {
    const response = await api.patch(`/v1/assets/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/v1/assets/${id}`);
  },

  // Relationships
  getRelationships: async (id: string) => {
    const response = await api.get(`/v1/assets/${id}/relationships`);
    return response.data;
  },

  createRelationship: async (id: string, data: { childAssetId: string; relationshipType: string }) => {
    const response = await api.post(`/v1/assets/${id}/relationships`, data);
    return response.data;
  },

  deleteRelationship: async (relationshipId: string) => {
    await api.delete(`/v1/assets/relationships/${relationshipId}`);
  },

  // Issue Links
  getIssues: async (id: string) => {
    const response = await api.get(`/v1/assets/${id}/issues`);
    return response.data;
  },

  linkToIssue: async (id: string, issueId: string) => {
    const response = await api.post(`/v1/assets/${id}/issues/${issueId}`);
    return response.data;
  },

  unlinkFromIssue: async (id: string, issueId: string) => {
    await api.delete(`/v1/assets/${id}/issues/${issueId}`);
  },

  // Change Links
  getChanges: async (id: string) => {
    const response = await api.get(`/v1/assets/${id}/changes`);
    return response.data;
  },

  // Stats
  getStats: async () => {
    const response = await api.get('/v1/assets/stats/overview');
    return response.data;
  },
};

// Workflow API
export const workflowApi = {
  // Rules
  listRules: async (params?: {
    entityType?: 'issue' | 'problem' | 'change' | 'request';
    triggerType?: 'on_create' | 'on_update' | 'on_status_change' | 'on_assignment' | 'scheduled';
    isActive?: boolean;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    if (params?.triggerType) searchParams.append('triggerType', params.triggerType);
    if (params?.isActive !== undefined) searchParams.append('isActive', String(params.isActive));
    const response = await api.get(`/v1/workflows/rules?${searchParams.toString()}`);
    return response.data;
  },

  getRule: async (id: string) => {
    const response = await api.get(`/v1/workflows/rules/${id}`);
    return response.data;
  },

  createRule: async (data: {
    name: string;
    description?: string;
    entityType: 'issue' | 'problem' | 'change' | 'request';
    triggerType: 'on_create' | 'on_update' | 'on_status_change' | 'on_assignment' | 'scheduled';
    isActive?: boolean;
    conditions: {
      field: string;
      operator: string;
      value: string | number | boolean | string[];
      logical_operator?: 'AND' | 'OR';
    }[];
    actions: {
      action_type: string;
      parameters: Record<string, unknown>;
      order: number;
    }[];
    executionOrder?: number;
    stopOnMatch?: boolean;
  }) => {
    const response = await api.post('/v1/workflows/rules', data);
    return response.data;
  },

  updateRule: async (id: string, data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    conditions?: {
      field: string;
      operator: string;
      value: string | number | boolean | string[];
      logical_operator?: 'AND' | 'OR';
    }[];
    actions?: {
      action_type: string;
      parameters: Record<string, unknown>;
      order: number;
    }[];
    executionOrder?: number;
    stopOnMatch?: boolean;
  }) => {
    const response = await api.patch(`/v1/workflows/rules/${id}`, data);
    return response.data;
  },

  deleteRule: async (id: string) => {
    await api.delete(`/v1/workflows/rules/${id}`);
  },

  toggleRule: async (id: string) => {
    const response = await api.post(`/v1/workflows/rules/${id}/toggle`);
    return response.data;
  },

  testRule: async (id: string, entityData: Record<string, unknown>) => {
    const response = await api.post(`/v1/workflows/rules/${id}/test`, { entityData });
    return response.data;
  },

  // Execution Logs
  getLogs: async (params?: {
    ruleId?: string;
    entityType?: 'issue' | 'problem' | 'change' | 'request';
    entityId?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.ruleId) searchParams.append('ruleId', params.ruleId);
    if (params?.entityType) searchParams.append('entityType', params.entityType);
    if (params?.entityId) searchParams.append('entityId', params.entityId);
    if (params?.page) searchParams.append('page', String(params.page));
    if (params?.limit) searchParams.append('limit', String(params.limit));
    const response = await api.get(`/v1/workflows/logs?${searchParams.toString()}`);
    return response.data;
  },

  // Fields and Actions metadata
  getFields: async (entityType: string) => {
    const response = await api.get(`/v1/workflows/fields/${entityType}`);
    return response.data;
  },

  getActions: async (entityType: string) => {
    const response = await api.get(`/v1/workflows/actions/${entityType}`);
    return response.data;
  },
};

// Integrations API (Webhooks, API Keys, Third-party Integrations)
export const integrationsApi = {
  // Metadata
  getWebhookEvents: async () => {
    const response = await api.get('/v1/integrations/webhooks/events');
    return response.data;
  },

  getIntegrationTypes: async () => {
    const response = await api.get('/v1/integrations/integrations/types');
    return response.data;
  },

  // API Keys
  listApiKeys: async (params?: { includeInactive?: boolean }) => {
    const response = await api.get('/v1/integrations/api-keys', { params });
    return response.data;
  },

  getApiKey: async (id: string) => {
    const response = await api.get(`/v1/integrations/api-keys/${id}`);
    return response.data;
  },

  createApiKey: async (data: {
    name: string;
    description?: string;
    permissions?: string[];
    rateLimit?: number;
    expiresAt?: string;
    ipWhitelist?: string[];
  }) => {
    const response = await api.post('/v1/integrations/api-keys', data);
    return response.data;
  },

  updateApiKey: async (id: string, data: {
    name?: string;
    description?: string | null;
    permissions?: string[];
    rateLimit?: number;
    isActive?: boolean;
    expiresAt?: string | null;
    ipWhitelist?: string[];
  }) => {
    const response = await api.patch(`/v1/integrations/api-keys/${id}`, data);
    return response.data;
  },

  deleteApiKey: async (id: string) => {
    await api.delete(`/v1/integrations/api-keys/${id}`);
  },

  validateApiKey: async (key: string) => {
    const response = await api.post('/v1/integrations/api-keys/validate', { key });
    return response.data;
  },

  // Webhooks
  listWebhooks: async (params?: { includeInactive?: boolean }) => {
    const response = await api.get('/v1/integrations/webhooks', { params });
    return response.data;
  },

  getWebhook: async (id: string) => {
    const response = await api.get(`/v1/integrations/webhooks/${id}`);
    return response.data;
  },

  createWebhook: async (data: {
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
  }) => {
    const response = await api.post('/v1/integrations/webhooks', data);
    return response.data;
  },

  updateWebhook: async (id: string, data: {
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
  }) => {
    const response = await api.patch(`/v1/integrations/webhooks/${id}`, data);
    return response.data;
  },

  deleteWebhook: async (id: string) => {
    await api.delete(`/v1/integrations/webhooks/${id}`);
  },

  testWebhook: async (id: string) => {
    const response = await api.post(`/v1/integrations/webhooks/${id}/test`);
    return response.data;
  },

  getWebhookDeliveries: async (id: string, params?: { status?: string; page?: number; limit?: number }) => {
    const response = await api.get(`/v1/integrations/webhooks/${id}/deliveries`, { params });
    return response.data;
  },

  // Integrations (Third-party)
  listIntegrations: async (params?: { type?: string; includeInactive?: boolean }) => {
    const response = await api.get('/v1/integrations/integrations', { params });
    return response.data;
  },

  getIntegration: async (id: string) => {
    const response = await api.get(`/v1/integrations/integrations/${id}`);
    return response.data;
  },

  createIntegration: async (data: {
    name: string;
    type: string;
    description?: string;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    syncEnabled?: boolean;
    syncInterval?: number;
    syncDirection?: 'inbound' | 'outbound' | 'both';
    fieldMappings?: Record<string, unknown>;
  }) => {
    const response = await api.post('/v1/integrations/integrations', data);
    return response.data;
  },

  updateIntegration: async (id: string, data: {
    name?: string;
    description?: string | null;
    config?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
    isActive?: boolean;
    syncEnabled?: boolean;
    syncInterval?: number;
    syncDirection?: 'inbound' | 'outbound' | 'both';
    fieldMappings?: Record<string, unknown>;
  }) => {
    const response = await api.patch(`/v1/integrations/integrations/${id}`, data);
    return response.data;
  },

  deleteIntegration: async (id: string) => {
    await api.delete(`/v1/integrations/integrations/${id}`);
  },

  testIntegration: async (id: string) => {
    const response = await api.post(`/v1/integrations/integrations/${id}/test`);
    return response.data;
  },

  getIntegrationLogs: async (id: string, params?: { direction?: string; status?: string; page?: number; limit?: number }) => {
    const response = await api.get(`/v1/integrations/integrations/${id}/logs`, { params });
    return response.data;
  },
};

// Email Integration API
export const emailApi = {
  // Configs
  listConfigs: async () => {
    const response = await api.get('/v1/email/configs');
    return response.data;
  },

  getConfig: async (id: string) => {
    const response = await api.get(`/v1/email/configs/${id}`);
    return response.data;
  },

  createConfig: async (data: {
    name: string;
    emailAddress: string;
    provider: 'sendgrid' | 'mailgun' | 'postmark' | 'smtp';
    defaultPriority?: 'low' | 'medium' | 'high' | 'critical';
    defaultApplicationId?: string;
    defaultAssignedGroup?: string;
    autoReplyEnabled?: boolean;
    autoReplyTemplate?: string;
    spamFilterEnabled?: boolean;
    allowedDomains?: string[];
    blockedDomains?: string[];
  }) => {
    const response = await api.post('/v1/email/configs', data);
    return response.data;
  },

  updateConfig: async (id: string, data: {
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
  }) => {
    const response = await api.patch(`/v1/email/configs/${id}`, data);
    return response.data;
  },

  deleteConfig: async (id: string) => {
    await api.delete(`/v1/email/configs/${id}`);
  },

  // Logs
  getLogs: async (params?: {
    configId?: string;
    action?: string;
    success?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await api.get('/v1/email/logs', { params });
    return response.data;
  },

  // Test
  testEmail: async (to: string, subject?: string, body?: string) => {
    const response = await api.post('/v1/email/test', { to, subject, body });
    return response.data;
  },

  // Webhook URLs
  getWebhookUrls: async () => {
    const response = await api.get('/v1/email/webhook-urls');
    return response.data;
  },
};

export default api;
