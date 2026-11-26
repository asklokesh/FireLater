import type { RouteSchemaMap } from './types.js';
import {
  createIssueSchema, updateIssueSchema, assignSchema, resolveSchema, statusChangeSchema, commentSchema,
  worklogSchema, issueIdParamSchema, listIssuesQuerySchema, linkProblemSchema,
} from './issues.js';

const p = { params: issueIdParamSchema };

export const issueRouteSchemas: RouteSchemaMap = {
  'GET /issues': { query: listIssuesQuerySchema },
  'GET /issues/:id': p,
  'POST /issues': { body: createIssueSchema },
  'PUT /issues/:id': { ...p, body: updateIssueSchema },
  'POST /issues/:id/assign': { ...p, body: assignSchema },
  'POST /issues/:id/escalate': p,
  'POST /issues/:id/resolve': { ...p, body: resolveSchema },
  'POST /issues/:id/close': p,
  'POST /issues/:id/reopen': p,
  'POST /issues/:id/status': { ...p, body: statusChangeSchema },
  'GET /issues/:id/comments': p,
  'POST /issues/:id/comments': { ...p, body: commentSchema },
  'GET /issues/:id/worklogs': p,
  'POST /issues/:id/worklogs': { ...p, body: worklogSchema },
  'GET /issues/:id/history': p,
  'GET /issues/:id/problem': p,
  'POST /issues/:id/problem': { ...p, body: linkProblemSchema },
  'DELETE /issues/:id/problem': p,
};
