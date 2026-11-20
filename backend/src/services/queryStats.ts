/**
 * In-memory database query statistics.
 *
 * Every query that goes through the instrumented pool (config/database.ts) is
 * recorded here by fingerprint (literals and parameters stripped). The data
 * feeds the admin query analytics API and the Prometheus text endpoint.
 */

export interface QueryRecord {
  text: string;
  durationMs: number;
  rowCount?: number | null;
  failed?: boolean;
}

export interface QueryStat {
  fingerprint: string;
  sample: string;
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  minMs: number;
  totalRows: number;
  slowCount: number;
  lastSeen: string;
}

export interface SlowQueryEntry {
  fingerprint: string;
  query: string;
  durationMs: number;
  rowCount: number | null;
  at: string;
}

export const HISTOGRAM_BUCKETS_MS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 5000];

const MAX_FINGERPRINTS = 1000;
const MAX_SLOW_ENTRIES = 200;
const MAX_TEXT = 500;

export function getSlowQueryThresholdMs(): number {
  const v = parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100', 10);
  return Number.isFinite(v) && v >= 0 ? v : 100;
}

/** Normalise SQL so equivalent statements share one fingerprint. */
export function fingerprintQuery(text: string): string {
  return text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, '?')
    .replace(/\$\d+/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\(\s*\?(?:\s*,\s*\?)+\s*\)/g, '(?)')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function truncate(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT ? t.substring(0, MAX_TEXT) + '...' : t;
}

class QueryStatsRegistry {
  private stats = new Map<string, QueryStat>();
  private slow: SlowQueryEntry[] = [];
  private buckets: number[] = new Array(HISTOGRAM_BUCKETS_MS.length).fill(0);
  private totalCount = 0;
  private totalErrors = 0;
  private totalSlow = 0;
  private totalSeconds = 0;

  record(rec: QueryRecord): { fingerprint: string; slow: boolean } {
    const fingerprint = fingerprintQuery(rec.text);
    const threshold = getSlowQueryThresholdMs();
    const slow = rec.durationMs > threshold;
    const rows = typeof rec.rowCount === 'number' ? rec.rowCount : 0;

    let s = this.stats.get(fingerprint);
    if (!s) {
      if (this.stats.size >= MAX_FINGERPRINTS) {
        // evict the least recently seen fingerprint
        let oldestKey: string | null = null;
        let oldest = Infinity;
        for (const [k, v] of this.stats) {
          const t = Date.parse(v.lastSeen);
          if (t < oldest) {
            oldest = t;
            oldestKey = k;
          }
        }
        if (oldestKey) this.stats.delete(oldestKey);
      }
      s = {
        fingerprint,
        sample: truncate(rec.text),
        count: 0,
        errors: 0,
        totalMs: 0,
        maxMs: 0,
        minMs: Infinity,
        totalRows: 0,
        slowCount: 0,
        lastSeen: '',
      };
      this.stats.set(fingerprint, s);
    }
    s.count++;
    s.totalMs += rec.durationMs;
    s.maxMs = Math.max(s.maxMs, rec.durationMs);
    s.minMs = Math.min(s.minMs, rec.durationMs);
    s.totalRows += rows;
    s.lastSeen = new Date().toISOString();
    if (rec.failed) {
      s.errors++;
      this.totalErrors++;
    }
    if (slow) {
      s.slowCount++;
      this.totalSlow++;
      this.slow.push({
        fingerprint,
        query: truncate(rec.text),
        durationMs: rec.durationMs,
        rowCount: typeof rec.rowCount === 'number' ? rec.rowCount : null,
        at: s.lastSeen,
      });
      if (this.slow.length > MAX_SLOW_ENTRIES) this.slow.shift();
    }

    this.totalCount++;
    this.totalSeconds += rec.durationMs / 1000;
    for (let i = 0; i < HISTOGRAM_BUCKETS_MS.length; i++) {
      if (rec.durationMs <= HISTOGRAM_BUCKETS_MS[i]) this.buckets[i]++;
    }
    return { fingerprint, slow };
  }

  private view(s: QueryStat) {
    return {
      ...s,
      minMs: s.minMs === Infinity ? 0 : s.minMs,
      avgMs: s.count ? Math.round((s.totalMs / s.count) * 100) / 100 : 0,
      avgRows: s.count ? Math.round((s.totalRows / s.count) * 100) / 100 : 0,
    };
  }

  topFrequent(limit = 10) {
    return [...this.stats.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map((s) => this.view(s));
  }

  /** Slowest by average duration. */
  topSlowest(limit = 10) {
    return [...this.stats.values()]
      .sort((a, b) => b.totalMs / b.count - a.totalMs / a.count)
      .slice(0, limit)
      .map((s) => this.view(s));
  }

  recentSlow(limit = 50): SlowQueryEntry[] {
    return this.slow.slice(-limit).reverse();
  }

  getStat(fingerprint: string) {
    const s = this.stats.get(fingerprint);
    return s ? this.view(s) : undefined;
  }

  summary() {
    return {
      totalQueries: this.totalCount,
      totalErrors: this.totalErrors,
      slowQueries: this.totalSlow,
      slowThresholdMs: getSlowQueryThresholdMs(),
      uniqueFingerprints: this.stats.size,
      totalSeconds: this.totalSeconds,
    };
  }

  /** Prometheus text exposition format. */
  prometheus(): string {
    const lines: string[] = [];
    lines.push('# HELP db_query_duration_seconds Database query duration');
    lines.push('# TYPE db_query_duration_seconds histogram');
    HISTOGRAM_BUCKETS_MS.forEach((b, i) => {
      lines.push(`db_query_duration_seconds_bucket{le="${b / 1000}"} ${this.buckets[i]}`);
    });
    lines.push(`db_query_duration_seconds_bucket{le="+Inf"} ${this.totalCount}`);
    lines.push(`db_query_duration_seconds_sum ${this.totalSeconds}`);
    lines.push(`db_query_duration_seconds_count ${this.totalCount}`);
    lines.push('# HELP db_queries_total Total database queries');
    lines.push('# TYPE db_queries_total counter');
    lines.push(`db_queries_total ${this.totalCount}`);
    lines.push('# HELP db_query_errors_total Total failed database queries');
    lines.push('# TYPE db_query_errors_total counter');
    lines.push(`db_query_errors_total ${this.totalErrors}`);
    lines.push('# HELP db_slow_queries_total Queries slower than DB_SLOW_QUERY_THRESHOLD');
    lines.push('# TYPE db_slow_queries_total counter');
    lines.push(`db_slow_queries_total ${this.totalSlow}`);
    return lines.join('\n') + '\n';
  }

  reset(): void {
    this.stats.clear();
    this.slow = [];
    this.buckets = new Array(HISTOGRAM_BUCKETS_MS.length).fill(0);
    this.totalCount = 0;
    this.totalErrors = 0;
    this.totalSlow = 0;
    this.totalSeconds = 0;
  }
}

export const queryStats = new QueryStatsRegistry();
