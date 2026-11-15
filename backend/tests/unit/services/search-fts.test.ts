import { describe, it, expect } from 'vitest';
import {
  SEARCH_VECTOR_COLUMN,
  buildTextSearchClause,
  buildRankExpression,
} from '../../../src/services/search/fts.js';

describe('search fts helpers', () => {
  it('exports the vector column name', () => {
    expect(SEARCH_VECTOR_COLUMN).toBe('search_vector');
  });

  it('builds the text search clause', () => {
    expect(buildTextSearchClause('i', 1)).toBe(
      "i.search_vector @@ websearch_to_tsquery('english', $1)"
    );
  });

  it('places the parameter index and alias', () => {
    expect(buildTextSearchClause('issues', 7)).toBe(
      "issues.search_vector @@ websearch_to_tsquery('english', $7)"
    );
  });

  it('builds the rank expression', () => {
    expect(buildRankExpression('i', 3)).toBe(
      "ts_rank(i.search_vector, websearch_to_tsquery('english', $3))"
    );
    expect(buildRankExpression('x', 12)).toContain('x.search_vector');
    expect(buildRankExpression('x', 12)).toContain('$12');
  });
});
