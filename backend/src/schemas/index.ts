/**
 * Central schema registry.
 *
 * Every endpoint's validation rules live under backend/src/schemas and are registered here, keyed by
 * "METHOD /path" (path without the /v1 version prefix, Fastify ':param' syntax, no trailing slash).
 * Routes missing from the registry still get the baseline validation applied by the middleware
 * (see middleware/validation.ts), so every route is covered.
 */
import type { z } from 'zod';
import type { RouteSchema, RouteSchemaMap } from './types.js';
import { authRouteSchemas } from './auth.routes.js';
import { userRouteSchemas } from './users.routes.js';
import { issueRouteSchemas } from './issues.routes.js';
import { requestRouteSchemas } from './requests.routes.js';
import { applicationsRouteSchemas } from './applications.routes.js';
import { assetsRouteSchemas } from './assets.routes.js';
import { bulkRouteSchemas } from './bulk.routes.js';
import { catalogRouteSchemas } from './catalog.routes.js';
import { changesRouteSchemas } from './changes.routes.js';
import { cloudRouteSchemas } from './cloud.routes.js';
import { complianceReportsRouteSchemas } from './compliance-reports.routes.js';
import { dataSecurityRouteSchemas } from './data-security.routes.js';
import { emailRouteSchemas } from './email.routes.js';
import { emergencyChangeRouteSchemas } from './emergency-change.routes.js';
import { groupsRouteSchemas } from './groups.routes.js';
import { healthRouteSchemas } from './health.routes.js';
import { integrationsRouteSchemas } from './integrations.routes.js';
import { knowledgeRouteSchemas } from './knowledge.routes.js';
import { notificationsRouteSchemas } from './notifications.routes.js';
import { oncallRouteSchemas } from './oncall.routes.js';
import { pamRouteSchemas } from './pam.routes.js';
import { problemsRouteSchemas } from './problems.routes.js';
import { regulatorySlaRouteSchemas } from './regulatory-sla.routes.js';
import { reportingRouteSchemas } from './reporting.routes.js';
import { rolesRouteSchemas } from './roles.routes.js';
import { settingsRouteSchemas } from './settings.routes.js';
import { slaRouteSchemas } from './sla.routes.js';
import { workflowRouteSchemas } from './workflow.routes.js';
import { remainingRouteSchemas } from './remaining.routes.js';
import { migrationRouteSchemas } from './migration.routes.js';
import type { createUserSchema, updateUserSchema } from './users.js';
import type { createIssueSchema } from './issues.js';
import type { createRequestSchema } from './requests.js';
import type { loginSchema } from './auth.js';

export * from './types.js';
export * from './common.js';

export const schemaRegistry: RouteSchemaMap = {
  ...authRouteSchemas,
  ...userRouteSchemas,
  ...issueRouteSchemas,
  ...requestRouteSchemas,
  ...migrationRouteSchemas,
  ...applicationsRouteSchemas,
  ...assetsRouteSchemas,
  ...bulkRouteSchemas,
  ...catalogRouteSchemas,
  ...changesRouteSchemas,
  ...cloudRouteSchemas,
  ...complianceReportsRouteSchemas,
  ...dataSecurityRouteSchemas,
  ...emailRouteSchemas,
  ...emergencyChangeRouteSchemas,
  ...groupsRouteSchemas,
  ...healthRouteSchemas,
  ...integrationsRouteSchemas,
  ...knowledgeRouteSchemas,
  ...notificationsRouteSchemas,
  ...oncallRouteSchemas,
  ...pamRouteSchemas,
  ...problemsRouteSchemas,
  ...regulatorySlaRouteSchemas,
  ...reportingRouteSchemas,
  ...rolesRouteSchemas,
  ...settingsRouteSchemas,
  ...slaRouteSchemas,
  ...workflowRouteSchemas,
  // Spread first-wins is not used: remaining only contains keys absent above.
  ...remainingRouteSchemas,
};

/** Normalise a Fastify route url to a registry path: strip /v1 prefix and trailing slash. */
export function normalizeRoutePath(url: string): string {
  let path = url.split('?')[0].replace(/^\/v1(?=\/|$)/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

export function registryKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${normalizeRoutePath(url)}`;
}

/**
 * Fastify expands an optional trailing param (`/x/:p?`) into `/x` and `/x/:p`; index those variants too
 * so the registry entry declared with the `?` applies to both.
 */
const optionalParamIndex = new Map<string, RouteSchema>();
for (const [key, value] of Object.entries(schemaRegistry)) {
  const m = key.match(/^(\w+) (.*)\/:(\w+)\?$/);
  if (m) {
    optionalParamIndex.set(`${m[1]} ${m[2] || '/'}`, value);
    optionalParamIndex.set(`${m[1]} ${m[2]}/:${m[3]}`, value);
  }
}

export function getRouteSchema(method: string, url: string): RouteSchema | undefined {
  const key = registryKey(method, url);
  return schemaRegistry[key] ?? optionalParamIndex.get(key);
}

/** Infer the parsed type of a schema: `type Body = Infer<typeof createUserSchema>`. */
export type Infer<T extends z.ZodTypeAny> = z.infer<T>;

export type CreateUserBody = z.infer<typeof createUserSchema>;
export type UpdateUserBody = z.infer<typeof updateUserSchema>;
export type CreateIssueBody = z.infer<typeof createIssueSchema>;
export type CreateRequestBody = z.infer<typeof createRequestSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
