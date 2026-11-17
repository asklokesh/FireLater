import { describe, it, expect } from 'vitest';
import {
  HIGHLIGHT_END,
  HIGHLIGHT_START,
  buildSearchFilters,
  filterGroupToRows,
  humanize,
  isValidFilterValue,
  rowsToFilterGroup,
  splitHighlights,
  splitSavedFilters,
  toggleValue,
  type FilterRow,
} from '../search';
import type { SearchFilterGroup } from '../api';

const S = HIGHLIGHT_START;
const E = HIGHLIGHT_END;

function row(field: string, operator: FilterRow['operator'], value = ''): FilterRow {
  return { id: `${field}-${operator}-${value}`, field, operator, value };
}

function stripIds(rows: FilterRow[]) {
  return rows.map(({ field, operator, value }) => ({ field, operator, value }));
}

describe('splitHighlights', () => {
  it('splits plain and highlighted segments', () => {
    expect(splitHighlights(`Users report the ${S}VPN${E} drops ${S}hourly${E}`)).toEqual([
      { text: 'Users report the ', highlighted: false },
      { text: 'VPN', highlighted: true },
      { text: ' drops ', highlighted: false },
      { text: 'hourly', highlighted: true },
    ]);
  });

  it('returns one plain segment when nothing is highlighted', () => {
    expect(splitHighlights('plain')).toEqual([{ text: 'plain', highlighted: false }]);
  });

  it('keeps HTML-looking text as text', () => {
    expect(splitHighlights(`<img src=x onerror=alert(1)> ${S}x${E}`)[0].text).toBe('<img src=x onerror=alert(1)> ');
  });

  it('returns nothing for an empty snippet', () => {
    expect(splitHighlights('')).toEqual([]);
  });
});

describe('rowsToFilterGroup', () => {
  it('drops incomplete rows and splits list values', () => {
    expect(
      rowsToFilterGroup(
        [row('status', 'eq', 'new'), row('priority', 'in', 'high, critical,'), row('severity', 'eq', '  '), row('group', 'is_null')],
        'or'
      )
    ).toEqual({
      op: 'or',
      conditions: [
        { field: 'status', operator: 'eq', value: 'new' },
        { field: 'priority', operator: 'in', value: ['high', 'critical'] },
        { field: 'group', operator: 'is_null' },
      ],
    });
  });

  it('returns null when no row is usable', () => {
    expect(rowsToFilterGroup([row('status', 'eq', '')], 'and')).toBeNull();
  });
});

describe('isValidFilterValue', () => {
  it('accepts relative and ISO dates and rejects partial input', () => {
    expect(isValidFilterValue('date', '7d')).toBe(true);
    expect(isValidFilterValue('date', '2026-01-31')).toBe(true);
    expect(isValidFilterValue('date', '2026-01-31T10:00:00Z')).toBe(true);
    expect(isValidFilterValue('date', '7')).toBe(false);
    expect(isValidFilterValue('date', '2026-01')).toBe(false);
  });

  it('accepts uuids and me for uuid fields', () => {
    expect(isValidFilterValue('uuid', 'me')).toBe(true);
    expect(isValidFilterValue('uuid', '22222222-2222-2222-2222-222222222222')).toBe(true);
    expect(isValidFilterValue('uuid', '2222')).toBe(false);
  });

  it('accepts the boolean words the API accepts', () => {
    expect(isValidFilterValue('boolean', 'Yes')).toBe(true);
    expect(isValidFilterValue('boolean', 'maybe')).toBe(false);
  });

  it('caps text length', () => {
    expect(isValidFilterValue('text', 'x'.repeat(201))).toBe(false);
    expect(isValidFilterValue(undefined, 'new')).toBe(true);
  });
});

