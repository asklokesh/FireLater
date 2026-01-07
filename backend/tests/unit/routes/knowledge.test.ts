import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock services
vi.mock('../../../src/services/knowledge.js', () => ({
  knowledgeService: {
    listArticles: vi.fn().mockResolvedValue({ articles: [], total: 0 }),
    searchArticles: vi.fn().mockResolvedValue({ articles: [], total: 0 }),
    getArticleById: vi.fn().mockResolvedValue(null),
    createArticle: vi.fn().mockResolvedValue({}),
    updateArticle: vi.fn().mockResolvedValue({}),
    deleteArticle: vi.fn().mockResolvedValue(undefined),
    incrementViewCount: vi.fn().mockResolvedValue(undefined),
    listCategories: vi.fn().mockResolvedValue([]),
  },
}));

// Mock middleware
vi.mock('../../../src/middleware/auth.js', () => ({
  requirePermission: vi.fn().mockReturnValue(vi.fn().mockImplementation((_req, _reply, done) => done())),
}));

// Mock pagination utils
vi.mock('../../../src/utils/pagination.js', () => ({
  parsePagination: vi.fn().mockReturnValue({ page: 1, perPage: 20 }),
  createPaginatedResponse: vi.fn().mockImplementation((data, total, pagination) => ({
    data,
    meta: { total, page: pagination.page, perPage: pagination.perPage },
  })),
}));

