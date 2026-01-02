import { BadRequestError } from './errors.js';
import { logger } from './logger.js';

export function validateTenantContext(tenantSlug: string | undefined): asserts tenantSlug is string {
  if (!tenantSlug) {
    throw new BadRequestError('Tenant context required');
  }
}

/**
 * Validates and parses a date string
 * @param dateString - ISO 8601 date string or timestamp
 * @param fieldName - Name of the field for error messages
 * @returns Valid Date object
 * @throws BadRequestError if date is invalid
 */
export function validateDate(dateString: string | undefined, fieldName: string): Date | undefined {
  if (!dateString) {
    return undefined;
  }

  // Trim whitespace
  const trimmed = dateString.trim();

  // Check for SQL injection patterns
  const sqlPattern = /['";--\/\*\*\/\\]/;
  if (sqlPattern.test(trimmed)) {
    logger.warn({ dateString: trimmed, fieldName }, 'Potential SQL injection attempt in date field');
    throw new BadRequestError(`Invalid ${fieldName}: contains illegal characters`);
  }

  // Parse date
  const parsed = new Date(trimmed);

  // Check if date is valid
  if (isNaN(parsed.getTime())) {
    throw new BadRequestError(`Invalid ${fieldName}: must be a valid ISO 8601 date`);
  }

  // Reject dates too far in the past (before 2000)
  const minDate = new Date('2000-01-01');
  if (parsed < minDate) {
    throw new BadRequestError(`Invalid ${fieldName}: date cannot be before 2000-01-01`);
  }

  // Reject dates too far in the future (more than 10 years)
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 10);
  if (parsed > maxDate) {
    throw new BadRequestError(`Invalid ${fieldName}: date cannot be more than 10 years in the future`);
  }

  return parsed;
}

/**
 * Validates a date range
 * @param startDate - Start date
 * @param endDate - End date
 * @param maxDaysRange - Maximum allowed days in range (default 365)
 * @throws BadRequestError if range is invalid
 */
export function validateDateRange(
  startDate: Date | undefined,
  endDate: Date | undefined,
  maxDaysRange: number = 365
): void {
  if (!startDate || !endDate) {
    return;
  }

  // Start must be before end
  if (startDate > endDate) {
    throw new BadRequestError('startDate must be before or equal to endDate');
  }

  // Check range limit
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > maxDaysRange) {
    throw new BadRequestError(`Date range cannot exceed ${maxDaysRange} days`);
  }
}

/**
 * Validates a UUID string
 * @param uuid - UUID string to validate
 * @param fieldName - Name of the field for error messages
 * @returns True if valid
 * @throws BadRequestError if invalid
 */
export function validateUUID(uuid: string | undefined, fieldName: string = 'id'): boolean {
  if (!uuid) {
    throw new BadRequestError(`${fieldName} is required`);
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(uuid)) {
    logger.warn({ uuid, fieldName }, 'Invalid UUID format');
    throw new BadRequestError(`Invalid ${fieldName}: must be a valid UUID`);
  }

  return true;
}

/**
 * Validates and sanitizes a search query
 * @param query - Search query string
 * @param maxLength - Maximum allowed length (default 200)
 * @returns Sanitized query
 * @throws BadRequestError if invalid
 */
export function validateSearchQuery(query: string | undefined, maxLength: number = 200): string | undefined {
  if (!query) {
    return undefined;
  }

  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    throw new BadRequestError(`Search query cannot exceed ${maxLength} characters`);
  }

  // Check for SQL injection patterns
  const sqlPattern = /['";]|--|\*\/|\/\*/;
  if (sqlPattern.test(trimmed)) {
    logger.warn({ query: trimmed }, 'Potential SQL injection attempt in search query');
    throw new BadRequestError('Search query contains illegal characters');
  }

  return trimmed;
}

/**
 * Validates a pagination limit
 * @param limit - Limit value
 * @param maxLimit - Maximum allowed limit (default 1000)
 * @returns Validated limit
 */
export function validateLimit(limit: string | number | undefined, maxLimit: number = 1000): number {
  if (limit === undefined || limit === null) {
    return 50; // default
  }

  const parsed = typeof limit === 'string' ? parseInt(limit, 10) : limit;

  if (isNaN(parsed) || parsed < 1) {
    throw new BadRequestError('Limit must be a positive integer');
  }

  if (parsed > maxLimit) {
    throw new BadRequestError(`Limit cannot exceed ${maxLimit}`);
  }

  return parsed;
}

/**
 * Validates a pagination offset
 * @param offset - Offset value
 * @returns Validated offset
 */
export function validateOffset(offset: string | number | undefined): number {
  if (offset === undefined || offset === null) {
    return 0; // default
  }

  const parsed = typeof offset === 'string' ? parseInt(offset, 10) : offset;

  if (isNaN(parsed) || parsed < 0) {
    throw new BadRequestError('Offset must be a non-negative integer');
  }

  return parsed;
}

/**
 * Validates an enum value
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @param fieldName - Name of the field for error messages
 * @returns Validated value
 * @throws BadRequestError if invalid
 */
export function validateEnum<T extends string>(
  value: string | undefined,
  allowedValues: readonly T[],
  fieldName: string
): T | undefined {
  if (!value) {
    return undefined;
  }

  if (!allowedValues.includes(value as T)) {
    throw new BadRequestError(
      `Invalid ${fieldName}: must be one of ${allowedValues.join(', ')}`
    );
  }

  return value as T;
}