import type { RouteSchemaMap } from './types.js';
import { createIntegrationSchema, updateApiKeySchema, updateIntegrationSchema, updateWebhookSchema } from './integrations.js';

export const integrationsRouteSchemas: RouteSchemaMap = {
  'PATCH /integrations/api-keys/:id': { body: updateApiKeySchema },
  'PATCH /integrations/webhooks/:id': { body: updateWebhookSchema },
  'POST /integrations': { body: createIntegrationSchema },
  'PATCH /integrations/:id': { body: updateIntegrationSchema },
};
