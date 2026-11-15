import { describe, it, expect } from 'vitest';
import {
  filterGroupSchema,
  buildFilterClause,
  type FilterGroup,
} from '../../../src/services/search/filter-builder.js';

const opts = { alias: 'i', startIndex: 1 };

describe('filter builder', () => {
  it('builds nested AND/OR with numbering from a non-1 startIndex', () => {
    const g: FilterGroup = {
      op: 'and',
      conditions: [
        { field: 'status', operator: 'eq', value: 'new' },
        {
          op: 'or',
          conditions: [
            { field: 'priority', operator: 'in', value: ['high', 'critical'] },
            { field: 'created_at', operator: 'between', value: ['2024-01-01', '2024-02-01'] },
          ],
        },
        { field: 'text', operator: 'eq', value: 'disk' },
      ],
    };
    const r = buildFilterClause(g, { alias: 'i', startIndex: 4 });
    expect(r.sql).toBe(
      "(i.status = $4 AND (i.priority = ANY($5) OR i.created_at BETWEEN $6 AND $7) AND i.search_vector @@ websearch_to_tsquery('english', $8))"
    );
    expect(r.values).toEqual(['new', ['high', 'critical'], '2024-01-01', '2024-02-01', 'disk']);
    expect(r.nextIndex).toBe(9);
  });

  it('supports every operator', () => {
    const cases: Array<[any, string, unknown[]]> = [
      [{ field: 'status', operator: 'eq', value: 'new' }, '(i.status = $1)', ['new']],
      [{ field: 'status', operator: 'neq', value: 'new' }, '(i.status <> $1)', ['new']],
      [{ field: 'status', operator: 'in', value: ['new'] }, '(i.status = ANY($1))', [['new']]],
      [{ field: 'status', operator: 'nin', value: ['new'] }, '(i.status <> ALL($1))', [['new']]],
      [{ field: 'created_at', operator: 'gt', value: '2024-01-01' }, '(i.created_at > $1)', ['2024-01-01']],
      [{ field: 'created_at', operator: 'gte', value: '2024-01-01' }, '(i.created_at >= $1)', ['2024-01-01']],
      [{ field: 'created_at', operator: 'lt', value: '2024-01-01' }, '(i.created_at < $1)', ['2024-01-01']],
      [{ field: 'created_at', operator: 'lte', value: '2024-01-01' }, '(i.created_at <= $1)', ['2024-01-01']],
      [
        { field: 'updated_at', operator: 'between', value: ['2024-01-01', '2024-01-02'] },
        '(i.updated_at BETWEEN $1 AND $2)',
        ['2024-01-01', '2024-01-02'],
      ],
      [{ field: 'resolved_at', operator: 'is_null' }, '(i.resolved_at IS NULL)', []],
      [{ field: 'assigned_to', operator: 'is_not_null' }, '(i.assigned_to IS NOT NULL)', []],
      [{ field: 'sla_breached', operator: 'eq', value: true }, '(i.sla_breached = $1)', [true]],
    ];
    for (const [cond, sql, values] of cases) {
      const r = buildFilterClause({ op: 'and', conditions: [cond] }, opts);
      expect(r.sql).toBe(sql);
      expect(r.values).toEqual(values);
    }
  });

  it('rejects unknown fields', () => {
    const g = { op: 'and', conditions: [{ field: 'password; DROP TABLE x', operator: 'eq', value: 'a' }] };
    expect(filterGroupSchema.safeParse(g).success).toBe(false);
    expect(() => buildFilterClause(g as any, opts)).toThrow();
  });

  it('rejects operators not allowed for the field', () => {
    const bad = (field: string, operator: string, value: unknown) =>
      filterGroupSchema.safeParse({ op: 'and', conditions: [{ field, operator, value }] }).success;
    expect(bad('status', 'gt', 'new')).toBe(false);
    expect(bad('priority', 'lt', 'low')).toBe(false);
    expect(bad('assigned_to', 'between', ['a', 'b'])).toBe(false);
    expect(bad('created_at', 'between', ['2024-01-01', '2024-01-02'])).toBe(true);
    expect(bad('sla_breached', 'in', [true])).toBe(false);
  });

  it('validates values and in/nin sizes', () => {
    const ok = (operator: string, value: unknown) =>
      filterGroupSchema.safeParse({ op: 'and', conditions: [{ field: 'assigned_to', operator, value }] }).success;
    expect(ok('in', [])).toBe(false);
    expect(ok('in', Array.from({ length: 50 }, (_, i) => `u${i}`))).toBe(true);
    expect(ok('nin', Array.from({ length: 51 }, (_, i) => `u${i}`))).toBe(false);
    expect(
      filterGroupSchema.safeParse({ op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'bogus' }] })
        .success
    ).toBe(false);
  });

  it('enforces depth limit of 4', () => {
    const nest = (d: number): FilterGroup =>
      d === 1
        ? { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] }
        : { op: 'and', conditions: [nest(d - 1)] };
    expect(filterGroupSchema.safeParse(nest(4)).success).toBe(true);
    expect(filterGroupSchema.safeParse(nest(5)).success).toBe(false);
  });

  it('enforces total condition limit of 50', () => {
    const conds = (n: number) =>
      Array.from({ length: n }, () => ({ field: 'status', operator: 'eq' as const, value: 'new' }));
    expect(filterGroupSchema.safeParse({ op: 'or', conditions: conds(50) }).success).toBe(true);
    expect(filterGroupSchema.safeParse({ op: 'or', conditions: conds(51) }).success).toBe(false);
    const split = { op: 'and', conditions: [{ op: 'or', conditions: conds(26) }, { op: 'or', conditions: conds(25) }] };
    expect(filterGroupSchema.safeParse(split).success).toBe(false);
  });

  it('yields TRUE for an empty group', () => {
    expect(buildFilterClause({ op: 'and', conditions: [] }, { alias: 'i', startIndex: 3 })).toEqual({
      sql: 'TRUE',
      values: [],
      nextIndex: 3,
    });
  });

  it('keeps SQL metacharacters only in values', () => {
    const evil = "x'); DROP TABLE issues; --";
    const r = buildFilterClause(
      { op: 'and', conditions: [{ field: 'text', operator: 'eq', value: evil }, { field: 'assigned_to', operator: 'eq', value: evil }] },
      opts
    );
    expect(r.sql).not.toContain('DROP');
    expect(r.sql).not.toContain("'); ");
    expect(r.values).toEqual([evil, evil]);
  });
});
