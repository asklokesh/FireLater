import { describe, it, expect } from 'vitest';
import { validateTenantSchema } from '../../../src/middleware/tenantMiddleware.js';
import { BadRequestError } from '../../../src/utils/errors.js';

/**
 * Unit tests for tenant middleware validation
 * Testing tenant slug format validation and error handling
 */

describe('Tenant Middleware', () => {
  describe('validateTenantSchema', () => {
    describe('Valid Tenant Slugs', () => {
      it('should accept lowercase alphanumeric slug', () => {
        expect(() => validateTenantSchema('acmecorp')).not.toThrow();
      });

      it('should accept slug with hyphens', () => {
        expect(() => validateTenantSchema('acme-corp')).not.toThrow();
      });

      it('should accept slug with underscores', () => {
        expect(() => validateTenantSchema('acme_corp')).not.toThrow();
      });

      it('should accept slug with numbers', () => {
        expect(() => validateTenantSchema('acme123')).not.toThrow();
      });

      it('should accept slug with mixed case', () => {
        expect(() => validateTenantSchema('AcmeCorp')).not.toThrow();
      });

      it('should accept 3 character slug (minimum length)', () => {
        expect(() => validateTenantSchema('abc')).not.toThrow();
      });

      it('should accept 63 character slug (maximum length)', () => {
        const slug = 'a'.repeat(63);
        expect(() => validateTenantSchema(slug)).not.toThrow();
      });

      it('should accept slug with all allowed characters', () => {
        expect(() => validateTenantSchema('Test-Slug_123')).not.toThrow();
      });
    });

    describe('Invalid Tenant Slugs - Empty/Missing', () => {
      it('should throw BadRequestError for empty string', () => {
        expect(() => validateTenantSchema('')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('')).toThrow('Tenant slug is required');
      });

      it('should throw BadRequestError for null', () => {
        expect(() => validateTenantSchema(null as unknown as string)).toThrow(BadRequestError);
        expect(() => validateTenantSchema(null as unknown as string)).toThrow('Tenant slug is required');
      });

      it('should throw BadRequestError for undefined', () => {
        expect(() => validateTenantSchema(undefined as unknown as string)).toThrow(BadRequestError);
        expect(() => validateTenantSchema(undefined as unknown as string)).toThrow('Tenant slug is required');
      });
    });

    describe('Invalid Tenant Slugs - Wrong Type', () => {
      it('should throw BadRequestError for number', () => {
        expect(() => validateTenantSchema(12345 as unknown as string)).toThrow(BadRequestError);
        expect(() => validateTenantSchema(12345 as unknown as string)).toThrow('Tenant slug must be a string');
      });

      it('should throw BadRequestError for object', () => {
        expect(() => validateTenantSchema({} as unknown as string)).toThrow(BadRequestError);
        expect(() => validateTenantSchema({} as unknown as string)).toThrow('Tenant slug must be a string');
      });

      it('should throw BadRequestError for array', () => {
        expect(() => validateTenantSchema([] as unknown as string)).toThrow(BadRequestError);
        expect(() => validateTenantSchema([] as unknown as string)).toThrow('Tenant slug must be a string');
      });

      it('should throw BadRequestError for boolean', () => {
        expect(() => validateTenantSchema(true as unknown as string)).toThrow(BadRequestError);
        expect(() => validateTenantSchema(true as unknown as string)).toThrow('Tenant slug must be a string');
      });
    });

    describe('Invalid Tenant Slugs - Format', () => {
      it('should throw BadRequestError for slug too short (2 chars)', () => {
        expect(() => validateTenantSchema('ab')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('ab')).toThrow('Invalid tenant slug format');
      });

      it('should throw BadRequestError for slug too short (1 char)', () => {
        expect(() => validateTenantSchema('a')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('a')).toThrow('Invalid tenant slug format');
      });

      it('should throw BadRequestError for slug too long (64 chars)', () => {
        const slug = 'a'.repeat(64);
        expect(() => validateTenantSchema(slug)).toThrow(BadRequestError);
        expect(() => validateTenantSchema(slug)).toThrow('Invalid tenant slug format');
      });

      it('should throw BadRequestError for slug with spaces', () => {
        expect(() => validateTenantSchema('acme corp')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme corp')).toThrow('Invalid tenant slug format');
      });

      it('should throw BadRequestError for slug with leading space', () => {
        expect(() => validateTenantSchema(' acme')).toThrow(BadRequestError);
      });

      it('should throw BadRequestError for slug with trailing space', () => {
        expect(() => validateTenantSchema('acme ')).toThrow(BadRequestError);
      });

      it('should throw BadRequestError for slug with special characters', () => {
        expect(() => validateTenantSchema('acme@corp')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme#corp')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme$corp')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme%corp')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme.corp')).toThrow(BadRequestError);
      });

      it('should throw BadRequestError for slug with forward slash', () => {
        expect(() => validateTenantSchema('acme/corp')).toThrow(BadRequestError);
      });

      it('should throw BadRequestError for slug with backslash', () => {
        expect(() => validateTenantSchema('acme\\corp')).toThrow(BadRequestError);
      });

      it('should throw BadRequestError for slug with unicode characters', () => {
        expect(() => validateTenantSchema('acme\u00e9corp')).toThrow(BadRequestError);
      });
    });

    describe('Security Edge Cases', () => {
      it('should reject SQL injection attempts', () => {
        expect(() => validateTenantSchema("'; DROP TABLE--")).toThrow(BadRequestError);
        expect(() => validateTenantSchema('1 OR 1=1')).toThrow(BadRequestError);
      });

      it('should reject path traversal attempts', () => {
        expect(() => validateTenantSchema('../etc/passwd')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('..\\windows')).toThrow(BadRequestError);
      });

      it('should reject null byte injection', () => {
        expect(() => validateTenantSchema('acme\x00corp')).toThrow(BadRequestError);
      });

      it('should reject newline injection', () => {
        expect(() => validateTenantSchema('acme\ncorp')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme\rcorp')).toThrow(BadRequestError);
      });

      it('should reject XSS attempts', () => {
        expect(() => validateTenantSchema('<script>alert(1)</script>')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('javascript:alert(1)')).toThrow(BadRequestError);
      });

      it('should reject command injection attempts', () => {
        expect(() => validateTenantSchema('$(whoami)')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('`whoami`')).toThrow(BadRequestError);
        expect(() => validateTenantSchema('acme;rm -rf')).toThrow(BadRequestError);
      });
    });

    describe('Boundary Conditions', () => {
      it('should accept exactly 3 characters', () => {
        expect(() => validateTenantSchema('abc')).not.toThrow();
      });

      it('should accept exactly 63 characters', () => {
        expect(() => validateTenantSchema('a'.repeat(63))).not.toThrow();
      });

      it('should reject exactly 2 characters', () => {
        expect(() => validateTenantSchema('ab')).toThrow(BadRequestError);
      });

      it('should reject exactly 64 characters', () => {
        expect(() => validateTenantSchema('a'.repeat(64))).toThrow(BadRequestError);
      });

      it('should handle slug at various lengths within range', () => {
        expect(() => validateTenantSchema('a'.repeat(10))).not.toThrow();
        expect(() => validateTenantSchema('a'.repeat(30))).not.toThrow();
        expect(() => validateTenantSchema('a'.repeat(50))).not.toThrow();
      });
    });
  });
});
