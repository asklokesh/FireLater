import type { FilterCondition, FilterGroup } from './filter-builder.js';
import { ENUM_VALUES } from './filter-builder.js';

export interface ParsedSearchQuery {
  text: string;
  filter: FilterGroup | null;
  warnings: string[];
}

const ENUM_TOKENS: Record<string, keyof typeof ENUM_VALUES> = {
  status: 'status',
  priority: 'priority',
  severity: 'severity',
  type: 'issue_type',
  source: 'source',
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Split on whitespace, keeping quoted phrases intact.
function tokenize(q: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of q) {
    if (ch === '"') inQuote = !inQuote;
    if (/\s/.test(ch) && !inQuote) {
      if (cur) tokens.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

export function parseSearchQuery(q: string): ParsedSearchQuery {
  const textParts: string[] = [];
  const conditions: FilterCondition[] = [];
  const warnings: string[] = [];

  for (const token of tokenize(q ?? '')) {
    const m = /^([a-z]+):(.*)$/i.exec(token);
    if (!m) {
      textParts.push(token);
      continue;
    }
    const key = m[1].toLowerCase();
    const raw = m[2];

    if (key in ENUM_TOKENS) {
      const field = ENUM_TOKENS[key];
      const allowed = ENUM_VALUES[field] as readonly string[];
      const vals = raw.split(',').map((v) => v.trim());
      const norm = vals.map((v) => allowed.find((a) => a.toLowerCase() === v.toLowerCase()));
      if (norm.some((v) => !v)) {
        warnings.push(`Invalid value for ${key}: "${raw}"`);
        continue;
      }
      const list = norm as string[];
      conditions.push(
        list.length === 1
          ? { field, operator: 'eq', value: list[0] }
          : { field, operator: 'in', value: list }
      );
    } else if (key === 'breached') {
      const v = raw.toLowerCase();
      if (v !== 'true' && v !== 'false') {
        warnings.push(`Invalid value for breached: "${raw}"`);
        continue;
      }
      conditions.push({ field: 'sla_breached', operator: 'eq', value: v === 'true' });
    } else if (key === 'created' || key === 'updated') {
      const dm = /^(>=|<=)(.*)$/.exec(raw);
      if (!dm || !validDate(dm[2])) {
        warnings.push(`Invalid value for ${key}: "${raw}"`);
        continue;
      }
      conditions.push({
        field: `${key}_at`,
        operator: dm[1] === '>=' ? 'gte' : 'lte',
        value: dm[2],
      });
    } else {
      textParts.push(token);
    }
  }

  return {
    text: textParts.join(' '),
    filter: conditions.length ? { op: 'and', conditions } : null,
    warnings,
  };
}
