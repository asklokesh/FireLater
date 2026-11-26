import type { RouteSchemaMap } from './types.js';
import { updateSettingsSchema } from './settings.js';

export const settingsRouteSchemas: RouteSchemaMap = {
  'PUT /settings': { body: updateSettingsSchema },
};
