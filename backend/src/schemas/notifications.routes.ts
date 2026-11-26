import type { RouteSchemaMap } from './types.js';
import { channelIdParamSchema, createChannelSchema, listNotificationsQuerySchema, notificationIdParamSchema, templateParamSchema, updateChannelSchema, updatePreferenceSchema, updateTemplateSchema } from './notifications.js';

export const notificationsRouteSchemas: RouteSchemaMap = {
  'GET /notifications': { query: listNotificationsQuerySchema },
  'POST /notifications/:id/read': { params: notificationIdParamSchema },
  'DELETE /notifications/:id': { params: notificationIdParamSchema },
  'PUT /notifications/preferences': { body: updatePreferenceSchema },
  'POST /notifications/channels': { body: createChannelSchema },
  'PUT /notifications/channels/:id': { body: updateChannelSchema, params: channelIdParamSchema },
  'PUT /notifications/templates/:eventType/:channelType': { body: updateTemplateSchema, params: templateParamSchema },
};
