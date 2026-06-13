import { describe, it, expect } from 'vitest';
import { MaskingService, type FieldClassification } from './masking.js';
import crypto from 'crypto';

describe('MaskingService', () => {
  const svc = new MaskingService();

  // ------------------------------------------------------------------ mask()
  describe('mask()', () => {
    describe('full strategy', () => {
      it('returns "***" regardless of input length', () => {
        expect(svc.mask('secret', 'full')).toBe('***');
        expect(svc.mask('x', 'full')).toBe('***');
        expect(svc.mask('a very long secret value', 'full')).toBe('***');
      });
    });

    describe('partial strategy', () => {
      it('shows last 4 chars masked with * prefix', () => {
        expect(svc.mask('1234567890', 'partial')).toBe('******7890');
      });

      it('masks entirely when value is 4 chars or fewer', () => {
        expect(svc.mask('1234', 'partial')).toBe('****');
        expect(svc.mask('ab', 'partial')).toBe('**');
      });

      it('masks a typical phone number', () => {
        expect(svc.mask('5551234567', 'partial')).toBe('******4567');
      });
    });

    describe('hash strategy', () => {
      it('returns a SHA-256 hex string (64 chars)', () => {
        const result = svc.mask('123-45-6789', 'hash');
        expect(result).toHaveLength(64);
        // Verify it matches manual SHA-256
        const expected = crypto.createHash('sha256').update('123-45-6789').digest('hex');
        expect(result).toBe(expected);
      });

      it('is deterministic', () => {
        expect(svc.mask('abc', 'hash')).toBe(svc.mask('abc', 'hash'));
      });
    });

    describe('tokenize strategy', () => {
      it('returns a token prefixed with "tok_"', () => {
        const result = svc.mask('4111111111111111', 'tokenize');
        expect(result).toMatch(/^tok_[0-9a-f]{8}$/);
      });

      it('is deterministic', () => {
        expect(svc.mask('4111111111111111', 'tokenize')).toBe(
          svc.mask('4111111111111111', 'tokenize')
        );
      });

      it('differs for different inputs', () => {
        expect(svc.mask('card-a', 'tokenize')).not.toBe(svc.mask('card-b', 'tokenize'));
      });
    });

    it('returns empty string unchanged', () => {
      expect(svc.mask('', 'full')).toBe('');
    });
  });

  // --------------------------------------------------------------- maskObject()
  describe('maskObject()', () => {
    it('masks fields that appear in default classifications', () => {
      const obj = {
        name: 'Alice',
        ssn: '123-45-6789',
        phone: '5551234567',
        credit_card: '4111111111111111',
      };

      const masked = svc.maskObject(obj);

      // non-sensitive fields pass through unchanged
      expect(masked.name).toBe('Alice');

      // ssn → hash
      const expectedSsnHash = crypto.createHash('sha256').update('123-45-6789').digest('hex');
      expect(masked.ssn).toBe(expectedSsnHash);

      // phone → partial
      expect(masked.phone).toBe('******4567');

      // credit_card → tokenize
      expect(masked.credit_card).toMatch(/^tok_[0-9a-f]{8}$/);
    });

    it('passes through non-string sensitive fields unchanged', () => {
      const obj = { ssn: 12345 as unknown as string, name: 'Bob' };
      const masked = svc.maskObject(obj as Record<string, unknown>);
      // numeric value is not a string, so it is passed through as-is
      expect(masked.ssn).toBe(12345);
    });

    it('uses custom classifications when provided', () => {
      const custom: Record<string, FieldClassification> = {
        secret_field: {
          classification: 'SENSITIVE',
          maskingStrategy: 'full',
          unmaskPermission: 'admin:write',
        },
      };

      const obj = { secret_field: 'top-secret', ordinary: 'value' };
      const masked = svc.maskObject(obj, custom);

      expect(masked.secret_field).toBe('***');
      expect(masked.ordinary).toBe('value');
    });

    it('merges custom classifications with defaults', () => {
      const custom: Record<string, FieldClassification> = {
        my_field: {
          classification: 'PII',
          maskingStrategy: 'partial',
          unmaskPermission: 'user:read',
        },
      };

      const obj = { ssn: '123-45-6789', my_field: '9876543210' };
      const masked = svc.maskObject(obj, custom);

      // Default ssn classification still applies
      expect(masked.ssn).toHaveLength(64); // SHA-256
      // Custom my_field applies
      expect(masked.my_field).toBe('******3210');
    });

    it('leaves object unchanged when no fields are classified', () => {
      const obj = { foo: 'bar', baz: 42 };
      const masked = svc.maskObject(obj as Record<string, unknown>);
      expect(masked).toEqual(obj);
    });
  });

  // --------------------------------------------------------------- isClassified()
  describe('isClassified()', () => {
    it('returns true for default classified fields', () => {
      expect(svc.isClassified('ssn')).toBe(true);
      expect(svc.isClassified('credit_card')).toBe(true);
      expect(svc.isClassified('phone')).toBe(true);
      expect(svc.isClassified('password')).toBe(true);
      expect(svc.isClassified('api_key')).toBe(true);
      expect(svc.isClassified('pan')).toBe(true);
      expect(svc.isClassified('account_number')).toBe(true);
    });

    it('returns false for unknown fields', () => {
      expect(svc.isClassified('name')).toBe(false);
      expect(svc.isClassified('email')).toBe(false);
      expect(svc.isClassified('unknown_field')).toBe(false);
    });

    it('uses custom classifications when provided', () => {
      const custom: Record<string, FieldClassification> = {
        custom_sensitive: {
          classification: 'NPI',
          maskingStrategy: 'hash',
          unmaskPermission: 'admin:write',
        },
      };

      expect(svc.isClassified('custom_sensitive', custom)).toBe(true);
      expect(svc.isClassified('ssn', custom)).toBe(true); // defaults still apply
    });
  });

  // --------------------------------------------------------------- getClassification()
  describe('getClassification()', () => {
    it('returns the correct classification for known fields', () => {
      const ssnClass = svc.getClassification('ssn');
      expect(ssnClass).not.toBeNull();
      expect(ssnClass?.classification).toBe('PII');
      expect(ssnClass?.maskingStrategy).toBe('hash');
      expect(ssnClass?.unmaskPermission).toBe('admin:write');
    });

    it('returns null for unknown fields', () => {
      expect(svc.getClassification('nonexistent_field')).toBeNull();
    });

    it('returns custom classification when provided', () => {
      const custom: Record<string, FieldClassification> = {
        npi_field: {
          classification: 'NPI',
          maskingStrategy: 'tokenize',
          unmaskPermission: 'admin:write',
        },
      };

      const result = svc.getClassification('npi_field', custom);
      expect(result?.classification).toBe('NPI');
      expect(result?.maskingStrategy).toBe('tokenize');
    });
  });
});
