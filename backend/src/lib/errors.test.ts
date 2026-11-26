import { describe, it, expect } from 'vitest';
import {
  AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError,
  RateLimitError, TimeoutError, ServiceUnavailableError, DatabaseError, CacheError, ExternalServiceError,
  ErrorCode, isRetryableError, codeForStatus,
} from './errors.js';
import * as legacy from '../utils/errors.js';

describe('error hierarchy', () => {
  it('all domain errors extend AppError with stable codes', () => {
    const cases: [AppError, number, string][] = [
      [new NotFoundError('Issue', '1'), 404, ErrorCode.NOT_FOUND],
      [new ValidationError([{ path: 'a' }]), 400, ErrorCode.VALIDATION_ERROR],
      [new UnauthorizedError(), 401, ErrorCode.UNAUTHORIZED],
      [new ForbiddenError(), 403, ErrorCode.FORBIDDEN],
      [new ConflictError('x'), 409, ErrorCode.CONFLICT],
      [new RateLimitError(), 429, ErrorCode.RATE_LIMITED],
      [new TimeoutError(), 504, ErrorCode.TIMEOUT],
      [new ServiceUnavailableError(), 503, ErrorCode.SERVICE_UNAVAILABLE],
      [new DatabaseError(), 503, ErrorCode.DATABASE_ERROR],
      [new CacheError(), 503, ErrorCode.CACHE_ERROR],
      [new ExternalServiceError('slack'), 502, ErrorCode.EXTERNAL_SERVICE_ERROR],
    ];
    for (const [err, status, code] of cases) {
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(status);
      expect(err.code).toBe(code);
      expect(err.userMessage.length).toBeGreaterThan(0);
    }
  });

  it('separates technical message from user message', () => {
    const e = new NotFoundError('Issue', 'abc');
    expect(e.message).toBe("Issue with id 'abc' not found");
    expect(e.userMessage).not.toContain('abc');
  });

  it('carries and merges context', () => {
    const e = new ConflictError('dup', { context: { tenantSlug: 'acme' } }).withContext({ operation: 'issues.create' });
    expect(e.context).toEqual({ tenantSlug: 'acme', operation: 'issues.create' });
  });

  it('retryable flags', () => {
    expect(new NotFoundError('x').retryable).toBe(false);
    expect(new TimeoutError().retryable).toBe(true);
    expect(isRetryableError(new ServiceUnavailableError())).toBe(true);
    expect(isRetryableError(Object.assign(new Error('x'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error('x'), { code: '40P01' }))).toBe(true);
    expect(isRetryableError(new Error('plain'))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('maps status to code', () => {
    expect(codeForStatus(404)).toBe(ErrorCode.NOT_FOUND);
    expect(codeForStatus(500)).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('legacy utils/errors re-exports the same classes', () => {
    expect(legacy.NotFoundError).toBe(NotFoundError);
    expect(legacy.AppError).toBe(AppError);
  });
});
