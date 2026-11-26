import type { RouteSchemaMap } from './types.js';
import { createArticleSchema, updateArticleSchema } from './knowledge.js';

export const knowledgeRouteSchemas: RouteSchemaMap = {
  'POST /kb': { body: createArticleSchema },
  'PUT /kb/:articleId': { body: updateArticleSchema },
};
