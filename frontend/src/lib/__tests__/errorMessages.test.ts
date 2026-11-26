import { describe, it, expect } from 'vitest';
import { shouldRetryHttp, httpRetryDelay, parseApiError, getUserMessage, shouldRetryRequest, ERROR_MESSAGES } from '../errorMessages';

describe('errorMessages', () => {
  it('uses server userMessage and code from API responses', () => {
    const err = { response: { status: 404, data: { statusCode: 404, code: 'NOT_FOUND', message: "Issue with id '1' not found", userMessage: 'Not here', requestId: 'r1' } } };
    expect(parseApiError(err)).toMatchObject({ code: 'NOT_FOUND', message: 'Not here', requestId: 'r1', retryable: false });
  });

  it('maps code to friendly message and never leaks 500 technical text', () => {
    const err = { response: { status: 500, data: { statusCode: 500, code: 'INTERNAL_ERROR', message: 'relation "x" does not exist' } } };
    const info = parseApiError(err);
    expect(info.message).toBe(ERROR_MESSAGES.INTERNAL_ERROR);
    expect(info.message).not.toContain('relation');
  });

  it('falls back to status when old-format body has no code', () => {
    const err = { response: { status: 403, data: { statusCode: 403, error: 'Forbidden', message: 'nope' } } };
    expect(parseApiError(err)).toMatchObject({ code: 'FORBIDDEN', message: ERROR_MESSAGES.FORBIDDEN });
  });

  it('detects network errors as retryable', () => {
    expect(parseApiError({ isAxiosError: true })).toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  it('plain Error is UNKNOWN with generic message', () => {
    const info = parseApiError(new Error('stack trace thing'));
    expect(info.code).toBe('UNKNOWN');
    expect(info.message).not.toContain('stack');
  });

  it('getUserMessage keeps specific 4xx messages without mapping', () => {
    expect(getUserMessage({ statusCode: 418, message: 'teapot' })).toBe('teapot');
  });

  it('retries only transient errors, max 3', () => {
    const transient = { response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE' } } };
    const permanent = { response: { status: 404, data: { code: 'NOT_FOUND' } } };
    expect(shouldRetryRequest(0, transient)).toBe(true);
    expect(shouldRetryRequest(3, transient)).toBe(false);
    expect(shouldRetryRequest(0, permanent)).toBe(false);
  });

  it('replays only idempotent requests that got no response, once', () => {
    const unavailable = { response: { status: 503, data: { code: 'SERVICE_UNAVAILABLE' } } };
    const limited = { response: { status: 429, data: { code: 'RATE_LIMITED' } } };
    const network = { isAxiosError: true };
    expect(shouldRetryHttp({ method: 'get' }, network, 0)).toBe(true);
    expect(shouldRetryHttp({ method: 'GET' }, network, 1)).toBe(false);
    expect(shouldRetryHttp({ method: 'post' }, network, 0)).toBe(false);
    expect(shouldRetryHttp({ method: 'get' }, unavailable, 0)).toBe(false);
    expect(shouldRetryHttp({ method: 'get' }, limited, 0)).toBe(false);
    expect(httpRetryDelay(0)).toBeLessThan(httpRetryDelay(1));
  });

  it('never retries or reports a cancelled request as a network error', () => {
    const cancelled = { isAxiosError: true, code: 'ERR_CANCELED', name: 'CanceledError' };
    expect(parseApiError(cancelled)).toMatchObject({ code: 'CANCELED', retryable: false });
    expect(shouldRetryHttp({ method: 'get' }, cancelled, 0)).toBe(false);
  });
});
