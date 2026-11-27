import { FastifyInstance } from 'fastify';
import { knowledgeService } from '../services/knowledge.js';
import { requirePermission } from '../middleware/auth.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';
import { validate } from '../middleware/validation.js';
import {
  createArticleSchema,
  updateArticleSchema,
  articleFeedbackSchema,
  type ArticleFeedbackInput,
  type CreateArticleInput,
  type UpdateArticleInput,
} from '../schemas/knowledge.js';



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
    preHandler: [requirePermission('kb:create'), validate({ body: createArticleSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const validatedBody = request.body as CreateArticleInput;

    const article = await knowledgeService.createArticle(tenantSlug, {
      ...validatedBody,
      authorId: userId,
    });

    reply.status(201);
    return article;
  });

  // Update article
  app.put('/:articleId', {
    preHandler: [requirePermission('kb:update'), validate({ body: updateArticleSchema })],
  }, async (request, _reply) => {
    const { tenantSlug, userId } = request.user;
    const { articleId } = request.params as { articleId: string };
    const validatedBody = request.body as UpdateArticleInput;

    const article = await knowledgeService.updateArticle(
      tenantSlug,
      articleId,
      { ...validatedBody, updatedBy: userId }
    );

    return article;
  });

  // Submit helpful / not helpful feedback
  app.post('/:articleId/feedback', {
    preHandler: [requirePermission('kb:read'), validate({ body: articleFeedbackSchema })],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { articleId } = request.params as { articleId: string };
    const { isHelpful, comment } = request.body as ArticleFeedbackInput;

    const feedback = await knowledgeService.submitFeedback(
      tenantSlug,
      articleId,
      userId,
      isHelpful,
      comment
    );

    reply.status(201);
    return feedback;
  });

  // Article version history, newest first
  app.get('/:articleId/history', {
    preHandler: [requirePermission('kb:read')],
  }, async (request, _reply) => {
    const { tenantSlug } = request.user;
    const { articleId } = request.params as { articleId: string };

    return knowledgeService.getArticleHistory(tenantSlug, articleId);
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
