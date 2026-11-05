import { describe, it, expect } from 'vitest';
import { buildFilterSql } from '../../src/utils/search-query-builder.js';

const c = (field: string, operator: string, value?: unknown) => ({ field, operator, value });

describe('buildFilterSql', () => {
  it('builds nested and/or with ordered params', () => {
    const r = buildFilterSql({ op: 'and', conditions: [
      c('status', 'eq', 'open'),
      { op: 'or', conditions: [c('priority', 'in', ['high', 'critical']), c('assigned_to', 'is_null')] },
    ] }, 3);
    expect(r.sql).toBe('(i.status = $3 AND (i.priority = ANY($4) OR i.assigned_to IS NULL))');
    expect(r.values).toEqual(['open', ['high', 'critical']]);
    expect(r.nextParamIndex).toBe(5);
  });
  it('rejects unknown field/operator', () => {
    expect(() => buildFilterSql({ op: 'and', conditions: [c('password', 'eq', 'x')] }, 1)).toThrow();
    expect(() => buildFilterSql({ op: 'and', conditions: [c('status', 'like', 'x')] }, 1)).toThrow();
  });
  it('neutralises injection', () => {
    expect(() => buildFilterSql({ op: 'and', conditions: [c('status; DROP TABLE issues', 'eq', 'x')] }, 1)).toThrow();
    const r = buildFilterSql({ op: 'and', conditions: [c('status', 'eq', "x'; DROP TABLE issues;--")] }, 1);
    expect(r.sql).not.toContain('DROP');
    expect(r.values).toEqual(["x'; DROP TABLE issues;--"]);
  });
  it('enforces depth and count limits', () => {
    const deep = { op: 'and', conditions: [{ op: 'and', conditions: [{ op: 'and', conditions: [{ op: 'and', conditions: [c('status', 'eq', 'a')] }] }] }] };
    expect(() => buildFilterSql(deep, 1)).toThrow();
    const ok = { op: 'and', conditions: [{ op: 'and', conditions: [{ op: 'and', conditions: [c('status', 'eq', 'a')] }] }] };
    expect(() => buildFilterSql(ok, 1)).not.toThrow();
    const many = { op: 'and', conditions: Array.from({ length: 51 }, () => c('status', 'eq', 'a')) };
    expect(() => buildFilterSql(many, 1)).toThrow();
  });
});
