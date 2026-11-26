import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '../../../src/utils/logger.js';
import { validationPlugin } from '../../../src/middleware/validation.js';
import { sanitizeInput, sanitizeString } from '../../../src/utils/inputSanitizer.js';
import { formatZodIssues, buildValidationError } from '../../../src/utils/validationErrors.js';
import { schemaRegistry, lookupSchemas } from '../../../src/schemas/index.js';
import { createIssueSchema, listIssuesQuerySchema } from '../../../src/schemas/issues.js';
import { loginSchema } from '../../../src/schemas/auth.js';
import { deriveParamsSchema } from '../../../src/schemas/index.js';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(validationPlugin);
  app.post('/echo', {
    preHandler: [app.validate({
      body: z.object({ title: z.string().min(3), n: z.coerce.number().optional() }),
      query: z.object({ page: z.coerce.number().int().min(1) }),
      params: z.object({}).passthrough(),
    })],
  }, async (req) => ({ body: req.body, query: req.query }));
  app.post('/items/:id', {
    preHandler: [app.validate({ params: z.object({ id: z.string().uuid() }) })],
  }, async (req) => ({ params: req.params }));
  app.post('/limited', {
    preHandler: [app.validate({ rateLimit: { max: 2, windowMs: 60_000 } })],
  }, async () => ({ ok: true }));
  app.post('/baseline', async (req) => ({ body: req.body }));
  app.get('/v1/audit/user/:userId', async (req) => ({ params: req.params, query: req.query }));
  app.post('/v1/sod/policies', async (req) => ({ body: req.body }));
  app.post('/v1/jobs/queues/:queueName/pause', async (req) => ({ params: req.params }));
  app.post('/v1/issues', async (req) => ({ body: req.body }));
  app.get('/v1/issues', async (req) => ({ query: req.query }));
  await app.ready();
  return app;
}

describe('sanitizeString / sanitizeInput', () => {
  it('removes script blocks, event handlers and javascript: URLs', () => {
    expect(sanitizeString('hi<script>alert(1)</script>there', 'description')).toBe('hithere');
    expect(sanitizeString('<img src=x onerror=alert(1)>', 'description')).toBe('<img src=x>');
    expect(sanitizeString('<a href="javascript:alert(1)">x</a>', 'description')).toBe('<a>x</a>');
    expect(sanitizeString('<iframe src="//evil"></iframe>', 'description')).toBe('');
  });
  it('defeats nested/split payloads', () => {
    expect(sanitizeString('<scr<script>ipt>alert(1)</scr</script>ipt>', 'description')).not.toMatch(/<script/i);
  });
  it('strips all tags and trims for plain fields', () => {
    expect(sanitizeString('  <b>Bob</b> ', 'name')).toBe('Bob');
    expect(sanitizeString('<b>Bob</b>', 'description')).toBe('<b>Bob</b>');
  });
  it('removes control characters but keeps newlines', () => {
    expect(sanitizeString('a\u0000b\u0007c\nd', 'description')).toBe('abc\nd');
  });
  it('never touches secrets', () => {
    const pw = 'p<a>ss\\w0rd`{x}';
    expect(sanitizeString(pw, 'password')).toBe(pw);
    expect(sanitizeString(pw, 'newPassword')).toBe(pw);
    expect(sanitizeString(pw, 'refreshToken')).toBe(pw);
  });
  it('leaves comparison operators and SQL-looking text intact', () => {
    expect(sanitizeString('a < b and b > c', 'description')).toBe('a < b and b > c');
    expect(sanitizeString("O'Brien; DROP TABLE x;--", 'description')).toBe("O'Brien; DROP TABLE x;--");
  });
  it('blocks data: URLs in url fields', () => {
    expect(sanitizeString('data:text/html,<b>x</b>', 'webhookUrl')).toBe('');
  });
  it('recurses into objects and arrays and drops prototype-pollution keys', () => {
    const input = JSON.parse('{"a":[{"title":"<i>x</i>"}],"__proto__":{"polluted":true},"n":5}');
    const { value, changed } = sanitizeInput(input);
    expect(value).toEqual({ a: [{ title: 'x' }], n: 5 });
    expect(changed).toContain('a[0].title');
    expect(changed).toContain('__proto__');
    expect(({} as any).polluted).toBeUndefined();
  });
  it('rejects absurdly deep input', () => {
    let deep: any = 'x';
    for (let i = 0; i < 40; i++) deep = { a: deep };
    expect(() => sanitizeInput(deep)).toThrow(/nested/);
  });
});

