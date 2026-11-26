import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { captureJobFailure } from '../../../src/lib/jobErrors.js';
import { setErrorTracker } from '../../../src/lib/errorTracking.js';

describe('job failure tracking', () => {
  it('sends job failures with queue, job and tenant context', () => {
    const captured: any[] = [];
    setErrorTracker({ name: 't', captureException: (e, c) => { captured.push([e, c]); } });
    const err = new Error('job broke');
    captureJobFailure('job.cleanup', { id: '7', name: 'purge', data: { tenantSlug: 'acme' } }, err);
    expect(captured[0][0]).toBe(err);
    expect(captured[0][1]).toMatchObject({ operation: 'job.cleanup', jobId: '7', jobName: 'purge', tenantSlug: 'acme' });
  });

  it('tolerates a missing job (BullMQ passes undefined for stalled jobs)', () => {
    setErrorTracker({ name: 't', captureException: () => {} });
    expect(() => captureJobFailure('job.x', undefined, new Error('x'))).not.toThrow();
  });

  // The workers start Redis connections on import, so their wiring is checked in the source.
  it.each([
    ['cleanup', 'cleanupWorker', 'job.cleanup'],
    ['slaBreaches', 'slaBreachWorker', 'job.slaBreaches'],
    ['healthScores', 'healthScoreWorker', 'job.healthScores'],
    ['notifications', 'notificationWorker', 'job.notifications'],
    ['cloudSync', 'cloudSyncWorker', 'job.cloudSync'],
    ['scheduledReports', 'scheduledReportsWorker', 'job.scheduledReports'],
  ])('%s worker reports failures to error tracking', (file, worker, op) => {
    const src = readFileSync(resolve(__dirname, `../../../src/jobs/processors/${file}.ts`), 'utf8');
    const handler = src.slice(src.indexOf(`${worker}.on('failed'`));
    expect(handler.slice(0, 200)).toContain(`captureJobFailure('${op}'`);
  });

  it('bulk worker reports failures to error tracking', () => {
    const src = readFileSync(resolve(__dirname, '../../../src/jobs/processors/bulkOperations.ts'), 'utf8');
    expect(src).toContain("captureJobFailure('job.bulk'");
  });
});
