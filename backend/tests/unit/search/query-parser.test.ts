import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  buildPrefixTsQuery,
  normalizeQuery,
  MAX_QUERY_LENGTH,
} from '../../../src/lib/search/query-parser.js';

describe('parseSearchQuery', () => {
  it('returns an empty result for empty input', () => {
    expect(parseSearchQuery('')).toEqual({ text: '', conditions: [], entityTypes: null, numbers: [], warnings: [] });
    expect(parseSearchQuery(undefined).text).toBe('');
    expect(parseSearchQuery(null).conditions).toEqual([]);
  });

  it('keeps plain words, phrases, OR and exclusions as free text', () => {
    const parsed = parseSearchQuery('vpn "password reset" OR printer -firmware');
    expect(parsed.text).toBe('vpn "password reset" OR printer -firmware');
    expect(parsed.conditions).toEqual([]);
  });

  it('parses a single field qualifier as eq', () => {
    const parsed = parseSearchQuery('vpn status:open');
    expect(parsed.text).toBe('vpn');
    expect(parsed.conditions).toEqual([{ field: 'status', operator: 'eq', value: 'open' }]);
  });

  it('parses comma lists as in and negated lists as nin', () => {
    const parsed = parseSearchQuery('priority:high,critical -status:closed,resolved');
    expect(parsed.conditions).toEqual([
      { field: 'priority', operator: 'in', value: ['high', 'critical'] },
      { field: 'status', operator: 'nin', value: ['closed', 'resolved'] },
    ]);
  });

  it('parses negation with - and with !', () => {
    expect(parseSearchQuery('-status:closed').conditions).toEqual([{ field: 'status', operator: 'neq', value: 'closed' }]);
    expect(parseSearchQuery('status:!closed').conditions).toEqual([{ field: 'status', operator: 'neq', value: 'closed' }]);
  });

  it('parses comparison operators', () => {
    const parsed = parseSearchQuery('created:>7d updated:<=2026-01-31 resolved:>=2026-01-01 planned_start:<1w');
    expect(parsed.conditions.map((c) => c.operator)).toEqual(['gt', 'lte', 'gte', 'lt']);
    expect(parsed.conditions[0].value).toBe('7d');
  });

  it('parses none/null/empty as is_null and negated as not_null', () => {
    expect(parseSearchQuery('assignee:none').conditions).toEqual([{ field: 'assignee', operator: 'is_null' }]);
    expect(parseSearchQuery('-group:empty').conditions).toEqual([{ field: 'group', operator: 'not_null' }]);
  });

  it('supports quoted qualifier values without splitting on commas', () => {
    const parsed = parseSearchQuery('status:"in progress, waiting"');
    expect(parsed.conditions).toEqual([{ field: 'status', operator: 'eq', value: 'in progress, waiting' }]);
  });

  it('lowercases field names', () => {
    expect(parseSearchQuery('Status:new').conditions).toEqual([{ field: 'status', operator: 'eq', value: 'new' }]);
  });

  it('extracts entity types with aliases and warns on unknown types', () => {
    const parsed = parseSearchQuery('type:issues,kb,widget vpn');
    expect(parsed.entityTypes?.sort()).toEqual(['issue', 'knowledge']);
    expect(parsed.warnings).toEqual(['Unknown type "widget" ignored']);
    expect(parsed.text).toBe('vpn');
  });

  it('treats unknown qualifiers and bare colons as free text', () => {
    const parsed = parseSearchQuery('error: timeout http://example.com foo:bar');
    expect(parsed.conditions).toEqual([]);
    expect(parsed.text).toBe('error: timeout http://example.com foo:bar');
  });

  it('warns and ignores a qualifier with an empty list', () => {
    const parsed = parseSearchQuery('status:,');
    expect(parsed.conditions).toEqual([]);
    expect(parsed.warnings[0]).toContain('has no value');
  });

  it('detects record numbers in free text but not excluded ones', () => {
    const parsed = parseSearchQuery('iss-00012 CHG-7 -PRB-00001');
    expect(parsed.numbers).toEqual(['ISS-00012', 'CHG-7']);
  });

  it('truncates very long input', () => {
    const parsed = parseSearchQuery('a'.repeat(MAX_QUERY_LENGTH + 50));
    expect(parsed.text.length).toBe(MAX_QUERY_LENGTH);
  });

  it('keeps an unterminated quote as text', () => {
    expect(parseSearchQuery('"unterminated phrase').text).toBe('"unterminated phrase');
  });
});

describe('buildPrefixTsQuery', () => {
  it('builds an AND of prefix terms', () => {
    expect(buildPrefixTsQuery('pass res')).toBe('pass:* & res:*');
  });

  it('strips tsquery operators and punctuation', () => {
    expect(buildPrefixTsQuery("vp&n | !x' :* (y)")).toBe('vpn:* & x:* & y:*');
  });

  it('returns an empty string when nothing usable remains', () => {
    expect(buildPrefixTsQuery('&& || !!')).toBe('');
  });

  it('limits to five terms', () => {
    expect(buildPrefixTsQuery('a b c d e f g').split(' & ')).toHaveLength(5);
  });

  it('keeps unicode letters', () => {
    expect(buildPrefixTsQuery('café')).toBe('café:*');
  });
});

describe('normalizeQuery', () => {
  it('trims, lowercases and collapses whitespace', () => {
    expect(normalizeQuery('  VPN   Password  ')).toBe('vpn password');
  });
});
