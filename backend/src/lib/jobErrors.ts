import { captureException } from './errorTracking.js';

interface JobLike {
  id?: string | number;
  name?: string;
  data?: { tenantSlug?: string } | undefined;
}

/** Send a failed background job to error tracking (call from each Worker's `failed` handler). */
export function captureJobFailure(operation: string, job: JobLike | undefined, err: unknown): void {
  captureException(err, {
    operation,
    jobId: job?.id,
    jobName: job?.name,
    tenantSlug: job?.data?.tenantSlug,
  });
}
