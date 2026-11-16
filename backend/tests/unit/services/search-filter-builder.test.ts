import { describe, it, expect } from 'vitest';
import {
  buildFilterClause,
  buildRankedMatchSql,
  filterTreeSchema,
} from '../../../src/services/search/filter-builder.js';
import { searchConfig } from '../../../src/services/search/config.js';

const U = '11111111-1111-1111-1111-111111111111';
const g = (op: 'and' | 'or', conditions: unknown[]) => ({ op, conditions });
const c = (field: string, operator: string, value?: unknown) => ({ field, operator, value });

describe('buildFilterClause', () => {
  it('builds each operator with bound params', () => {
    expect(buildFilterClause('issues', g('and', [c('status', 'eq', 'new')]))).toEqual({ sql: '(i.status = $1)', params: ['new'] });
    expect(buildFilterClause('issues', g('and', [c('status', 'ne', 'new')])).sql).toBe('(i.status <> $1)');
    expect(buildFilterClause('issues', g('and', [c('status', 'in', ['a', 'b'])]))).toEqual({ sql: '(i.status = ANY($1))', params: [['a', 'b']] });
    expect(buildFilterClause('issues', g('and', [c('status', 'nin', ['a'])])).sql).toBe('(i.status <> ALL($1))');
    expect(buildFilterClause('issues', g('and', [c('created_at', 'gt', '2024-01-01')])).sql).toBe('(i.created_at > $1)');
    expect(buildFilterClause('issues', g('and', [c('created_at', 'gte', '2024-01-01')])).sql).toBe('(i.created_at >= $1)');
    expect(buildFilterClause('issues', g('and', [c('created_at', 'lt', '2024-01-01')])).sql).toBe('(i.created_at < $1)');
    expect(buildFilterClause('issues', g('and', [c('created_at', 'lte', '2024-01-01')])).sql).toBe('(i.created_at <= $1)');
    const b = buildFilterClause('issues', g('and', [c('created_at', 'between', ['2024-01-01', '2024-02-01'])]));
    expect(b).toEqual({ sql: '(i.created_at BETWEEN $1 AND $2)', params: ['2024-01-01', '2024-02-01'] });
    const ct = buildFilterClause('requests', g('and', [c('cost_center', 'contains', '50%_x')]));
    expect(ct).toEqual({ sql: '(sr.cost_center ILIKE $1)', params: ['%50\\%\\_x%'] });
    expect(buildFilterClause('issues', g('and', [c('resolved_at', 'isnull')]))).toEqual({ sql: '(i.resolved_at IS NULL)', params: [] });
    expect(buildFilterClause('issues', g('and', [c('resolved_at', 'notnull')])).sql).toBe('(i.resolved_at IS NOT NULL)');
  });

  it('handles nested groups and non-1 start index', () => {
    const r = buildFilterClause(
      'issues',
      g('and', [
        c('status', 'eq', 'open'),
        g('or', [c('priority', 'eq', 'high'), c('assigned_to', 'eq', U)]),
        c('created_at', 'between', ['2024-01-01', '2024-02-01']),
      ]),
      5
    );
    expect(r.sql).toBe('(i.status = $5 AND (i.priority = $6 OR i.assigned_to = $7) AND i.created_at BETWEEN $8 AND $9)');
    expect(r.params).toEqual(['open', 'high', U, '2024-01-01', '2024-02-01']);
  });

  it('keeps injection payloads in params', () => {
    const evil = `'; DROP TABLE issues; --`;
    const r = buildFilterClause('issues', g('or', [c('status', 'eq', evil)]));
    expect(r.sql).not.toMatch(/DROP|;|'/);
    expect(r.params).toEqual([evil]);
  });

  it('rejects non-whitelisted fields', () => {
    expect(() => buildFilterClause('issues', g('and', [c('password; DROP', 'eq', 'x')]))).toThrow(/not filterable/);
    expect(() => buildFilterClause('problems', g('and', [c('severity', 'eq', 'x')]))).toThrow(/not filterable/);
  });

  it('rejects too deep trees', () => {
    let t: unknown = g('and', [c('status', 'eq', 'a')]);
    for (let i = 0; i < 3; i++) t = g('and', [t]);
    expect(() => buildFilterClause('issues', t)).not.toThrow();
    t = g('and', [t]);
    expect(() => buildFilterClause('issues', t)).toThrow(/deeper than 4/);
  });

  it('rejects more than 25 conditions', () => {
    const many = (n: number) => g('and', Array.from({ length: n }, () => c('status', 'eq', 'a')));
    expect(() => buildFilterClause('issues', many(25))).not.toThrow();
    expect(() => buildFilterClause('issues', many(26))).toThrow(/more than 25/);
  });

  it('rejects operator/value mismatches', () => {
    const bad: unknown[] = [
      c('status', 'eq', ['a']),
      c('status', 'eq', 5),
      c('status', 'in', 'a'),
      c('status', 'in', []),
      c('sla_breached', 'eq', 'true'),
      c('assigned_to', 'eq', 'not-a-uuid'),
      c('created_at', 'gt', 'garbage'),
      c('created_at', 'between', ['2024-01-01']),
      c('status', 'between', ['a', 'b']),
      c('status', 'gt', 'a'),
      c('sla_breached', 'contains', 'x'),
      c('status', 'isnull', 'x'),
      c('status', 'eq'),
    ];
    for (const cond of bad) {
      expect(() => buildFilterClause('issues', g('and', [cond]))).toThrow();
    }
  });

  it('rejects malformed trees and bad indexes', () => {
    expect(() => buildFilterClause('issues', { op: 'xor', conditions: [] })).toThrow(/Invalid filter tree/);
    expect(() => buildFilterClause('issues', g('and', [c('status', 'bogus', 'a')]))).toThrow(/Invalid filter tree/);
    expect(() => buildFilterClause('issues', g('and', []))).toThrow(/at least one/);
    expect(() => buildFilterClause('issues', g('and', [c('status', 'eq', 'a')]), 0)).toThrow(/startParamIndex/);
  });

  it('exports a zod schema', () => {
    expect(filterTreeSchema.safeParse(g('and', [c('status', 'eq', 'a')])).success).toBe(true);
    expect(filterTreeSchema.safeParse({}).success).toBe(false);
  });
});

describe('buildRankedMatchSql', () => {
  it('uses the config tsvector and websearch_to_tsquery', () => {
    for (const e of ['issues', 'problems', 'requests', 'kb'] as const) {
      const r = buildRankedMatchSql(e, 3);
      const ts = searchConfig[e].tsvector;
      expect(r.where).toBe(`(${ts}) @@ websearch_to_tsquery('english', $3)`);
      expect(r.orderBy).toBe(`ts_rank_cd((${ts}), websearch_to_tsquery('english', $3)) DESC`);
    }
    expect(() => buildRankedMatchSql('issues', 0)).toThrow();
  });
});
