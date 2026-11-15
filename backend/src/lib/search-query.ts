import type { FilterGroup, FilterEntity } from './filter-builder.js';

export const MAX_SEARCH_QUERY_LENGTH = 200;

export const SEARCH_FIELDS = ['status', 'priority', 'assignee', 'group', 'application', 'reporter'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];

export interface SearchToken {
  field: SearchField;
  value: string;
}

export interface ParsedSearchQuery {
  /** Free text, passed to websearch_to_tsquery. */
  text: string;
  tokens: SearchToken[];
}

const FIELD_SET = new Set<string>(SEARCH_FIELDS);

/**
 * Parse a search string. field:value tokens for whitelisted fields are
 * extracted (value may be "quoted"); everything else, including quoted
 * phrases, OR and -exclusions, stays in the free text.
 */
export function parseSearchQuery(input: string): ParsedSearchQuery {
  const s = (input ?? '').trim().slice(0, MAX_SEARCH_QUERY_LENGTH).trim();
  const tokens: SearchToken[] = [];
  const rest: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    // read one whitespace-delimited word, treating quoted segments as atomic
    const start = i;
    let inQuote = false;
    while (i < s.length && (inQuote || !/\s/.test(s[i]))) {
      if (s[i] === '"') inQuote = !inQuote;
      i++;
    }
    const word = s.slice(start, i);
    const m = /^([A-Za-z]+):([\s\S]*)$/.exec(word);
    if (m && FIELD_SET.has(m[1].toLowerCase())) {
      let value = m[2];
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (value.length > 0 && !value.includes('"')) {
        tokens.push({ field: m[1].toLowerCase() as SearchField, value });
        continue;
      }
    }
    rest.push(word);
  }
  return { text: rest.join(' '), tokens };
}

const FIELD_COLUMNS: Record<FilterEntity, Partial<Record<SearchField, string>>> = {
  issues: {
    status: 'status',
    priority: 'priority',
    assignee: 'assigned_to',
    group: 'assigned_group',
    application: 'application_id',
    reporter: 'reporter_id',
  },
  problems: {
    status: 'status',
    priority: 'priority',
    assignee: 'assigned_to',
    group: 'assigned_group',
    application: 'application_id',
    reporter: 'reporter_id',
  },
  requests: {
    status: 'status',
    priority: 'priority',
    assignee: 'assigned_to',
    group: 'fulfillment_group_id',
    reporter: 'requester_id',
  },
};

export interface TokenFilterResult {
  /** AND group of the satisfiable tokens, or null if there are none. */
  group: FilterGroup | null;
  /** Tokens this entity cannot satisfy. */
  unsupported: SearchToken[];
}

/** Convert tokens into an AND FilterGroup; repeated fields become an `in`. */
export function tokensToFilterGroup(entity: FilterEntity, tokens: SearchToken[]): TokenFilterResult {
  const cols = FIELD_COLUMNS[entity];
  const byField = new Map<string, string[]>();
  const unsupported: SearchToken[] = [];
  for (const t of tokens) {
    const col = cols[t.field];
    if (!col) {
      unsupported.push(t);
      continue;
    }
    const list = byField.get(col) ?? [];
    list.push(t.value);
    byField.set(col, list);
  }
  const conditions: FilterGroup['conditions'] = [];
  byField.forEach((values, field) => {
    conditions.push(
      values.length === 1
        ? { field, operator: 'eq', value: values[0] }
        : { field, operator: 'in', value: values },
    );
  });
  return { group: conditions.length ? { op: 'and', conditions } : null, unsupported };
}

/** Entities that cannot satisfy at least one of the tokens. */
export function entitiesUnableToSatisfy(tokens: SearchToken[]): FilterEntity[] {
  return (Object.keys(FIELD_COLUMNS) as FilterEntity[]).filter(
    (e) => tokensToFilterGroup(e, tokens).unsupported.length > 0,
  );
}