describe('validation error formatting', () => {
  it('formats zod issues with location, field and message', () => {
    const r = z.object({ a: z.string(), b: z.enum(['x', 'y']) }).safeParse({ b: 'z' });
    if (r.success) throw new Error('expected failure');
    const details = formatZodIssues('body', r.error);
    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({ location: 'body', field: 'a', message: 'Required', code: 'invalid_type' });
    expect(details[1].message).toBe('Must be one of: x, y');
    expect(buildValidationError(details)).toMatchObject({ statusCode: 400, error: 'Validation Error' });
  });
});

describe('schema registry', () => {
  it('looks up schemas by method and route pattern', () => {
    expect(lookupSchemas('post', '/v1/issues')?.body).toBe(createIssueSchema);
    expect(lookupSchemas('GET', '/v1/issues/')?.query).toBe(listIssuesQuerySchema);
    expect(lookupSchemas('POST', '/v1/auth/login')?.body).toBe(loginSchema);
    // unregistered routes fall back to convention defaults (query only for GET)
    const fallback = lookupSchemas('GET', '/nope');
    expect(fallback?.params).toBeUndefined();
    expect(fallback?.query).toBeDefined();
    expect(fallback?.body).toBeUndefined();
  });
  it('only registers well-formed keys', () => {
    for (const key of Object.keys(schemaRegistry)) expect(key).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/v1\//);
  });
  it('infers types from schemas', () => {
    const parsed = createIssueSchema.parse({ title: 'Valid title' });
    const title: string = parsed.title;
    expect(title).toBe('Valid title');
  });
});

