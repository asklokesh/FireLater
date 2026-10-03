import { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import { getRouteSchema, RouteSchema } from '../schemas/index.js';
import { sanitizeValue } from './sanitization.js';
import { logRequestAudit } from './auditLog.js';
import { formatValidationError, FormattedValidationIssue } from '../utils/errors.js';

type Source = 'body' | 'params' | 'query';
const SOURCES: Source[] = ['params', 'query', 'body'];

export interface ValidationOptions {
  // Rate limit config (see middleware/rateLimit.ts) passed to @fastify/rate-limit
  rateLimit?: Record<string, unknown>;
}

export async function validateRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  schema: RouteSchema
): Promise<void> {
  const failures: FormattedValidationIssue[] = [];

  for (const source of SOURCES) {
    const sourceSchema = schema[source];
    if (!sourceSchema) continue;

    const sanitized = sanitizeValue((request as unknown as Record<Source, unknown>)[source] ?? {});
    const result = sourceSchema.safeParse(sanitized);
    if (result.success) {
      (request as unknown as Record<Source, unknown>)[source] = result.data;
    } else {
      failures.push(...formatValidationError(result.error.issues, source).details);
    }
  }

  if (failures.length > 0) {
    logRequestAudit(request, failures.map(({ field, code }) => ({ field, code })));
    return reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: 'Validation failed',
      details: failures,
    });
  }
}

// Route-level helper: spread into route options to validate with an explicit schema
export function validated(schema: RouteSchema, options: ValidationOptions = {}): RouteShorthandOptions {
  const routeOptions: RouteShorthandOptions = {
    preValidation: async (request, reply) => validateRequest(request, reply, schema),
  };
  if (options.rateLimit) {
    routeOptions.config = { rateLimit: options.rateLimit };
  }
  return routeOptions;
}

// Global hook: validates any route that has an entry in the schema registry
export default function registerValidation(fastify: FastifyInstance) {
  fastify.addHook('preValidation', async (request, reply) => {
    const schema = getRouteSchema(request.method, request.routeOptions.url ?? '');
    if (!schema) return;
    return validateRequest(request, reply, schema);
  });
}
