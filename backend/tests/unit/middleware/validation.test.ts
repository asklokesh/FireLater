import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { logger } from '../../../src/utils/logger.js';
import {
  registerValidation, sanitizeString, sanitizeValue, resetRouteRateLimits, MAX_DEPTH,
} from '../../../src/middleware/validation.js';
import { defineRoute, getRouteSchema, normalizeRoutePath, listRegisteredRoutes } from '../../../src/schemas/index.js';
import { buildValidationError, formatZodIssues } from '../../../src/utils/validationErrors.js';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerValidation(app);
  app.post('/echo', async (req) => ({ body: req.body }));
  app.get('/echo/:id', async (req) => ({ params: req.params, query: req.query }));
  await app.register(async (sub) => {
    sub.post('/things', async (req) => ({ body: req.body }));
    sub.get('/things/:id', async (req) => ({ params: req.params }));
  }, { prefix: '/v1' });
  await app.ready();
  return app;
}

describe('sanitizeString', () => {
  it('removes script tags and event handlers', () => {
    expect(sanitizeString('hi<script>alert(1)</script>')).toBe('hi');
    expect(sanitizeString('<img src=x onerror=alert(1)>')).not.toMatch(/onerror/i);
    expect(sanitizeString('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  });
  it('strips null bytes and control characters but keeps newlines', () => {
    expect(sanitizeString('a\u0000b\u0007c\nd')).toBe('abc\nd');
  });
  it('removes dangerous leading URL schemes', () => {
    expect(sanitizeString('javascript:alert(1)')).not.toMatch(/^javascript/i);
  });
  it('leaves plain text with comparison operators untouched', () => {
    expect(sanitizeString('5 < 6 && 7 > 3')).toBe('5 < 6 && 7 > 3');
  });
  it('does not touch credential-like fields', () => {
    expect(sanitizeString('p<a>ss\u0001', 'password')).toBe('p<a>ss\u0001');
  });
});

describe('sanitizeValue', () => {
  it('sanitizes nested objects and arrays and reports paths', () => {
    const report = { modified: [] as string[], suspicious: [] as string[] };
    const out = sanitizeValue({ a: { b: ['<script>x</script>ok'] }, n: 1 }, report) as any;
    expect(out.a.b[0]).toBe('ok');
    expect(out.n).toBe(1);
    expect(report.modified).toEqual(['a.b[0]']);
  });
  it('rejects prototype pollution keys', () => {
    const evil = JSON.parse('{"a":{"__proto__":{"x":1}}}');
    expect(() => sanitizeValue(evil, { modified: [], suspicious: [] })).toThrow(/Forbidden key/);
    expect(() => sanitizeValue({ constructor: 1 }, { modified: [], suspicious: [] })).toThrow();
  });
  it('rejects excessively nested input', () => {
    let v: any = 'x';
    for (let i = 0; i < MAX_DEPTH + 2; i++) v = { a: v };
    expect(() => sanitizeValue(v, { modified: [], suspicious: [] })).toThrow(/nested/);
  });
  it('flags suspicious SQL-like input', () => {
    const report = { modified: [] as string[], suspicious: [] as string[] };
    sanitizeValue({ q: "x' OR 1=1 --", r: 'UNION SELECT password FROM users' }, report);
    expect(report.suspicious).toEqual(['q', 'r']);
  });
});

describe('error formatting', () => {
  it('formats issues with location, field, message and code', () => {
    const r = z.object({ title: z.string().min(5) }).safeParse({ title: 'x' });
    if (r.success) throw new Error('expected failure');
    const details = formatZodIssues('body', r.error.issues);
    expect(details[0]).toMatchObject({ location: 'body', field: 'title', code: 'too_small' });
    const payload = buildValidationError(details);
    expect(payload).toMatchObject({ statusCode: 400, error: 'Validation Error' });
    expect(payload.message).toContain('body.title');
  });
  it('summarises long lists', () => {
    const details = Array.from({ length: 8 }, (_, i) => ({ location: 'query' as const, field: `f${i}`, message: 'bad', code: 'x' }));
    expect(buildValidationError(details).message).toContain('(+3 more)');
  });
});

describe('registry', () => {
  it('normalises paths', () => {
    expect(normalizeRoutePath('/v1/issues/')).toBe('/issues');
    expect(normalizeRoutePath('/issues/:id')).toBe('/issues/:id');
    expect(normalizeRoutePath('/v1')).toBe('/');
  });
  it('resolves entries with or without /v1', () => {
    expect(getRouteSchema('POST', '/v1/issues')?.body).toBeDefined();
    expect(getRouteSchema('post', '/issues/')?.body).toBeDefined();
    expect(getRouteSchema('POST', '/v1/auth/login')?.body).toBeDefined();
    // no route is rate limited unless explicitly configured
    expect(getRouteSchema('POST', '/v1/auth/login')?.rateLimit).toBeUndefined();
  });
});

describe('global validation hook', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();
    resetRouteRateLimits();
    app = await build();
  });

  it('sanitizes bodies before handlers see them', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { note: '<script>alert(1)</script>hello', password: '<b>x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().body).toEqual({ note: 'hello', password: '<b>x' });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'input_sanitized', sanitizedFields: ['body.note'] }), expect.any(String));
  });

  it('sanitizes query strings', async () => {
    const res = await app.inject({ method: 'GET', url: '/echo/abc?q=' + encodeURIComponent('<script>x</script>y') });
    expect(res.json().query).toEqual({ q: 'y' });
  });

  it('applies baseline validation to routes without a schema (incl. prefixed plugins)', async () => {
    const bad = await app.inject({ method: 'GET', url: '/v1/things/' + encodeURIComponent('a b;c') });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ statusCode: 400, error: 'Validation Error' });
    expect(bad.json().details[0]).toMatchObject({ location: 'params', field: 'id' });
    const ok = await app.inject({ method: 'GET', url: '/v1/things/abc-123' });
    expect(ok.statusCode).toBe(200);
  });

  it('rejects non-object JSON bodies on schema-less routes', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo', headers: { 'content-type': 'application/json' }, payload: '"just a string"' });
    expect(res.statusCode).toBe(400);
    expect(res.json().details[0].location).toBe('body');
  });

  it('rejects prototype pollution payloads with 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/echo', headers: { 'content-type': 'application/json' }, payload: '{"a":{"constructor":{"x":1}}}' });
    expect(res.statusCode).toBe(400);
    expect(res.json().details[0].field).toBe('a.constructor');
  });

  it('uses registry schemas for body, params and query with consistent errors', async () => {
    defineRoute('POST', '/things', {
      body: z.object({ title: z.string().min(5) }),
      query: z.object({ page: z.coerce.number().int().positive().optional() }),
    });
    const res = await app.inject({ method: 'POST', url: '/v1/things?page=-1', payload: { title: 'abc' } });
    expect(res.statusCode).toBe(400);
    const fields = res.json().details.map((d: any) => `${d.location}.${d.field}`).sort();
    expect(fields).toEqual(['body.title', 'query.page']);
    const ok = await app.inject({ method: 'POST', url: '/v1/things?page=2', payload: { title: 'long enough' } });
    expect(ok.statusCode).toBe(200);
  });

  it('enforces per-route rate limits with 429 and retry-after', async () => {
    defineRoute('POST', '/limited', { rateLimit: { max: 2, timeWindowMs: 60_000 } });
    const limited = Fastify();
    registerValidation(limited);
    limited.post('/limited', async () => ({ ok: true }));
    await limited.ready();
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await limited.inject({ method: 'POST', url: '/limited', payload: {} })).statusCode);
    expect(codes).toEqual([200, 200, 429]);
    const last = await limited.inject({ method: 'POST', url: '/limited', payload: {} });
    expect(last.headers['retry-after']).toBeDefined();
    expect(last.json().error).toBe('Too Many Requests');
  });

  it('exposes app.validate for explicit per-route schemas', async () => {
    const a = Fastify();
    registerValidation(a);
    a.post('/x', { preValidation: [a.validate({ body: z.object({ n: z.number() }) })] }, async () => ({ ok: true }));
    await a.ready();
    expect((await a.inject({ method: 'POST', url: '/x', payload: { n: 'no' } })).statusCode).toBe(400);
    expect((await a.inject({ method: 'POST', url: '/x', payload: { n: 1 } })).statusCode).toBe(200);
  });

  it('records every route in the coverage report', () => {
    const cov = app.validationCoverage();
    expect(cov.map((c) => `${c.method} ${c.url}`).sort()).toEqual([
      'GET /echo/:id', 'GET /v1/things/:id', 'POST /echo', 'POST /v1/things',
    ]);
  });
});

