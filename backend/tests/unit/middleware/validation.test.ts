import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import rateLimit from '@fastify/rate-limit';

vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn(() => async (request: { user: unknown }) => {
    request.user = { userId: 'u1', tenantSlug: 'acme', tenantId: 't', email: 'u@acme.test', roles: ['admin'] };
  }),
  authenticate: vi.fn(async (request: { user: unknown }) => {
    request.user = { userId: 'u1', tenantSlug: 'acme', tenantId: 't', email: 'u@acme.test', roles: ['admin'] };
  }),
}));
vi.mock('../../../src/services/users.js', () => ({
  userService: { create: vi.fn(async (_t: string, body: unknown) => ({ id: 'new', ...(body as object) })), list: vi.fn(), findById: vi.fn() },
}));
vi.mock('../../../src/services/issues.js', () => ({ issueService: {} }));
vi.mock('../../../src/services/requests.js', () => ({ requestService: {} }));
vi.mock('../../../src/services/auth.js', () => ({ authService: {} }));
vi.mock('../../../src/services/tenant.js', () => ({ tenantService: {} }));

import { setupValidation, getValidationCoverage, resetValidationCoverage, validate, deriveParamsSchema } from '../../../src/middleware/validation.js';
import { schemaRegistry, normalizeRoutePath, registryKey } from '../../../src/schemas/index.js';
import { sanitizeInput, sanitizeString, newReport, MAX_DEPTH } from '../../../src/utils/inputSanitizer.js';
import { buildValidationErrorResponse, formatZodIssues } from '../../../src/utils/validationErrors.js';
import userRoutes from '../../../src/routes/users.js';
import issueRoutes from '../../../src/routes/issues.js';
import requestRoutes from '../../../src/routes/requests.js';
import authRoutes from '../../../src/routes/auth.js';
import { userService } from '../../../src/services/users.js';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

async function build(register: (app: FastifyInstance) => Promise<void> | void, registry?: Record<string, never>) {
  const app = Fastify({ logger: false });
  setupValidation(app, registry ? { registry } : {});
  await register(app);
  await app.ready();
  return app;
}

