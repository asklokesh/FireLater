import { z } from 'zod';

/** Shared building blocks for route schemas. */
export const uuid = z.string().uuid();

export const idParamSchema = z.object({ id: uuid });

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
});

/** Strict token pattern for identifier-like params (id, jobId, entity_id, ...). */
export const SAFE_PARAM_PATTERN = /^[\w.:@~+=%-]{1,255}$/;
const ID_PARAM_KEY = /^(id|.*Id|.*_id)$/;
// Free-text params (names, types, slugs, non-ASCII) may contain spaces and any letters, but never
// control characters, quotes, statement/markup characters or backslashes. "/" is only legal in wildcard params.
// eslint-disable-next-line no-control-regex
const UNSAFE_PARAM_CHARS = /[\u0000-\u001F\u007F;"'`<>\\|]/;

/** Baseline for any path parameters on a route without a dedicated schema. */
export const defaultParamsSchema = z.record(z.string().max(2048)).superRefine((params, ctx) => {
  for (const [key, value] of Object.entries(params)) {
    if (value.length === 0) continue;
    const bad = ID_PARAM_KEY.test(key)
      ? !SAFE_PARAM_PATTERN.test(value)
      : UNSAFE_PARAM_CHARS.test(value) || (key !== '*' && value.includes('/')) || value.split('/').includes('..');
    if (bad) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Contains characters that are not allowed in a path parameter' });
    }
  }
});

/** Baseline for query strings: strings or arrays of strings, bounded length. */
export const defaultQuerySchema = z.record(
  z.union([z.string().max(4000), z.array(z.string().max(4000)).max(100)]),
);

// Sized to the real transport limits: 10 MB request bodies, and bulk operations of up to 50,000 ids.
export const MAX_BODY_STRING = 5_000_000;
export const MAX_BODY_ARRAY = 50_000;
export const MAX_BODY_KEY = 200;

/**
 * Baseline for bodies on routes WITHOUT a dedicated body schema (a dedicated schema owns its own limits):
 * a JSON object or array whose leaves are bounded (strings <= 5M chars, arrays <= 50k items, keys <= 200
 * chars with no control characters). Depth and key-count limits plus forbidden keys are enforced by the sanitizer.
 */
export const defaultBodySchema = z.union([z.record(z.unknown()), z.array(z.unknown())]).superRefine((value, ctx) => {
  const walk = (v: unknown, path: (string | number)[]): void => {
    if (typeof v === 'string') {
      if (v.length > MAX_BODY_STRING) {
        ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_BODY_STRING, type: 'string', inclusive: true, path, message: `String must contain at most ${MAX_BODY_STRING} character(s)` });
      }
    } else if (Array.isArray(v)) {
      if (v.length > MAX_BODY_ARRAY) {
        ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: MAX_BODY_ARRAY, type: 'array', inclusive: true, path, message: `Array must contain at most ${MAX_BODY_ARRAY} element(s)` });
        return;
      }
      v.forEach((item, i) => walk(item, [...path, i]));
    } else if (v !== null && typeof v === 'object') {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        // eslint-disable-next-line no-control-regex
        if (k.length === 0 || k.length > MAX_BODY_KEY || /[\u0000-\u001F\u007F]/.test(k)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, k.slice(0, 50)], message: 'Invalid property name' });
          continue;
        }
        walk(child, [...path, k]);
      }
    }
  };
  walk(value, []);
});
