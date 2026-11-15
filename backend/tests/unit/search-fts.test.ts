import { describe, it, expect } from 'vitest';
import {
  ISSUES_TSVECTOR,
  PROBLEMS_TSVECTOR,
  SERVICE_REQUESTS_TSVECTOR,
  KB_ARTICLES_TSVECTOR,
  buildFtsMatch,
  buildFtsRank,
  buildFtsHeadline,
} from '../../src/lib/search-fts.js';

describe('search-fts', () => {
  it('weights issue title/number A and description B', () => {
    expect(ISSUES_TSVECTOR).toContain("coalesce(title, '') || ' ' || coalesce(issue_number, '')), 'A'");
    expect(ISSUES_TSVECTOR).toContain("coalesce(description, '')), 'B'");
  });

  it('weights problem title/number A and description B', () => {
    expect(PROBLEMS_TSVECTOR).toContain("coalesce(problem_number, '')), 'A'");
    expect(PROBLEMS_TSVECTOR).toContain("coalesce(description, '')), 'B'");
  });

  it('weights request_number A and notes B', () => {
    expect(SERVICE_REQUESTS_TSVECTOR).toContain("coalesce(request_number, '')), 'A'");
    expect(SERVICE_REQUESTS_TSVECTOR).toContain("coalesce(notes, '')), 'B'");
  });

  it('kb expression equals the migration 014 index expression', () => {
    expect(KB_ARTICLES_TSVECTOR).toBe(
      "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))",
    );
  });

  it('builds match, rank and headline with bound parameter only', () => {
    expect(buildFtsMatch(ISSUES_TSVECTOR, 3)).toBe(`${ISSUES_TSVECTOR} @@ websearch_to_tsquery('english', $3)`);
    expect(buildFtsRank(ISSUES_TSVECTOR, 3)).toBe(
      `ts_rank_cd(${ISSUES_TSVECTOR}, websearch_to_tsquery('english', $3))`,
    );
    const h = buildFtsHeadline('description', 4);
    expect(h).toContain('ts_headline');
    expect(h).toContain('$4');
    expect(h).toContain('StartSel=[[hl]]');
    expect(h).toContain('StopSel=[[/hl]]');
  });

  it('rejects invalid parameter indexes instead of interpolating text', () => {
    expect(() => buildFtsMatch(ISSUES_TSVECTOR, "1); DROP TABLE x;--" as unknown as number)).toThrow();
    expect(() => buildFtsRank(ISSUES_TSVECTOR, 0)).toThrow();
  });
});
