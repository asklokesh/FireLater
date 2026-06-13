import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const KEY_LENGTH = 32; // AES-256 = 32 bytes
const SALT = 'firelater-tenant-key-derivation'; // static salt; in production use per-key salt stored in KMS

/**
 * Envelope encryption using AES-256-GCM.
 *
 * In production the data key would be wrapped by a KMS master key.
 * Here we derive a deterministic per-tenant key from tenantSlug + a master
 * secret using scryptSync so the key can be reproduced for decryption without
 * storing a key-per-tenant in the database.
 *
 * Ciphertext format (base64-encoded): "<iv>:<authTag>:<ciphertext>"
 * Each component is hex-encoded before joining and the final string is
 * base64-encoded for safe storage.
 */
export class EncryptionService {
  private readonly masterSecret: string;

  constructor() {
    this.masterSecret = process.env.ENCRYPTION_MASTER_SECRET ?? 'firelater-default-dev-secret-32ch';
  }

  /**
   * Derive a deterministic per-tenant AES-256 key (32 bytes).
   * Uses scryptSync with a static salt + the master secret as the passphrase
   * and the tenantSlug as additional input mixed into the password.
   */
  deriveTenantKey(tenantSlug: string): Buffer {
    const password = `${this.masterSecret}:${tenantSlug}`;
    return crypto.scryptSync(password, SALT, KEY_LENGTH) as Buffer;
  }

  /**
   * Encrypt plaintext with the tenant-derived key.
   * Returns a base64-encoded string: "<ivHex>:<authTagHex>:<ciphertextHex>"
   */
  encrypt(plaintext: string, tenantSlug: string): string {
    const key = this.deriveTenantKey(tenantSlug);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    const raw = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    return Buffer.from(raw, 'utf8').toString('base64');
  }

  /**
   * Decrypt a base64-encoded ciphertext back to plaintext.
   */
  decrypt(ciphertext: string, tenantSlug: string): string {
    const raw = Buffer.from(ciphertext, 'base64').toString('utf8');
    const parts = raw.split(':');

    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = this.deriveTenantKey(tenantSlug);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export const encryptionService = new EncryptionService();
