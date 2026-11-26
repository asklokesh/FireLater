import { z, type ZodTypeAny } from 'zod';

/**
 * Small builders for endpoints that read a handful of loose fields (see remaining.routes.ts).
 * Everything is optional and bounded; unknown keys are tolerated (passthrough) so existing clients keep working.
 */

const PAGING = new Set(['page', 'per_page', 'perPage', 'limit', 'offset', 'days', 'hours', 'months', 'threshold']);

/** Param names `id` / `*Id` are UUIDs (except jobId / sessionId); every other param is a bounded, non-empty string. */
export function params(...names: string[]): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  for (const n of names) {
    const uuidParam = (n === 'id' || /Id$/.test(n)) && n !== 'jobId' && n !== 'sessionId';
    shape[n] = uuidParam
      ? z.string().uuid()
      : z.string().min(1).max(255).refine((v) => !v.includes('..'), 'must not contain ".."');
  }
  return z.object(shape).passthrough();
}

/** Query string fields: bounded strings (or string arrays); paging-style fields must be non-negative integers. */
export function query(...names: string[]): ZodTypeAny {
  const str = z.string().max(10_000);
  const shape: Record<string, ZodTypeAny> = {};
  for (const n of names) {
    shape[n] = (PAGING.has(n) ? z.string().regex(/^\d+$/, 'must be a non-negative integer') : z.union([str, z.array(str).max(100)])).optional();
  }
  return z.object(shape).passthrough();
}

export const string = (): ZodTypeAny => z.string().max(100_000).optional();
export const strings = (): ZodTypeAny => z.array(z.string().max(10_000)).max(1000).optional();
export const number = (): ZodTypeAny => z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).optional();
export const boolean = (): ZodTypeAny => z.boolean().optional();
export const any = (): ZodTypeAny => z.unknown().optional();
/** Loose JSON object body; may be omitted entirely (handlers treat a missing body as empty). */
export const object = (shape: Record<string, ZodTypeAny>): ZodTypeAny => z.object(shape).passthrough().optional();
