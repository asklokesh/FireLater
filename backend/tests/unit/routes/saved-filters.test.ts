import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

const mockService = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));
const permissionSpy = vi.hoisted(() => vi.fn());
const currentUser = vi.hoisted(() => ({
  value: { userId: 'u1', tenantSlug: 'acme', roles: ['agent'] } as Record<string, unknown>,
}));

vi.mock('../../../src/services/saved-filters.js', () => ({ savedFilterService: mockService }));
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: (...perms: string[]) => {
    permissionSpy(...perms);
    return async (request: { user: unknown }) => {
      request.user = currentUser.value;
    };
  },
}));

import savedFilterRoutes from '../../../src/routes/saved-filters.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../src/utils/errors.js';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('saved filter routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    Object.values(mockService).forEach((m) => m.mockReset());
    currentUser.value = { userId: 'u1', tenantSlug: 'acme', roles: ['agent'] };
    app = Fastify();
    app.setErrorHandler((error: any, _req, reply) => {
      if (error.name === 'ZodError') return reply.status(400).send({ message: 'validation' });
      return reply.status(error.statusCode ?? 500).send({ message: error.message });
    });
    await app.register(savedFilterRoutes, { prefix: '/v1/search/filters' });
  });

  it('guards with the three read permissions', () => {
    expect(permissionSpy).toHaveBeenCalledWith('issues:read', 'problems:read', 'requests:read');
  });

  it('lists with entity_type filter', async () => {
    mockService.list.mockResolvedValue([{ id: 'a' }]);
    const res = await app.inject({ method: 'GET', url: '/v1/search/filters?entity_type=issues' });
    expect(res.statusCode).toBe(200);
    expect(mockService.list).toHaveBeenCalledWith('acme', 'u1', 'issues');
    expect(res.json()).toEqual([{ id: 'a' }]);
  });

  it('rejects invalid entity_type query', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/search/filters?entity_type=bogus' });
    expect(res.statusCode).toBe(400);
  });

  it('creates and returns 201', async () => {
    mockService.create.mockResolvedValue({ id: 'a' });
    const payload = { name: 'n', entityType: 'problems', definition: { op: 'and' }, isShared: true };
    const res = await app.inject({ method: 'POST', url: '/v1/search/filters', payload });
    expect(res.statusCode).toBe(201);
    expect(mockService.create).toHaveBeenCalledWith('acme', 'u1', payload);
  });

  it('rejects invalid entityType, bad name and non-object definition', async () => {
    for (const payload of [
      { name: 'n', entityType: 'changes', definition: {} },
      { name: '', entityType: 'issues', definition: {} },
      { name: 'x'.repeat(101), entityType: 'issues', definition: {} },
      { name: 'n', entityType: 'issues', definition: [] },
      { name: 'n', entityType: 'issues', definition: 'str' },
    ]) {
      const res = await app.inject({ method: 'POST', url: '/v1/search/filters', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects oversized definition', async () => {
    const payload = { name: 'n', entityType: 'issues', definition: { big: 'x'.repeat(20001) } };
    const res = await app.inject({ method: 'POST', url: '/v1/search/filters', payload });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 on duplicate name', async () => {
    mockService.create.mockRejectedValue(new ConflictError('dup'));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/search/filters',
      payload: { name: 'n', entityType: 'issues', definition: {} },
    });
    expect(res.statusCode).toBe(409);
  });

  it('requires a UUID id', async () => {
    const res = await app.inject({ method: 'PUT', url: '/v1/search/filters/nope', payload: { name: 'x' } });
    expect(res.statusCode).toBe(400);
    const del = await app.inject({ method: 'DELETE', url: '/v1/search/filters/nope' });
    expect(del.statusCode).toBe(400);
  });

  it('updates as owner (non-admin) and passes admin flag', async () => {
    mockService.update.mockResolvedValue({ id: UUID });
    let res = await app.inject({ method: 'PUT', url: `/v1/search/filters/${UUID}`, payload: { name: 'x' } });
    expect(res.statusCode).toBe(200);
    expect(mockService.update).toHaveBeenLastCalledWith('acme', UUID, 'u1', false, { name: 'x' });
    currentUser.value = { userId: 'u2', tenantSlug: 'acme', roles: ['admin'] };
    res = await app.inject({ method: 'PUT', url: `/v1/search/filters/${UUID}`, payload: { isShared: true } });
    expect(mockService.update).toHaveBeenLastCalledWith('acme', UUID, 'u2', true, { isShared: true });
  });

  it('maps 403 and 404 from the service', async () => {
    mockService.update.mockRejectedValue(new ForbiddenError('no'));
    let res = await app.inject({ method: 'PUT', url: `/v1/search/filters/${UUID}`, payload: { name: 'x' } });
    expect(res.statusCode).toBe(403);
    mockService.delete.mockRejectedValue(new NotFoundError('Saved filter', UUID));
    res = await app.inject({ method: 'DELETE', url: `/v1/search/filters/${UUID}` });
    expect(res.statusCode).toBe(404);
  });

  it('deletes with 204', async () => {
    mockService.delete.mockResolvedValue(undefined);
    const res = await app.inject({ method: 'DELETE', url: `/v1/search/filters/${UUID}` });
    expect(res.statusCode).toBe(204);
    expect(mockService.delete).toHaveBeenCalledWith('acme', UUID, 'u1', false);
  });
});
