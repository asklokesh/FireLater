import type { RouteSchemaMap } from './types.js';
import { assignSchema, commentSchema, createProblemSchema, linkIssueSchema, listProblemsQuerySchema, problemIdParamSchema, problemIssueParamSchema, statusChangeSchema, updateProblemSchema, worklogSchema } from './problems.js';

export const problemsRouteSchemas: RouteSchemaMap = {
  'GET /problems': { query: listProblemsQuerySchema },
  'GET /problems/:id': { params: problemIdParamSchema },
  'POST /problems': { body: createProblemSchema },
  'PUT /problems/:id': { body: updateProblemSchema, params: problemIdParamSchema },
  'DELETE /problems/:id': { params: problemIdParamSchema },
  'PUT /problems/:id/status': { body: statusChangeSchema, params: problemIdParamSchema },
  'POST /problems/:id/assign': { body: assignSchema, params: problemIdParamSchema },
  'GET /problems/:id/comments': { params: problemIdParamSchema },
  'POST /problems/:id/comments': { body: commentSchema, params: problemIdParamSchema },
  'GET /problems/:id/worklogs': { params: problemIdParamSchema },
  'POST /problems/:id/worklogs': { body: worklogSchema, params: problemIdParamSchema },
  'GET /problems/:id/issues': { params: problemIdParamSchema },
  'POST /problems/:id/issues': { body: linkIssueSchema, params: problemIdParamSchema },
  'DELETE /problems/:id/issues/:issueId': { params: problemIssueParamSchema },
  'GET /problems/:id/history': { params: problemIdParamSchema },
  'POST /problems/:id/convert-to-known-error': { params: problemIdParamSchema },
};
