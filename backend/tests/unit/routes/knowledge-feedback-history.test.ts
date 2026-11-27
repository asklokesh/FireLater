import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const m = vi.hoisted(() => ({
  submitFeedback: vi.fn(),
  getArticleHistory: vi.fn(),
  updateArticle: vi.fn(),
  createArticle: vi.fn(),
  poolConnect: vi.fn(),
  poolQuery: vi.fn(),
}));

// Auth: the signed-in user comes from the "token"; permissions from the x-perms header
vi.mock('../../../src/middleware/auth.js', async () => {
  const { ForbiddenError } = await import('../../../src/utils/errors.js');
  return {
    requirePermission: (...required: string[]) => async (request: FastifyRequest) => {
      (request as unknown as { user: unknown }).user = {
        userId: 'user-from-token', email: 'u@acme.test', tenantSlug: 'acme', roles: [],
      };
      const granted = String(request.headers['x-perms'] ?? '').split(',');
      if (!required.some((p) => granted.includes(p))) throw new ForbiddenError('no permission');
    },
  };
});
vi.mock('../../../src/services/knowledge.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/knowledge.js')>();
  const real = actual.knowledgeService;
  return {
    ...actual,
    knowledgeService: {
      ...real,
      submitFeedback: m.submitFeedback,
      getArticleHistory: m.getArticleHistory,
      updateArticle: m.updateArticle,
      createArticle: m.createArticle,
      realSubmitFeedback: real.submitFeedback.bind(real),
      realGetArticleHistory: real.getArticleHistory.bind(real),
    },
  };
});
vi.mock('../../../src/config/database.js', () => ({
  pool: { query: m.poolQuery, connect: m.poolConnect },
}));
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import knowledgeRoutes from '../../../src/routes/knowledge.js';
import errorHandlerPlugin from '../../../src/plugins/errorHandler.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';
import { knowledgeService } from '../../../src/services/knowledge.js';

const ART = '3f2b8f1e-5c1a-4d63-9a77-0d9f1c1b2a10';
const READ = { 'x-perms': 'kb:read' };

