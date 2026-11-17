import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeBulk = vi.fn();
vi.mock('../../../../src/services/bulk.js', () => ({ executeBulk: (...a: unknown[]) => executeBulk(...a) }));
vi.mock('../../../../src/utils/ssrf.js', () => ({ validateUrlForSSRF: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('bullmq', () => ({
  Worker: vi.fn().mockImplementation(() => ({ on: vi.fn(), close: vi.fn() })),
  Queue: vi.fn(),
  QueueEvents: vi.fn(),
}));
vi.mock('../../../../src/config/redis.js', () => ({ redisConnection: { host: 'localhost', port: 6379 } }));
vi.mock('../../../../src/jobs/bulkQueue.js', () => ({ BULK_QUEUE_NAME: 'bulk-operations' }));

import { processBulkJob } from '../../../../src/jobs/processors/bulkOperations.js';

function makeJob(data: Record<string, unknown>) {
  return { id: '42', data, progress: 0, updateProgress: vi.fn().mockResolvedValue(undefined) } as never;
}

const base = {
  tenantSlug: 'acme',
  userId: 'u1',
  entity: 'issues',
  operation: 'update',
  payload: { ids: [], changes: { priority: 'low' } },
};

describe('bulk operations processor', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('records progress and posts started/completed webhooks', async () => {
    executeBulk.mockImplementation(async (_a, _e, _o, _p, onProgress) => {
      await onProgress(1000, 2000);
      await onProgress(2000, 2000);
      return { entity: 'issues', operation: 'update', requested: 2000, affected: 2000 };
    });
    const job = makeJob({ ...base, webhookUrl: 'https://hooks.example.com/x' });
    const result = await processBulkJob(job);
    expect(result.affected).toBe(2000);
    expect((job as { updateProgress: ReturnType<typeof vi.fn> }).updateProgress).toHaveBeenCalledWith({ processed: 2000, total: 2000 });
    const events = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body).event);
    expect(events[0]).toBe('bulk.started');
    expect(events[events.length - 1]).toBe('bulk.completed');
  });

  it('posts a failed webhook and rethrows when the transaction fails', async () => {
    executeBulk.mockRejectedValue(new Error('boom'));
    const job = makeJob({ ...base, webhookUrl: 'https://hooks.example.com/x' });
    await expect(processBulkJob(job)).rejects.toThrow('boom');
    const last = JSON.parse(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1].body);
    expect(last).toMatchObject({ event: 'bulk.failed', error: 'boom' });
  });

  it('does not call fetch without a webhook and ignores webhook errors', async () => {
    executeBulk.mockResolvedValue({ entity: 'issues', operation: 'update', requested: 1, affected: 1 });
    await processBulkJob(makeJob(base));
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValue(new Error('down'));
    await expect(processBulkJob(makeJob({ ...base, webhookUrl: 'https://h.example.com' }))).resolves.toBeDefined();
  });
});
