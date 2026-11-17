// ============================================
// CACHE METRICS (Prometheus text exposition, no external dependency)
// ============================================

type Labels = Record<string, string>;

const counters = new Map<string, { help: string; values: Map<string, number> }>();

function labelKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys
    .map((k) => `${k}="${labels[k].replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`)
    .join(',');
}

function define(name: string, help: string): void {
  counters.set(name, { help, values: new Map() });
}

define('firelater_cache_hits_total', 'Cache reads served from a fresh cached value');
define('firelater_cache_stale_hits_total', 'Cache reads served stale while a background refresh ran');
define('firelater_cache_misses_total', 'Cache reads that had to call the fetcher');
define('firelater_cache_invalidations_total', 'Cache invalidation operations');
define('firelater_cache_invalidated_keys_total', 'Redis keys deleted by invalidations');
define('firelater_cache_events_total', 'Cache events emitted');
define('firelater_cache_pubsub_messages_total', 'Pub/Sub invalidation messages by direction');

/** Extract the namespace (3rd segment of `cache:<tenant>:<namespace>:...`) so labels stay low-cardinality. */
export function namespaceOf(key: string): string {
  const parts = key.split(':');
  return parts.length >= 3 ? parts[2] : 'unknown';
}

export const cacheMetrics = {
  inc(name: string, labels: Labels = {}, by = 1): void {
    const c = counters.get(name);
    if (!c) return;
    const k = labelKey(labels);
    c.values.set(k, (c.values.get(k) ?? 0) + by);
  },

  total(name: string): number {
    const c = counters.get(name);
    if (!c) return 0;
    let sum = 0;
    for (const v of c.values.values()) sum += v;
    return sum;
  },

  /** Miss ratio = misses / (hits + stale hits + misses) */
  missRatio(): number {
    const misses = this.total('firelater_cache_misses_total');
    const all = misses + this.total('firelater_cache_hits_total') + this.total('firelater_cache_stale_hits_total');
    return all === 0 ? 0 : misses / all;
  },

  render(): string {
    const lines: string[] = [];
    for (const [name, c] of counters) {
      lines.push(`# HELP ${name} ${c.help}`, `# TYPE ${name} counter`);
      if (c.values.size === 0) lines.push(`${name} 0`);
      for (const [k, v] of c.values) lines.push(k ? `${name}{${k}} ${v}` : `${name} ${v}`);
    }
    return lines.join('\n') + '\n';
  },

  reset(): void {
    for (const c of counters.values()) c.values.clear();
  },
};
