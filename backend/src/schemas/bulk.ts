import { z } from 'zod';

export const jobIdParamSchema = z.object({ id: z.string().min(1).max(100) });
