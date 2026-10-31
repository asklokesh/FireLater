import { describe, it, expect } from 'vitest';
import { buildFilterQuery, parseSearchQuery, FilterValidationError } from './search-filters.js';

describe('buildFilterQuery', () => {
  it('returns empty sql for undefined group', () => {
    expect(buildFilterQuery(undefined)).toEqual({ sql: '', params: [] });
  });

  it('builds parameterized AND conditions', () => {
    const r = buildFilterQuery({
      operator: 'AND',
      conditions: [
        { field: 'status', op: 'eq', value: 'new' },
        { field: 'priority', op: 'in', value: ['high', 'critical'] },
      ],
    });
    expect(r.sql).toBe('i.status = $1 AND i.priority::text = ANY($2::text[])');
    expect(r.params).toEqual(['new', ['high', 'critical']]);
  });

  it('nests OR groups and respects startIndex', () => {
    const r = buildFilterQuery({
      operator: 'AND',
      conditions: [
        { field: 'category', op: 'not_null' },
        { operator: 'OR', conditions: [
          { field: 'status', op: 'eq', value: 'new' },
          { field: 'status', op: 'eq', value: 'assigned' },
        ] },
      ],
    }, 2);
    expect(r.sql).toBe('i.category_id IS NOT NULL AND (i.status = $2 OR i.status = $3)');
    expect(r.params).toEqual(['new', 'assigned']);
  });

  it('escapes LIKE wildcards in contains', () => {
    const r = buildFilterQuery({ operator: 'AND', conditions: [{ field: 'status', op: 'contains', value: '50%_x' }] });
    expect(r.params).toEqual(['%50\\%\\_x%']);
  });

  it('rejects unknown fields (no SQL injection via field name)', () => {
    expect(() => buildFilterQuery({
      operator: 'AND', conditions: [{ field: 'title; DROP TABLE issues', op: 'eq', value: 1 }],
    })).toThrow(FilterValidationError);
  });

  it('rejects invalid group operators and empty in arrays', () => {
    expect(() => buildFilterQuery({ operator: 'XOR' as 'AND', conditions: [] })).toThrow(FilterValidationError);
    expect(() => buildFilterQuery({ operator: 'AND', conditions: [{ field: 'status', op: 'in', value: [] }] }))
      .toThrow(FilterValidationError);
  });

  it('rejects excessive nesting', () => {
    let g: any = { operator: 'AND', conditions: [{ field: 'status', op: 'eq', value: 'new' }] };
    for (let i = 0; i < 6; i++) g = { operator: 'OR', conditions: [g] };
    expect(() => buildFilterQuery(g)).toThrow(/too deep/);
  });
});

describe('parseSearchQuery', () => {
  it('splits free text from field filters', () => {
    const r = parseSearchQuery('printer jam status:new,assigned -priority:low');
    expect(r.text).toBe('printer jam');
    expect(r.filterGroup).toEqual({
      operator: 'AND',
      conditions: [
        { field: 'status', op: 'in', value: ['new', 'assigned'] },
        { field: 'priority', op: 'neq', value: 'low' },
      ],
    });
  });

  it('keeps unknown prefixes and quoted phrases as text', () => {
    const r = parseSearchQuery('"disk full" foo:bar');
    expect(r.text).toBe('"disk full" foo:bar');
    expect(r.filterGroup.conditions).toEqual([]);
  });
});