describe('rowsToFilterGroup with field types', () => {
  const types = new Map([
    ['created', 'date' as const],
    ['assignee', 'uuid' as const],
  ]);

  it('holds back rows whose value is not valid yet', () => {
    expect(rowsToFilterGroup([row('created', 'gt', '7')], 'and', types)).toBeNull();
    expect(rowsToFilterGroup([row('assignee', 'in', 'me, 12')], 'and', types)).toBeNull();
    expect(rowsToFilterGroup([row('created', 'gt', '7d')], 'and', types)).toEqual({
      op: 'and',
      conditions: [{ field: 'created', operator: 'gt', value: '7d' }],
    });
  });
});

describe('buildSearchFilters', () => {
  it('returns null with no selections', () => {
    expect(buildSearchFilters({ statuses: [], priorities: [], rows: [], rowsOp: 'and' })).toBeNull();
  });

  it('ANDs facet selections with the builder group', () => {
    expect(
      buildSearchFilters({ statuses: ['new'], priorities: ['high'], rows: [row('assignee', 'eq', 'me')], rowsOp: 'or' })
    ).toEqual({
      op: 'and',
      conditions: [
        { field: 'status', operator: 'in', value: ['new'] },
        { field: 'priority', operator: 'in', value: ['high'] },
        { op: 'or', conditions: [{ field: 'assignee', operator: 'eq', value: 'me' }] },
      ],
    });
  });
});

describe('splitSavedFilters', () => {
  it('round-trips a tree built by the page', () => {
    const nested: SearchFilterGroup = {
      op: 'or',
      conditions: [{ op: 'and', conditions: [{ field: 'risk', operator: 'eq', value: 'high' }] }],
    };
    const state = {
      statuses: ['new', 'assigned'],
      priorities: ['critical'],
      rows: [row('created', 'gt', '7d'), row('group', 'is_null')],
      rowsOp: 'or' as const,
      nested: [nested],
    };
    const tree = buildSearchFilters(state)!;
    const split = splitSavedFilters(tree);
    expect(split.statuses).toEqual(state.statuses);
    expect(split.priorities).toEqual(state.priorities);
    expect(split.rowsOp).toBe('or');
    expect(stripIds(split.rows)).toEqual(stripIds(state.rows));
    expect(split.nested).toEqual([nested]);
    expect(buildSearchFilters(split)).toEqual(tree);
  });

  it('handles empty saved filters', () => {
    expect(splitSavedFilters({})).toEqual({ statuses: [], priorities: [], rows: [], rowsOp: 'and', nested: [] });
    expect(splitSavedFilters(null).rows).toEqual([]);
  });

  it('treats a flat OR root as builder rows', () => {
    const split = splitSavedFilters({ op: 'or', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] });
    expect(split.rowsOp).toBe('or');
    expect(stripIds(split.rows)).toEqual([{ field: 'status', operator: 'eq', value: 'new' }]);
  });

  it('keeps an OR root with nested groups intact as one nested group', () => {
    const tree: SearchFilterGroup = {
      op: 'or',
      conditions: [{ field: 'status', operator: 'eq', value: 'new' }, { op: 'and', conditions: [] }],
    };
    expect(splitSavedFilters(tree).nested).toEqual([tree]);
  });

  it('moves loose conditions into a nested group when a builder group also exists', () => {
    const tree: SearchFilterGroup = {
      op: 'and',
      conditions: [
        { field: 'severity', operator: 'eq', value: 'S1' },
        { op: 'or', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
      ],
    };
    const split = splitSavedFilters(tree);
    expect(split.rowsOp).toBe('or');
    expect(split.nested).toEqual([{ op: 'and', conditions: [{ field: 'severity', operator: 'eq', value: 'S1' }] }]);
  });
});

describe('filterGroupToRows', () => {
  it('joins list values for editing', () => {
    const parsed = filterGroupToRows({ op: 'and', conditions: [{ field: 'priority', operator: 'in', value: ['high', 'low'] }] });
    expect(parsed.rows[0].value).toBe('high, low');
  });
});

describe('small helpers', () => {
  it('toggleValue adds and removes', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('humanize formats snake case', () => {
    expect(humanize('in_progress')).toBe('In Progress');
  });
});
