/**
 * Index advisor: runs EXPLAIN on captured slow queries and recommends
 * indexes for sequential scans that filter on columns.
 */

export interface IndexRecommendation {
  schema: string | null;
  table: string;
  columns: string[];
  reason: string;
  estimatedRows: number;
  statement: string;
}

export interface PlanNode {
  'Node Type'?: string;
  'Relation Name'?: string;
  Schema?: string;
  Filter?: string;
  'Plan Rows'?: number;
  'Actual Rows'?: number;
  'Rows Removed by Filter'?: number;
  'Total Cost'?: number;
  Plans?: PlanNode[];
  [key: string]: unknown;
}

export interface QueryPlanResult {
  plan: PlanNode | null;
  planningMs?: number;
  executionMs?: number;
  analyzed: boolean;
  recommendations: IndexRecommendation[];
}

export interface Queryable {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** A Queryable that can also hand out a dedicated connection (a pg Pool does). */
export interface ExplainDb extends Queryable {
  connect?: () => Promise<Queryable & { release: () => void }>;
}

const MIN_SEQ_SCAN_ROWS = parseInt(process.env.DB_INDEX_ADVISOR_MIN_ROWS || '1000', 10);

/** Extract column names compared in a plan Filter expression. */
export function extractFilterColumns(filter: string): string[] {
  const cols: string[] = [];
  // matches "(col = ..." / "(col)::text = ..." / "(col > ..." / "(col ~~ ..." / "col IS NULL"
  const re = /\(?\(?"?([a-z_][a-z0-9_]*)"?\)?(?:::[a-z ]+)?\s*(?:=|<>|<=|>=|<|>|~~\*?|IS (?:NOT )?NULL|= ANY)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(filter)) !== null) {
    const c = m[1].toLowerCase();
    if (!['and', 'or', 'not', 'any', 'true', 'false', 'null'].includes(c) && !cols.includes(c)) {
      cols.push(c);
    }
  }
  return cols.slice(0, 3);
}

function walk(node: PlanNode, visit: (n: PlanNode) => void): void {
  visit(node);
  for (const child of node.Plans || []) walk(child, visit);
}

/** Relations that are sequentially scanned with a filter. */
export function seqScanRelations(plan: PlanNode): Array<{ schema: string | null; table: string }> {
  const out: Array<{ schema: string | null; table: string }> = [];
  walk(plan, (n) => {
    if (n['Node Type'] === 'Seq Scan' && n['Relation Name'] && n.Filter) {
      out.push({ schema: n.Schema ?? null, table: n['Relation Name'] });
    }
  });
  return out;
}

export function relationKey(schema: string | null, table: string): string {
  return `${schema ?? ''}.${table}`;
}

/**
 * Derive index recommendations from an EXPLAIN (FORMAT JSON) root plan node.
 *
 * "Rows scanned" is what matters, not the rows the filter lets through (a
 * selective filter on a huge table has a tiny Plan Rows but is exactly the case
 * where an index helps most). Preference order: pg_class.reltuples for the
 * relation (tableRows), actual rows read (Actual Rows + Rows Removed by Filter)
 * when the plan was ANALYZEd, then Plan Rows as a last resort.
 */
