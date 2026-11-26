import type { RouteSchemaMap } from './types.js';
import {
  createRequestSchema, updateRequestSchema, assignRequestSchema, approvalActionSchema, cancelRequestSchema,
  completeRequestSchema, addCommentSchema, requestIdParamSchema, requestApprovalParamSchema, listRequestsQuerySchema,
} from './requests.js';

const p = { params: requestIdParamSchema };
const ap = { params: requestApprovalParamSchema };

export const requestRouteSchemas: RouteSchemaMap = {
  'GET /requests': { query: listRequestsQuerySchema },
  'GET /requests/:id': p,
  'POST /requests': { body: createRequestSchema },
  'PUT /requests/:id': { ...p, body: updateRequestSchema },
  'POST /requests/:id/assign': { ...p, body: assignRequestSchema },
  'POST /requests/:id/start': p,
  'POST /requests/:id/complete': { ...p, body: completeRequestSchema },
  'POST /requests/:id/cancel': { ...p, body: cancelRequestSchema },
  'GET /requests/:id/approvals': p,
  'POST /requests/:id/approvals/:approvalId/approve': { ...ap, body: approvalActionSchema },
  'POST /requests/:id/approvals/:approvalId/reject': { ...ap, body: approvalActionSchema },
  'GET /requests/:id/comments': p,
  'POST /requests/:id/comments': { ...p, body: addCommentSchema },
  'GET /requests/:id/history': p,
};
