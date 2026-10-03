import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { z } from 'zod';
import { validateRequest } from '../../../src/middleware/validation.js';
import { createApplicationSchema, appIdParamSchema } from '../../../src/schemas/applications.js';
import { formatZodIssues, zodErrorToAppError } from '../../../src/utils/validationErrors.js';
import { AppError } from '../../../src/utils/errors.js';

describe('validateRequest middleware', () => {
  async function buildTestApp(schema: Parameters<typeof validateRequest>[0]) {
    const app = Fastify({ logger: false });

    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof AppError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }
      return reply.status(500).send({ message: 'unexpected' });
    });

    app.post('/test/:id', { preHandler: [validateRequest(schema)] }, async (request) => {
      return { body: request.body, params: request.params, query: request.query };
    });

    await app.ready();
    return app;
  }

  it('passes through valid body, params, and query', async () => {
    const app = await buildTestApp({
      body: createApplicationSchema,
      params: appIdParamSchema,
      query: z.object({ verbose: z.coerce.boolean().optional() }),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/test/123e4567-e89b-12d3-a456-426614174000?verbose=true',
      payload: { name: 'App One', tier: 'P1' },
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.body.name).toBe('App One');
    expect(json.params.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(json.query.verbose).toBe(true);

    await app.close();
  });

  it('rejects an invalid UUID param with a 400 AppError response', async () => {
    const app = await buildTestApp({ params: appIdParamSchema });

    const response = await app.inject({
      method: 'POST',
      url: '/test/not-a-uuid',
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.error).toBe('Validation Error');
    expect(json.details).toHaveProperty('id');

    await app.close();
  });

  it('rejects an invalid body and reports field-level details', async () => {
    const app = await buildTestApp({
      body: createApplicationSchema,
      params: appIdParamSchema,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/test/123e4567-e89b-12d3-a456-426614174000',
      payload: { name: 'A', tier: 'INVALID' },
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.details).toHaveProperty('name');
    expect(json.details).toHaveProperty('tier');
  });

  it.each([
    { name: '<script>alert(1)</script>', tier: 'P1' },
    { name: "Robert'); DROP TABLE applications;--", tier: 'P1' },
    { name: '../../../etc/passwd', tier: 'P1' },
  ])('accepts attack-payload strings as plain data without executing them: %j', async (payload) => {
    const app = await buildTestApp({ body: createApplicationSchema });

    const response = await app.inject({
      method: 'POST',
      url: '/test/123e4567-e89b-12d3-a456-426614174000',
      payload,
    });

    // Zod only validates shape/type, not content; the string is preserved verbatim
    // (sanitization/escaping is a separate concern handled by escapeHtml).
    expect(response.statusCode).toBe(200);
    expect(response.json().body.name).toBe(payload.name);
  });
});

describe('validationErrors utility', () => {
  it('formats ZodError issues into a field -> messages map', () => {
    const schema = z.object({ id: z.string().uuid(), name: z.string().min(1) });
    const result = schema.safeParse({ id: 'bad', name: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const details = formatZodIssues(result.error);
      expect(details.id).toBeDefined();
      expect(details.name).toBeDefined();
    }
  });

  it('converts a ZodError into an AppError with statusCode 400', () => {
    const schema = z.object({ id: z.string().uuid() });
    const result = schema.safeParse({ id: 'bad' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const appError = zodErrorToAppError(result.error);
      expect(appError).toBeInstanceOf(AppError);
      expect(appError.statusCode).toBe(400);
      expect(appError.error).toBe('Validation Error');
      expect(appError.details.id).toBeDefined();
    }
  });
});
