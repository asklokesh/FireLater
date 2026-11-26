import { z, ZodTypeAny } from 'zod';
import * as auth from './auth.js';
import * as issues from './issues.js';
import * as requests from './requests.js';

export * from './common.js';
export * as authSchemas from './auth.js';
export * as issueSchemas from './issues.js';
export * as requestSchemas from './requests.js';

export * from './registry.js';
import { defineRoute } from './registry.js';
import './modules.js';

/** Inferred request types, e.g. InferBody<typeof createIssueSchema>. */
export type InferSchema<T extends ZodTypeAny> = z.infer<T>;
export type CreateIssueBody = z.infer<typeof issues.createIssueSchema>;
export type UpdateIssueBody = z.infer<typeof issues.updateIssueSchema>;
export type CreateRequestBody = z.infer<typeof requests.createRequestSchema>;
export type LoginBody = z.infer<typeof auth.loginSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
defineRoute('POST', '/auth/register', { body: z.union([auth.registerTenantSchema, auth.registerUserSchema]) });
defineRoute('POST', '/auth/login', { body: auth.loginSchema });
defineRoute('POST', '/auth/logout', {});
defineRoute('POST', '/auth/refresh', { body: auth.refreshSchema });
defineRoute('GET', '/auth/me', {});
defineRoute('GET', '/auth/profile', {});
defineRoute('PUT', '/auth/password', { body: auth.changePasswordSchema });
defineRoute('POST', '/auth/forgot-password', { body: auth.forgotPasswordSchema });
defineRoute('POST', '/auth/reset-password', { body: auth.resetPasswordSchema });
defineRoute('POST', '/auth/verify-email', { body: auth.verifyEmailSchema });
defineRoute('POST', '/auth/resend-verification', { body: auth.resendVerificationSchema });

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------
const issueId = { params: issues.issueIdParamSchema };
defineRoute('GET', '/issues', { query: issues.listIssuesQuerySchema });
defineRoute('GET', '/issues/categories', {});
defineRoute('POST', '/issues', { body: issues.createIssueSchema });
defineRoute('GET', '/issues/:id', issueId);
defineRoute('PUT', '/issues/:id', { ...issueId, body: issues.updateIssueSchema });
defineRoute('POST', '/issues/:id/assign', { ...issueId, body: issues.assignSchema });
defineRoute('POST', '/issues/:id/escalate', issueId);
defineRoute('POST', '/issues/:id/resolve', { ...issueId, body: issues.resolveSchema });
defineRoute('POST', '/issues/:id/close', issueId);
defineRoute('POST', '/issues/:id/reopen', issueId);
defineRoute('POST', '/issues/:id/status', { ...issueId, body: issues.statusChangeSchema });
defineRoute('GET', '/issues/:id/comments', issueId);
defineRoute('POST', '/issues/:id/comments', { ...issueId, body: issues.commentSchema });
defineRoute('GET', '/issues/:id/worklogs', issueId);
defineRoute('POST', '/issues/:id/worklogs', { ...issueId, body: issues.worklogSchema });
defineRoute('GET', '/issues/:id/history', issueId);
defineRoute('GET', '/issues/:id/problem', issueId);
defineRoute('POST', '/issues/:id/problem', { ...issueId, body: issues.linkProblemSchema });
defineRoute('DELETE', '/issues/:id/problem', issueId);

// ---------------------------------------------------------------------------
// Service requests
// ---------------------------------------------------------------------------
const requestId = { params: requests.requestIdParamSchema };
defineRoute('GET', '/requests', { query: requests.listRequestsQuerySchema });
defineRoute('GET', '/requests/my', { query: paginationOnly() });
defineRoute('GET', '/requests/assigned', { query: paginationOnly() });
defineRoute('GET', '/requests/pending-approvals', {});
defineRoute('POST', '/requests', { body: requests.createRequestSchema });
defineRoute('GET', '/requests/:id', requestId);
defineRoute('PUT', '/requests/:id', { ...requestId, body: requests.updateRequestSchema });
defineRoute('POST', '/requests/:id/assign', { ...requestId, body: requests.assignRequestSchema });
defineRoute('POST', '/requests/:id/start', requestId);
defineRoute('POST', '/requests/:id/complete', { ...requestId, body: requests.completeRequestSchema });
defineRoute('POST', '/requests/:id/cancel', { ...requestId, body: requests.cancelRequestSchema });
defineRoute('GET', '/requests/:id/approvals', requestId);
defineRoute('POST', '/requests/:id/approvals/:approvalId/approve', { params: requests.requestApprovalParamSchema, body: requests.approvalActionSchema });
defineRoute('POST', '/requests/:id/approvals/:approvalId/reject', { params: requests.requestApprovalParamSchema, body: requests.approvalActionSchema });
defineRoute('GET', '/requests/:id/comments', requestId);
defineRoute('POST', '/requests/:id/comments', { ...requestId, body: requests.addCommentSchema });
defineRoute('GET', '/requests/:id/history', requestId);

function paginationOnly(): ZodTypeAny {
  return z.object({
    page: z.coerce.number().int().positive().optional(),
    per_page: z.coerce.number().int().min(1).max(100).optional(),
  }).passthrough();
}