describe('sanitizeString / sanitizeInput', () => {
  it('strips script tags together with their contents', () => {
    expect(sanitizeString('hi<script>alert(1)</script>there', 'title')).toBe('hithere');
  });

  it('strips event-handler markup', () => {
    expect(sanitizeString('<img src=x onerror=alert(1)>pic', 'title')).toBe('pic');
  });

  it('removes javascript: and data:text/html schemes', () => {
    expect(sanitizeString('javascript:alert(1)', 'url')).not.toMatch(/javascript:/i);
    expect(sanitizeString('data:text/html,<b>x', 'url')).not.toMatch(/data:text\/html/i);
  });

  it('removes NUL bytes and control characters but keeps newlines and tabs', () => {
    expect(sanitizeString('a\u0000b\u0007c\nd\te', 'x')).toBe('abc\nd\te');
  });

  it('keeps plain ampersands readable and does not touch ordinary text', () => {
    expect(sanitizeString('Tom & Jerry 1 + 1', 'title')).toBe('Tom & Jerry 1 + 1');
  });

  it('leaves passwords and tokens untouched apart from control characters', () => {
    expect(sanitizeString('p<a>ss&word', 'password')).toBe('p<a>ss&word');
    expect(sanitizeString('a<b>c', 'refreshToken')).toBe('a<b>c');
  });

  it('applies the allow-list HTML sanitizer to rich-text keys', () => {
    const out = sanitizeString('<p>ok</p><script>x()</script>', 'content');
    expect(out).toContain('<p>ok</p>');
    expect(out).not.toContain('script');
  });

  it('drops __proto__ keys and recurses through arrays/objects, reporting changes', () => {
    const report = newReport();
    const input = JSON.parse('{"a":{"__proto__":{"polluted":true},"t":"<b>x</b>"},"list":["<i>y</i>"]}');
    const out = sanitizeInput(input, report) as { a: Record<string, unknown>; list: string[] };
    expect(Object.keys(out.a)).toEqual(['t']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(out.a.t).toBe('x');
    expect(out.list).toEqual(['y']);
    expect(report.changes).toBe(3);
    expect(report.paths).toContain('a.t');
  });

  it('does not mutate its input and passes non-strings through', () => {
    const input = { n: 1, b: true, nul: null, s: '<b>x</b>' };
    const out = sanitizeInput(input);
    expect(input.s).toBe('<b>x</b>');
    expect(out).toEqual({ n: 1, b: true, nul: null, s: 'x' });
  });

  it('rejects absurdly deep nesting', () => {
    let deep: unknown = 'x';
    for (let i = 0; i < MAX_DEPTH + 2; i++) deep = { a: deep };
    expect(() => sanitizeInput(deep)).toThrow(/nesting/);
  });
});

describe('validation error formatting', () => {
  it('produces field-level issues with location', () => {
    const r = z.object({ email: z.string().email(), roleIds: z.array(z.string().uuid()) }).safeParse({ email: 'nope', roleIds: ['x'] });
    if (r.success) throw new Error('should fail');
    const issues = formatZodIssues(r.error, 'body');
    expect(issues.map((i) => i.field)).toEqual(['email', 'roleIds.0']);
    const res = buildValidationErrorResponse(issues);
    expect(res.statusCode).toBe(400);
    expect(res.error).toBe('Validation Error');
    expect(res.message).toContain('body.email');
    expect(res.details).toHaveLength(2);
  });
});

describe('schema registry helpers', () => {
  it('normalises urls to registry keys', () => {
    expect(normalizeRoutePath('/v1/users/')).toBe('/users');
    expect(normalizeRoutePath('/v1/users/:id')).toBe('/users/:id');
    expect(normalizeRoutePath('/auth/login')).toBe('/auth/login');
    expect(registryKey('post', '/v1/auth/login')).toBe('POST /auth/login');
  });
});

describe('validation middleware (ad hoc routes)', () => {
  let app: FastifyInstance;
  beforeEach(() => resetValidationCoverage());

  it('validates, sanitizes and replaces body, and rejects invalid input with a consistent 400', async () => {
    const schema = z.object({ title: z.string().min(3), count: z.number().default(1) });
    app = await build((a) => {
      a.post('/echo', { preHandler: [a.validate({ body: schema })] }, async (req) => req.body);
    });

    const ok = await app.inject({ method: 'POST', url: '/echo', payload: { title: '<script>alert(1)</script>Hello' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ title: 'Hello', count: 1 });

    const bad = await app.inject({ method: 'POST', url: '/echo', payload: { title: 'x' } });
    expect(bad.statusCode).toBe(400);
    const json = bad.json();
    expect(json.error).toBe('Validation Error');
    expect(json.details[0]).toMatchObject({ location: 'body', field: 'title' });
    await app.close();
  });

  it('exposes validate() directly with params and query schemas', async () => {
    app = await build((a) => {
      a.get('/things/:id', { preHandler: [validate({ params: z.object({ id: z.string().uuid() }), query: z.object({ n: z.coerce.number().int() }) })] }, async (req) => ({ ok: true, params: req.params }));
    });
    expect((await app.inject({ url: `/things/${UUID}?n=2` })).statusCode).toBe(200);
    const bad = await app.inject({ url: '/things/abc?n=x' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details.map((d: { location: string }) => d.location).sort()).toEqual(['params', 'query']);
    await app.close();
  });

  it('rejects an oversized/over-nested body with 400', async () => {
    app = await build((a) => {
      a.post('/any', async () => ({ ok: true }));
    });
    let deep: unknown = 'x';
    for (let i = 0; i < MAX_DEPTH + 2; i++) deep = { a: deep };
    const res = await app.inject({ method: 'POST', url: '/any', payload: deep as object });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('baseline validation covers routes without a registry entry', () => {
  it('sanitizes bodies and queries and enforces numeric paging', async () => {
    resetValidationCoverage();
    const app = await build((a) => {
      a.post('/unregistered/:thing', async (req) => ({ body: req.body, query: req.query }));
    });
    const res = await app.inject({ method: 'POST', url: '/unregistered/abc?page=2', payload: { name: '<b onclick=x()>hi</b>\u0000' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().body).toEqual({ name: 'hi' });

    const bad = await app.inject({ method: 'POST', url: '/unregistered/abc?page=-1', payload: {} });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details[0]).toMatchObject({ location: 'query', field: 'page' });

    const traversal = await app.inject({ method: 'POST', url: '/unregistered/a..b', payload: {} });
    expect(traversal.statusCode).toBe(400);
    expect(getValidationCoverage().find((c) => c.key === 'POST /unregistered/:thing')?.source).toBe('baseline');
    await app.close();
  });
});

describe('migrated routes (real route modules, registry schemas)', () => {
  let app: FastifyInstance;

  async function buildReal() {
    resetValidationCoverage();
    return build(async (a) => {
      await a.register(authRoutes, { prefix: '/v1/auth' });
      await a.register(userRoutes, { prefix: '/v1/users' });
      await a.register(issueRoutes, { prefix: '/v1/issues' });
      await a.register(requestRoutes, { prefix: '/v1/requests' });
    });
  }

  it('every route of the migrated modules is covered by a registry schema, and every registry entry maps to a real route', async () => {
    app = await buildReal();
    const cov = getValidationCoverage();
    const baseline = cov.filter((c) => c.source === 'baseline').map((c) => c.key);
    // Allowed baseline-only routes: bodyless, parameterless endpoints.
    const allowedBaseline = new Set([
      'GET /users', 'GET /issues/categories', 'GET /requests/my', 'GET /requests/assigned', 'GET /requests/pending-approvals',
      'POST /auth/logout', 'GET /auth/me', 'GET /auth/profile',
    ]);
    expect(baseline.filter((k) => !allowedBaseline.has(k))).toEqual([]);

    const seen = new Set(cov.map((c) => c.key));
    const migratedPrefixes = ['/auth', '/users', '/issues', '/requests'];
    const orphaned = Object.keys(schemaRegistry).filter((k) => migratedPrefixes.some((p) => k.split(' ')[1].startsWith(p)) && !seen.has(k));
    expect(orphaned).toEqual([]);
    await app.close();
  });

  it('rejects an invalid user id (params) and invalid create body with field details', async () => {
    app = await buildReal();
    const badId = await app.inject({ method: 'GET', url: '/v1/users/not-a-uuid' });
    expect(badId.statusCode).toBe(400);
    expect(badId.json().details[0]).toMatchObject({ location: 'params', field: 'id' });

    const badBody = await app.inject({ method: 'POST', url: '/v1/users', payload: { email: 'bad', name: 'x' } });
    expect(badBody.statusCode).toBe(400);
    expect(badBody.json().details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'name']);
    await app.close();
  });

  it('passes sanitized, parsed data to the handler/service', async () => {
    app = await buildReal();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/users',
      payload: { email: 'a@b.co', name: '<script>alert(1)</script>Alice', password: 'p<a>ssw0rd!' },
    });
    expect(res.statusCode).toBe(201);
    const [, body] = (userService.create as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)!;
    expect(body).toMatchObject({ name: 'Alice', password: 'p<a>ssw0rd!' });
    await app.close();
  });

  it('chooses the register body schema from the x-tenant-slug header', async () => {
    app = await buildReal();
    const tenant = await app.inject({ method: 'POST', url: '/v1/auth/register', payload: { email: 'a@b.co', password: 'longenough', name: 'Al' } });
    expect(tenant.statusCode).toBe(400); // tenant registration body expected
    expect(tenant.json().details.map((d: { field: string }) => d.field)).toContain('tenantName');
    await app.close();
  });

  it('validates issue and request payloads', async () => {
    app = await buildReal();
    const issue = await app.inject({ method: 'POST', url: '/v1/issues', payload: { title: 'abc', priority: 'urgent' } });
    expect(issue.statusCode).toBe(400);
    expect(issue.json().details.map((d: { field: string }) => d.field).sort()).toEqual(['priority', 'title']);

    const list = await app.inject({ method: 'GET', url: '/v1/requests?status=bogus' });
    expect(list.statusCode).toBe(400);
    expect(list.json().details[0]).toMatchObject({ location: 'query', field: 'status' });
    await app.close();
  });
});

describe('per-route rate limiting from the registry', () => {
  it('returns 429 after the configured max and counts per route', async () => {
    resetValidationCoverage();
    const app = Fastify({ logger: false });
    await app.register(rateLimit, { global: false });
    setupValidation(app, { registry: { 'POST /limited': { rateLimit: { max: 2, timeWindow: 60000 } } } as never });
    app.post('/limited', async () => ({ ok: true }));
    app.post('/free', async () => ({ ok: true }));
    await app.ready();

    expect((await app.inject({ method: 'POST', url: '/limited', payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/limited', payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/limited', payload: {} })).statusCode).toBe(429);
    for (let i = 0; i < 4; i++) expect((await app.inject({ method: 'POST', url: '/free', payload: {} })).statusCode).toBe(200);
    await app.close();
  });
});

describe('derived param validation for routes without an explicit schema', () => {
  it('requires UUIDs for :id and :xxxId, but not for other params or jobId', () => {
    const schema = deriveParamsSchema('/v1/things/:id/items/:itemId/:slug');
    expect(schema.safeParse({ id: UUID, itemId: UUID, slug: 'abc' }).success).toBe(true);
    expect(schema.safeParse({ id: 'nope', itemId: UUID, slug: 'abc' }).success).toBe(false);
    expect(schema.safeParse({ id: UUID, itemId: 'x', slug: 'abc' }).success).toBe(false);
    expect(deriveParamsSchema('/v1/jobs/:queueName/:jobId').safeParse({ queueName: 'q', jobId: '42' }).success).toBe(true);
  });

  it('is enforced end to end on an unregistered route', async () => {
    const app = await build((a) => {
      a.get('/widgets/:id', async () => ({ ok: true }));
    });
    expect((await app.inject({ url: `/widgets/${UUID}` })).statusCode).toBe(200);
    const bad = await app.inject({ url: '/widgets/1%20OR%201=1' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details[0]).toMatchObject({ location: 'params', field: 'id' });
    await app.close();
  });
});

describe('common attack vectors', () => {
  const cases: Array<[string, string]> = [
    ['<svg onload=alert(1)>t</svg>', 't'],
    ['<iframe src="javascript:alert(1)"></iframe>safe', 'safe'],
    ['<a href="javascript:alert(1)">click</a>', 'click'],
    ['<style>body{display:none}</style>visible', 'visible'],
    ['<scr<script>ipt>alert(1)</scr</script>ipt>', ''],
    ['x\u0000y', 'xy'],
  ];
  it.each(cases)('neutralises %j', (input, expected) => {
    const out = sanitizeString(input, 'title');
    expect(out).not.toMatch(/<\s*(script|svg|iframe|style)/i);
    expect(out).not.toMatch(/javascript:/i);
    if (expected) expect(out).toBe(expected);
  });

  it('leaves SQL-looking text intact (injection is prevented by parameterised queries, not rewriting)', () => {
    expect(sanitizeString("Robert'); DROP TABLE users;--", 'name')).toBe("Robert'); DROP TABLE users;--");
  });

  it('sanitizes a registered body end to end (issue description)', async () => {
    const app = await build((a) => {
      a.post('/v1/issues', { preHandler: [] }, async (req) => req.body);
    }, {
      'POST /issues': { body: z.object({ title: z.string().min(5), description: z.string().optional() }) },
    } as never);
    const res = await app.inject({ method: 'POST', url: '/v1/issues', payload: { title: 'abcde<script>x()</script>', description: '<img src=x onerror=alert(1)>hello' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ title: 'abcde', description: 'hello' });
    await app.close();
  });
});

describe('registry breadth', () => {
  it('registers strict schemas for the main route modules', () => {
    const keys = Object.keys(schemaRegistry);
    expect(keys.length).toBeGreaterThan(200);
    for (const prefix of ['/users', '/issues', '/requests', '/auth', '/changes', '/problems', '/oncall', '/catalog', '/cloud', '/groups', '/roles', '/applications', '/assets', '/notifications']) {
      expect(keys.some((k) => k.split(' ')[1].startsWith(prefix))).toBe(true);
    }
  });

  it('only uses well-formed keys', () => {
    for (const k of Object.keys(schemaRegistry)) expect(k).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/[^\s]*$/);
  });
});
