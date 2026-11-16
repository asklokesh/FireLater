import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../../../src/services/search/query-parser.js';

describe('parseSearchQuery', () => {
  it('extracts field tokens and returns free text', () => {
    const r = parseSearchQuery('status:open priority:high server down', 'issues');
    expect(r.filters).toEqual([
      { field: 'status', value: 'open' },
      { field: 'priority', value: 'high' },
    ]);
    expect(r.text).toBe('server down');
  });

  it('keeps phrases, OR and exclusion in free text', () => {
    const r = parseSearchQuery('"disk full" OR memory -network status:new', 'issues');
    expect(r.text).toBe('"disk full" OR memory -network');
    expect(r.filters).toEqual([{ field: 'status', value: 'new' }]);
  });

  it('keeps unknown field tokens in free text', () => {
    const r = parseSearchQuery('colour:red status:open', 'issues');
    expect(r.text).toBe('colour:red');
    expect(r.filters).toHaveLength(1);
  });

  it('respects the entity whitelist', () => {
    expect(parseSearchQuery('severity:S1', 'problems')).toEqual({ filters: [], text: 'severity:S1' });
  });

  it('supports quoted field values', () => {
    const r = parseSearchQuery('cost_center:"IT Ops" printer', 'requests');
    expect(r.filters).toEqual([{ field: 'cost_center', value: 'IT Ops' }]);
    expect(r.text).toBe('printer');
  });

  it('handles empty input', () => {
    expect(parseSearchQuery('   ', 'kb')).toEqual({ filters: [], text: '' });
  });

  it('leaves injection attempts as inert data', () => {
    const r = parseSearchQuery(`status:open'; DROP TABLE issues; -- x OR 1=1`, 'issues');
    expect(r.filters[0].value).toBe(`open';`);
    expect(r.text).toContain('DROP TABLE issues; --');
    expect(r.text).toContain('OR 1=1');
  });
});
