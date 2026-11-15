/**
 * Full-text search SQL fragments (PostgreSQL, 'english' configuration).
 *
 * The search text is never interpolated: helpers take a bound parameter
 * index (e.g. 3 -> $3) and reference it in the generated SQL.
 */

export const ISSUES_TSVECTOR =
  `(setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(issue_number, '')), 'A') || ` +
  `setweight(to_tsvector('english', coalesce(description, '')), 'B'))`;

export const PROBLEMS_TSVECTOR =
  `(setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(problem_number, '')), 'A') || ` +
  `setweight(to_tsvector('english', coalesce(description, '')), 'B'))`;

export const SERVICE_REQUESTS_TSVECTOR =
  `(setweight(to_tsvector('english', coalesce(request_number, '')), 'A') || ` +
  `setweight(to_tsvector('english', coalesce(notes, '')), 'B'))`;

/** Identical to the expression of idx_kb_articles_fulltext (migration 014). */
export const KB_ARTICLES_TSVECTOR =
  `to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))`;

export const HEADLINE_START_SEL = '[[hl]]';
export const HEADLINE_STOP_SEL = '[[/hl]]';

function paramRef(paramIndex: number): string {
  if (!Number.isInteger(paramIndex) || paramIndex < 1) {
    throw new Error(`Invalid parameter index: ${paramIndex}`);
  }
  return `$${paramIndex}`;
}

function tsquery(paramIndex: number): string {
  return `websearch_to_tsquery('english', ${paramRef(paramIndex)})`;
}

/** WHERE fragment: tsvector @@ websearch_to_tsquery('english', $n) */
export function buildFtsMatch(tsvectorExpr: string, paramIndex: number): string {
  return `${tsvectorExpr} @@ ${tsquery(paramIndex)}`;
}

/** Rank expression: ts_rank_cd(tsvector, websearch_to_tsquery('english', $n)) */
export function buildFtsRank(tsvectorExpr: string, paramIndex: number): string {
  return `ts_rank_cd(${tsvectorExpr}, ${tsquery(paramIndex)})`;
}

/** Snippet expression over a text expression, highlighting with [[hl]]...[[/hl]]. */
export function buildFtsHeadline(textExpr: string, paramIndex: number): string {
  return (
    `ts_headline('english', coalesce(${textExpr}, ''), ${tsquery(paramIndex)}, ` +
    `'StartSel=${HEADLINE_START_SEL}, StopSel=${HEADLINE_STOP_SEL}, MaxWords=35, MinWords=15')`
  );
}
