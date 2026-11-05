import { describe, it, expect } from 'vitest';
import { buildSearchFilter, FILTER_OPERATORS, type FilterGroup } from '../../src/utils/searchFilterBuilder.js';

describe('buildSearchFilter', () => {
  it('returns empty for no tree', () => {
    expect(buildSearchFilter(undefined)).toEqual({ sql: '', values: [] });
  });

  it('builds AND', () => {
    const r = buildSearchFilter({ op: 'AND', conditions: [
      { field: 'status', operator: 'eq', value: 'new' },
      { field: 'priority', operator: 'eq', value: 'high' },
    ] });
    expect(r.sql).toBe('(i.status = $1 AND i.priority = $2)');
    expect(r.values).toEqual(['new', 'high']);
  });

  it('builds OR', () => {
    const r = buildSearchFilter({ op: 'OR', conditions: [
      { field: 'status', operator: 'eq', value: 'new' },
      { field: 'status', operator: 'eq', value: 'assigned' },
    ] });
    expect(r.sql).toBe('(i.status = $1 OR i.status = $2)');
  });

  it('builds nested groups', () => {
    const r = buildSearchFilter({ op: 'AND', conditions: [
      { field: 'status', operator: 'eq', value: 'new' },
      { op: 'OR', conditions: [
        { field: 'priority', operator: 'eq', value: 'high' },
        { field: 'severity', operator: 'eq', value: 'critical' },
      ] },
    ] });
    expect(r.sql).toBe('(i.status = $1 AND (i.priority = $2 OR i.severity = $3))');
    expect(r.values).toEqual(['new', 'high', 'critical']);
  });

  it('supports every operator', () => {
    const expected: Record<string, [string, unknown[]]> = {
      eq: ['i.status = $1', ['a']],
      neq: ['i.status <> $1', ['a']],
      in: ['i.status = ANY($1)', [['a', 'b']]],
      not_in: ['i.status <> ALL($1)', [['a', 'b']]],
      gt: ['i.created_at > $1', ['2024-01-01']],
      gte: ['i.created_at >= $1', ['2024-01-01']],
      lt: ['i.created_at < $1', ['2024-01-01']],
      lte: ['i.created_at <= $1', ['2024-01-01']],
      is_null: ['i.status IS NULL', []],
      not_null: ['i.status IS NOT NULL', []],
    };
    expect(Object.keys(expected).sort()).toEqual([...FILTER_OPERATORS].sort());
    for (const op of FILTER_OPERATORS) {
      const field = ['gt', 'gte', 'lt', 'lte'].includes(op) ? 'created_at' : 'status';
      const value = expected[op][1][0];
      const r = buildSearchFilter({ op: 'AND', conditions: [{ field, operator: op, value }] });
      expect(r.sql).toBe(`(${expected[op][0]})`);
      expect(r.values).toEqual(expected[op][1]);
    }
  });

  it('honors parameter offset', () => {
    const r = buildSearchFilter({ op: 'AND', conditions: [
      { field: 'status', operator: 'eq', value: 'x' },
      { field: 'priority', operator: 'is_null' },
      { field: 'severity', operator: 'eq', value: 'y' },
    ] }, 5);
    expect(r.sql).toBe('(i.status = $5 AND i.priority IS NULL AND i.severity = $6)');
  });

  it('rejects unknown field and operator', () => {
    expect(() => buildSearchFilter({ op: 'AND', conditions: [{ field: 'password', operator: 'eq', value: 1 }] })).toThrow();
    expect(() => buildSearchFilter({ op: 'AND', conditions: [{ field: 'status', operator: 'like', value: 1 }] })).toThrow();
  });

  it('enforces depth limit', () => {
    const ok: FilterGroup = { op: 'AND', conditions: [{ op: 'OR', conditions: [{ op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'a' }] }] }] };
    expect(() => buildSearchFilter(ok)).not.toThrow();
    const bad: FilterGroup = { op: 'AND', conditions: [{ op: 'OR', conditions: [{ op: 'AND', conditions: [{ op: 'OR', conditions: [{ field: 'status', operator: 'eq', value: 'a' }] }] }] }] };
    expect(() => buildSearchFilter(bad)).toThrow("Validation failed");
  });

  it('enforces condition limit', () => {
    const mk = (n: number): FilterGroup => ({ op: 'OR', conditions: Array.from({ length: n }, () => ({ field: 'status', operator: 'eq', value: 'a' })) });
    expect(() => buildSearchFilter(mk(25))).not.toThrow();
    expect(() => buildSearchFilter(mk(26))).toThrow("Validation failed");
  });

  it('never interpolates values into SQL', () => {
    const evil = "x'; DROP TABLE issues; --";
    const r = buildSearchFilter({ op: 'AND', conditions: [{ field: 'status', operator: 'eq', value: evil }] });
    expect(r.sql).not.toContain('DROP');
    expect(r.sql).toBe('(i.status = $1)');
    expect(r.values).toEqual([evil]);
  });
});
