import { describe, it, expect } from 'vitest';
import { getSafeErrorMessage } from '../../src/utils/errorUtils.js';

/**
 * Unit tests for error utility functions
 * Testing safe error message extraction for user-facing responses
 */

describe('Error Utilities', () => {
  describe('getSafeErrorMessage', () => {
    describe('Validation Errors', () => {
      it('should pass through "Invalid" messages', () => {
        const error = new Error('Invalid email format');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('Invalid email format');
      });

      it('should pass through "required" messages', () => {
        const error = new Error('Email is required');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('Email is required');
      });

      it('should pass through messages with "Invalid" anywhere', () => {
        const error = new Error('The provided token is Invalid');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('The provided token is Invalid');
      });

      it('should pass through messages with "required" anywhere', () => {
        const error = new Error('This field is required for validation');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('This field is required for validation');
      });
    });

    describe('Generic Errors', () => {
      it('should return default message for generic errors', () => {
        const error = new Error('Database connection failed');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
      });

      it('should return default message for TypeError', () => {
        const error = new TypeError('Cannot read property of undefined');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
      });

      it('should return default message for RangeError', () => {
        const error = new RangeError('Maximum call stack size exceeded');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
      });
    });

    describe('Non-Error Types', () => {
      it('should return default for string', () => {
        const message = getSafeErrorMessage('string error');

        expect(message).toBe('An error occurred');
      });

      it('should return default for null', () => {
        const message = getSafeErrorMessage(null);

        expect(message).toBe('An error occurred');
      });

      it('should return default for undefined', () => {
        const message = getSafeErrorMessage(undefined);

        expect(message).toBe('An error occurred');
      });

      it('should return default for number', () => {
        const message = getSafeErrorMessage(123);

        expect(message).toBe('An error occurred');
      });

      it('should return default for object', () => {
        const message = getSafeErrorMessage({ message: 'test' });

        expect(message).toBe('An error occurred');
      });

      it('should return default for array', () => {
        const message = getSafeErrorMessage(['error']);

        expect(message).toBe('An error occurred');
      });

      it('should return default for boolean', () => {
        const message = getSafeErrorMessage(false);

        expect(message).toBe('An error occurred');
      });
    });

    describe('Custom Default Message', () => {
      it('should use custom default message', () => {
        const error = new Error('Internal failure');

        const message = getSafeErrorMessage(error, 'Something went wrong');

        expect(message).toBe('Something went wrong');
      });

      it('should still pass through validation errors with custom default', () => {
        const error = new Error('Invalid input');

        const message = getSafeErrorMessage(error, 'Custom default');

        expect(message).toBe('Invalid input');
      });

      it('should use custom default for non-Error types', () => {
        const message = getSafeErrorMessage(null, 'Custom error message');

        expect(message).toBe('Custom error message');
      });
    });

    describe('Security Considerations', () => {
      it('should not expose database errors', () => {
        const error = new Error('ECONNREFUSED: Connection refused to postgres://user:password@localhost');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
        expect(message).not.toContain('postgres');
        expect(message).not.toContain('password');
      });

      it('should not expose file paths', () => {
        const error = new Error('ENOENT: no such file or directory /etc/passwd');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
        expect(message).not.toContain('/etc/passwd');
      });

      it('should not expose stack traces', () => {
        const error = new Error('Internal error');
        error.stack = 'Error: Internal error\n    at Function.execute (/app/src/service.ts:42:5)';

        const message = getSafeErrorMessage(error);

        expect(message).not.toContain('at Function.execute');
        expect(message).not.toContain('/app/src/service.ts');
      });

      it('should not expose API keys', () => {
        const error = new Error('API key sk_live_abc123 is invalid');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
        expect(message).not.toContain('sk_live_abc123');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty error message', () => {
        const error = new Error('');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
      });

      it('should handle error with only whitespace', () => {
        const error = new Error('   ');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
      });

      it('should be case-sensitive for "Invalid"', () => {
        const error = new Error('invalid input');

        // "invalid" lowercase should not match
        const message = getSafeErrorMessage(error);

        expect(message).toBe('An error occurred');
      });

      it('should match "Invalid" case-sensitively', () => {
        const error = new Error('Invalid credentials');

        const message = getSafeErrorMessage(error);

        expect(message).toBe('Invalid credentials');
      });

      it('should handle error object without message property', () => {
        const fakeError = Object.create(Error.prototype);

        const message = getSafeErrorMessage(fakeError);

        expect(message).toBe('An error occurred');
      });
    });
  });
});
