import { describe, it, expect } from 'vitest';
import {
  SqlParams,
  buildConditionSql,
  buildFilterSql,
  filterGroupSchema,
  mergeFilters,
  parseDateValue,
  validateFilterTree,
  type FilterGroup,
} from '../../../src/lib/search/filters.js';
import { SEARCH_ENTITIES } from '../../../src/lib/search/entities.js';
import { BadRequestError } from '../../../src/utils/errors.js';

const issue = SEARCH_ENTITIES.issue;
const kb = SEARCH_ENTITIES.knowledge;
const change = SEARCH_ENTITIES.change;
const ctx = { userId: '11111111-1111-1111-1111-111111111111', now: new Date('2026-11-16T12:00:00.000Z') };
const UUID = '22222222-2222-2222-2222-222222222222';

function build(cond: Parameters<typeof buildConditionSql>[0], entity = issue) {
  const params = new SqlParams();
  const sql = buildConditionSql(cond, entity, 't', params, ctx);
  return { sql, values: params.values };
}

describe('SqlParams', () => {
  it('returns sequential placeholders', () => {
    const p = new SqlParams();
    expect(p.add('a')).toBe('$1');
    expect(p.add('b')).toBe('$2');
    expect(p.values).toEqual(['a', 'b']);
  });
});

describe('buildConditionSql', () => {
  it('builds eq for text fields with a bound parameter', () => {
    expect(build({ field: 'status', operator: 'eq', value: 'new' })).toEqual({
      sql: 't.status = $1::text',
      values: ['new'],
    });
  });

  it('maps logical field names to entity columns', () => {
    expect(build({ field: 'assignee', operator: 'eq', value: UUID }, change).sql).toBe('t.implementer_id = $1::uuid');
    expect(build({ field: 'risk', operator: 'eq', value: 'high' }, change).sql).toBe('t.risk_level = $1::text');
  });

  it('substitutes "me" for the caller on uuid fields', () => {
    expect(build({ field: 'assignee', operator: 'eq', value: 'me' }).values).toEqual([ctx.userId]);
  });

  it('rejects malformed uuids', () => {
    expect(() => build({ field: 'assignee', operator: 'eq', value: "x' OR 1=1" })).toThrow(BadRequestError);
  });

  it('builds neq as IS DISTINCT FROM so NULL rows are kept', () => {
    expect(build({ field: 'priority', operator: 'neq', value: 'low' }).sql).toBe('t.priority IS DISTINCT FROM $1::text');
  });

  it('builds in and nin with array parameters', () => {
    expect(build({ field: 'priority', operator: 'in', value: ['high', 'critical'] })).toEqual({
      sql: 't.priority = ANY($1::text[])',
      values: [['high', 'critical']],
    });
    expect(build({ field: 'status', operator: 'nin', value: ['closed'] }).sql).toBe(
      '(t.status IS NULL OR NOT (t.status = ANY($1::text[])))'
    );
  });

  it('requires at least one value for in', () => {
    expect(() => build({ field: 'status', operator: 'in', value: [] })).toThrow('requires at least one value');
  });

  it('escapes LIKE wildcards for contains', () => {
    expect(build({ field: 'status', operator: 'contains', value: '50%_off\\' })).toEqual({
      sql: 't.status ILIKE $1',
      values: ['%50\\%\\_off\\\\%'],
    });
  });

  it('builds date comparisons and day equality', () => {
    expect(build({ field: 'created', operator: 'gt', value: '7d' })).toEqual({
      sql: 't.created_at > $1::timestamptz',
      values: ['2026-11-09T12:00:00.000Z'],
    });
    expect(build({ field: 'created', operator: 'eq', value: '2026-11-01' }).sql).toContain("interval '1 day'");
  });

  it('coerces boolean values', () => {
    expect(build({ field: 'sla_breached', operator: 'eq', value: 'yes' }).values).toEqual([true]);
    expect(build({ field: 'sla_breached', operator: 'eq', value: false }).values).toEqual([false]);
    expect(() => build({ field: 'sla_breached', operator: 'eq', value: 'maybe' })).toThrow(BadRequestError);
  });

  it('builds null checks', () => {
    expect(build({ field: 'group', operator: 'is_null' }).sql).toBe('t.assigned_group IS NULL');
    expect(build({ field: 'group', operator: 'not_null' }).sql).toBe('t.assigned_group IS NOT NULL');
  });

  it('rejects operators that do not fit the field type', () => {
    expect(() => build({ field: 'status', operator: 'gt', value: 'a' })).toThrow('not supported');
    expect(() => build({ field: 'sla_breached', operator: 'contains', value: 'a' })).toThrow('not supported');
  });

  it('evaluates fields missing on an entity to FALSE, except is_null', () => {
    expect(build({ field: 'priority', operator: 'eq', value: 'high' }, kb)).toEqual({ sql: 'FALSE', values: [] });
    expect(build({ field: 'priority', operator: 'is_null' }, kb).sql).toBe('TRUE');
  });

  it('rejects values that are too long', () => {
    expect(() => build({ field: 'status', operator: 'eq', value: 'x'.repeat(201) })).toThrow('too long');
  });
});

