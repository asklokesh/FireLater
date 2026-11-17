import { BadRequestError } from './errors.js';
import { validateUrlForSSRF } from './ssrf.js';

/**
 * Validate a bulk-operation webhook target.
 * Private and loopback targets are refused unless BULK_WEBHOOK_ALLOW_PRIVATE=true,
 * which on-premise deployments can set to reach receivers on an internal network.
 */
export async function validateBulkWebhookUrl(url: string): Promise<void> {
  if (process.env.BULK_WEBHOOK_ALLOW_PRIVATE === 'true') {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestError('Only HTTP(S) webhook URLs are permitted');
    }
    return;
  }
  await validateUrlForSSRF(url);
}