describe('dedicated schemas for migrated routes', () => {
  it('covers 100% of the issues, requests and auth routes', async () => {
    vi.resetModules();
    const noop = new Proxy({}, { get: () => async () => ({}) });
    vi.doMock('../../../src/services/issues.js', () => ({ issueService: noop }));
    vi.doMock('../../../src/services/requests.js', () => ({ requestService: noop }));
    vi.doMock('../../../src/services/auth.js', () => ({ authService: noop }));
    vi.doMock('../../../src/services/tenant.js', () => ({ tenantService: noop }));
    vi.doMock('../../../src/middleware/auth.js', () => ({
      authenticate: async () => {},
      requirePermission: () => async () => {},
    }));
    const { registerValidation: reg } = await import('../../../src/middleware/validation.js');
    const issueRoutes = (await import('../../../src/routes/issues.js')).default;
    const requestRoutes = (await import('../../../src/routes/requests.js')).default;
    const authRoutes = (await import('../../../src/routes/auth.js')).default;
    const app = Fastify();
    reg(app);
    await app.register(issueRoutes, { prefix: '/v1/issues' });
    await app.register(requestRoutes, { prefix: '/v1/requests' });
    await app.register(authRoutes, { prefix: '/v1/auth' });
    await app.ready();
    const missing = app.validationCoverage().filter((c) => !c.registered).map((c) => `${c.method} ${c.url}`);
    expect(missing).toEqual([]);
    expect(listRegisteredRoutes().length).toBeGreaterThan(40);

    const res = await app.inject({ method: 'POST', url: '/v1/issues', payload: { title: 'abc', priority: 'urgent' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().details.map((d: any) => d.field).sort()).toEqual(['priority', 'title']);
    const bad = await app.inject({ method: 'GET', url: '/v1/issues/not-a-uuid' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details[0]).toMatchObject({ location: 'params', field: 'id' });
    const login = await app.inject({ method: 'POST', url: '/v1/auth/login', payload: { email: 'nope' } });
    expect(login.statusCode).toBe(400);
    expect(UUID).toBeTruthy();
  });
});

describe('validation precedes route-level onRequest auth hooks', () => {
  it('rejects bad params/query with 400 before a 401 from an onRequest hook', async () => {
    const app = Fastify();
    registerValidation(app);
    await app.register(async (sub) => {
      sub.addHook('onRequest', async (_req, reply) => reply.code(401).send({ error: 'Unauthorized' }));
      sub.get('/jobs/:id', async () => ({ ok: true }));
    }, { prefix: '/v1' });
    await app.ready();
    const bad = await app.inject({ method: 'GET', url: '/v1/jobs/' + encodeURIComponent('a b;c') });
    expect(bad.statusCode).toBe(400);
    const anon = await app.inject({ method: 'GET', url: '/v1/jobs/abc' });
    expect(anon.statusCode).toBe(401);
  });
});

describe('sanitizer keeps legitimate text intact', () => {
  it.each([
    'JavaScript error on login',
    'VBScript: macro fails',
    'javascript: the good parts',
    'Jane <jane@example.com>',
    '<abc123@mail.example.com>',
    'a<b && c>d',
    'if (a<b) { return "<div>"; }',
    'Use `x < y` in markdown, **bold** and [link](https://example.com)',
    '<p>safe <strong>html</strong></p>',
  ])('leaves %j unchanged', (text) => {
    expect(sanitizeString(text)).toBe(text);
  });
  it('still neutralises nested and attribute-based payloads', () => {
    expect(sanitizeString('<scr<script>x</script>ipt>alert(1)</script>')).not.toMatch(/<script/i);
    expect(sanitizeString('<a href="  JaVaScRiPt:alert(1)">x</a>')).not.toMatch(/javascript/i);
    expect(sanitizeString('<svg onload=alert(1)>')).not.toMatch(/onload/i);
    expect(sanitizeString('<iframe src="x"></iframe>after')).toBe('after');
  });
});

describe('baseline limits and params', () => {
  it('accepts large arrays (bulk: 50,000 ids) and many keys, rejects beyond the limit', async () => {
    const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
    registerValidation(app);
    app.post('/bulk', async () => ({ ok: true }));
    await app.ready();
    const ids = Array.from({ length: 50_000 }, (_, i) => `id-${i}`);
    expect((await app.inject({ method: 'POST', url: '/bulk', payload: { ids } })).statusCode).toBe(200);
    const items = Array.from({ length: 10_000 }, (_, i) => ({ id: `id-${i}`, changes: { status: 'x' } }));
    expect((await app.inject({ method: 'POST', url: '/bulk', payload: { items } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/bulk', payload: { ids: [...ids, 'one-more'] } })).statusCode).toBe(400);
  });

  it('does not apply the baseline body limits on top of a dedicated body schema', async () => {
    defineRoute('POST', '/big', { body: z.object({ content: z.string() }) });
    const app = Fastify({ bodyLimit: 20 * 1024 * 1024 });
    registerValidation(app);
    app.post('/big', async () => ({ ok: true }));
    app.post('/big-schemaless', async () => ({ ok: true }));
    await app.ready();
    const content = 'x'.repeat(5_000_001);
    expect((await app.inject({ method: 'POST', url: '/big', payload: { content } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/big-schemaless', payload: { content } })).statusCode).toBe(400);
  });

  it('allows free-text params with spaces and non-ASCII, rejects unsafe and slash-bypass values', async () => {
    const app = Fastify();
    registerValidation(app);
    app.get('/cfg/:privilegeType', async (r) => ({ p: r.params }));
    app.get('/items/:id', async () => ({ ok: true }));
    await app.ready();
    const get = (u: string) => app.inject({ method: 'GET', url: u }).then((r) => r.statusCode);
    expect(await get('/cfg/' + encodeURIComponent('Domain Admin'))).toBe(200);
    expect(await get('/cfg/' + encodeURIComponent('Zugriff für Köln'))).toBe(200);
    expect(await get('/cfg/' + encodeURIComponent('a b;c'))).toBe(400);
    expect(await get('/cfg/' + encodeURIComponent('a b;c') + '%2F')).toBe(400);
    expect(await get('/cfg/a%2Fb')).toBe(400);
    expect(await get('/items/' + encodeURIComponent('a b'))).toBe(400);
    expect(await get('/items/abc-123')).toBe(200);
  });
});

describe('authentication precedes dedicated schema details', () => {
  it('answers 401 (not field-level 400) to anonymous callers of a protected route', async () => {
    defineRoute('POST', '/guarded', { body: z.object({ title: z.string().min(5) }) });
    const app = Fastify();
    registerValidation(app);
    app.post('/guarded', { preHandler: [async (_req, reply) => reply.code(401).send({ error: 'Unauthorized' })] }, async () => ({ ok: true }));
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/guarded', payload: { title: 'x' } });
    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('title');
  });
  it('validates the dedicated schema once authentication has passed', async () => {
    defineRoute('POST', '/guarded-ok', { body: z.object({ title: z.string().min(5) }) });
    const app = Fastify();
    registerValidation(app);
    app.post('/guarded-ok', { preHandler: [async () => undefined] }, async () => ({ ok: true }));
    await app.ready();
    expect((await app.inject({ method: 'POST', url: '/guarded-ok', payload: { title: 'x' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/guarded-ok', payload: { title: 'long enough' } })).statusCode).toBe(200);
  });
});
