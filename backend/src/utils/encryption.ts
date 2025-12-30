import crypto from 'crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = config.encryption?.key || process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  // If key is hex string, convert to buffer
  if (key.length === 64) {
    return Buffer.from(key, 'hex');
  }

  // Otherwise hash the key to get 32 bytes
  return crypto.createHash('sha256').update(key).digest();
}

export function encrypt(text: string): string {
  if (!text) {
    return text;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Return format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) {
    return encryptedText;
  }

  try {
    const parts = encryptedText.split(':');

    if (parts.length !== 3) {
      // Not encrypted format, return as-is
      return encryptedText;
    }

    const [ivHex, authTagHex, encrypted] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // If decryption fails, might be plain text - return as-is
    // In production, you might want to throw an error instead
    return encryptedText;
  }
}

export function encryptObject(obj: Record<string, unknown>): Record<string, unknown> {
  const encrypted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      encrypted[key] = encrypt(value);
    } else if (typeof value === 'object' && value !== null) {
      encrypted[key] = encryptObject(value as Record<string, unknown>);
    } else {
      encrypted[key] = value;
    }
  }

  return encrypted;
}

export function decryptObject(obj: Record<string, unknown>): Record<string, unknown> {
  const decrypted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      decrypted[key] = decrypt(value);
    } else if (typeof value === 'object' && value !== null) {
      decrypted[key] = decryptObject(value as Record<string, unknown>);
    } else {
      decrypted[key] = value;
    }
  }

  return decrypted;
}

// Generate a new encryption key (for initial setup)
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
