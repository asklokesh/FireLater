// ============================================
// CACHE DEPENDENCY GRAPH
// ============================================
// Describes which cache keys belong to each entity and which other entities'
// caches embed its data. Key convention used by services:
//   cache:<tenant>:<namespace>:<kind>:<id>      (single entity)
//   cache:<tenant>:<namespace>:list:<filters>   (list/aggregate views)

export interface EntityDefinition {
  /** Cache namespace (3rd key segment) */
  namespace: string;
  /** Key segment that precedes the entity id for detail keys, e.g. `app` */
  detailKind?: string;
  /** Key segments that identify list/aggregate keys. Default: everything in the namespace except details */
  listKinds?: string[];
}

export type DependencyScope = 'lists' | 'all';

export interface DependencyEdge {
  /** Entity whose change triggers the invalidation */
  from: string;
  /** Entity whose cached data embeds data of `from` */
  to: string;
  /** `lists`: only list/aggregate keys of `to`; `all`: every key in the namespace of `to` */
  scope: DependencyScope;
}

const entities = new Map<string, EntityDefinition>();
const edges: DependencyEdge[] = [];

export function registerEntity(name: string, def: EntityDefinition): void {
  entities.set(name, def);
}

export function registerDependency(edge: DependencyEdge): void {
  if (!edges.some((e) => e.from === edge.from && e.to === edge.to && e.scope === edge.scope)) {
    edges.push(edge);
  }
}

export function getEntity(name: string): EntityDefinition | undefined {
  return entities.get(name);
}

export function getDependents(name: string): DependencyEdge[] {
  return edges.filter((e) => e.from === name);
}

export function clearDependencyGraph(): void {
  entities.clear();
  edges.length = 0;
}

function listPatterns(tenantSlug: string, def: EntityDefinition): string[] {
  return (def.listKinds ?? ['list']).map((k) => `cache:${tenantSlug}:${def.namespace}:${k}:*`);
}

function ownPatterns(tenantSlug: string, def: EntityDefinition, id?: string): string[] {
  // Without an id the whole entity namespace is potentially affected.
  if (id === undefined) return [`cache:${tenantSlug}:${def.namespace}:*`];
  const detail = def.detailKind ? [`cache:${tenantSlug}:${def.namespace}:${def.detailKind}:${id}`] : [];
  return [...detail, ...listPatterns(tenantSlug, def)];
}

/**
 * Resolve the cache key patterns affected by a change to `entity` (optionally a single `id`).
 * Walks dependency edges transitively; cycles are handled. An unknown entity falls back to the
 * whole `<entity>` namespace of that tenant, never to the whole tenant.
 */
export function resolveInvalidations(tenantSlug: string, entity: string, id?: string): string[] {
  const out = new Set<string>();
  const def = entities.get(entity);
  if (def) {
    for (const p of ownPatterns(tenantSlug, def, id)) out.add(p);
  } else {
    out.add(`cache:${tenantSlug}:${entity}:*`);
  }

  const visited = new Set<string>([entity]);
  const queue = [entity];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of getDependents(current)) {
      const target = entities.get(edge.to);
      if (target) {
        const pats = edge.scope === 'all' ? [`cache:${tenantSlug}:${target.namespace}:*`] : listPatterns(tenantSlug, target);
        for (const p of pats) out.add(p);
      }
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  // Drop patterns subsumed by a wider pattern (e.g. `ns:list:*` when `ns:*` is present).
  const all = [...out];
  return all.filter((p) => !all.some((q) => q !== p && q.endsWith(':*') && p.startsWith(q.slice(0, -1))));
}

// ---- Default graph for FireLater entities ----
registerEntity('application', { namespace: 'applications', detailKind: 'app' });
registerEntity('issue', { namespace: 'issues', detailKind: 'issue', listKinds: ['list', 'categories'] });
registerEntity('problem', { namespace: 'problems', detailKind: 'problem' });
registerEntity('change', { namespace: 'changes', detailKind: 'change' });
registerEntity('request', { namespace: 'requests', detailKind: 'request' });
registerEntity('dashboard', { namespace: 'dashboard' });

// Issues/problems/changes list views embed application names; dashboards aggregate everything.
registerDependency({ from: 'application', to: 'issue', scope: 'lists' });
registerDependency({ from: 'application', to: 'problem', scope: 'lists' });
registerDependency({ from: 'application', to: 'change', scope: 'lists' });
registerDependency({ from: 'application', to: 'dashboard', scope: 'all' });
registerDependency({ from: 'issue', to: 'dashboard', scope: 'all' });
registerDependency({ from: 'problem', to: 'dashboard', scope: 'all' });
registerDependency({ from: 'change', to: 'dashboard', scope: 'all' });
registerDependency({ from: 'request', to: 'dashboard', scope: 'all' });
