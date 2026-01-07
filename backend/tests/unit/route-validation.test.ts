import { describe, it, expect } from 'vitest';
import { z, ZodError } from 'zod';

/**
 * Route Input Validation Tests
 *
 * Verifies that Zod validation schemas correctly validate:
 * 1. UUID path parameters
 * 2. Pagination query parameters
 * 3. Filter/search query parameters
 * 4. Enum validation
 * 5. Error message formatting
 */

// Common validation schemas used across routes
const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format'),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const statusEnumSchema = z.enum(['open', 'in_progress', 'resolved', 'closed']);
const priorityEnumSchema = z.enum(['critical', 'high', 'medium', 'low']);
const tierEnumSchema = z.enum(['P1', 'P2', 'P3', 'P4']);

describe('Route Input Validation', () => {
  describe('UUID Parameter Validation', () => {
    it('should accept valid UUIDs', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      ];

      validUUIDs.forEach((uuid) => {
        const result = uuidParamSchema.safeParse({ id: uuid });
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid UUID formats', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '123',
        '',
        '123e4567-e89b-12d3-a456',
        '123e4567e89b12d3a456426614174000',
        'INVALID-UUID-FORMAT',
        '123e4567-e89b-12d3-a456-42661417400g', // invalid char
        '123e4567-e89b-12d3-a456-4266141740000', // too long
      ];

      invalidUUIDs.forEach((uuid) => {
        const result = uuidParamSchema.safeParse({ id: uuid });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues[0].message).toContain('Invalid');
        }
      });
    });

    it('should reject SQL injection attempts in UUID field', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        '1 OR 1=1',
        'UNION SELECT * FROM users',
        "admin'--",
      ];

      sqlInjectionAttempts.forEach((attempt) => {
        const result = uuidParamSchema.safeParse({ id: attempt });
        expect(result.success).toBe(false);
      });
    });

    it('should reject path traversal attempts in UUID field', () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '%2e%2e%2f',
      ];

      pathTraversalAttempts.forEach((attempt) => {
        const result = uuidParamSchema.safeParse({ id: attempt });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Pagination Validation', () => {
    it('should accept valid pagination parameters', () => {
      const validParams = [
        { page: '1', perPage: '20' },
        { page: '100', perPage: '50' },
        { page: '1', perPage: '1' },
        { page: '1', perPage: '100' },
      ];

      validParams.forEach((params) => {
        const result = paginationSchema.safeParse(params);
        expect(result.success).toBe(true);
      });
    });

    it('should apply defaults when parameters are missing', () => {
      const result = paginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.perPage).toBe(20);
      }
    });

    it('should coerce string numbers to integers', () => {
      const result = paginationSchema.safeParse({ page: '5', perPage: '30' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.page).toBe('number');
        expect(typeof result.data.perPage).toBe('number');
        expect(result.data.page).toBe(5);
        expect(result.data.perPage).toBe(30);
      }
    });

    it('should reject invalid page numbers', () => {
      const invalidPages = [
        { page: '0' },
        { page: '-1' },
        { page: 'abc' },
        { page: '1.5' },
      ];

      invalidPages.forEach((params) => {
        const result = paginationSchema.safeParse(params);
        expect(result.success).toBe(false);
      });
    });

    it('should reject perPage values outside bounds', () => {
      const invalidPerPage = [
        { perPage: '0' },
        { perPage: '-1' },
        { perPage: '101' },
        { perPage: '1000' },
      ];

      invalidPerPage.forEach((params) => {
        const result = paginationSchema.safeParse(params);
        expect(result.success).toBe(false);
      });
    });

    it('should prevent denial of service via large perPage values', () => {
      const result = paginationSchema.safeParse({ perPage: '999999' });
      expect(result.success).toBe(false);
    });
  });

  describe('Enum Validation', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
      validStatuses.forEach((status) => {
        const result = statusEnumSchema.safeParse(status);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status values', () => {
      const invalidStatuses = ['invalid', 'OPEN', 'Open', '', 'pending'];
      invalidStatuses.forEach((status) => {
        const result = statusEnumSchema.safeParse(status);
        expect(result.success).toBe(false);
      });
    });

    it('should accept valid priority values', () => {
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      validPriorities.forEach((priority) => {
        const result = priorityEnumSchema.safeParse(priority);
        expect(result.success).toBe(true);
      });
    });

    it('should accept valid tier values', () => {
      const validTiers = ['P1', 'P2', 'P3', 'P4'];
      validTiers.forEach((tier) => {
        const result = tierEnumSchema.safeParse(tier);
        expect(result.success).toBe(true);
      });
    });

    it('should reject case-sensitive enum mismatches', () => {
      expect(tierEnumSchema.safeParse('p1').success).toBe(false);
      expect(tierEnumSchema.safeParse('p2').success).toBe(false);
      expect(statusEnumSchema.safeParse('OPEN').success).toBe(false);
    });
  });

  describe('Compound Parameter Validation', () => {
    const issueWorklogParamSchema = z.object({
      issueId: z.string().uuid(),
      worklogId: z.string().uuid(),
    });

    it('should validate compound UUID parameters', () => {
      const result = issueWorklogParamSchema.safeParse({
        issueId: '123e4567-e89b-12d3-a456-426614174000',
        worklogId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject if any UUID in compound param is invalid', () => {
      const testCases = [
        { issueId: 'invalid', worklogId: '550e8400-e29b-41d4-a716-446655440000' },
        { issueId: '123e4567-e89b-12d3-a456-426614174000', worklogId: 'invalid' },
        { issueId: 'invalid', worklogId: 'invalid' },
      ];

      testCases.forEach((params) => {
        const result = issueWorklogParamSchema.safeParse(params);
        expect(result.success).toBe(false);
      });
    });
  });

  describe('Search Query Validation', () => {
    const searchQuerySchema = z.object({
      q: z.string().max(500).optional(),
      status: statusEnumSchema.optional(),
      priority: priorityEnumSchema.optional(),
      assignedTo: z.string().uuid().optional(),
    });

    it('should accept valid search queries', () => {
      const validQueries = [
        { q: 'network issue' },
        { q: 'test', status: 'open' },
        { status: 'resolved', priority: 'high' },
        { assignedTo: '123e4567-e89b-12d3-a456-426614174000' },
      ];

      validQueries.forEach((query) => {
        const result = searchQuerySchema.safeParse(query);
        expect(result.success).toBe(true);
      });
    });

    it('should reject search queries exceeding max length', () => {
      const longQuery = 'a'.repeat(501);
      const result = searchQuerySchema.safeParse({ q: longQuery });
      expect(result.success).toBe(false);
    });

    it('should reject invalid filter combinations', () => {
      const result = searchQuerySchema.safeParse({
        status: 'invalid_status',
        priority: 'invalid_priority',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Error Message Quality', () => {
    it('should provide descriptive error messages for UUID validation', () => {
      const result = uuidParamSchema.safeParse({ id: 'not-valid' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.issues[0];
        expect(error.path).toContain('id');
        expect(error.message.toLowerCase()).toContain('uuid');
      }
    });

    it('should indicate field names in error paths', () => {
      const compoundSchema = z.object({
        userId: z.string().uuid(),
        roleId: z.string().uuid(),
      });

      const result = compoundSchema.safeParse({
        userId: 'valid-user',
        roleId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('userId');
      }
    });

    it('should collect all validation errors', () => {
      const multiFieldSchema = z.object({
        id: z.string().uuid(),
        name: z.string().min(1),
        page: z.coerce.number().positive(),
      });

      const result = multiFieldSchema.safeParse({
        id: 'invalid',
        name: '',
        page: '-1',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        // Should have multiple errors
        expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe('ZodError Handling', () => {
    it('should be catchable as ZodError instance', () => {
      const schema = z.object({ id: z.string().uuid() });

      try {
        schema.parse({ id: 'invalid' });
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error instanceof ZodError).toBe(true);
      }
    });

    it('should provide structured error details', () => {
      const schema = z.object({ id: z.string().uuid() });
      const result = schema.safeParse({ id: 'invalid' });

      expect(result.success).toBe(false);
      if (!result.success) {
        const issue = result.error.issues[0];
        expect(issue).toHaveProperty('code');
        expect(issue).toHaveProperty('path');
        expect(issue).toHaveProperty('message');
      }
    });
  });
});
