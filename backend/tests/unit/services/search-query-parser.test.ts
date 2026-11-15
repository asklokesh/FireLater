import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../../../src/services/search/query-parser.js';

describe('parseSearchQuery', () => {
  it('returns plain free text', () => {
    expect(parseSearchQuery('database timeout')).toEqual({ text: 'database timeout', filter: null, warnings: [] });
  });

  it.each([
    ['status:new', 'status', 'new'],
    ['priority:critical', 'priority', 'critical'],
    ['severity:S1', 'severity', 'S1'],
    ['type:problem', 'issue_type', 'problem'],
    ['source:email', 'source', 'email'],
  ])('parses %s', (q, field, value) => {
    const r = parseSearchQuery(q);
    expect(r.text).toBe('');
    expect(r.filter).toEqual({ op: 'and', conditions: [{ field, operator: 'eq', value }] });
  });

  it('parses breached true/false', () => {
    expect(parseSearchQuery('breached:true').filter?.conditions).toEqual([
      { field: 'sla_breached', operator: 'eq', value: true },
    ]);
    expect(parseSearchQuery('breached:false').filter?.conditions).toEqual([
      { field: 'sla_breached', operator: 'eq', value: false },
    ]);
  });

  it('parses comma lists as in', () => {
    expect(parseSearchQuery('status:new,assigned').filter?.conditions).toEqual([
      { field: 'status', operator: 'in', value: ['new', 'assigned'] },
    ]);
  });

  it('parses date ranges', () => {
    const r = parseSearchQuery('created:>=2024-01-01 created:<=2024-01-31 updated:>=2024-02-01 updated:<=2024-02-28');
    expect(r.text).toBe('');
    expect(r.filter?.conditions).toEqual([
      { field: 'created_at', operator: 'gte', value: '2024-01-01' },
      { field: 'created_at', operator: 'lte', value: '2024-01-31' },
      { field: 'updated_at', operator: 'gte', value: '2024-02-01' },
      { field: 'updated_at', operator: 'lte', value: '2024-02-28' },
    ]);
  });

  it('combines tokens and free text', () => {
    const r = parseSearchQuery('database priority:high,critical timeout breached:true');
    expect(r.text).toBe('database timeout');
    expect(r.filter?.conditions).toHaveLength(2);
  });

  it('preserves quoted phrases, OR and minus terms', () => {
    const r = parseSearchQuery('"disk full" OR "out of space" -network status:new');
    expect(r.text).toBe('"disk full" OR "out of space" -network');
    expect(r.filter?.conditions).toEqual([{ field: 'status', operator: 'eq', value: 'new' }]);
  });

  it('does not extract tokens inside quotes or negated', () => {
    const r = parseSearchQuery('"status:new now" -priority:low');
    expect(r.text).toBe('"status:new now" -priority:low');
    expect(r.filter).toBeNull();
  });

  it('leaves unknown tokens in text', () => {
    const r = parseSearchQuery('color:red error');
    expect(r.text).toBe('color:red error');
    expect(r.filter).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it('warns on invalid values without throwing', () => {
    const r = parseSearchQuery('priority:urgentish created:>=2024-13-45 breached:maybe updated:2024-01-01 status:new');
    expect(r.warnings).toHaveLength(4);
    expect(r.text).toBe('');
    expect(r.filter?.conditions).toEqual([{ field: 'status', operator: 'eq', value: 'new' }]);
  });
});
