export const SEARCH_VECTOR_COLUMN = 'search_vector';
const TS_CONFIG = 'english';

export function buildTextSearchClause(alias: string, paramIndex: number): string {
  return `${alias}.${SEARCH_VECTOR_COLUMN} @@ websearch_to_tsquery('${TS_CONFIG}', $${paramIndex})`;
}

export function buildRankExpression(alias: string, paramIndex: number): string {
  return `ts_rank(${alias}.${SEARCH_VECTOR_COLUMN}, websearch_to_tsquery('${TS_CONFIG}', $${paramIndex}))`;
}
