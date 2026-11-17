import type {
  SearchEntityType,
  SearchFilterCondition,
  SearchFilterGroup,
  SearchFilterOperator,
} from './api';

/** Private-use code points the API wraps around highlighted terms. */
export const HIGHLIGHT_START = '';
export const HIGHLIGHT_END = '';

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

/**
 * Splits an API snippet into plain and highlighted segments. Rendering the
 * segments as React text nodes keeps record content from ever being parsed as
 * HTML.
 */
export function splitHighlights(snippet: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let highlighted = false;
  let buffer = '';
  for (const ch of snippet) {
    if (ch === HIGHLIGHT_START || ch === HIGHLIGHT_END) {
      if (buffer) segments.push({ text: buffer, highlighted });
      buffer = '';
      highlighted = ch === HIGHLIGHT_START;
      continue;
    }
    buffer += ch;
  }
  if (buffer) segments.push({ text: buffer, highlighted });
  return segments;
}

export const ENTITY_LABELS: Record<SearchEntityType, string> = {
  issue: 'Issues',
  problem: 'Problems',
  change: 'Changes',
  knowledge: 'Knowledge Base',
};

export const ENTITY_SINGULAR: Record<SearchEntityType, string> = {
  issue: 'Issue',
  problem: 'Problem',
  change: 'Change',
  knowledge: 'Article',
};

export const OPERATOR_LABELS: Record<SearchFilterOperator, string> = {
  eq: 'is',
  neq: 'is not',
  in: 'is any of',
  nin: 'is none of',
  gt: 'after',
  gte: 'on or after',
  lt: 'before',
  lte: 'on or before',
  contains: 'contains',
  is_null: 'is empty',
  not_null: 'is not empty',
};

export const OPERATORS_BY_FIELD_TYPE: Record<SearchFieldType, SearchFilterOperator[]> = {
  text: ['eq', 'neq', 'in', 'nin', 'contains', 'is_null', 'not_null'],
  uuid: ['eq', 'neq', 'in', 'nin', 'is_null', 'not_null'],
  boolean: ['eq', 'neq'],
  date: ['gt', 'gte', 'lt', 'lte', 'eq', 'is_null', 'not_null'],
};

export function operatorNeedsValue(op: SearchFilterOperator): boolean {
  return op !== 'is_null' && op !== 'not_null';
}

/** A flat filter row as edited in the filter builder UI. */
export interface FilterRow {
  id: string;
  field: string;
  operator: SearchFilterOperator;
  value: string;
}

export type SearchFieldType = 'text' | 'uuid' | 'date' | 'boolean';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELATIVE_DATE_RE = /^\d{1,4}[hdwmy]$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const BOOLEAN_VALUES = new Set(['true', 'false', 'yes', 'no', '1', '0']);

/**
 * Mirrors the API's value rules so half-typed values (for example "7" on the
 * way to "7d") are held back instead of producing a 400.
 */
export function isValidFilterValue(type: SearchFieldType | undefined, value: string): boolean {
  switch (type) {
    case 'uuid':
      return value.toLowerCase() === 'me' || UUID_RE.test(value);
    case 'date':
      return RELATIVE_DATE_RE.test(value) || (ISO_DATE_RE.test(value) && !Number.isNaN(new Date(value).getTime()));
    case 'boolean':
      return BOOLEAN_VALUES.has(value.toLowerCase());
    default:
      return value.length > 0 && value.length <= 200;
  }
}

/**
 * Converts builder rows into an API filter group, dropping rows that are
 * incomplete or whose value is not valid for the field type.
 */
export function rowsToFilterGroup(
  rows: FilterRow[],
  op: 'and' | 'or',
  fieldTypes?: ReadonlyMap<string, SearchFieldType>
): SearchFilterGroup | null {
  const conditions: SearchFilterCondition[] = [];
  for (const row of rows) {
    if (!row.field) continue;
    if (!operatorNeedsValue(row.operator)) {
      conditions.push({ field: row.field, operator: row.operator });
      continue;
    }
    const type = fieldTypes?.get(row.field);
    const raw = row.value.trim();
    if (!raw) continue;
    if (row.operator === 'in' || row.operator === 'nin') {
      const values = raw.split(',').map((v) => v.trim()).filter(Boolean);
      if (values.length && values.every((v) => isValidFilterValue(type, v))) {
        conditions.push({ field: row.field, operator: row.operator, value: values });
      }
    } else if (isValidFilterValue(type, raw)) {
      conditions.push({ field: row.field, operator: row.operator, value: raw });
    }
  }
  return conditions.length ? { op, conditions } : null;
}

