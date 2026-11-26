import { ZodTypeAny } from 'zod';

export interface RouteRateLimit {
  max: number;
  timeWindowMs: number;
}

export interface RouteSchema {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  rateLimit?: RouteRateLimit;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const registry = new Map<string, RouteSchema>();

/** Normalise a route URL to registry form: no /v1 prefix and no trailing slash. */
export function normalizeRoutePath(url: string): string {
  let path = url.split('?')[0] ?? '';
  path = path.replace(/^\/v1(?=\/|$)/, '');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

export function routeKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${normalizeRoutePath(url)}`;
}

/** Register the schema for a route. Path uses Fastify syntax without the /v1 prefix, e.g. '/issues/:id'. */
export function defineRoute(method: Method | Method[], path: string, schema: RouteSchema): void {
  for (const m of Array.isArray(method) ? method : [method]) {
    registry.set(routeKey(m, path), schema);
  }
}

export function getRouteSchema(method: string, url: string): RouteSchema | undefined {
  return registry.get(routeKey(method, url));
}

export function listRegisteredRoutes(): string[] {
  return [...registry.keys()];
}

