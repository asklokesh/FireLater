/**
 * Optional search backend adapter interface.
 *
 * PostgreSQL full-text search is the default and only bundled implementation.
 * An Elasticsearch adapter is optional and not shipped: no Elasticsearch client
 * is a dependency. Deployments that need one can implement SearchAdapter and
 * gate it with ELASTICSEARCH_ENABLED=true and ELASTICSEARCH_URL. When the flag
 * is unset, or no external adapter is registered, the fallback is PostgreSQL.
 */
import type { SearchParams } from './search.js';

export interface SearchAdapter {
  name: string;
  search(tenantSlug: string, params: SearchParams): Promise<{ ids: string[]; total: number }>;
}

export function isElasticsearchEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ELASTICSEARCH_ENABLED === 'true' && !!env.ELASTICSEARCH_URL;
}

let externalAdapter: SearchAdapter | null = null;

export function registerSearchAdapter(adapter: SearchAdapter | null): void {
  externalAdapter = adapter;
}

/** Returns the external adapter only when enabled by config; null means use the PostgreSQL fallback. */
export function getExternalSearchAdapter(env: NodeJS.ProcessEnv = process.env): SearchAdapter | null {
  return isElasticsearchEnabled(env) ? externalAdapter : null;
}
