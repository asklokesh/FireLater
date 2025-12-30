import { describe, it, expect, beforeAll } from 'vitest';
import { encrypt, decrypt, encryptObject, decryptObject, generateEncryptionKey } from '../../src/utils/encryption.js';

describe('Encryption Utilities', () => {
  let encryptionKey: string;

  beforeAll(() => {
    // Generate a test encryption key
    encryptionKey = generateEncryptionKey();
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
});
