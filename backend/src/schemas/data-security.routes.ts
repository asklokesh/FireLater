import type { RouteSchemaMap } from './types.js';
import { addClassificationSchema, unmaskSchema, updateSettingsSchema } from './data-security.js';

export const dataSecurityRouteSchemas: RouteSchemaMap = {
  'PUT /data-security/settings': { body: updateSettingsSchema },
  'POST /data-security/classifications': { body: addClassificationSchema },
  'POST /data-security/unmask': { body: unmaskSchema },
};
