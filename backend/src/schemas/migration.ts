import { z } from 'zod';

export const jobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});
