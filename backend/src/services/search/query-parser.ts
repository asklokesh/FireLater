import { searchConfig, type SearchEntity } from './config.js';

export interface ParsedFilterToken {
  field: string;
  value: string;
}

export interface ParsedSearchQuery {
  /** field:value tokens for whitelisted fields (equality conditions) */
  filters: ParsedFilterToken[];
  /** Remaining text; pass as a bound parameter to websearch_to_tsquery, never interpolate. */
  text: string;
}

/**
 * Splits a raw query into whitespace-separated tokens, keeping double-quoted
 * phrases (including a quoted field value like title:"x y") intact.
 */
function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of raw) {
    if (ch === '"') {
      inQuote = !inQuote;
      cur += ch;
    } else if (/\s/.test(ch) && !inQuote) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

export function parseSearchQuery(raw: string, entity: SearchEntity): ParsedSearchQuery {
  const fields = new Set(searchConfig[entity].filterFields.map((f) => f.column));
  const filters: ParsedFilterToken[] = [];
  const rest: string[] = [];

  for (const token of tokenize(raw ?? '')) {
    const m = /^([a-z_][a-z0-9_]*):(.+)$/i.exec(token);
    if (m) {
      const field = m[1].toLowerCase();
      let value = m[2];
      if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      if (fields.has(field) && value.length > 0 && !value.includes('"')) {
        filters.push({ field, value });
        continue;
      }
    }
    rest.push(token);
  }

  return { filters, text: rest.join(' ').trim() };
}
