import type { RouteSchemaMap } from './types.js';
import { emailConfigSchema, genericInboundSchema, mailgunInboundSchema, sendgridInboundSchema, updateEmailConfigSchema } from './email.js';

export const emailRouteSchemas: RouteSchemaMap = {
  'POST /email/webhook/sendgrid/:tenantSlug': { body: sendgridInboundSchema },
  'POST /email/webhook/mailgun/:tenantSlug': { body: mailgunInboundSchema },
  'POST /email/webhook/inbound/:tenantSlug': { body: genericInboundSchema },
  'POST /email/configs': { body: emailConfigSchema },
  'PATCH /email/configs/:id': { body: updateEmailConfigSchema },
};