let rowCounter = 0;
export function newRowId(): string {
  rowCounter += 1;
  return `row-${Date.now().toString(36)}-${rowCounter}`;
}

/**
 * Converts a saved flat filter group back into builder rows. Nested groups
 * are not representable as rows and are returned separately.
 */
export function filterGroupToRows(group: SearchFilterGroup | Record<string, never> | null | undefined): {
  op: 'and' | 'or';
  rows: FilterRow[];
  nested: SearchFilterGroup[];
} {
  if (!group || !('conditions' in group) || !Array.isArray(group.conditions)) {
    return { op: 'and', rows: [], nested: [] };
  }
  const rows: FilterRow[] = [];
  const nested: SearchFilterGroup[] = [];
  for (const c of group.conditions) {
    if ('conditions' in c) {
      nested.push(c);
      continue;
    }
    const value = Array.isArray(c.value) ? c.value.join(', ') : c.value === undefined || c.value === null ? '' : String(c.value);
    rows.push({ id: newRowId(), field: c.field, operator: c.operator, value });
  }
  return { op: group.op, rows, nested };
}

/** Builds the full filter tree sent to the API from page state. */
export function buildSearchFilters(params: {
  statuses: string[];
  priorities: string[];
  rows: FilterRow[];
  rowsOp: 'and' | 'or';
  nested?: SearchFilterGroup[];
  fieldTypes?: ReadonlyMap<string, SearchFieldType>;
}): SearchFilterGroup | null {
  const conditions: Array<SearchFilterCondition | SearchFilterGroup> = [];
  if (params.statuses.length) conditions.push({ field: 'status', operator: 'in', value: params.statuses });
  if (params.priorities.length) conditions.push({ field: 'priority', operator: 'in', value: params.priorities });
  const builder = rowsToFilterGroup(params.rows, params.rowsOp, params.fieldTypes);
  if (builder) conditions.push(builder);
  for (const n of params.nested ?? []) conditions.push(n);
  return conditions.length ? { op: 'and', conditions } : null;
}

/**
 * Splits a saved filter tree back into facet selections, builder rows and any
 * nested groups the builder cannot show as rows. The result rebuilds to an
 * equivalent tree with buildSearchFilters.
 */
export function splitSavedFilters(group: SearchFilterGroup | Record<string, never> | null | undefined): {
  statuses: string[];
  priorities: string[];
  rows: FilterRow[];
  rowsOp: 'and' | 'or';
  nested: SearchFilterGroup[];
} {
  const statuses: string[] = [];
  const priorities: string[] = [];
  const nested: SearchFilterGroup[] = [];
  if (!group || !('conditions' in group) || !Array.isArray(group.conditions)) {
    return { statuses, priorities, rows: [], rowsOp: 'and', nested };
  }
  const root = group as SearchFilterGroup;
  if (root.op === 'or') {
    const parsed = filterGroupToRows(root);
    if (parsed.nested.length) return { statuses, priorities, rows: [], rowsOp: 'and', nested: [root] };
    return { statuses, priorities, rows: parsed.rows, rowsOp: 'or', nested };
  }

  let builder: SearchFilterGroup | null = null;
  const extra: SearchFilterCondition[] = [];
  for (const c of group.conditions) {
    if ('conditions' in c) {
      const flat = c.conditions.every((x) => !('conditions' in x));
      if (flat && !builder) builder = c;
      else nested.push(c);
    } else if (c.field === 'status' && c.operator === 'in' && Array.isArray(c.value) && !statuses.length) {
      statuses.push(...c.value.map(String));
    } else if (c.field === 'priority' && c.operator === 'in' && Array.isArray(c.value) && !priorities.length) {
      priorities.push(...c.value.map(String));
    } else {
      extra.push(c);
    }
  }

  if (builder && extra.length) {
    // Both cannot share one row list without changing meaning.
    nested.push({ op: 'and', conditions: extra });
  }
  if (builder) {
    const parsed = filterGroupToRows(builder);
    return { statuses, priorities, rows: parsed.rows, rowsOp: parsed.op, nested };
  }
  return { statuses, priorities, rows: filterGroupToRows({ op: 'and', conditions: extra }).rows, rowsOp: 'and', nested };
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