describe('buildFilterSql', () => {
  it('combines nested AND/OR groups', () => {
    const tree: FilterGroup = {
      op: 'or',
      conditions: [
        { field: 'priority', operator: 'eq', value: 'critical' },
        {
          op: 'and',
          conditions: [
            { field: 'status', operator: 'eq', value: 'new' },
            { field: 'assignee', operator: 'is_null' },
          ],
        },
      ],
    };
    const params = new SqlParams();
    expect(buildFilterSql(tree, issue, 't', params, ctx)).toBe(
      '(t.priority = $1::text OR (t.status = $2::text AND t.assigned_to IS NULL))'
    );
    expect(params.values).toEqual(['critical', 'new']);
  });

  it('returns TRUE for an empty group', () => {
    expect(buildFilterSql({ op: 'and', conditions: [] }, issue, 't', new SqlParams(), ctx)).toBe('TRUE');
  });
});

describe('validateFilterTree', () => {
  it('rejects unknown fields', () => {
    expect(() => validateFilterTree({ op: 'and', conditions: [{ field: 'password_hash', operator: 'eq', value: 'x' }] })).toThrow(
      'Unknown filter field'
    );
  });

  it('rejects trees deeper than the limit', () => {
    let tree: FilterGroup = { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };
    for (let i = 0; i < 4; i++) tree = { op: 'and', conditions: [tree] };
    expect(() => validateFilterTree(tree)).toThrow('maximum depth');
  });

  it('rejects trees with too many conditions', () => {
    const leaves = Array.from({ length: 30 }, () => ({ field: 'status', operator: 'eq' as const, value: 'new' }));
    expect(() => validateFilterTree({ op: 'and', conditions: [{ op: 'or', conditions: leaves }, { op: 'or', conditions: leaves }] })).toThrow(
      'more than 50'
    );
  });

  it('accepts a valid tree', () => {
    expect(() =>
      validateFilterTree({ op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] })
    ).not.toThrow();
  });
});

describe('filterGroupSchema', () => {
  it('parses nested groups', () => {
    const result = filterGroupSchema.safeParse({
      op: 'and',
      conditions: [{ op: 'or', conditions: [{ field: 'status', operator: 'in', value: ['a', 'b'] }] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown operators', () => {
    expect(filterGroupSchema.safeParse({ op: 'and', conditions: [{ field: 'status', operator: 'like', value: 'a' }] }).success).toBe(false);
  });

  it('rejects invalid group operators', () => {
    expect(filterGroupSchema.safeParse({ op: 'xor', conditions: [] }).success).toBe(false);
  });
});

describe('parseDateValue', () => {
  const now = new Date('2026-11-16T12:00:00.000Z');
  it('parses relative ages', () => {
    expect(parseDateValue('12h', now)).toBe('2026-11-16T00:00:00.000Z');
    expect(parseDateValue('2w', now)).toBe('2026-11-02T12:00:00.000Z');
    expect(parseDateValue('1y', now)).toBe('2025-11-16T12:00:00.000Z');
  });

  it('parses ISO dates and datetimes', () => {
    expect(parseDateValue('2026-01-15', now)).toBe('2026-01-15T00:00:00.000Z');
    expect(parseDateValue('2026-01-15T10:30:00Z', now)).toBe('2026-01-15T10:30:00.000Z');
  });

  it('rejects other formats', () => {
    expect(() => parseDateValue('yesterday', now)).toThrow(BadRequestError);
    expect(() => parseDateValue('2026-13-45', now)).toThrow(BadRequestError);
    expect(() => parseDateValue(null, now)).toThrow(BadRequestError);
  });
});

describe('mergeFilters', () => {
  it('ANDs query conditions with the explicit tree', () => {
    const tree: FilterGroup = { op: 'or', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };
    expect(mergeFilters([{ field: 'priority', operator: 'eq', value: 'high' }], tree)).toEqual({
      op: 'and',
      conditions: [{ field: 'priority', operator: 'eq', value: 'high' }, tree],
    });
  });

  it('drops an empty tree', () => {
    expect(mergeFilters([], { op: 'or', conditions: [] })).toEqual({ op: 'and', conditions: [] });
  });
});
