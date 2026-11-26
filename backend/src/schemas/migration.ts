import { z } from 'zod';

// Parameter validation schemas
export const jobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});
