/**
 * Advanced filter query builder.
 * Turns a nested filterGroup (AND/OR) into a parameterized SQL WHERE fragment.
 * Only allowlisted fields and operators are accepted; values are always bound.
 */

export type FilterOperator = 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte' | 'is_null' | 'not_null';

export interface FilterCondition {
  field: string;
  op: FilterOperator;
  value?: unknown;
}

export interface FilterGroup {
  operator: 'AND' | 'OR';
  conditions: Array<FilterCondition | FilterGroup>;
}

/** Allowlisted filter fields mapped to SQL column expressions (issues alias i). */
export const FILTER_FIELDS: Record<string, string> = {
  status: 'i.status',
  priority: 'i.priority',
  severity: 'i.severity',
  urgency: 'i.urgency',
  impact: 'i.impact',
  category: 'i.category_id',
  assigned_to: 'i.assigned_to',
  assigned_group: 'i.assigned_group',
  application: 'i.application_id',
  reporter: 'i.reporter_id',
  sla_breached: 'i.sla_breached',
  created_at: 'i.created_at',
  updated_at: 'i.updated_at',
};

const OPERATORS = new Set<FilterOperator>(['eq', 'neq', 'in', 'contains', 'gt', 'gte', 'lt', 'lte', 'is_null', 'not_null']);
const MAX_DEPTH = 5;
const MAX_CONDITIONS = 50;

export class FilterValidationError extends Error {}

export interface BuiltFilter {
  sql: string;
  params: unknown[];
}

function isGroup(node: FilterCondition | FilterGroup): node is FilterGroup {
  return typeof node === 'object' && node !== null && 'conditions' in node;
}

/**
 * Build a WHERE fragment. Placeholders start at $(startIndex).
 * Returns sql '' when the group has no conditions.
 */
export function buildFilterQuery(group: FilterGroup | undefined, startIndex = 1): BuiltFilter {
  const params: unknown[] = [];
  let count = 0;

  const next = (value: unknown): string => {
    params.push(value);
    return `$${startIndex + params.length - 1}`;
  };

  const buildCondition = (c: FilterCondition): string => {
    const column = FILTER_FIELDS[c.field];
    if (!column) throw new FilterValidationError(`Unknown filter field: ${String(c.field)}`);
    if (!OPERATORS.has(c.op)) throw new FilterValidationError(`Unknown filter operator: ${String(c.op)}`);
    switch (c.op) {
      case 'eq': return `${column} = ${next(c.value)}`;
      case 'neq': return `${column} <> ${next(c.value)}`;
      case 'gt': return `${column} > ${next(c.value)}`;
      case 'gte': return `${column} >= ${next(c.value)}`;
      case 'lt': return `${column} < ${next(c.value)}`;
      case 'lte': return `${column} <= ${next(c.value)}`;
      case 'is_null': return `${column} IS NULL`;
      case 'not_null': return `${column} IS NOT NULL`;
      case 'contains': {
        const escaped = String(c.value ?? '').replace(/[\\%_]/g, (m) => `\\${m}`);
        return `${column}::text ILIKE ${next(`%${escaped}%`)}`;
      }
      case 'in': {
        if (!Array.isArray(c.value) || c.value.length === 0) {
          throw new FilterValidationError(`Operator "in" requires a non-empty array for ${c.field}`);
        }
        return `${column}::text = ANY(${next(c.value.map(String))}::text[])`;
      }
    }
    throw new FilterValidationError(`Unsupported operator: ${String(c.op)}`);
  };

  const buildGroup = (g: FilterGroup, depth: number): string => {
    if (depth > MAX_DEPTH) throw new FilterValidationError('Filter nesting too deep');
    if (g.operator !== 'AND' && g.operator !== 'OR') {
      throw new FilterValidationError(`Invalid group operator: ${String(g.operator)}`);
    }
    if (!Array.isArray(g.conditions)) throw new FilterValidationError('conditions must be an array');
    const parts: string[] = [];
    for (const node of g.conditions) {
      if (isGroup(node)) {
        const inner = buildGroup(node, depth + 1);
        if (inner) parts.push(`(${inner})`);
      } else {
        count += 1;
        if (count > MAX_CONDITIONS) throw new FilterValidationError('Too many filter conditions');
        parts.push(buildCondition(node));
      }
    }
    return parts.join(` ${g.operator} `);
  };

  if (!group) return { sql: '', params };
  return { sql: buildGroup(group, 1), params };
}

/**
 * Parse a search query string into free text plus a filterGroup.
 * "printer status:new,assigned -priority:low" -> text "printer",
 * AND of (status IN [new, assigned]) and (priority <> low).
 * Tokens without a known field prefix are kept as free text.
 */
export function parseSearchQuery(input: string): { text: string; filterGroup: FilterGroup } {
  const conditions: FilterCondition[] = [];
  const textParts: string[] = [];
  const tokens = input.match(/"[^"]*"|\S+/g) ?? [];
  for (const token of tokens) {
    const m = /^(-?)([a-z_]+):(.+)$/.exec(token);
    if (m && FILTER_FIELDS[m[2]]) {
      const values = m[3].split(',').filter(Boolean);
      const negate = m[1] === '-';
      if (values.length > 1 && !negate) {
        conditions.push({ field: m[2], op: 'in', value: values });
      } else {
        conditions.push({ field: m[2], op: negate ? 'neq' : 'eq', value: values[0] });
      }
    } else {
      textParts.push(token);
    }
  }
  return { text: textParts.join(' '), filterGroup: { operator: 'AND', conditions } };
}
