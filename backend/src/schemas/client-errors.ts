import { z } from 'zod';

/** POST /v1/client-errors: a render error reported by the frontend ErrorBoundary. */
export const clientErrorSchema = z.object({
  message: z.string().max(2000),
  stack: z.string().max(10000).optional(),
  componentStack: z.string().max(10000).optional(),
  code: z.string().max(100).optional(),
  url: z.string().max(2000).optional(),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>;
