/**
 * Search query syntax parser.
 *
 * Splits a raw query string into:
 *   - free text, passed to Postgres websearch_to_tsquery (which supports
 *     "quoted phrases", OR and -exclusion and never throws on user input)
 *   - field qualifiers such as status:open, priority:high,critical,
 *     -status:closed, created:>7d, assignee:me, group:none
 *   - type:issue,problem which restricts the entity types searched
 *
 * Unknown qualifiers are kept as free text so queries such as
 * "error: timeout" still work. See docs/SEARCH_QUERY_SYNTAX.md.
 */
import { ALL_SEARCH_FIELDS, isSearchEntityType, type SearchEntityType } from './entities.js';
import type { FilterCondition, FilterOperator } from './filters.js';

export const MAX_QUERY_LENGTH = 500;

export interface ParsedQuery {
  /** Free text for full-text matching (may be empty) */
  text: string;
  conditions: FilterCondition[];
  /** null means "all entity types the caller may see" */
  entityTypes: SearchEntityType[] | null;
  /** Record numbers (e.g. ISS-00012) found in the free text */
  numbers: string[];
  warnings: string[];
}

const TYPE_ALIASES: Record<string, SearchEntityType> = {
  issue: 'issue',
  issues: 'issue',
  incident: 'issue',
  incidents: 'issue',
  problem: 'problem',
  problems: 'problem',
  change: 'change',
  changes: 'change',
  kb: 'knowledge',
  article: 'knowledge',
  articles: 'knowledge',
  knowledge: 'knowledge',
};

const NULL_WORDS = new Set(['none', 'null', 'empty']);
const NUMBER_RE = /^[A-Za-z]{2,5}-\d{1,10}$/;

// -field:op"quoted value" | -field:opvalue | "quoted text" | bare word
const TOKEN_RE = /(-?)([A-Za-z_]+):(>=|<=|>|<|!)?(?:"([^"]*)"|(\S+))|"[^"]*"?|\S+/g;

function resolveOperator(neg: boolean, cmp: string | undefined, values: string[]): FilterOperator {
  const negated = neg || cmp === '!';
  if (values.length === 1 && NULL_WORDS.has(values[0].toLowerCase())) {
    return negated ? 'not_null' : 'is_null';
  }
  switch (cmp) {
    case '>':
      return 'gt';
    case '>=':
      return 'gte';
    case '<':
      return 'lt';
    case '<=':
      return 'lte';
    default:
      if (values.length > 1) return negated ? 'nin' : 'in';
      return negated ? 'neq' : 'eq';
  }
}

export function parseSearchQuery(input: string | undefined | null): ParsedQuery {
  const result: ParsedQuery = { text: '', conditions: [], entityTypes: null, numbers: [], warnings: [] };
  if (!input) return result;

  const raw = input.slice(0, MAX_QUERY_LENGTH);
  const textParts: string[] = [];
  const types = new Set<SearchEntityType>();

  for (const match of raw.matchAll(TOKEN_RE)) {
    const [token, neg, field, cmp, quoted, bare] = match;
    const fieldName = field?.toLowerCase();

    if (fieldName === 'type') {
      const values = (quoted ?? bare ?? '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
      for (const v of values) {
        const resolved = TYPE_ALIASES[v] ?? (isSearchEntityType(v) ? v : undefined);
        if (resolved) types.add(resolved);
        else result.warnings.push(`Unknown type "${v}" ignored`);
      }
      continue;
    }

    if (fieldName && ALL_SEARCH_FIELDS.has(fieldName)) {
      const rawValue = quoted ?? bare ?? '';
      const values = quoted !== undefined ? [rawValue] : rawValue.split(',').map((v) => v.trim()).filter(Boolean);
      if (values.length === 0) {
        result.warnings.push(`Qualifier "${fieldName}:" has no value and was ignored`);
        continue;
      }
      const operator = resolveOperator(neg === '-', cmp, values);
      const condition: FilterCondition = { field: fieldName, operator };
      if (operator === 'in' || operator === 'nin') condition.value = values;
      else if (operator !== 'is_null' && operator !== 'not_null') condition.value = values[0];
      result.conditions.push(condition);
      continue;
    }

    textParts.push(token);
    const bareWord = token.replace(/^-/, '');
    if (NUMBER_RE.test(bareWord) && !token.startsWith('-')) {
      result.numbers.push(bareWord.toUpperCase());
    }
  }

  result.text = textParts.join(' ').trim();
  if (types.size > 0) result.entityTypes = [...types];
  return result;
}

/**
 * Builds a safe prefix tsquery string for autocomplete ("pass res" ->
 * "pass:* & res:*"). Tokens are reduced to letters and digits so the result is
 * always valid input for to_tsquery.
 */
export function buildPrefixTsQuery(input: string): string {
  const tokens = input
    .slice(0, 100)
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .slice(0, 5);
  return tokens.map((t) => `${t}:*`).join(' & ');
}

/** Normalizes a query for analytics grouping. */
export function normalizeQuery(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
}
