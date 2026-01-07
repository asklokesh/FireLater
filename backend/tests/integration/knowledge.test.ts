import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, generateTestToken, createAuthHeader } from '../helpers.js';

interface MockArticle {
  id: string;
  title: string;
  content: string;
  summary: string | null;
  type: string;
  status: string;
  visibility: string;
  category_id: string | null;
  author_id: string;
  tags: string[];
  view_count: number;
  created_at: string;
  updated_at: string;
}

interface MockCategory {
  id: string;
  name: string;
  description: string | null;
}

const validTypes = ['how_to', 'faq', 'troubleshooting', 'policy', 'best_practice'];
const validStatuses = ['draft', 'published', 'archived'];
const validVisibilities = ['internal', 'public', 'restricted'];

describe('Knowledge Base Routes', () => {
  let app: FastifyInstance;
  const articles: MockArticle[] = [];
  const categories: MockCategory[] = [
    { id: 'cat-001', name: 'General Support', description: 'General IT support' },
    { id: 'cat-002', name: 'Network', description: 'Networking articles' },
  ];
  let articleIdCounter = 0;

  beforeAll(async () => {
    app = await createTestApp();

    // GET /v1/kb - List articles
    app.get('/v1/kb', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as {
        status?: string;
        type?: string;
        visibility?: string;
        q?: string;
        page?: string;
        per_page?: string;
      };

      let filteredArticles = [...articles];

      if (query.status) {
        filteredArticles = filteredArticles.filter(a => a.status === query.status);
      }
      if (query.type) {
        filteredArticles = filteredArticles.filter(a => a.type === query.type);
      }
      if (query.visibility) {
        filteredArticles = filteredArticles.filter(a => a.visibility === query.visibility);
      }
      if (query.q) {
        const q = query.q.toLowerCase();
        filteredArticles = filteredArticles.filter(a =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q)
        );
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');
      const start = (page - 1) * perPage;
      const end = start + perPage;

      return {
        data: filteredArticles.slice(start, end),
        meta: {
          page,
          per_page: perPage,
          total: filteredArticles.length,
          total_pages: Math.ceil(filteredArticles.length / perPage),
        },
      };
    });

    // GET /v1/kb/search - Search articles
    app.get('/v1/kb/search', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const query = request.query as { q?: string; status?: string; page?: string; per_page?: string };
      let filteredArticles = [...articles];

      if (query.q) {
        const q = query.q.toLowerCase();
        filteredArticles = filteredArticles.filter(a =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q) ||
          a.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      if (query.status) {
        filteredArticles = filteredArticles.filter(a => a.status === query.status);
      }

      const page = parseInt(query.page || '1');
      const perPage = parseInt(query.per_page || '20');

      return {
        data: filteredArticles,
        meta: {
          page,
          per_page: perPage,
          total: filteredArticles.length,
          total_pages: Math.ceil(filteredArticles.length / perPage),
        },
      };
    });

    // GET /v1/kb/categories - List categories
    app.get('/v1/kb/categories', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      return { categories };
    });

    // GET /v1/kb/:articleId - Get article by ID
    app.get('/v1/kb/:articleId', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { articleId } = request.params as { articleId: string };
      const article = articles.find(a => a.id === articleId);

      if (!article) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Article with id '${articleId}' not found`,
        });
      }

      return article;
    });

    // POST /v1/kb - Create article
    app.post('/v1/kb', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const body = request.body as {
        title?: string;
        content?: string;
        summary?: string;
        type?: string;
        status?: string;
        visibility?: string;
        tags?: string[];
      };

      if (!body.title || body.title.length < 5) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Title must be at least 5 characters',
        });
      }

      if (!body.content) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Content is required',
        });
      }

      if (body.type && !validTypes.includes(body.type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid type value',
        });
      }

      if (body.status && !validStatuses.includes(body.status)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid status value',
        });
      }

      if (body.visibility && !validVisibilities.includes(body.visibility)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid visibility value',
        });
      }

      const newArticle: MockArticle = {
        id: `art-${++articleIdCounter}`,
        title: body.title,
        content: body.content,
        summary: body.summary || null,
        type: body.type || 'how_to',
        status: body.status || 'draft',
        visibility: body.visibility || 'internal',
        category_id: null,
        author_id: 'test-user-id',
        tags: body.tags || [],
        view_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      articles.push(newArticle);
      reply.status(201).send(newArticle);
    });

    // PUT /v1/kb/:articleId - Update article
    app.put('/v1/kb/:articleId', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { articleId } = request.params as { articleId: string };
      const articleIndex = articles.findIndex(a => a.id === articleId);

      if (articleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Article with id '${articleId}' not found`,
        });
      }

      const body = request.body as Partial<MockArticle>;

      if (body.type && !validTypes.includes(body.type)) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid type value',
        });
      }

      articles[articleIndex] = {
        ...articles[articleIndex],
        ...body,
        updated_at: new Date().toISOString(),
      };

      return articles[articleIndex];
    });

    // DELETE /v1/kb/:articleId - Delete article
    app.delete('/v1/kb/:articleId', async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' });
      }

      const { articleId } = request.params as { articleId: string };
      const articleIndex = articles.findIndex(a => a.id === articleId);

      if (articleIndex === -1) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Article with id '${articleId}' not found`,
        });
      }

      articles.splice(articleIndex, 1);
      reply.status(204).send();
    });

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /v1/kb', () => {
    it('should return empty list initially', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });

    it('should return 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /v1/kb', () => {
    it('should create an article', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        headers: createAuthHeader(token),
        payload: {
          title: 'How to Reset Your Password',
          content: 'Step 1: Click on Forgot Password...',
          summary: 'Password reset guide',
          type: 'how_to',
          status: 'draft',
          tags: ['password', 'security'],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('How to Reset Your Password');
      expect(body.type).toBe('how_to');
    });

    it('should return 400 for title too short', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        headers: createAuthHeader(token),
        payload: {
          title: 'Hi',
          content: 'Content here',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for missing content', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        headers: createAuthHeader(token),
        payload: {
          title: 'Valid Title Here',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        headers: createAuthHeader(token),
        payload: {
          title: 'Valid Title Here',
          content: 'Content here',
          type: 'invalid-type',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        headers: createAuthHeader(token),
        payload: {
          title: 'Valid Title Here',
          content: 'Content here',
          status: 'invalid-status',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid visibility', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'POST',
        url: '/v1/kb',
        headers: createAuthHeader(token),
        payload: {
          title: 'Valid Title Here',
          content: 'Content here',
          visibility: 'invalid',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/kb/:articleId', () => {
    it('should get an article by id', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb/art-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('art-1');
    });

    it('should return 404 for non-existent article', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /v1/kb/search', () => {
    beforeAll(async () => {
      const token = generateTestToken(app);
      // Add more articles for search
      for (const articleData of [
        { title: 'VPN Connection Guide', content: 'How to connect to VPN', type: 'how_to', tags: ['vpn', 'network'] },
        { title: 'Email Setup FAQ', content: 'Common email questions', type: 'faq', tags: ['email'] },
      ]) {
        await app.inject({
          method: 'POST',
          url: '/v1/kb',
          headers: createAuthHeader(token),
          payload: articleData,
        });
      }
    });

    it('should search articles', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb/search?q=VPN',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it('should search with status filter', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb/search?q=Guide&status=draft',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
    });
  });

  describe('PUT /v1/kb/:articleId', () => {
    it('should update an article', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/kb/art-1',
        headers: createAuthHeader(token),
        payload: {
          title: 'Updated Password Guide',
          status: 'published',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Updated Password Guide');
      expect(body.status).toBe('published');
    });

    it('should return 404 for non-existent article', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/kb/non-existent',
        headers: createAuthHeader(token),
        payload: { title: 'Test' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for invalid type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'PUT',
        url: '/v1/kb/art-1',
        headers: createAuthHeader(token),
        payload: { type: 'invalid-type' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/kb/categories', () => {
    it('should list categories', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb/categories',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.categories).toBeDefined();
      expect(Array.isArray(body.categories)).toBe(true);
    });
  });

  describe('DELETE /v1/kb/:articleId', () => {
    it('should delete an article', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/kb/art-1',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 404 when deleting non-existent article', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/kb/non-existent',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Filtering', () => {
    it('should filter by status', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb?status=draft',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((a: MockArticle) => a.status === 'draft')).toBe(true);
    });

    it('should filter by type', async () => {
      const token = generateTestToken(app);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/kb?type=how_to',
        headers: createAuthHeader(token),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.every((a: MockArticle) => a.type === 'how_to')).toBe(true);
    });
  });
});
