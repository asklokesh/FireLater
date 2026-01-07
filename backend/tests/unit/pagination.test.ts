import { describe, it, expect } from 'vitest';
import {
  paginationSchema,
  parsePagination,
  createPaginatedResponse,
  getOffset,
} from '../../src/utils/pagination.js';

/**
 * Unit tests for pagination utilities
 * Testing schema validation, parsing, response creation, and offset calculation
 */

describe('Pagination Utilities', () => {
  describe('paginationSchema', () => {
    it('should parse valid pagination with all fields', () => {
      const result = paginationSchema.parse({
        page: 2,
        per_page: 50,
        sort: 'created_at',
        order: 'asc',
      });

      expect(result.page).toBe(2);
      expect(result.per_page).toBe(50);
      expect(result.sort).toBe('created_at');
      expect(result.order).toBe('asc');
    });

    it('should apply defaults for missing fields', () => {
      const result = paginationSchema.parse({});

      expect(result.page).toBe(1);
      expect(result.per_page).toBe(25);
      expect(result.order).toBe('desc');
      expect(result.sort).toBeUndefined();
    });

    it('should coerce string page to number', () => {
      const result = paginationSchema.parse({ page: '5' });

      expect(result.page).toBe(5);
    });

    it('should coerce string per_page to number', () => {
      const result = paginationSchema.parse({ per_page: '30' });

      expect(result.per_page).toBe(30);
    });

    it('should reject page less than 1', () => {
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
      expect(() => paginationSchema.parse({ page: -1 })).toThrow();
    });

    it('should reject per_page less than 1', () => {
      expect(() => paginationSchema.parse({ per_page: 0 })).toThrow();
      expect(() => paginationSchema.parse({ per_page: -5 })).toThrow();
    });

    it('should reject per_page greater than 100', () => {
      expect(() => paginationSchema.parse({ per_page: 101 })).toThrow();
      expect(() => paginationSchema.parse({ per_page: 500 })).toThrow();
    });

    it('should accept per_page at boundary values', () => {
      expect(paginationSchema.parse({ per_page: 1 }).per_page).toBe(1);
      expect(paginationSchema.parse({ per_page: 100 }).per_page).toBe(100);
    });

    it('should reject invalid order values', () => {
      expect(() => paginationSchema.parse({ order: 'ascending' })).toThrow();
      expect(() => paginationSchema.parse({ order: 'random' })).toThrow();
    });

    it('should accept asc and desc order', () => {
      expect(paginationSchema.parse({ order: 'asc' }).order).toBe('asc');
      expect(paginationSchema.parse({ order: 'desc' }).order).toBe('desc');
    });
  });

  describe('parsePagination', () => {
    it('should parse query and return PaginationParams', () => {
      const result = parsePagination({
        page: 3,
        per_page: 20,
        sort: 'updated_at',
        order: 'asc',
      });

      expect(result).toEqual({
        page: 3,
        perPage: 20,
        sort: 'updated_at',
        order: 'asc',
      });
    });

    it('should convert per_page to perPage', () => {
      const result = parsePagination({ per_page: 50 });

      expect(result.perPage).toBe(50);
      expect(result).not.toHaveProperty('per_page');
    });

    it('should handle defaults correctly', () => {
      const result = parsePagination({});

      expect(result.page).toBe(1);
      expect(result.perPage).toBe(25);
      expect(result.order).toBe('desc');
    });

    it('should throw on invalid input', () => {
      expect(() => parsePagination({ page: -1 })).toThrow();
    });
  });

  describe('createPaginatedResponse', () => {
    it('should create response with correct structure', () => {
      const data = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const params = { page: 1, perPage: 10, order: 'desc' as const };

      const result = createPaginatedResponse(data, 25, params);

      expect(result.data).toEqual(data);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.perPage).toBe(10);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('should calculate totalPages correctly', () => {
      const params = { page: 1, perPage: 10, order: 'desc' as const };

      expect(createPaginatedResponse([], 0, params).pagination.totalPages).toBe(0);
      expect(createPaginatedResponse([], 1, params).pagination.totalPages).toBe(1);
      expect(createPaginatedResponse([], 10, params).pagination.totalPages).toBe(1);
      expect(createPaginatedResponse([], 11, params).pagination.totalPages).toBe(2);
      expect(createPaginatedResponse([], 100, params).pagination.totalPages).toBe(10);
    });

    it('should handle empty data array', () => {
      const params = { page: 1, perPage: 25, order: 'desc' as const };
      const result = createPaginatedResponse([], 0, params);

      expect(result.data).toEqual([]);
      expect(result.pagination.total).toBe(0);
      expect(result.pagination.totalPages).toBe(0);
    });

    it('should preserve generic type', () => {
      interface User {
        id: string;
        name: string;
      }

      const users: User[] = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];
      const params = { page: 1, perPage: 10, order: 'asc' as const };

      const result = createPaginatedResponse<User>(users, 2, params);

      expect(result.data[0].name).toBe('Alice');
      expect(result.data[1].id).toBe('2');
    });

    it('should include sort in params when provided', () => {
      const params = { page: 1, perPage: 10, sort: 'name', order: 'asc' as const };
      const result = createPaginatedResponse([], 0, params);

      expect(result.pagination.page).toBe(1);
    });
  });

  describe('getOffset', () => {
    it('should return 0 for page 1', () => {
      const offset = getOffset({ page: 1, perPage: 25, order: 'desc' });

      expect(offset).toBe(0);
    });

    it('should calculate offset for page 2', () => {
      const offset = getOffset({ page: 2, perPage: 25, order: 'desc' });

      expect(offset).toBe(25);
    });

    it('should calculate offset for page 10', () => {
      const offset = getOffset({ page: 10, perPage: 25, order: 'desc' });

      expect(offset).toBe(225);
    });

    it('should handle different perPage values', () => {
      expect(getOffset({ page: 3, perPage: 10, order: 'desc' })).toBe(20);
      expect(getOffset({ page: 3, perPage: 50, order: 'desc' })).toBe(100);
      expect(getOffset({ page: 3, perPage: 100, order: 'desc' })).toBe(200);
    });

    it('should work with page 1 and any perPage', () => {
      expect(getOffset({ page: 1, perPage: 1, order: 'desc' })).toBe(0);
      expect(getOffset({ page: 1, perPage: 100, order: 'desc' })).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large page numbers', () => {
      const params = { page: 1000000, perPage: 25, order: 'desc' as const };
      const offset = getOffset(params);

      expect(offset).toBe(24999975);
    });

    it('should handle perPage of 1', () => {
      const params = { page: 5, perPage: 1, order: 'desc' as const };

      expect(getOffset(params)).toBe(4);
      expect(createPaginatedResponse([], 100, params).pagination.totalPages).toBe(100);
    });

    it('should handle single item response', () => {
      const data = [{ id: 1 }];
      const params = { page: 1, perPage: 10, order: 'desc' as const };
      const result = createPaginatedResponse(data, 1, params);

      expect(result.data.length).toBe(1);
      expect(result.pagination.total).toBe(1);
      expect(result.pagination.totalPages).toBe(1);
    });
  });
});
