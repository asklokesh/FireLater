import { describe, it, expect } from 'vitest';
import {
  validateTenantContext,
  validateDate,
  validateDateRange,
  validateUUID,
  validateSearchQuery,
  validateLimit,
  validateOffset,
  validateEnum,
} from '../../src/utils/validation.js';
import { BadRequestError } from '../../src/utils/errors.js';

describe('Validation Utilities', () => {
  describe('validateTenantContext', () => {
    it('should pass for valid tenant slug', () => {
      expect(() => validateTenantContext('my-tenant')).not.toThrow();
    });

    it('should throw BadRequestError for undefined tenant', () => {
      expect(() => validateTenantContext(undefined)).toThrow(BadRequestError);
      expect(() => validateTenantContext(undefined)).toThrow('Tenant context required');
    });

    it('should throw BadRequestError for empty string tenant', () => {
      expect(() => validateTenantContext('')).toThrow(BadRequestError);
    });
  });

  describe('validateDate', () => {
    it('should accept valid ISO 8601 dates', () => {
      const result = validateDate('2024-01-15T10:30:00Z', 'testDate');
      expect(result).toBeInstanceOf(Date);
      expect(result?.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should accept valid date strings', () => {
      const result = validateDate('2024-06-15', 'testDate');
      expect(result).toBeInstanceOf(Date);
    });

    it('should return undefined for undefined input', () => {
      const result = validateDate(undefined, 'testDate');
      expect(result).toBeUndefined();
    });

    it('should reject dates with SQL injection patterns', () => {
      expect(() => validateDate("2024-01-01'; DROP TABLE users;--", 'testDate')).toThrow(
        BadRequestError
      );
      expect(() => validateDate("2024-01-01' OR '1'='1", 'testDate')).toThrow(BadRequestError);
      expect(() => validateDate('2024-01-01/*comment*/', 'testDate')).toThrow(BadRequestError);
    });

    it('should reject invalid date strings', () => {
      expect(() => validateDate('not-a-date', 'testDate')).toThrow(BadRequestError);
      expect(() => validateDate('2024-13-45', 'testDate')).toThrow(BadRequestError);
    });

    it('should reject dates before year 2000', () => {
      expect(() => validateDate('1999-12-31', 'testDate')).toThrow(BadRequestError);
      expect(() => validateDate('1990-01-01', 'testDate')).toThrow(BadRequestError);
    });

    it('should reject dates more than 10 years in the future', () => {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 11);
      expect(() => validateDate(farFuture.toISOString(), 'testDate')).toThrow(BadRequestError);
    });

    it('should trim whitespace from date strings', () => {
      const result = validateDate('  2024-01-15  ', 'testDate');
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('validateDateRange', () => {
    it('should accept valid date ranges', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      expect(() => validateDateRange(start, end)).not.toThrow();
    });

    it('should accept ranges within max days limit', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-12-31'); // 365 days
      expect(() => validateDateRange(start, end, 365)).not.toThrow();
    });

    it('should reject ranges exceeding max days limit', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2025-02-01'); // >365 days
      expect(() => validateDateRange(start, end, 365)).toThrow(BadRequestError);
    });

    it('should reject ranges where start is after end', () => {
      const start = new Date('2024-02-01');
      const end = new Date('2024-01-01');
      expect(() => validateDateRange(start, end)).toThrow(BadRequestError);
    });

    it('should allow equal start and end dates', () => {
      const date = new Date('2024-01-01');
      expect(() => validateDateRange(date, date)).not.toThrow();
    });

    it('should not throw if either date is undefined', () => {
      const date = new Date('2024-01-01');
      expect(() => validateDateRange(undefined, date)).not.toThrow();
      expect(() => validateDateRange(date, undefined)).not.toThrow();
      expect(() => validateDateRange(undefined, undefined)).not.toThrow();
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000', 'id')).toBe(true);
      expect(validateUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'id')).toBe(true);
    });

    it('should accept UUIDs regardless of case', () => {
      expect(validateUUID('550E8400-E29B-41D4-A716-446655440000', 'id')).toBe(true);
      expect(validateUUID('f47ac10b-58CC-4372-A567-0e02b2c3d479', 'id')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(() => validateUUID('not-a-uuid', 'id')).toThrow(BadRequestError);
      expect(() => validateUUID('550e8400-e29b-41d4-a716', 'id')).toThrow(BadRequestError);
      expect(() => validateUUID('550e8400-e29b-41d4-a716-446655440000-extra', 'id')).toThrow(
        BadRequestError
      );
    });

    it('should reject undefined/null', () => {
      expect(() => validateUUID(undefined, 'id')).toThrow(BadRequestError);
    });
  });

  describe('validateSearchQuery', () => {
    it('should accept valid search queries', () => {
      expect(validateSearchQuery('test query')).toBe('test query');
      expect(validateSearchQuery('search-term_123')).toBe('search-term_123');
    });

    it('should trim whitespace', () => {
      expect(validateSearchQuery('  test  ')).toBe('test');
    });

    it('should return undefined for empty strings', () => {
      expect(validateSearchQuery('')).toBeUndefined();
      expect(validateSearchQuery('   ')).toBeUndefined();
      expect(validateSearchQuery(undefined)).toBeUndefined();
    });

    it('should reject queries with SQL injection patterns', () => {
      expect(() => validateSearchQuery("'; DROP TABLE--")).toThrow(BadRequestError);
      expect(() => validateSearchQuery("test' OR '1'='1")).toThrow(BadRequestError);
      expect(() => validateSearchQuery('test/*comment*/')).toThrow(BadRequestError);
    });

    it('should reject queries exceeding max length', () => {
      const longQuery = 'a'.repeat(300);
      expect(() => validateSearchQuery(longQuery, 200)).toThrow(BadRequestError);
    });

    it('should accept queries within max length', () => {
      const query = 'a'.repeat(100);
      expect(validateSearchQuery(query, 200)).toBe(query);
    });
  });

  describe('validateLimit', () => {
    it('should accept valid limits as numbers', () => {
      expect(validateLimit(10)).toBe(10);
      expect(validateLimit(100)).toBe(100);
    });

    it('should accept valid limits as strings', () => {
      expect(validateLimit('25')).toBe(25);
      expect(validateLimit('500')).toBe(500);
    });

    it('should return default for undefined', () => {
      expect(validateLimit(undefined)).toBe(50);
    });

    it('should reject negative limits', () => {
      expect(() => validateLimit(-1)).toThrow(BadRequestError);
      expect(() => validateLimit('-10')).toThrow(BadRequestError);
    });

    it('should reject zero', () => {
      expect(() => validateLimit(0)).toThrow(BadRequestError);
    });

    it('should reject limits exceeding max', () => {
      expect(() => validateLimit(1001, 1000)).toThrow(BadRequestError);
      expect(() => validateLimit('2000', 1000)).toThrow(BadRequestError);
    });

    it('should reject invalid number strings', () => {
      expect(() => validateLimit('abc')).toThrow(BadRequestError);
      expect(() => validateLimit('12.5')).toThrow(BadRequestError);
    });
  });

  describe('validateOffset', () => {
    it('should accept valid offsets as numbers', () => {
      expect(validateOffset(0)).toBe(0);
      expect(validateOffset(100)).toBe(100);
    });

    it('should accept valid offsets as strings', () => {
      expect(validateOffset('0')).toBe(0);
      expect(validateOffset('250')).toBe(250);
    });

    it('should return default for undefined', () => {
      expect(validateOffset(undefined)).toBe(0);
    });

    it('should reject negative offsets', () => {
      expect(() => validateOffset(-1)).toThrow(BadRequestError);
      expect(() => validateOffset('-10')).toThrow(BadRequestError);
    });

    it('should reject invalid number strings', () => {
      expect(() => validateOffset('abc')).toThrow(BadRequestError);
      expect(() => validateOffset('12.5')).toThrow(BadRequestError);
    });
  });

  describe('validateEnum', () => {
    const validValues = ['critical', 'high', 'medium', 'low'] as const;

    it('should accept valid enum values', () => {
      expect(validateEnum('critical', validValues, 'priority')).toBe('critical');
      expect(validateEnum('low', validValues, 'priority')).toBe('low');
    });

    it('should return undefined for undefined input', () => {
      expect(validateEnum(undefined, validValues, 'priority')).toBeUndefined();
    });

    it('should reject invalid enum values', () => {
      expect(() => validateEnum('invalid', validValues, 'priority')).toThrow(BadRequestError);
      expect(() => validateEnum('CRITICAL', validValues, 'priority')).toThrow(BadRequestError);
    });

    it('should include allowed values in error message', () => {
      try {
        validateEnum('invalid', validValues, 'priority');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('critical');
        expect(error.message).toContain('high');
        expect(error.message).toContain('medium');
        expect(error.message).toContain('low');
      }
    });
  });
});
