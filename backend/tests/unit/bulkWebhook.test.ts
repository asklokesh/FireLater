import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const validateUrlForSSRF = vi.fn();
vi.mock('../../src/utils/ssrf.js', () => ({ validateUrlForSSRF: (...a: unknown[]) => validateUrlForSSRF(...a) }));

import { validateBulkWebhookUrl } from '../../src/utils/bulkWebhook.js';

describe('validateBulkWebhookUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BULK_WEBHOOK_ALLOW_PRIVATE;
  });
  afterEach(() => {
    delete process.env.BULK_WEBHOOK_ALLOW_PRIVATE;
  });

  it('runs the SSRF check by default', async () => {
    validateUrlForSSRF.mockRejectedValue(new Error('blocked'));
    await expect(validateBulkWebhookUrl('http://127.0.0.1/hook')).rejects.toThrow('blocked');
  });

  it('skips the address check but keeps the protocol check when private targets are allowed', async () => {
    process.env.BULK_WEBHOOK_ALLOW_PRIVATE = 'true';
    await expect(validateBulkWebhookUrl('http://127.0.0.1/hook')).resolves.toBeUndefined();
    expect(validateUrlForSSRF).not.toHaveBeenCalled();
    await expect(validateBulkWebhookUrl('ftp://127.0.0.1/hook')).rejects.toMatchObject({ statusCode: 400 });
  });
});
