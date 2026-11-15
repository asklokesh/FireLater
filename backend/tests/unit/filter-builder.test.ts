import { describe, it, expect } from 'vitest';
import { buildFilterSql, FilterGroupSchema } from '../../src/lib/filter-builder.js';
import { BadRequestError } from '../../src/utils/errors.js';

describe('buildFilterSql', () => {
  it('builds a simple eq', () => {
    expect(buildFilterSql('issues', { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'open' }] }, 1)).toEqual({
      sql: '(status = $1)',
      values: ['open'],
      nextParamIndex: 2,
    });
  });

  it('documented worked example', () => {
    const group = {
      op: 'and',
      conditions: [
        { field: 'status', operator: 'in', value: ['new', 'assigned'] },
        {
          op: 'or',
          conditions: [
            { field: 'priority', operator: 'eq', value: 'critical' },
            { field: 'title', operator: 'contains', value: 'outage' },
          ],
        },
        { field: 'resolved_at', operator: 'is_null' },
      ],
    };
    expect(FilterGroupSchema.safeParse(group).success).toBe(true);
    expect(buildFilterSql('issues', group, 1, 'i')).toEqual({
      sql: "(i.status = ANY($1) AND (i.priority = $2 OR i.title ILIKE $3 ESCAPE '\\') AND i.resolved_at IS NULL)",
      values: [['new', 'assigned'], 'critical', '%outage%'],
      nextParamIndex: 4,
    });
  });

  it('parenthesizes nested groups and numbers params from a non-zero start', () => {
    const r = buildFilterSql(
      'problems',
      {
        op: 'or',
        conditions: [
          { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }, { field: 'priority', operator: 'neq', value: 'low' }] },
          { op: 'and', conditions: [{ field: 'is_known_error', operator: 'eq', value: true }, { field: 'created_at', operator: 'gte', value: '2024-01-01' }] },
        ],
      },
      5,
      'p',
    );
    expect(r.sql).toBe('((p.status = $5 AND p.priority <> $6) OR (p.is_known_error = $7 AND p.created_at >= $8))');
    expect(r.values).toEqual(['new', 'low', true, '2024-01-01']);
    expect(r.nextParamIndex).toBe(9);
  });

  it('supports not_in, is_not_null, and numeric operators', () => {
    const r = buildFilterSql('requests', {
      op: 'and',
      conditions: [
        { field: 'status', operator: 'not_in', value: ['cancelled'] },
        { field: 'assigned_to', operator: 'is_not_null' },
        { field: 'total_cost', operator: 'lt', value: 100 },
        { field: 'total_cost', operator: 'lte', value: 200 },
        { field: 'total_cost', operator: 'gt', value: 1 },
      ],
    });
    expect(r.sql).toBe('(NOT (status = ANY($1)) AND assigned_to IS NOT NULL AND total_cost < $2 AND total_cost <= $3 AND total_cost > $4)');
    expect(r.nextParamIndex).toBe(5);
  });

  it('escapes LIKE wildcards in contains', () => {
    const r = buildFilterSql('issues', { op: 'and', conditions: [{ field: 'title', operator: 'contains', value: '50%_a\\b' }] });
    expect(r.values).toEqual(['%50\\%\\_a\\\\b%']);
  });

  it('treats SQL metacharacters in values as bound parameters', () => {
    const evil = "x'; DROP TABLE issues; --";
    const r = buildFilterSql('issues', { op: 'and', conditions: [{ field: 'title', operator: 'eq', value: evil }] });
    expect(r.sql).toBe('(title = $1)');
    expect(r.sql).not.toContain('DROP');
    expect(r.values).toEqual([evil]);
  });

  it('rejects SQL metacharacters in field names and alias', () => {
    const bad = { op: 'and', conditions: [{ field: 'status; DROP TABLE issues', operator: 'eq', value: 'a' }] };
    expect(() => buildFilterSql('issues', bad)).toThrow(BadRequestError);
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'a' }] }, 1, 'i; --')).toThrow(BadRequestError);
  });

  it('rejects unknown fields, including those from other entities', () => {
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'request_number', operator: 'eq', value: 'a' }] })).toThrow(BadRequestError);
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'constructor', operator: 'eq', value: 'a' }] })).toThrow(BadRequestError);
  });

  it('rejects unknown operators and operators invalid for the type', () => {
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'status', operator: 'like', value: 'a' }] })).toThrow(BadRequestError);
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'status', operator: 'gt', value: 'a' }] })).toThrow(BadRequestError);
  });

  it('rejects bad values and empty groups', () => {
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'status', operator: 'in', value: [] }] })).toThrow(BadRequestError);
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [{ field: 'escalation_level', operator: 'eq', value: 'x' }] })).toThrow(BadRequestError);
    expect(() => buildFilterSql('issues', { op: 'and', conditions: [] })).toThrow(BadRequestError);
    expect(() => buildFilterSql('issues', { op: 'xor', conditions: [{ field: 'status', operator: 'eq', value: 'a' }] })).toThrow(BadRequestError);
  });

  it('allows depth 3 but rejects depth 4', () => {
    const leaf = { field: 'status', operator: 'eq', value: 'a' };
    const d3 = { op: 'and', conditions: [{ op: 'or', conditions: [{ op: 'and', conditions: [leaf] }] }] };
    expect(buildFilterSql('issues', d3).sql).toBe('(((status = $1)))');
    const d4 = { op: 'and', conditions: [{ op: 'or', conditions: [{ op: 'and', conditions: [{ op: 'or', conditions: [leaf] }] }] }] };
    expect(() => buildFilterSql('issues', d4)).toThrow(BadRequestError);
  });

  it('allows 25 leaf conditions but rejects 26', () => {
    const mk = (n: number) => ({
      op: 'and',
      conditions: Array.from({ length: n }, () => ({ field: 'status', operator: 'eq', value: 'a' })),
    });
    expect(buildFilterSql('issues', mk(25)).nextParamIndex).toBe(26);
    expect(() => buildFilterSql('issues', mk(26))).toThrow(BadRequestError);
  });
});
