import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { knowledgeService } from '../services/knowledge.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const createArticleSchema = z.object({
  title: z.string().min(5).max(500),
  content: z.string().min(1),
  summary: z.string().max(1000).optional(),
  type: z.enum(['how_to', 'faq', 'troubleshooting', 'policy', 'best_practice']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['internal', 'public', 'restricted']).optional(),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  relatedProblemId: z.string().uuid().optional(),
  relatedIssueId: z.string().uuid().optional(),
});

const updateArticleSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  content: z.string().min(1).optional(),
  summary: z.string().max(1000).optional(),
  type: z.enum(['how_to', 'faq', 'troubleshooting', 'policy', 'best_practice']).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  visibility: z.enum(['internal', 'public', 'restricted']).optional(),
  categoryId: z.string().uuid().optional(),
  reviewerId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

export default async function knowledgeRoutes(app: FastifyInstance) {
  // List articles
  app.get('/', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      category: query.category,
      status: query.status,
      type: query.type,
      visibility: query.visibility,
      q: query.q,
    };

    const result = await knowledgeService.listArticles(
      tenantSlug,
      filters,
      pagination
    );

    return createPaginatedResponse(result.articles, result.total, pagination);
  });

  // Search articles
  app.get('/search', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      q: query.q,
      category: query.category,
      status: query.status,
      type: query.type,
      visibility: query.visibility,
    };

    const result = await knowledgeService.searchArticles(tenantSlug, filters);

    return createPaginatedResponse(result.articles, result.total, pagination);
  });

  // Get single article
  app.get('/:articleId', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const { articleId } = request.params as { articleId: string };

    const article = await knowledgeService.getArticleById(tenantSlug, articleId);

    // Increment view count asynchronously
    knowledgeService.incrementViewCount(tenantSlug, articleId).catch(() => {});

    return article;
  });

  // Create article
  app.post('/', {
    preHandler: [requirePermission('kb:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const validatedBody = createArticleSchema.parse(request.body);

    const article = await knowledgeService.createArticle(tenantSlug, {
      ...validatedBody,
      authorId: userId,
    });

    reply.status(201);
    return article;
  });

  // Update article
  app.put('/:articleId', {
    preHandler: [requirePermission('kb:update')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const { articleId } = request.params as { articleId: string };
    const validatedBody = updateArticleSchema.parse(request.body);

    const article = await knowledgeService.updateArticle(
      tenantSlug,
      articleId,
      validatedBody
    );

    return article;
  });

  // Delete article
  app.delete('/:articleId', {
    preHandler: [requirePermission('kb:delete')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { articleId } = request.params as { articleId: string };

    await knowledgeService.deleteArticle(tenantSlug, articleId);

    reply.status(204);
    return;
  });

  // List categories
  app.get('/categories', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;

    const categories = await knowledgeService.listCategories(tenantSlug);

    return { categories };
  });
}
