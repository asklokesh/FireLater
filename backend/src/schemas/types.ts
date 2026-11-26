import type { FastifyRequest } from 'fastify';
import type { ZodTypeAny } from 'zod';

export type SchemaOrResolver = ZodTypeAny | ((request: FastifyRequest) => ZodTypeAny);

export interface RateLimitConfig {
  max: number;
  /** Window in milliseconds or a string such as '1 minute'. */
  timeWindow: number | string;
}

/** Validation rules for a single endpoint. */
export interface RouteSchema {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  /** A schema, or a function choosing one from the request (e.g. header-dependent bodies). */
  body?: SchemaOrResolver;
  /** Per-route rate limit enforced by the validation middleware. */
  rateLimit?: RateLimitConfig;
}

export type RouteSchemaMap = Record<string, RouteSchema>;