describe('knowledge feedback and history routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(errorHandlerPlugin);
    await app.register(knowledgeRoutes, { prefix: '/v1/kb' });
    await app.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    m.submitFeedback.mockReset();
    m.getArticleHistory.mockReset();
  });

  describe('POST /v1/kb/:articleId/feedback', () => {
    it('stores the vote for the user in the token and returns 201', async () => {
      m.submitFeedback.mockResolvedValue({ id: 'f1', is_helpful: true, helpful_count: 1, not_helpful_count: 0 });

      const res = await app.inject({
        method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: READ,
        payload: { isHelpful: true, comment: 'Clear steps' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ id: 'f1', helpful_count: 1 });
      expect(m.submitFeedback).toHaveBeenCalledWith('acme', ART, 'user-from-token', true, 'Clear steps');
    });

    it('ignores a userId in the body and treats the comment as optional', async () => {
      m.submitFeedback.mockResolvedValue({ id: 'f1' });

      const res = await app.inject({
        method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: READ,
        payload: { isHelpful: false, userId: 'someone-else' },
      });

      expect(res.statusCode).toBe(201);
      expect(m.submitFeedback).toHaveBeenCalledWith('acme', ART, 'user-from-token', false, undefined);
    });

    it('accepts a null comment', async () => {
      m.submitFeedback.mockResolvedValue({ id: 'f1' });
      const res = await app.inject({
        method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: READ,
        payload: { isHelpful: true, comment: null },
      });
      expect(res.statusCode).toBe(201);
      expect(m.submitFeedback).toHaveBeenCalledWith('acme', ART, 'user-from-token', true, undefined);
    });

    it.each([
      [{}],
      [{ isHelpful: 'yes' }],
      [{ isHelpful: true, comment: 'x'.repeat(2001) }],
    ])('rejects the invalid body %j with 400', async (payload) => {
      const res = await app.inject({ method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: READ, payload });
      expect(res.statusCode).toBe(400);
      expect(m.submitFeedback).not.toHaveBeenCalled();
    });

    it('maps a missing article to 404 and an unpublished article to 400', async () => {
      m.submitFeedback.mockRejectedValueOnce(new NotFoundError('Article', ART));
      const missing = await app.inject({ method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: READ, payload: { isHelpful: true } });
      expect(missing.statusCode).toBe(404);

      m.submitFeedback.mockRejectedValueOnce(new BadRequestError('Feedback can only be submitted on published articles'));
      const draft = await app.inject({ method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: READ, payload: { isHelpful: true } });
      expect(draft.statusCode).toBe(400);
    });

    it.each(['abc', 'KB000001'])('returns 404, not 500, for the non-UUID id %s', async (id) => {
      m.submitFeedback.mockImplementation((knowledgeService as any).realSubmitFeedback);
      const res = await app.inject({ method: 'POST', url: `/v1/kb/${id}/feedback`, headers: READ, payload: { isHelpful: true } });
      expect(res.statusCode).toBe(404);
      expect(m.poolConnect).not.toHaveBeenCalled();
    });

    it('requires kb:read', async () => {
      const denied = await app.inject({ method: 'POST', url: `/v1/kb/${ART}/feedback`, headers: { 'x-perms': 'kb:delete' }, payload: { isHelpful: true } });
      expect(denied.statusCode).toBe(403);
      expect(m.submitFeedback).not.toHaveBeenCalled();
    });
  });

  describe('GET /v1/kb/:articleId/history', () => {
    it('returns the service entries in order (newest first)', async () => {
      m.getArticleHistory.mockResolvedValue([{ version: 2 }, { version: 1 }]);

      const res = await app.inject({ method: 'GET', url: `/v1/kb/${ART}/history`, headers: READ });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([{ version: 2 }, { version: 1 }]);
      expect(m.getArticleHistory).toHaveBeenCalledWith('acme', ART);
    });

    it('maps a missing article to 404', async () => {
      m.getArticleHistory.mockRejectedValueOnce(new NotFoundError('Article', ART));
      expect((await app.inject({ method: 'GET', url: `/v1/kb/${ART}/history`, headers: READ })).statusCode).toBe(404);
    });

    it.each(['abc', 'KB000001'])('returns 404, not 500, for the non-UUID id %s', async (id) => {
      m.getArticleHistory.mockImplementation((knowledgeService as any).realGetArticleHistory);
      const res = await app.inject({ method: 'GET', url: `/v1/kb/${id}/history`, headers: READ });
      expect(res.statusCode).toBe(404);
      expect(m.poolQuery).not.toHaveBeenCalled();
    });

    it('requires kb:read', async () => {
      const denied = await app.inject({ method: 'GET', url: `/v1/kb/${ART}/history`, headers: { 'x-perms': 'kb:delete' } });
      expect(denied.statusCode).toBe(403);
      expect(m.getArticleHistory).not.toHaveBeenCalled();
    });
  });

  describe('article writes feed the history', () => {
    it('PUT passes the signed-in user as updatedBy', async () => {
      m.updateArticle.mockResolvedValue({ id: ART, version: 2 });
      const res = await app.inject({
        method: 'PUT', url: `/v1/kb/${ART}`, headers: { 'x-perms': 'kb:update' }, payload: { title: 'A new title' },
      });
      expect(res.statusCode).toBe(200);
      expect(m.updateArticle).toHaveBeenCalledWith('acme', ART, { title: 'A new title', updatedBy: 'user-from-token' });
    });

    it('POST passes the signed-in user as authorId', async () => {
      m.createArticle.mockResolvedValue({ id: ART, version: 1 });
      const res = await app.inject({
        method: 'POST', url: '/v1/kb', headers: { 'x-perms': 'kb:create' }, payload: { title: 'A new title', content: 'Body' },
      });
      expect(res.statusCode).toBe(201);
      expect(m.createArticle).toHaveBeenCalledWith('acme', expect.objectContaining({ authorId: 'user-from-token' }));
    });
  });
});
