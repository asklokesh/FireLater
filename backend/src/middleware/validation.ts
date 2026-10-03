import { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, ZodTypeAny } from 'zod';
import { zodErrorToAppError } from '../utils/validationErrors.js';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
}

export interface RateLimitOptions {
  max: number;
  timeWindow: string | number;
}

/**
 * Fastify preHandler that validates request body/params/query against the given
 * Zod schemas. Validated (and coerced/defaulted) values replace the raw request
 * fields so downstream handlers can trust their shape.
 */
export function validateRequest(schemas: ValidationSchemas) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    try {
      if (schemas.body) {
        request.body = schemas.body.parse(request.body);
      }
      if (schemas.params) {
        request.params = schemas.params.parse(request.params);
      }
      if (schemas.query) {
        request.query = schemas.query.parse(request.query);
      }
    } catch (error) {
      if (error instanceof ZodError) {
        throw zodErrorToAppError(error);
      }
      throw error;
    }
  };
}

/**
 * Builds a Fastify route `config` fragment that `@fastify/rate-limit` reads to
 * apply a per-route override of the globally registered rate limiter.
 * No-op helper (callers just spread the result) so routes stay decoupled from
 * whether rate-limit is registered at all.
 */
export function withRateLimit(options: RateLimitOptions): { config: { rateLimit: RateLimitOptions } } {
  return { config: { rateLimit: options } };
}
