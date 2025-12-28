import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { knowledgeService } from '../services/knowledge.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const createArticleSchema = z.object({
  title: z.string().min(5).max(500),
  content: z.string().min(10),
  summary: z.string().max(1000).optional(),
  type: z.enum(['how_to', 'troubleshooting', 'faq', 'reference', 'policy', 'known_error']).optional(),
  visibility: z.enum(['public', 'internal', 'restricted']).optional(),
  categoryId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  relatedProblemId: z.string().uuid().optional(),
  relatedIssueId: z.string().uuid().optional(),
});

const updateArticleSchema = z.object({
  title: z.string().min(5).max(500).optional(),
  content: z.string().min(10).optional(),
  summary: z.string().max(1000).optional(),
  type: z.enum(['how_to', 'troubleshooting', 'faq', 'reference', 'policy', 'known_error']).optional(),
  visibility: z.enum(['public', 'internal', 'restricted']).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
});

const feedbackSchema = z.object({
  isHelpful: z.boolean(),
  comment: z.string().max(1000).optional(),
});

const createCategorySchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().optional(),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().max(500).optional(),
  parentId: z.string().uuid().nullable().optional(),
  icon: z.string().max(100).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const linkSchema = z.object({
  problemId: z.string().uuid().optional(),
  issueId: z.string().uuid().optional(),
});

export default async function knowledgeRoutes(app: FastifyInstance) {
  // ================================
  // ARTICLE ROUTES
  // ================================

  // List articles
  app.get('/', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status as 'draft' | 'review' | 'published' | 'archived' | undefined,
      type: query.type as 'how_to' | 'troubleshooting' | 'faq' | 'reference' | 'policy' | 'known_error' | undefined,
      visibility: query.visibility as 'public' | 'internal' | 'restricted' | undefined,
      categoryId: query.category_id,
      authorId: query.author_id,
      search: query.search || query.q,
      tag: query.tag,
      publishedOnly: query.published_only === 'true',
    };

    const { articles, total } = await knowledgeService.listArticles(tenantSlug, pagination, filters);
    reply.send(createPaginatedResponse(articles, total, pagination));
  });

  // Search articles (public endpoint for published articles)
  app.get('/search', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);
    const searchQuery = query.q || query.query || '';

    if (!searchQuery) {
      return reply.status(400).send({ error: 'Search query is required' });
    }

    const { articles, total } = await knowledgeService.searchArticles(tenantSlug, searchQuery, pagination);
    reply.send(createPaginatedResponse(articles, total, pagination));
  });

  // Get article by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const article = await knowledgeService.getArticleById(tenantSlug, request.params.id);

    // Increment view count (async, don't wait)
    knowledgeService.incrementViewCount(tenantSlug, request.params.id).catch(() => {});

    reply.send(article);
  });

  // Get article by slug (for public viewing)
  app.get<{ Params: { slug: string } }>('/slug/:slug', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const article = await knowledgeService.getArticleBySlug(tenantSlug, request.params.slug);

    // Increment view count
    knowledgeService.incrementViewCount(tenantSlug, article.id).catch(() => {});

    reply.send(article);
  });

  // Create article
  app.post('/', {
    preHandler: [requirePermission('kb:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createArticleSchema.parse(request.body);

    const article = await knowledgeService.createArticle(tenantSlug, userId, body);
    reply.status(201).send(article);
  });

  // Update article
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('kb:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = updateArticleSchema.parse(request.body);

    // Convert null values to undefined for the service
    const updateData = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key, value === null ? undefined : value])
    );
    const article = await knowledgeService.updateArticle(tenantSlug, request.params.id, updateData, userId);
    reply.send(article);
  });

  // Delete article
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('kb:delete')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await knowledgeService.deleteArticle(tenantSlug, request.params.id);
    reply.status(204).send();
  });

  // ================================
  // ARTICLE STATUS MANAGEMENT
  // ================================

  // Submit for review
  app.post<{ Params: { id: string } }>('/:id/submit-for-review', {
    preHandler: [requirePermission('kb:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const article = await knowledgeService.submitForReview(tenantSlug, request.params.id, userId);
    reply.send(article);
  });

  // Publish article
  app.post<{ Params: { id: string } }>('/:id/publish', {
    preHandler: [requirePermission('kb:publish')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const article = await knowledgeService.publishArticle(tenantSlug, request.params.id, userId);
    reply.send(article);
  });

  // Archive article
  app.post<{ Params: { id: string } }>('/:id/archive', {
    preHandler: [requirePermission('kb:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const article = await knowledgeService.archiveArticle(tenantSlug, request.params.id, userId);
    reply.send(article);
  });

  // Revert to draft
  app.post<{ Params: { id: string } }>('/:id/revert-to-draft', {
    preHandler: [requirePermission('kb:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const article = await knowledgeService.revertToDraft(tenantSlug, request.params.id, userId);
    reply.send(article);
  });

  // ================================
  // ARTICLE FEEDBACK
  // ================================

  // Submit feedback
  app.post<{ Params: { id: string } }>('/:id/feedback', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = feedbackSchema.parse(request.body);

    const feedback = await knowledgeService.submitFeedback(
      tenantSlug,
      request.params.id,
      userId,
      body.isHelpful,
      body.comment
    );
    reply.status(201).send(feedback);
  });

  // ================================
  // ARTICLE HISTORY
  // ================================

  // Get article history
  app.get<{ Params: { id: string } }>('/:id/history', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const history = await knowledgeService.getArticleHistory(tenantSlug, request.params.id);
    reply.send(history);
  });

  // ================================
  // ARTICLE LINKING
  // ================================

  // Link article to problem/issue
  app.post<{ Params: { id: string } }>('/:id/link', {
    preHandler: [requirePermission('kb:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = linkSchema.parse(request.body);

    let article;
    if (body.problemId) {
      article = await knowledgeService.linkToProblem(tenantSlug, request.params.id, body.problemId);
    } else if (body.issueId) {
      article = await knowledgeService.linkToIssue(tenantSlug, request.params.id, body.issueId);
    } else {
      return reply.status(400).send({ error: 'Either problemId or issueId is required' });
    }

    reply.send(article);
  });

  // ================================
  // CATEGORY ROUTES
  // ================================

  // List categories
  app.get('/categories', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const categories = await knowledgeService.listCategories(tenantSlug);
    reply.send(categories);
  });

  // Create category
  app.post('/categories', {
    preHandler: [requirePermission('kb_categories:create')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = createCategorySchema.parse(request.body);

    const category = await knowledgeService.createCategory(tenantSlug, body);
    reply.status(201).send(category);
  });

  // Update category
  app.put<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('kb_categories:update')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = updateCategorySchema.parse(request.body);

    const category = await knowledgeService.updateCategory(tenantSlug, request.params.id, body);
    reply.send(category);
  });

  // Delete category
  app.delete<{ Params: { id: string } }>('/categories/:id', {
    preHandler: [requirePermission('kb_categories:delete')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    await knowledgeService.deleteCategory(tenantSlug, request.params.id);
    reply.status(204).send();
  });

  // ================================
  // RELATED ARTICLES
  // ================================

  // Get articles for a problem
  app.get<{ Params: { problemId: string } }>('/problem/:problemId', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const articles = await knowledgeService.getArticlesForProblem(tenantSlug, request.params.problemId);
    reply.send(articles);
  });

  // Get articles for an issue
  app.get<{ Params: { issueId: string } }>('/issue/:issueId', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const articles = await knowledgeService.getArticlesForIssue(tenantSlug, request.params.issueId);
    reply.send(articles);
  });
}
