import { describe, it, expect } from 'vitest';
import {
  SEARCH_TSVECTOR_EXPR,
  parseSearchQuery,
  buildFilterClause,
  toWebsearchInput,
} from '../../src/lib/search-query.js';

describe('parseSearchQuery', () => {
  it('returns empty for blank input', () => {
    expect(parseSearchQuery('   ').isEmpty).toBe(true);
    expect(parseSearchQuery(undefined).isEmpty).toBe(true);
  });
  it('keeps plain words', () => {
    expect(parseSearchQuery('disk full').tsquery).toBe('disk full');
  });
  it('keeps quoted phrases', () => {
    expect(parseSearchQuery('"disk full" error').tsquery).toBe('"disk full" error');
  });
  it('keeps -exclusion', () => {
    expect(parseSearchQuery('disk -network').tsquery).toBe('disk -network');
  });
  it('keeps OR and drops dangling OR', () => {
    expect(parseSearchQuery('disk OR memory').tsquery).toBe('disk or memory');
    expect(parseSearchQuery('OR disk OR').tsquery).toBe('disk');
  });
  it('keeps trailing-star prefix', () => {
    expect(parseSearchQuery('serv*').tsquery).toBe('serv*');
    expect(toWebsearchInput(parseSearchQuery('serv*'))).toBe('serv');
  });
  it('strips injection-style characters', () => {
    const p = parseSearchQuery("'; DROP TABLE issues; --");
    expect(p.tsquery).not.toMatch(/['";]/);
    expect(p.tsquery).not.toContain('--');
  });
});

describe('buildFilterClause', () => {
  const cond = (op: string, value?: unknown) => ({ conditions: [{ field: 'status', op, value }] }) as never;

  it.each([
    ['eq', 'open', 'i.status = $1'],
    ['neq', 'open', 'i.status IS DISTINCT FROM $1'],
    ['gt', 1, 'i.status > $1'],
    ['gte', 1, 'i.status >= $1'],
    ['lt', 1, 'i.status < $1'],
    ['lte', 1, 'i.status <= $1'],
  ])('op %s', (op, value, sql) => {
    const r = buildFilterClause('issues', cond(op, value), 0, 'i');
    expect(r.sql).toBe(`(${sql})`);
    expect(r.values).toEqual([value]);
  });
  it('in', () => {
    const r = buildFilterClause('issues', cond('in', ['a', 'b']));
    expect(r.sql).toBe('(status = ANY($1))');
    expect(r.values).toEqual([['a', 'b']]);
  });
  it('contains escapes wildcards', () => {
    const r = buildFilterClause('issues', cond('contains', '50%'));
    expect(r.sql).toBe('(status::text ILIKE $1)');
    expect(r.values).toEqual(['%50\\%%']);
  });
  it('is_null', () => {
    expect(buildFilterClause('issues', cond('is_null')).sql).toBe('(status IS NULL)');
    expect(buildFilterClause('issues', cond('is_null')).values).toEqual([]);
  });
  it('nested OR inside AND with offset', () => {
    const r = buildFilterClause('issues', {
      logic: 'AND',
      conditions: [
        { field: 'status', op: 'eq', value: 'new' },
        { logic: 'OR', conditions: [
          { field: 'priority', op: 'eq', value: 'high' },
          { field: 'priority', op: 'eq', value: 'critical' },
        ] },
      ],
    }, 2);
    expect(r.sql).toBe('(status = $3 AND (priority = $4 OR priority = $5))');
    expect(r.values).toEqual(['new', 'high', 'critical']);
  });
  it('never inlines values', () => {
    const r = buildFilterClause('issues', cond('eq', "x'; DROP TABLE issues;--"));
    expect(r.sql).not.toContain('DROP');
  });
  it('rejects unknown field, entity-specific field, unknown op, deep nesting', () => {
    expect(() => buildFilterClause('issues', { conditions: [{ field: 'password', op: 'eq', value: 1 }] })).toThrow();
    expect(() => buildFilterClause('problems', { conditions: [{ field: 'severity', op: 'eq', value: 1 }] })).toThrow();
    expect(() => buildFilterClause('issues', cond('like', 'x'))).toThrow();
    const deep = { conditions: [{ conditions: [{ conditions: [{ conditions: [{ field: 'status', op: 'eq', value: 1 }] }] }] }] };
    expect(() => buildFilterClause('issues', deep as never)).toThrow();
    const ok = { conditions: [{ conditions: [{ conditions: [{ field: 'status', op: 'eq', value: 1 }] }] }] };
    expect(() => buildFilterClause('issues', ok as never)).not.toThrow();
  });
});

describe('SEARCH_TSVECTOR_EXPR', () => {
  it('matches the indexed expression', () => {
    expect(SEARCH_TSVECTOR_EXPR).toBe(
      "to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))"
    );
  });
});
