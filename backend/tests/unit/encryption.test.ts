import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { encrypt, decrypt, encryptObject, decryptObject, generateEncryptionKey } from '../../src/utils/encryption.js';

describe('Encryption Utilities', () => {
  let encryptionKey: string;
  let originalEncryptionKey: string | undefined;

  beforeAll(() => {
    // Save original key
    originalEncryptionKey = process.env.ENCRYPTION_KEY;
    // Generate a test encryption key
    encryptionKey = generateEncryptionKey();
    process.env.ENCRYPTION_KEY = encryptionKey;
  });

  afterEach(() => {
    // Restore the original key after each test
    process.env.ENCRYPTION_KEY = encryptionKey;
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a string', () => {
      const plaintext = 'secret password 123';
      const encrypted = encrypt(plaintext);

      // Encrypted should be different from plaintext
      expect(encrypted).not.toBe(plaintext);
      // Encrypted should contain IV:authTag:encrypted format
      expect(encrypted.split(':')).toHaveLength(3);

      // Decryption should return original plaintext
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should return empty string when encrypting empty string', () => {
      const encrypted = encrypt('');
      expect(encrypted).toBe('');
    });

    it('should handle special characters and unicode', () => {
      const plaintext = 'Test 测试 🔐 !@#$%^&*()';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (IV randomization)', () => {
      const plaintext = 'same text';
      const encrypted1 = encrypt(plaintext);
      const encrypted2 = encrypt(plaintext);

      // Different IVs should produce different ciphertexts
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same plaintext
      expect(decrypt(encrypted1)).toBe(plaintext);
      expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should return plaintext if decryption fails (not encrypted format)', () => {
      const notEncrypted = 'plain text without colons';
      const result = decrypt(notEncrypted);

      expect(result).toBe(notEncrypted);
    });

    it('should handle decryption of malformed encrypted text gracefully', () => {
      const malformed = 'aaa:bbb'; // Only 2 parts instead of 3
      const result = decrypt(malformed);

      expect(result).toBe(malformed);
    });
  });

  describe('encryptObject and decryptObject', () => {
    it('should encrypt and decrypt object with string values', () => {
      const original = {
        username: 'admin',
        password: 'secret123',
        apiKey: 'sk_test_1234567890',
      };

      const encrypted = encryptObject(original);

      // Values should be encrypted
      expect(encrypted.username).not.toBe(original.username);
      expect(encrypted.password).not.toBe(original.password);
      expect(encrypted.apiKey).not.toBe(original.apiKey);

      // Decrypt should restore original values
      const decrypted = decryptObject(encrypted);
      expect(decrypted).toEqual(original);
    });

    it('should handle nested objects', () => {
      const original = {
        credentials: {
          username: 'user',
          password: 'pass',
        },
        config: {
          apiUrl: 'https://api.example.com',
        },
      };

      const encrypted = encryptObject(original);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(original);
    });

    it('should preserve non-string values', () => {
      const original = {
        string: 'text',
        number: 42,
        boolean: true,
        null: null as null,
      };

      const encrypted = encryptObject(original);
      const decrypted = decryptObject(encrypted);

      expect(decrypted.string).toBe('text');
      expect(decrypted.number).toBe(42);
      expect(decrypted.boolean).toBe(true);
      expect(decrypted.null).toBe(null);
    });

    it('should handle empty objects', () => {
      const original = {};
      const encrypted = encryptObject(original);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(original);
    });
  });

  describe('generateEncryptionKey', () => {
    it('should generate a 64-character hex string', () => {
      const key = generateEncryptionKey();

      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique keys', () => {
      const key1 = generateEncryptionKey();
      const key2 = generateEncryptionKey();

      expect(key1).not.toBe(key2);
    });
  });

  describe('getEncryptionKey edge cases', () => {
    it('should handle non-hex key by hashing it', () => {
      // Use a non-hex key (not 64 chars hex)
      process.env.ENCRYPTION_KEY = 'my-secret-password-that-is-not-hex';

      const plaintext = 'test data';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle short non-hex key', () => {
      process.env.ENCRYPTION_KEY = 'short';

      const plaintext = 'test data';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('decrypt edge cases', () => {
    it('should return empty string for empty input', () => {
      const result = decrypt('');
      expect(result).toBe('');
    });

    it('should return original string for invalid encrypted format (3 parts but invalid hex)', () => {
      // Valid format but invalid hex will throw and return original
      const invalidEncrypted = 'notvalidhex:notvalidhex:notvalidhex';
      const result = decrypt(invalidEncrypted);
      expect(result).toBe(invalidEncrypted);
    });

    it('should handle decryption with corrupted auth tag gracefully', () => {
      const encrypted = encrypt('secret data');
      const parts = encrypted.split(':');
      // Corrupt the auth tag (second part)
      parts[1] = 'ff'.repeat(16);
      const corrupted = parts.join(':');

      // Should return the corrupted string since decryption fails
      const result = decrypt(corrupted);
      expect(result).toBe(corrupted);
    });

    it('should handle tampered ciphertext gracefully', () => {
      const encrypted = encrypt('secret data');
      // Tamper with the ciphertext
      const parts = encrypted.split(':');
      parts[2] = parts[2].replace(/[0-9]/, 'x'); // Corrupt the hex
      const tampered = parts.join(':');

      const result = decrypt(tampered);
      // Should return original since decryption fails
      expect(result).toBe(tampered);
    });
  });

  describe('encryptObject edge cases', () => {
    it('should handle arrays in objects', () => {
      const original = {
        tags: ['tag1', 'tag2', 'tag3'],
        name: 'test',
      };

      const encrypted = encryptObject(original);
      const decrypted = decryptObject(encrypted);

      expect(decrypted.name).toBe('test');
      // Arrays are treated as objects
      expect(decrypted.tags).toBeDefined();
    });

    it('should handle undefined values in objects', () => {
      const original = {
        defined: 'value',
        undefined: undefined as unknown as string,
      };

      const encrypted = encryptObject(original);
      const decrypted = decryptObject(encrypted);

      expect(decrypted.defined).toBe('value');
      expect(decrypted.undefined).toBeUndefined();
    });

    it('should handle deeply nested objects', () => {
      const original = {
        level1: {
          level2: {
            level3: {
              secret: 'deep-secret',
            },
          },
        },
      };

      const encrypted = encryptObject(original);
      const decrypted = decryptObject(encrypted);

      expect(decrypted).toEqual(original);
    });
  });
});
