import { describe, it, expect } from 'vitest';
import { buildFilterClause, MAX_FILTER_DEPTH, type FilterNode } from '../../../src/services/search-filters.js';

describe('buildFilterClause', () => {
  it('builds AND groups with parameters', () => {
    const { sql, values } = buildFilterClause({
      op: 'and',
      conditions: [
        { field: 'status', operator: 'eq', value: 'new' },
        { field: 'priority', operator: 'in', value: ['high', 'critical'] },
      ],
    });
    expect(sql).toBe('(i.status::text = $1 AND i.priority::text = ANY($2::text[]))');
    expect(values).toEqual(['new', ['high', 'critical']]);
  });

  it('builds OR groups and respects startIndex', () => {
    const { sql, values } = buildFilterClause(
      {
        op: 'or',
        conditions: [
          { field: 'created_at', operator: 'gte', value: '2024-01-01' },
          { field: 'severity', operator: 'neq', value: 'S4' },
        ],
      },
      3
    );
    expect(sql).toContain(' OR ');
    expect(sql).toContain('$3');
    expect(sql).toContain('$4');
    expect(values).toHaveLength(2);
  });

  it('builds nested groups', () => {
    const { sql, values } = buildFilterClause({
      op: 'and',
      conditions: [
        { field: 'status', operator: 'eq', value: 'new' },
        {
          op: 'or',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'high' },
            { field: 'title' as never, operator: 'contains', value: 'x' } as never,
          ].slice(0, 1),
        },
      ],
    });
    expect(sql).toBe('(i.status::text = $1 AND (i.priority::text = $2))');
    expect(values).toEqual(['new', 'high']);
  });

  it('supports contains and lte without ILIKE', () => {
    const { sql } = buildFilterClause({
      op: 'and',
      conditions: [
        { field: 'assigned_group', operator: 'contains', value: 'ops' },
        { field: 'updated_at', operator: 'lte', value: '2025-01-01' },
      ],
    });
    expect(sql).not.toContain('ILIKE');
    expect(sql).toContain('position(lower($1) in lower(i.assigned_group::text)) > 0');
  });

  it('rejects non-allowlisted field names', () => {
    expect(() =>
      buildFilterClause({ op: 'and', conditions: [{ field: 'status; DROP TABLE issues;--', operator: 'eq', value: 'x' }] })
    ).toThrow(/not allowed/);
    expect(() =>
      buildFilterClause({ op: 'and', conditions: [{ field: 'password_hash', operator: 'eq', value: 'x' }] })
    ).toThrow(/not allowed/);
  });

  it('rejects non-allowlisted operators', () => {
    expect(() =>
      buildFilterClause({ op: 'and', conditions: [{ field: 'status', operator: 'like' as never, value: 'x' }] })
    ).toThrow(/operator/);
  });

  it('parameterizes malicious values and never interpolates them', () => {
    const evil = "x' OR '1'='1'; DROP TABLE issues;--";
    const { sql, values } = buildFilterClause({
      op: 'and',
      conditions: [{ field: 'status', operator: 'eq', value: evil }],
    });
    expect(sql).not.toContain('DROP');
    expect(sql).not.toContain("'1'");
    expect(values).toEqual([evil]);
  });

  it('rejects object values and invalid group ops', () => {
    expect(() =>
      buildFilterClause({ op: 'and', conditions: [{ field: 'status', operator: 'eq', value: { a: 1 } }] })
    ).toThrow();
    expect(() =>
      buildFilterClause({ op: 'xor' as never, conditions: [{ field: 'status', operator: 'eq', value: 'a' }] })
    ).toThrow();
  });

  it('caps nesting depth', () => {
    let node: FilterNode = { field: 'status', operator: 'eq', value: 'a' };
    for (let i = 0; i < MAX_FILTER_DEPTH + 1; i++) node = { op: 'and', conditions: [node] };
    expect(() => buildFilterClause(node)).toThrow(/depth/);
  });
});
