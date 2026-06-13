import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from './encryption.js';

describe('EncryptionService', () => {
  let svc: EncryptionService;

  beforeEach(() => {
    // Each test gets a fresh instance with the default master secret
    process.env.ENCRYPTION_MASTER_SECRET = 'test-master-secret-for-unit-tests';
    svc = new EncryptionService();
  });

  // -------------------------------------------------------- deriveTenantKey()
  describe('deriveTenantKey()', () => {
    it('returns a 32-byte Buffer', () => {
      const key = svc.deriveTenantKey('acme');
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('is deterministic', () => {
      const k1 = svc.deriveTenantKey('tenant-a');
      const k2 = svc.deriveTenantKey('tenant-a');
      expect(k1.equals(k2)).toBe(true);
    });

    it('produces different keys for different tenants', () => {
      const k1 = svc.deriveTenantKey('tenant-a');
      const k2 = svc.deriveTenantKey('tenant-b');
      expect(k1.equals(k2)).toBe(false);
    });
  });

  // -------------------------------------------------------- encrypt / decrypt
  describe('encrypt() / decrypt() round-trip', () => {
    it('decrypts back to the original plaintext', () => {
      const plaintext = 'Hello, world!';
      const ciphertext = svc.encrypt(plaintext, 'acme');
      const decrypted = svc.decrypt(ciphertext, 'acme');
      expect(decrypted).toBe(plaintext);
    });

    it('handles empty string', () => {
      const ciphertext = svc.encrypt('', 'acme');
      expect(svc.decrypt(ciphertext, 'acme')).toBe('');
    });

    it('handles unicode / special characters', () => {
      const plaintext = '日本語テスト 🔒 PII: 123-45-6789';
      const ciphertext = svc.encrypt(plaintext, 'tenant-unicode');
      expect(svc.decrypt(ciphertext, 'tenant-unicode')).toBe(plaintext);
    });

    it('handles long strings', () => {
      const plaintext = 'A'.repeat(10_000);
      const ciphertext = svc.encrypt(plaintext, 'big-tenant');
      expect(svc.decrypt(ciphertext, 'big-tenant')).toBe(plaintext);
    });
  });

  // -------------------------------------------------------- ciphertext properties
  describe('ciphertext properties', () => {
    it('produces different ciphertexts for the same plaintext (random IV)', () => {
      const ct1 = svc.encrypt('same-value', 'tenant-a');
      const ct2 = svc.encrypt('same-value', 'tenant-a');
      // Random IV means each encryption is unique
      expect(ct1).not.toBe(ct2);
    });

    it('produces different ciphertexts for different tenants with the same plaintext', () => {
      const plaintext = 'my-secret-ssn';
      const ct1 = svc.encrypt(plaintext, 'tenant-x');
      const ct2 = svc.encrypt(plaintext, 'tenant-y');
      expect(ct1).not.toBe(ct2);
    });

    it('returns a valid base64 string', () => {
      const ciphertext = svc.encrypt('test', 'acme');
      // base64 characters only
      expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });
  });

  // -------------------------------------------------------- cross-tenant isolation
  describe('cross-tenant isolation', () => {
    it('cannot decrypt with a different tenant key', () => {
      const ciphertext = svc.encrypt('sensitive', 'tenant-a');
      expect(() => svc.decrypt(ciphertext, 'tenant-b')).toThrow();
    });
  });

  // -------------------------------------------------------- invalid ciphertext
  describe('invalid ciphertext', () => {
    it('throws on malformed (not base64) ciphertext', () => {
      // Not valid base64-encoded "<iv>:<authTag>:<ct>" format
      expect(() => svc.decrypt('not-valid!!!', 'acme')).toThrow();
    });

    it('throws on tampered ciphertext', () => {
      const ct = svc.encrypt('secret', 'acme');
      // Flip a byte by altering the base64 payload
      const raw = Buffer.from(ct, 'base64').toString('utf8');
      // Replace first hex char to corrupt IV/authTag/ciphertext
      const tampered = Buffer.from(raw.slice(0, -1) + (raw.endsWith('0') ? '1' : '0'), 'utf8').toString('base64');
      expect(() => svc.decrypt(tampered, 'acme')).toThrow();
    });
  });

  // -------------------------------------------------------- master secret isolation
  describe('master secret isolation', () => {
    it('cannot decrypt when the master secret changes', () => {
      const ct = svc.encrypt('my-secret', 'acme');

      // Create a new service with a different master secret
      process.env.ENCRYPTION_MASTER_SECRET = 'completely-different-master-secret!!';
      const svc2 = new EncryptionService();

      expect(() => svc2.decrypt(ct, 'acme')).toThrow();
    });
  });
});
