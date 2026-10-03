import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import Fastify from 'fastify';
import { z } from 'zod';
import { sanitizeInput, sanitizeObject } from '../../src/middleware/sanitization';
import registerValidation, { validated } from '../../src/middleware/validation';
import { schemaRegistry, paginationQuerySchema, idParamsSchema } from '../../src/schemas/index';
import { formatValidationError } from '../../src/utils/errors';

vi.mock('../../src/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../../src/services/audit', () => ({ auditService: { log: vi.fn() } }));

describe('sanitizer', () => {
  it('removes script blocks and their content', () => {
    expect(sanitizeInput('hi<script>alert(1)</script>there')).toBe('hithere');
  });

  it('strips markup characters from event handler payloads', () => {
    const out = sanitizeInput('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('strips control characters', () => {
    expect(sanitizeInput('a\u0000b\u0007c')).toBe('abc');
  });

  it('sanitizes nested objects and arrays', () => {
    const out = sanitizeObject({ a: ['<b>x</b>'], n: { s: '`rm`' } });
    expect(out.a[0]).toBe('bx/b');
    expect(out.n.s).toBe('rm');
  });

  it('drops prototype pollution keys', () => {
    const out = sanitizeObject(JSON.parse('{"__proto__":{"x":1},"ok":"y"}'));
    expect(Object.keys(out)).toEqual(['ok']);
  });

  it('leaves credential fields untouched', () => {
    expect(sanitizeObject({ password: 'a[b]|c' }).password).toBe('a[b]|c');
  });
});

describe('common schemas', () => {
  it('applies pagination defaults and coercion', () => {
    expect(paginationQuerySchema.parse({ limit: '5' })).toMatchObject({ page: 1, limit: 5 });
  });

  it('rejects non-uuid ids', () => {
    expect(idParamsSchema.safeParse({ id: 'nope' }).success).toBe(false);
  });
});

describe('formatValidationError', () => {
  it('returns field path, message and code', () => {
    const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({ a: { b: 1 } });
    if (result.success) throw new Error('expected failure');
    const formatted = formatValidationError(result.error.issues, 'body');
    expect(formatted.statusCode).toBe(400);
    expect(formatted.details[0]).toMatchObject({ field: 'body.a.b', code: 'invalid_type' });
    expect(typeof formatted.details[0].message).toBe('string');
  });
});

describe('validation middleware', () => {
  const build = async () => {
    const app = Fastify();
    registerValidation(app);
    app.post('/items/:id', validated({
      params: idParamsSchema,
      body: z.object({ name: z.string().min(1) }),
      query: paginationQuerySchema,
    }), async (request) => ({ body: request.body, query: request.query }));
    app.post('/auth/login', async () => ({ ok: true }));
    await app.ready();
    return app;
  };

  const id = '123e4567-e89b-42d3-a456-426614174000';

  it('replaces request data with sanitized parsed output', async () => {
    const app = await build();
    const res = await app.inject({
      method: 'POST',
      url: `/items/${id}?limit=3`,
      payload: { name: '<script>x</script>Widget' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: { name: 'Widget' }, query: { page: 1, limit: 3 } });
  });

  it('returns a consistent 400 shape on failure', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/items/bad', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.error).toBe('Validation Error');
    expect(json.details.map((d: { field: string }) => d.field)).toEqual(
      expect.arrayContaining(['params.id', 'body.name'])
    );
  });

  it('does not leak submitted values in the error response', async () => {
    const app = await build();
    const res = await app.inject({ method: 'POST', url: '/items/bad', payload: { name: '' } });
    expect(res.body).not.toContain('bad"');
  });
});

describe('schema registry', () => {
  it('uses "METHOD /route" keys', () => {
    for (const key of Object.keys(schemaRegistry)) {
      expect(key).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/\S*$/);
    }
  });

  it('every auth entry maps to a route in routes/auth.ts', () => {
    const source = readFileSync(join(__dirname, '../../src/routes/auth.ts'), 'utf8');
    for (const key of Object.keys(schemaRegistry).filter((k) => k.includes(' /auth/'))) {
      const [method, url] = key.split(' ');
      const route = url.replace('/auth', '');
      expect(source).toContain(`app.${method.toLowerCase()}('${route}'`);
    }
  });
});
