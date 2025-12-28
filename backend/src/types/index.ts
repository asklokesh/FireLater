export interface PaginationParams {
  page: number;
  perPage: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  details?: Record<string, string[]>;
}

export type UserStatus = 'active' | 'inactive' | 'pending';
export type AuthProvider = 'local' | 'google' | 'okta' | 'azure_ad';
export type RoleName = 'admin' | 'manager' | 'agent' | 'requester';
export type GroupType = 'team' | 'department' | 'distribution';
export type ApplicationTier = 'P1' | 'P2' | 'P3' | 'P4';
export type ApplicationStatus = 'active' | 'inactive' | 'deprecated';
export type LifecycleStage = 'development' | 'staging' | 'production' | 'sunset';
export type Criticality = 'mission_critical' | 'business_critical' | 'business_operational' | 'administrative';
export type EnvironmentType = 'dev' | 'test' | 'staging' | 'prod';
export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'on-prem';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueSeverity = 'S1' | 'S2' | 'S3' | 'S4';
export type IssueStatus = 'new' | 'assigned' | 'in_progress' | 'pending' | 'resolved' | 'closed';
export type IssueImpact = 'widespread' | 'significant' | 'moderate' | 'minor';
export type IssueUrgency = 'immediate' | 'high' | 'medium' | 'low';
export type IssueType = 'issue' | 'problem' | 'question';
export type IssueSource = 'portal' | 'email' | 'phone' | 'monitoring' | 'api';

export type ProblemStatus = 'new' | 'assigned' | 'investigating' | 'root_cause_identified' | 'known_error' | 'resolved' | 'closed';
export type ProblemType = 'reactive' | 'proactive';
export type ProblemPriority = 'critical' | 'high' | 'medium' | 'low';
export type KnownErrorStatus = 'active' | 'workaround_available' | 'permanent_fix_planned' | 'retired';

export interface JwtPayload {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  roles: string[];
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
