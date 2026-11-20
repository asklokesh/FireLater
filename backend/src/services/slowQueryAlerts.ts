/**
 * Slow query alerting: POSTs a JSON alert to DB_SLOW_QUERY_ALERT_WEBHOOK_URL
 * (Slack/Teams/generic webhooks accept the `text` field).
 *
 * Alerts are rate limited per query fingerprint (DB_SLOW_QUERY_ALERT_INTERVAL
 * seconds, default 300) and globally (DB_SLOW_QUERY_ALERT_MAX_PER_MINUTE,
 * default 30) so a database-wide slowdown cannot flood the receiver.
 */
import { logger } from '../utils/logger.js';

export interface SlowQueryAlert {
  fingerprint: string;
  query: string;
  durationMs: number;
  rowCount: number | null;
  thresholdMs: number;
}

const lastSent = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
const stats = { sent: 0, failed: 0, suppressed: 0 };

export function getAlertStats() {
  return { ...stats, webhookConfigured: !!process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL };
}

export function resetAlerts(): void {
  lastSent.clear();
  windowStart = 0;
  windowCount = 0;
  stats.sent = stats.failed = stats.suppressed = 0;
}

/** Returns true when an alert was dispatched (the HTTP call itself is async). */
export function sendSlowQueryAlert(alert: SlowQueryAlert, now = Date.now()): boolean {
  const url = process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL;
  if (!url || !/^https?:\/\//i.test(url)) return false;

  const intervalMs = Math.max(0, parseInt(process.env.DB_SLOW_QUERY_ALERT_INTERVAL || '300', 10) || 0) * 1000;
  const maxPerMinute = parseInt(process.env.DB_SLOW_QUERY_ALERT_MAX_PER_MINUTE || '30', 10) || 30;

  const last = lastSent.get(alert.fingerprint);
  if (last !== undefined && now - last < intervalMs) {
    stats.suppressed++;
    return false;
  }
  if (now - windowStart >= 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  if (windowCount >= maxPerMinute) {
    stats.suppressed++;
    return false;
  }
  windowCount++;
  lastSent.set(alert.fingerprint, now);
  if (lastSent.size > 2000) {
    const first = lastSent.keys().next().value;
    if (first !== undefined) lastSent.delete(first);
  }

  const body = {
    event: 'slow_query',
    text: `Slow database query (${alert.durationMs}ms > ${alert.thresholdMs}ms): ${alert.query}`,
    ...alert,
    at: new Date(now).toISOString(),
  };
  fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      if (res.ok) stats.sent++;
      else {
        stats.failed++;
        logger.warn({ status: res.status }, 'Slow query alert webhook returned an error');
      }
    })
    .catch((err: Error) => {
      stats.failed++;
      logger.warn({ err: err.message }, 'Slow query alert webhook failed');
    });
  return true;
}
