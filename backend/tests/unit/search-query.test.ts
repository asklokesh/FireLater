import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  tokensToFilterGroup,
  entitiesUnableToSatisfy,
} from '../../src/lib/search-query.js';

describe('parseSearchQuery', () => {
  it('trims input', () => {
    expect(parseSearchQuery('  disk full  ')).toEqual({ text: 'disk full', tokens: [] });
  });

  it('caps at 200 characters', () => {
    expect(parseSearchQuery('a'.repeat(500)).text).toHaveLength(200);
  });

  it('keeps quoted phrases in free text', () => {
    expect(parseSearchQuery('"disk full" server').text).toBe('"disk full" server');
  });

  it('keeps OR in free text', () => {
    expect(parseSearchQuery('login OR password').text).toBe('login OR password');
  });

  it('keeps leading-minus exclusions in free text', () => {
    expect(parseSearchQuery('network -vpn').text).toBe('network -vpn');
    expect(parseSearchQuery('-status:new').text).toBe('-status:new');
  });

  it('extracts whitelisted field tokens', () => {
    expect(parseSearchQuery('status:open priority:high disk')).toEqual({
      text: 'disk',
      tokens: [
        { field: 'status', value: 'open' },
        { field: 'priority', value: 'high' },
      ],
    });
  });

  it('extracts all documented fields', () => {
    const r = parseSearchQuery('assignee:bob group:ops application:crm reporter:amy');
    expect(r.tokens.map((t) => t.field)).toEqual(['assignee', 'group', 'application', 'reporter']);
    expect(r.text).toBe('');
  });

  it('supports quoted token values', () => {
    expect(parseSearchQuery('group:"service desk" printer')).toEqual({
      text: 'printer',
      tokens: [{ field: 'group', value: 'service desk' }],
    });
  });

  it('treats unknown fields as free text', () => {
    expect(parseSearchQuery('color:red status:open')).toEqual({
      text: 'color:red',
      tokens: [{ field: 'status', value: 'open' }],
    });
  });

  it('does not extract tokens inside quoted phrases', () => {
    expect(parseSearchQuery('"status:open now"').tokens).toEqual([]);
  });

  it('documented example: mixed query', () => {
    expect(parseSearchQuery('"disk full" OR outage -vpn status:open priority:critical')).toEqual({
      text: '"disk full" OR outage -vpn',
      tokens: [
        { field: 'status', value: 'open' },
        { field: 'priority', value: 'critical' },
      ],
    });
  });
});

describe('tokensToFilterGroup', () => {
  it('builds an AND group', () => {
    const { tokens } = parseSearchQuery('status:open assignee:u1');
    expect(tokensToFilterGroup('issues', tokens)).toEqual({
      group: {
        op: 'and',
        conditions: [
          { field: 'status', operator: 'eq', value: 'open' },
          { field: 'assigned_to', operator: 'eq', value: 'u1' },
        ],
      },
      unsupported: [],
    });
  });

  it('merges repeated fields into in', () => {
    const { tokens } = parseSearchQuery('status:new status:open');
    expect(tokensToFilterGroup('problems', tokens).group?.conditions).toEqual([
      { field: 'status', operator: 'in', value: ['new', 'open'] },
    ]);
  });

  it('maps requests columns and reports unsupported tokens', () => {
    const { tokens } = parseSearchQuery('reporter:u1 application:a1');
    const r = tokensToFilterGroup('requests', tokens);
    expect(r.group?.conditions).toEqual([{ field: 'requester_id', operator: 'eq', value: 'u1' }]);
    expect(r.unsupported).toEqual([{ field: 'application', value: 'a1' }]);
  });

  it('reports entities that cannot satisfy a token', () => {
    expect(entitiesUnableToSatisfy(parseSearchQuery('application:a1').tokens)).toEqual(['requests']);
    expect(entitiesUnableToSatisfy(parseSearchQuery('status:open').tokens)).toEqual([]);
  });

  it('returns null group when there are no tokens', () => {
    expect(tokensToFilterGroup('issues', []).group).toBeNull();
  });
});
