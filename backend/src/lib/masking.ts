import crypto from 'crypto';

export type Classification = 'PII' | 'PCI' | 'NPI' | 'SENSITIVE';
export type MaskingStrategy = 'full' | 'partial' | 'tokenize' | 'hash';

export interface FieldClassification {
  classification: Classification;
  maskingStrategy: MaskingStrategy;
  unmaskPermission: string;
}

const DEFAULT_CLASSIFICATIONS: Record<string, FieldClassification> = {
  ssn: { classification: 'PII', maskingStrategy: 'hash', unmaskPermission: 'admin:write' },
  credit_card: { classification: 'PCI', maskingStrategy: 'tokenize', unmaskPermission: 'admin:write' },
  account_number: { classification: 'PCI', maskingStrategy: 'partial', unmaskPermission: 'admin:write' },
  pan: { classification: 'PCI', maskingStrategy: 'tokenize', unmaskPermission: 'admin:write' },
  phone: { classification: 'PII', maskingStrategy: 'partial', unmaskPermission: 'user:read' },
  password: { classification: 'SENSITIVE', maskingStrategy: 'full', unmaskPermission: 'admin:write' },
  api_key: { classification: 'SENSITIVE', maskingStrategy: 'partial', unmaskPermission: 'admin:write' },
};

export class MaskingService {
  /**
   * Apply masking based on strategy:
   *   full:     return '***'
   *   partial:  show last 4 chars, mask rest with *  e.g. '****1234'
   *   hash:     SHA-256 hex digest
   *   tokenize: 'tok_' + first 8 chars of SHA-256
   */
  mask(value: string, strategy: MaskingStrategy): string {
    if (!value) {
      return value;
    }

    switch (strategy) {
      case 'full':
        return '***';

      case 'partial': {
        if (value.length <= 4) {
          return '*'.repeat(value.length);
        }
        const last4 = value.slice(-4);
        const masked = '*'.repeat(value.length - 4);
        return `${masked}${last4}`;
      }

      case 'hash': {
        return crypto.createHash('sha256').update(value).digest('hex');
      }

      case 'tokenize': {
        const hash = crypto.createHash('sha256').update(value).digest('hex');
        return `tok_${hash.slice(0, 8)}`;
      }

      default:
        return '***';
    }
  }

  /**
   * Mask all sensitive fields in an object based on classification map.
   * Uses DEFAULT_CLASSIFICATIONS merged with any provided overrides.
   */
  maskObject(
    obj: Record<string, unknown>,
    classifications?: Record<string, FieldClassification>
  ): Record<string, unknown> {
    const classMap = classifications
      ? { ...DEFAULT_CLASSIFICATIONS, ...classifications }
      : DEFAULT_CLASSIFICATIONS;

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const classification = classMap[key];
      if (classification && typeof value === 'string') {
        result[key] = this.mask(value, classification.maskingStrategy);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Check if a field name is classified as sensitive.
   */
  isClassified(
    fieldName: string,
    classifications?: Record<string, FieldClassification>
  ): boolean {
    const classMap = classifications
      ? { ...DEFAULT_CLASSIFICATIONS, ...classifications }
      : DEFAULT_CLASSIFICATIONS;

    return fieldName in classMap;
  }

  /**
   * Get classification for a field, or null if not classified.
   */
  getClassification(
    fieldName: string,
    classifications?: Record<string, FieldClassification>
  ): FieldClassification | null {
    const classMap = classifications
      ? { ...DEFAULT_CLASSIFICATIONS, ...classifications }
      : DEFAULT_CLASSIFICATIONS;

    return classMap[fieldName] ?? null;
  }
}

export const maskingService = new MaskingService();
