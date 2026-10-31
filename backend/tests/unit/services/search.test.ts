import { describe, it, expect } from 'vitest';
import { buildFilterClause, filterGroupSchema, FilterGroup } from '../../../src/services/search-filters.js';
import { buildSearchSql, normalizeQuery } from '../../../src/services/search.js';
import { parseFilterParam, searchQuerySchema, templateSchema } from '../../../src/routes/search.js';

describe('search filter builder', () => {
  it('builds AND conditions with bound parameters', () => {
    const filter: FilterGroup = {
      logicalOperator: 'AND',
      conditions: [
        { field: 'status', operator: 'eq', value: 'new' },
        { field: 'priority', operator: 'in', value: ['high', 'critical'] },
      ],
    };
    const { sql, params } = buildFilterClause(filter);
    expect(sql).toBe('(status = $1 AND priority = ANY($2::text[]))');
    expect(params).toEqual(['new', ['high', 'critical']]);
  });

  it('builds nested OR groups with alias and start index', () => {
    const filter: FilterGroup = {
      logicalOperator: 'OR',
      conditions: [
        { field: 'assignedTo', operator: 'isNull' },
        {
          logicalOperator: 'AND',
          conditions: [
            { field: 'createdAt', operator: 'gte', value: '2026-01-01' },
            { field: 'title', operator: 'contains', value: '50%_off' },
          ],
        },
      ],
    };
    const { sql, params } = buildFilterClause(filter, 3, 't');
    expect(sql).toBe('(t.assigned_to IS NULL OR (t.created_at >= $3 AND t.title ILIKE $4))');
    expect(params).toEqual(['2026-01-01', '%50\\%\\_off%']);
  });

  it('rejects fields outside the allowlist', () => {
    expect(() =>
      buildFilterClause({
        logicalOperator: 'AND',
        conditions: [{ field: 'id; DROP TABLE issues', operator: 'eq', value: 'x' }],
      })
    ).toThrow(/Unknown filter field/);
    expect(
      filterGroupSchema.safeParse({
        logicalOperator: 'AND',
        conditions: [{ field: 'password_hash', operator: 'eq', value: 'x' }],
      }).success
    ).toBe(false);
  });

  it('rejects missing values and excessive depth', () => {
    expect(() =>
      buildFilterClause({ logicalOperator: 'AND', conditions: [{ field: 'status', operator: 'eq' }] })
    ).toThrow(/requires a value/);

    let deep: FilterGroup = { logicalOperator: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] };
    for (let i = 0; i < 6; i++) {
      deep = { logicalOperator: 'OR', conditions: [deep] };
    }
    expect(() => buildFilterClause(deep)).toThrow(/maximum depth/);
  });

  it('rejects contains on non-text fields', () => {
    expect(() =>
      buildFilterClause({
        logicalOperator: 'AND',
        conditions: [{ field: 'createdAt', operator: 'contains', value: '2026' }],
      })
    ).toThrow(/only valid for text/);
  });
});

describe('search SQL builder', () => {
  it('uses websearch_to_tsquery with ts_rank ordering when a query is given', () => {
    const { dataSql, countSql, values, countValues } = buildSearchSql('tenant_acme', {
      q: '  database   outage ',
      entityType: 'issue',
      page: 2,
      perPage: 10,
    });
    expect(dataSql).toContain("websearch_to_tsquery('english', $1)");
    expect(dataSql).toContain('ts_rank(t.search_tsvector');
    expect(dataSql).toContain('ORDER BY rank DESC');
    expect(dataSql).toContain('FROM tenant_acme.issues t');
    expect(countSql).toContain('FROM tenant_acme.issues t');
    expect(values).toEqual(['database outage', 'database outage%', 10, 10]);
    expect(countValues).toEqual(['database outage', 'database outage%']);
  });

  it('combines text query with filter parameters in order', () => {
    const { dataSql, values } = buildSearchSql('tenant_acme', {
      q: 'login',
      entityType: 'problem',
      filter: { logicalOperator: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
      page: 1,
      perPage: 20,
    });
    expect(dataSql).toContain('FROM tenant_acme.problems t');
    expect(dataSql).toContain('(t.status = $3)');
    expect(dataSql).toContain('LIMIT $4 OFFSET $5');
    expect(values).toEqual(['login', 'login%', 'new', 20, 0]);
  });

  it('omits ranking when no query is given', () => {
    const { dataSql, values } = buildSearchSql('tenant_acme', { entityType: 'issue', page: 1, perPage: 5 });
    expect(dataSql).not.toContain('websearch_to_tsquery');
    expect(dataSql).not.toContain('WHERE');
    expect(values).toEqual([5, 0]);
  });

  it('normalizes whitespace and truncates long queries', () => {
    expect(normalizeQuery('  a   b  ')).toBe('a b');
    expect(normalizeQuery('x'.repeat(600)).length).toBe(500);
    expect(normalizeQuery(undefined)).toBe('');
  });
});

describe('search route validation', () => {
  it('parses a JSON filter query parameter', () => {
    const parsed = parseFilterParam(
      JSON.stringify({ logicalOperator: 'OR', conditions: [{ field: 'priority', operator: 'eq', value: 'high' }] })
    );
    expect(parsed?.logicalOperator).toBe('OR');
    expect(parseFilterParam(undefined)).toBeUndefined();
  });

  it('rejects malformed filter parameters', () => {
    expect(() => parseFilterParam('{not json')).toThrow(/valid JSON/);
    expect(() => parseFilterParam(JSON.stringify({ logicalOperator: 'XOR', conditions: [] }))).toThrow(/Invalid filter/);
  });

  it('applies defaults and bounds to search query params', () => {
    expect(searchQuerySchema.parse({ q: 'vpn' })).toMatchObject({ entityType: 'issue', page: 1, perPage: 20 });
    expect(() => searchQuerySchema.parse({ perPage: '500' })).toThrow();
    expect(() => searchQuerySchema.parse({ entityType: 'users' })).toThrow();
  });

  it('validates filter template payloads', () => {
    expect(() => templateSchema.parse({ name: '' })).toThrow();
    expect(templateSchema.parse({ name: 'My open P1s', query: 'outage' })).toMatchObject({ entityType: 'issue' });
  });
});

describe('buildQuery', () => {
  it('validates input before building', async () => {
    const { buildQuery } = await import('../../../src/services/search-filters.js');
    expect(buildQuery({ logicalOperator: 'AND', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] }).sql).toBe(
      '(status = $1)'
    );
    expect(() => buildQuery({ logicalOperator: 'AND', conditions: [] })).toThrow(/Invalid filter/);
  });
});