export function recommendFromPlan(
  plan: PlanNode,
  minRows = MIN_SEQ_SCAN_ROWS,
  tableRows?: Map<string, number>
): IndexRecommendation[] {
  const out: IndexRecommendation[] = [];
  walk(plan, (n) => {
    if (n['Node Type'] !== 'Seq Scan' || !n['Relation Name'] || !n.Filter) return;
    const table = n['Relation Name'];
    const schema = n.Schema ?? null;
    const fromStats = tableRows?.get(relationKey(schema, table));
    const removed = n['Rows Removed by Filter'];
    const actual = n['Actual Rows'];
    const scanned =
      fromStats !== undefined && fromStats > 0
        ? fromStats
        : typeof actual === 'number' && typeof removed === 'number'
          ? actual + removed
          : n['Plan Rows'] ?? 0;
    if (scanned < minRows) return;
    const columns = extractFilterColumns(n.Filter);
    if (columns.length === 0) return;
    const qualified = schema ? `${schema}.${table}` : table;
    const name = `idx_${table}_${columns.join('_')}`.substring(0, 63);
    const dup = out.some((r) => r.table === table && r.schema === schema && r.columns.join() === columns.join());
    if (dup) return;
    out.push({
      schema,
      table,
      columns,
      reason: `Seq Scan on ${qualified} (~${Math.round(scanned)} rows scanned) with filter ${n.Filter}`,
      estimatedRows: scanned,
      statement: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${name} ON ${qualified} (${columns.join(', ')});`,
    });
  });
  return out;
}

/** Remove comments, string literals and quoted identifiers so keyword checks only see SQL syntax. */
function stripQuoted(text: string): string {
  return text
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

const FORBIDDEN =
  /\b(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|into|copy|call|do|vacuum|lock|set|reset|listen|notify|execute|prepare|refresh|reindex|cluster|comment)\b/i;

/**
 * Only a single read-only SELECT / WITH statement is explainable. Keywords inside
 * string literals or quoted identifiers do not count. Functions with side effects
 * are additionally blocked by running the EXPLAIN inside a READ ONLY transaction.
 */
export function isExplainable(text: string): boolean {
  const stripped = stripQuoted(text).trim().replace(/;\s*$/, '');
  if (stripped.includes(';')) return false; // multiple statements
  if (!/^(select|with)\b/i.test(stripped)) return false;
  return !FORBIDDEN.test(stripped);
}

const SAFE_SEARCH_PATH = /^[a-z0-9_"$, ]+$/i;

/** Parse a `SET [SESSION|LOCAL] search_path TO ...` statement into its (safe) value list. */
export function parseSearchPath(statement: string): string | null {
  const m = /^\s*set\s+(?:session\s+|local\s+)?search_path\s*(?:to|=)\s*([^;]+?)\s*;?\s*$/i.exec(statement);
  return m && SAFE_SEARCH_PATH.test(m[1]) ? m[1] : null;
}

async function loadTableRows(db: Queryable, plan: PlanNode): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const rel of seqScanRelations(plan)) {
    const key = relationKey(rel.schema, rel.table);
    if (map.has(key)) continue;
    try {
      const r = await db.query(
        `SELECT c.reltuples::bigint AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE c.relname = $1 AND ($2::text IS NULL OR ns.nspname = $2)`,
        [rel.table, rel.schema]
      );
      const n = Number(r.rows[0]?.n);
      if (Number.isFinite(n) && n > 0) map.set(key, n);
    } catch {
      // statistics unavailable: fall back to plan estimates
    }
  }
  return map;
}

/**
 * Run EXPLAIN (VERBOSE, FORMAT JSON) on a query. ANALYZE executes the statement, so it
 * is only done for read-only SELECT/WITH statements. When the db can hand out a
 * connection, everything runs in a READ ONLY transaction that is always rolled back,
 * with an optional per-connection search_path replayed first.
 */
export async function explainQuery(
  db: ExplainDb,
  text: string,
  values: unknown[] = [],
  options: { analyze?: boolean; searchPath?: string | null } = {}
): Promise<QueryPlanResult> {
  if (!isExplainable(text)) {
    throw new Error('Only a single read-only SELECT query can be explained');
  }
  const analyze = options.analyze === true;
  const sql = `EXPLAIN (${analyze ? 'ANALYZE, BUFFERS, ' : ''}VERBOSE, FORMAT JSON) ${text}`;

  const execute = async (q: Queryable): Promise<QueryPlanResult> => {
    const res = await q.query(sql, values);
    const raw = res.rows[0]?.['QUERY PLAN'];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const top = Array.isArray(parsed) ? parsed[0] : undefined;
    const plan: PlanNode | null = top?.Plan ?? null;
    const tableRows = plan ? await loadTableRows(q, plan) : undefined;
    return {
      plan,
      planningMs: top?.['Planning Time'],
      executionMs: top?.['Execution Time'],
      analyzed: analyze,
      recommendations: plan ? recommendFromPlan(plan, MIN_SEQ_SCAN_ROWS, tableRows) : [],
    };
  };

  if (!db.connect) return execute(db);

  const client = await db.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10000'");
    if (options.searchPath && SAFE_SEARCH_PATH.test(options.searchPath)) {
      await client.query(`SET LOCAL search_path TO ${options.searchPath}`);
    }
    return await execute(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

// ---- stored plans / recommendations for captured slow queries ----

interface StoredAnalysis {
  fingerprint: string;
  query: string;
  at: string;
  recommendations: IndexRecommendation[];
  plan: PlanNode | null;
}

const analyses = new Map<string, StoredAnalysis>();
const lastAnalyzed = new Map<string, number>();
const MAX_ANALYSES = 200;

export function storeAnalysis(fingerprint: string, query: string, result: QueryPlanResult): void {
  if (analyses.size >= MAX_ANALYSES && !analyses.has(fingerprint)) {
    const first = analyses.keys().next().value;
    if (first !== undefined) analyses.delete(first);
  }
  analyses.set(fingerprint, {
    fingerprint,
    query,
    at: new Date().toISOString(),
    recommendations: result.recommendations,
    plan: result.plan,
  });
}

/** True at most once per interval per fingerprint (limits auto-EXPLAIN load). */
export function shouldAnalyze(fingerprint: string, intervalMs = 5 * 60_000, now = Date.now()): boolean {
  const last = lastAnalyzed.get(fingerprint);
  if (last !== undefined && now - last < intervalMs) return false;
  lastAnalyzed.set(fingerprint, now);
  return true;
}

/** Aggregated recommendations across all analysed slow queries, deduplicated. */
export function getRecommendations(): Array<IndexRecommendation & { queries: number }> {
  const merged = new Map<string, IndexRecommendation & { queries: number }>();
  for (const a of analyses.values()) {
    for (const r of a.recommendations) {
      const key = `${r.schema}.${r.table}.${r.columns.join(',')}`;
      const ex = merged.get(key);
      if (ex) ex.queries++;
      else merged.set(key, { ...r, queries: 1 });
    }
  }
  return [...merged.values()].sort((a, b) => b.estimatedRows - a.estimatedRows);
}

export function getStoredPlans(): StoredAnalysis[] {
  return [...analyses.values()].reverse();
}

export function resetAdvisor(): void {
  analyses.clear();
  lastAnalyzed.clear();
}