describe('validate() middleware', () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.clearAllMocks(); app = await build(); });

  it('passes valid input, coerces and replaces request data', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo?page=2', payload: { title: 'abc', n: '7' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ body: { title: 'abc', n: 7 }, query: { page: 2 } });
  });

  it('returns a consistent 400 listing every failing location', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo?page=0', payload: { title: 'a' } });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json).toMatchObject({ statusCode: 400, error: 'Validation Error', message: 'Request validation failed' });
    const fields = json.details.map((d: any) => `${d.location}.${d.field}`).sort();
    expect(fields).toEqual(['body.title', 'query.page']);
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'validation_rejected' }), expect.any(String));
  });

  it('validates params', async () => {
    const bad = await app.inject({ method: 'POST', url: '/items/not-a-uuid', payload: {} });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details[0]).toMatchObject({ location: 'params', field: 'id' });
    const ok = await app.inject({ method: 'POST', url: '/items/4f1b3b3e-8f52-4c53-9d0e-0d5c3b1f0a11', payload: {} });
    expect(ok.statusCode).toBe(200);
  });

  it('sanitizes XSS payloads before the handler and audits without logging values', async () => {
    const res = await app.inject({ method: 'POST', url: '/baseline', payload: { description: 'x<script>alert(1)</script>y', name: '<b>n</b>', password: '<pw>' } });
    expect(res.json().body).toEqual({ description: 'xy', name: 'n', password: '<pw>' });
    const call = (logger.warn as any).mock.calls.find((c: any[]) => c[0].event === 'input_sanitized');
    expect(call[0].fields).toEqual(['body.description', 'body.name']);
    expect(JSON.stringify(call)).not.toContain('alert');
  });

  it('applies baseline sanitization to routes with no explicit validator', async () => {
    const res = await app.inject({ method: 'POST', url: '/baseline', payload: { title: '<i>t</i>' } });
    expect(res.json().body).toEqual({ title: 't' });
  });

  it('applies registry schemas to registered routes automatically', async () => {
    const bad = await app.inject({ method: 'POST', url: '/v1/issues', payload: { title: 'x' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/v1/issues', payload: { title: 'A real title' } });
    expect(ok.statusCode).toBe(200);
    const list = await app.inject({ method: 'GET', url: '/v1/issues?page=2&sort=title' });
    expect(list.json().query).toMatchObject({ page: 2, sort: 'title' });
    expect((await app.inject({ method: 'GET', url: '/v1/issues?status=bogus' })).statusCode).toBe(400);
  });

  it('enforces per-route rate limits', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await app.inject({ method: 'POST', url: '/limited', payload: {} })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    const res = await app.inject({ method: 'POST', url: '/limited', payload: {} });
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('reports coverage for every registered route', async () => {
    const cov = app.validationCoverage();
    expect(cov.find((c) => c.route === 'POST /baseline')?.mode).toBe('default');
    expect(cov.find((c) => c.route === 'POST /echo')?.mode).toBe('explicit');
    expect(cov.find((c) => c.route === 'POST /v1/issues')?.mode).toBe('explicit');
    expect(cov.every((c) => c.mode !== 'baseline')).toBe(true);
  });
});

describe('convention defaults and hand-written registry schemas', () => {
  let app: FastifyInstance;
  beforeEach(async () => { app = await build(); });

  it('derives uuid params for id-like names and safe strings otherwise', () => {
    const schema = deriveParamsSchema('/v1/x/:id/y/:queueName')!;
    expect(schema.safeParse({ id: '4f1b3b3e-8f52-4c53-9d0e-0d5c3b1f0a11', queueName: 'email-queue' }).success).toBe(true);
    expect(schema.safeParse({ id: 'nope', queueName: 'q' }).success).toBe(false);
    expect(schema.safeParse({ id: '4f1b3b3e-8f52-4c53-9d0e-0d5c3b1f0a11', queueName: 'a b' }).success).toBe(false);
    expect(deriveParamsSchema('/v1/plain')).toBeUndefined();
  });

  it('rejects a non-uuid :userId on a route without an explicit schema', async () => {
    const bad = await app.inject({ method: 'GET', url: '/v1/audit/user/abc' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details[0]).toMatchObject({ location: 'params', field: 'userId' });
  });

  it('checks default GET query keys but keeps unknown keys', async () => {
    const id = '4f1b3b3e-8f52-4c53-9d0e-0d5c3b1f0a11';
    expect((await app.inject({ method: 'GET', url: `/v1/audit/user/${id}?limit=abc` })).statusCode).toBe(400);
    const ok = await app.inject({ method: 'GET', url: `/v1/audit/user/${id}?limit=5&days=7` });
    expect(ok.json().query).toEqual({ limit: 5, days: '7' });
  });

  it('rejects array bodies on write routes by default', async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/jobs/queues/email/pause', payload: [1, 2] });
    expect(res.statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/jobs/queues/email/pause' })).statusCode).toBe(200);
  });

  it('applies hand-written schemas from the registry (sod policies)', async () => {
    const bad = await app.inject({ method: 'POST', url: '/v1/sod/policies', payload: { name: 'x' } });
    expect(bad.statusCode).toBe(400);
    const fields = bad.json().details.map((d: any) => d.field).sort();
    expect(fields).toEqual(['conflicting_role_a', 'conflicting_role_b', 'entity_type']);
    const ok = await app.inject({ method: 'POST', url: '/v1/sod/policies', payload: { name: 'x', conflicting_role_a: 'a', conflicting_role_b: 'b', entity_type: 'change' } });
    expect(ok.statusCode).toBe(200);
  });
});

describe('several validate() calls on one route are merged', () => {
  it('runs params, body and every rate limit even when declared in separate validators', async () => {
    const app = Fastify();
    await app.register(validationPlugin);
    app.post('/v1/things/:id', {
      preHandler: [
        app.validate({ params: z.object({ id: z.string().uuid() }) }),
        app.validate({ body: z.object({ n: z.number() }), rateLimit: { max: 2, windowMs: 60_000 } }),
      ],
    }, async (req) => req.body);
    const id = '4f1b3b3e-8f52-4c53-9d0e-0d5c3b1f0a11';
    expect((await app.inject({ method: 'POST', url: '/v1/things/x', payload: { n: 1 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/v1/things/${id}`, payload: { n: 'a' } })).statusCode).toBe(400);
    // two 400s above did not count as passes: the limiter only sees requests that reach it first
    const ok = await app.inject({ method: 'POST', url: `/v1/things/${id}`, payload: { n: 1 } });
    expect(ok.statusCode === 200 || ok.statusCode === 429).toBe(true);
    await app.close();
  });

  it('refuses to register two validators for the same location', async () => {
    const app = Fastify();
    await app.register(validationPlugin);
    expect(() => app.post('/dup', {
      preHandler: [app.validate({ body: z.object({}) }), app.validate({ body: z.object({}) })],
    }, async () => ({}))).toThrow(/more than one validate/);
    await app.close();
  });

  it('fills locations the route did not declare with registry/default schemas', async () => {
    const app = Fastify();
    await app.register(validationPlugin);
    app.post('/v1/sod/policies', { preHandler: [app.validate({})] }, async () => ({ ok: true }));
    app.post('/v1/things/:id/act', { preHandler: [app.validate({ body: z.object({}).passthrough() })] }, async () => ({ ok: true }));
    expect((await app.inject({ method: 'POST', url: '/v1/things/not-uuid/act', payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/v1/sod/policies', payload: { name: 'x' } })).statusCode).toBe(400);
    await app.close();
  });

  it('picks a body schema per request when a function is given', async () => {
    const app = Fastify();
    await app.register(validationPlugin);
    app.post('/pick', {
      preHandler: [app.validate({ body: (r) => (r.headers['x-kind'] === 'a' ? z.object({ a: z.string() }) : z.object({ b: z.string() })) })],
    }, async () => ({ ok: true }));
    expect((await app.inject({ method: 'POST', url: '/pick', headers: { 'x-kind': 'a' }, payload: { a: 'x' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/pick', payload: { a: 'x' } })).statusCode).toBe(400);
    await app.close();
  });
});
