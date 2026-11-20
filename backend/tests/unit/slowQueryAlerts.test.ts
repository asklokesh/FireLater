import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendSlowQueryAlert, resetAlerts, getAlertStats } from '../../src/services/slowQueryAlerts';

const alert = { fingerprint: 'fp', query: 'select 1', durationMs: 250, rowCount: 1, thresholdMs: 100 };

describe('slowQueryAlerts', () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  beforeEach(() => {
    resetAlerts();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
    process.env.DB_SLOW_QUERY_ALERT_INTERVAL = '300';
    process.env.DB_SLOW_QUERY_ALERT_MAX_PER_MINUTE = '2';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL;
    delete process.env.DB_SLOW_QUERY_ALERT_INTERVAL;
    delete process.env.DB_SLOW_QUERY_ALERT_MAX_PER_MINUTE;
  });

  it('does nothing without a webhook URL', () => {
    delete process.env.DB_SLOW_QUERY_ALERT_WEBHOOK_URL;
    expect(sendSlowQueryAlert(alert)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a JSON alert with the query details', () => {
    expect(sendSlowQueryAlert(alert, 1000)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:9/hook');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ event: 'slow_query', fingerprint: 'fp', durationMs: 250, thresholdMs: 100 });
    expect(body.text).toContain('select 1');
  });

  it('rate limits per fingerprint and globally', () => {
    expect(sendSlowQueryAlert(alert, 1000)).toBe(true);
    expect(sendSlowQueryAlert(alert, 2000)).toBe(false); // same fingerprint inside interval
    expect(sendSlowQueryAlert({ ...alert, fingerprint: 'b' }, 2000)).toBe(true);
    expect(sendSlowQueryAlert({ ...alert, fingerprint: 'c' }, 2000)).toBe(false); // global cap 2/min
    expect(sendSlowQueryAlert({ ...alert, fingerprint: 'c' }, 62_000)).toBe(true); // new window
    expect(getAlertStats().suppressed).toBe(2);
  });
});
