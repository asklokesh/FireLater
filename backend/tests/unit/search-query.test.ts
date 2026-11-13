import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  parseSearchQuery,
  buildFilterSql,
  filterGroupSchema,
  ISSUE_FULLTEXT_EXPRESSION,
  type FilterGroup,
} from '../../src/utils/search-query.js';

describe('search-query', () => {
  describe('ISSUE_FULLTEXT_EXPRESSION', () => {
    it('weights title A and description B', () => {
      expect(ISSUE_FULLTEXT_EXPRESSION).toBe(
        "setweight(to_tsvector('english', coalesce(title,'')),'A') || setweight(to_tsvector('english', coalesce(description,'')),'B')"
      );
    });
  });

  describe('parseSearchQuery', () => {
    it('extracts allowlisted qualifiers and keeps free text', () => {
      const r = parseSearchQuery('database status:in_progress outage priority:HIGH severity:s1');
      expect(r.text).toBe('database outage');
      expect(r.conditions).toEqual([
        { field: 'status', operator: 'eq', value: 'in_progress' },
        { field: 'priority', operator: 'eq', value: 'high' },
        { field: 'severity', operator: 'eq', value: 'S1' },
      ]);
    });

    it('keeps unknown qualifiers and disallowed values in free text', () => {
      const r = parseSearchQuery('owner:bob status:bogus vpn');
      expect(r.conditions).toEqual([]);
      expect(r.text).toBe('owner:bob status:bogus vpn');
    });

    it('preserves quoted phrases, OR and -exclusion', () => {
      const r = parseSearchQuery('"disk full" OR memory -test status:new');
      expect(r.text).toBe('"disk full" OR memory -test');
      expect(r.conditions).toHaveLength(1);
    });

    it('handles empty input', () => {
      expect(parseSearchQuery('')).toEqual({ text: '', conditions: [] });
      expect(parseSearchQuery(undefined)).toEqual({ text: '', conditions: [] });
    });
  });

  describe('buildFilterSql', () => {
    it('renders every operator with parameters', () => {
      const group: FilterGroup = { op: 'and', conditions: [
        { field: 'status', operator: 'eq', value: 'new' },
        { field: 'priority', operator: 'neq', value: 'low' },
        { field: 'severity', operator: 'in', value: ['S1', 'S2'] },
        { field: 'assigned_group', operator: 'not_in', value: ['g1'] },
        { field: 'created_at', operator: 'gt', value: '2024-01-01' },
        { field: 'created_at', operator: 'gte', value: '2024-01-02' },
        { field: 'updated_at', operator: 'lt', value: '2024-02-01' },
        { field: 'updated_at', operator: 'lte', value: '2024-02-02' },
        { field: 'assigned_to', operator: 'is_null' },
        { field: 'application_id', operator: 'is_not_null' },
      ] };
      const r = buildFilterSql(group, 1);
      expect(r.sql).toBe(
        '(i.status = $1 AND i.priority <> $2 AND i.severity = ANY($3) AND NOT (i.assigned_group = ANY($4))' +
        ' AND i.created_at > $5 AND i.created_at >= $6 AND i.updated_at < $7 AND i.updated_at <= $8' +
        ' AND i.assigned_to IS NULL AND i.application_id IS NOT NULL)'
      );
      expect(r.values).toEqual(['new', 'low', ['S1', 'S2'], ['g1'], '2024-01-01', '2024-01-02', '2024-02-01', '2024-02-02']);
      expect(r.nextParamIndex).toBe(9);
    });

    it('nests AND/OR groups and numbers from startParamIndex', () => {
      const r = buildFilterSql({ op: 'or', conditions: [
        { field: 'reporter_id', operator: 'eq', value: 'u1' },
        { op: 'and', conditions: [
          { field: 'sla_breached', operator: 'eq', value: true },
          { op: 'or', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
        ] },
      ] }, 4);
      expect(r.sql).toBe('(i.reporter_id = $4 OR (i.sla_breached = $5 AND (i.status = $6)))');
      expect(r.values).toEqual(['u1', true, 'new']);
      expect(r.nextParamIndex).toBe(7);
    });

    it('never interpolates values (injection in values)', () => {
      const evil = "x'; DROP TABLE issues; --";
      const r = buildFilterSql({ op: 'and', conditions: [{ field: 'status', operator: 'eq', value: evil }] }, 1);
      expect(r.sql).toBe('(i.status = $1)');
      expect(r.sql).not.toContain('DROP');
      expect(r.values).toEqual([evil]);
    });

    it('rejects injection attempts in field names', () => {
      expect(() => buildFilterSql({ op: 'and', conditions: [
        { field: 'status; DROP TABLE issues' as never, operator: 'eq', value: 'x' },
      ] }, 1)).toThrow(ZodError);
    });

    it('rejects unknown fields and bad operators', () => {
      expect(filterGroupSchema.safeParse({ op: 'and', conditions: [{ field: 'title', operator: 'eq', value: 'x' }] }).success).toBe(false);
      expect(filterGroupSchema.safeParse({ op: 'and', conditions: [{ field: 'status', operator: 'like', value: 'x' }] }).success).toBe(false);
      expect(filterGroupSchema.safeParse({ op: 'xor', conditions: [{ field: 'status', operator: 'eq', value: 'x' }] }).success).toBe(false);
      expect(filterGroupSchema.safeParse({ op: 'and', conditions: [{ field: 'status', operator: 'in', value: 'x' }] }).success).toBe(false);
    });

    it('rejects nesting deeper than 3 levels', () => {
      const deep = { op: 'and', conditions: [{ op: 'and', conditions: [{ op: 'and', conditions: [
        { op: 'and', conditions: [{ field: 'status', operator: 'eq', value: 'new' }] },
      ] }] }] };
      expect(filterGroupSchema.safeParse(deep).success).toBe(false);
      expect(() => buildFilterSql(deep as FilterGroup, 1)).toThrow(ZodError);
    });

    it('rejects more than 20 conditions', () => {
      const many = Array.from({ length: 21 }, () => ({ field: 'status', operator: 'eq', value: 'new' }));
      expect(filterGroupSchema.safeParse({ op: 'or', conditions: many }).success).toBe(false);
      expect(filterGroupSchema.safeParse({ op: 'or', conditions: many.slice(0, 20) }).success).toBe(true);
    });
  });
});