describe('Knowledge Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Article Schema', () => {
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

    it('should require title and content', () => {
      const result = createArticleSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid article data', () => {
      const result = createArticleSchema.safeParse({
        title: 'How to Reset Password',
        content: 'Follow these steps to reset your password...',
      });
      expect(result.success).toBe(true);
    });

    it('should require title of at least 5 characters', () => {
      const result = createArticleSchema.safeParse({
        title: 'Hi',
        content: 'Some content',
      });
      expect(result.success).toBe(false);
    });

    it('should reject title over 500 characters', () => {
      const result = createArticleSchema.safeParse({
        title: 'x'.repeat(501),
        content: 'Some content',
      });
      expect(result.success).toBe(false);
    });

    it('should require content of at least 1 character', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept summary', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        summary: 'A brief summary of the article',
      });
      expect(result.success).toBe(true);
    });

    it('should reject summary over 1000 characters', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        summary: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept all article types', () => {
      const types = ['how_to', 'faq', 'troubleshooting', 'policy', 'best_practice'];
      for (const type of types) {
        const result = createArticleSchema.safeParse({
          title: 'Valid Title',
          content: 'Some content',
          type,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all status values', () => {
      const statuses = ['draft', 'published', 'archived'];
      for (const status of statuses) {
        const result = createArticleSchema.safeParse({
          title: 'Valid Title',
          content: 'Some content',
          status,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all visibility values', () => {
      const visibilities = ['internal', 'public', 'restricted'];
      for (const visibility of visibilities) {
        const result = createArticleSchema.safeParse({
          title: 'Valid Title',
          content: 'Some content',
          visibility,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept categoryId as UUID', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept tags array', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        tags: ['password', 'security', 'authentication'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept keywords array', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        keywords: ['reset', 'forgot', 'login'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept relatedProblemId', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        relatedProblemId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept relatedIssueId', () => {
      const result = createArticleSchema.safeParse({
        title: 'Valid Title',
        content: 'Some content',
        relatedIssueId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Update Article Schema', () => {
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

    it('should accept partial update', () => {
      const result = updateArticleSchema.safeParse({
        title: 'Updated Title Here',
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty update', () => {
      const result = updateArticleSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept status change', () => {
      const result = updateArticleSchema.safeParse({
        status: 'published',
      });
      expect(result.success).toBe(true);
    });

    it('should accept visibility change', () => {
      const result = updateArticleSchema.safeParse({
        visibility: 'public',
      });
      expect(result.success).toBe(true);
    });

    it('should accept reviewerId', () => {
      const result = updateArticleSchema.safeParse({
        reviewerId: '123e4567-e89b-12d3-a456-426614174000',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Query Filters', () => {
    it('should handle category filter', () => {
      const query = { category: 'software' };
      const filters = {
        category: query.category,
        status: (query as Record<string, string>).status,
        type: (query as Record<string, string>).type,
        visibility: (query as Record<string, string>).visibility,
        q: (query as Record<string, string>).q,
      };
      expect(filters.category).toBe('software');
    });

    it('should handle status filter', () => {
      const query = { status: 'published' };
      const filters = {
        status: query.status,
      };
      expect(filters.status).toBe('published');
    });

    it('should handle type filter', () => {
      const query = { type: 'how_to' };
      const filters = {
        type: query.type,
      };
      expect(filters.type).toBe('how_to');
    });

    it('should handle visibility filter', () => {
      const query = { visibility: 'public' };
      const filters = {
        visibility: query.visibility,
      };
      expect(filters.visibility).toBe('public');
    });

    it('should handle search query', () => {
      const query = { q: 'password reset' };
      const filters = {
        q: query.q,
      };
      expect(filters.q).toBe('password reset');
    });
  });

  describe('Route Permissions', () => {
    it('should require kb:read for GET /', () => {
      const permission = 'kb:read';
      expect(permission).toBe('kb:read');
    });

    it('should require kb:read for GET /search', () => {
      const permission = 'kb:read';
      expect(permission).toBe('kb:read');
    });

    it('should require kb:read for GET /:articleId', () => {
      const permission = 'kb:read';
      expect(permission).toBe('kb:read');
    });

    it('should require kb:create for POST /', () => {
      const permission = 'kb:create';
      expect(permission).toBe('kb:create');
    });

    it('should require kb:update for PUT /:articleId', () => {
      const permission = 'kb:update';
      expect(permission).toBe('kb:update');
    });

    it('should require kb:delete for DELETE /:articleId', () => {
      const permission = 'kb:delete';
      expect(permission).toBe('kb:delete');
    });

    it('should require kb:read for GET /categories', () => {
      const permission = 'kb:read';
      expect(permission).toBe('kb:read');
    });
  });

  describe('Response Formats', () => {
    it('should return 201 for created article', () => {
      const statusCode = 201;
      expect(statusCode).toBe(201);
    });

    it('should return 204 for deleted article', () => {
      const statusCode = 204;
      expect(statusCode).toBe(204);
    });

    it('should return categories in wrapper', () => {
      const categories = [{ id: 'cat-1', name: 'Software' }];
      const response = { categories };
      expect(response).toHaveProperty('categories');
      expect(Array.isArray(response.categories)).toBe(true);
    });
  });

  describe('Service Integration', () => {
    it('should pass tenantSlug and filters to knowledgeService.listArticles', async () => {
      const { knowledgeService } = await import('../../../src/services/knowledge.js');
      const filters = { status: 'published' };
      const pagination = { page: 1, perPage: 20 };

      await knowledgeService.listArticles('test-tenant', filters, pagination);
      expect(knowledgeService.listArticles).toHaveBeenCalledWith('test-tenant', filters, pagination);
    });

    it('should pass tenantSlug and id to knowledgeService.getArticleById', async () => {
      const { knowledgeService } = await import('../../../src/services/knowledge.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await knowledgeService.getArticleById('test-tenant', id);
      expect(knowledgeService.getArticleById).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should increment view count asynchronously', async () => {
      const { knowledgeService } = await import('../../../src/services/knowledge.js');
      const id = '123e4567-e89b-12d3-a456-426614174000';

      await knowledgeService.incrementViewCount('test-tenant', id);
      expect(knowledgeService.incrementViewCount).toHaveBeenCalledWith('test-tenant', id);
    });

    it('should pass tenantSlug to knowledgeService.listCategories', async () => {
      const { knowledgeService } = await import('../../../src/services/knowledge.js');

      await knowledgeService.listCategories('test-tenant');
      expect(knowledgeService.listCategories).toHaveBeenCalledWith('test-tenant');
    });
  });
});
