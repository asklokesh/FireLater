import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing service
const mockQuery = vi.fn();

vi.mock('../../../src/config/database.js', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

vi.mock('../../../src/services/tenant.js', () => ({
  tenantService: {
    getSchemaName: (slug: string) => `tenant_${slug}`,
  },
}));

vi.mock('../../../src/utils/cache.js', () => ({
  cacheService: {
    getOrSet: vi.fn(async (_key: string, fetcher: () => Promise<unknown>) => fetcher()),
    invalidateTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../../src/utils/contentSanitization.js', () => ({
  sanitizeMarkdown: (content: string) => content,
}));

import { knowledgeService } from '../../../src/services/knowledge.js';
import { NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

describe('KnowledgeService', () => {
  const tenantSlug = 'test';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==================
  // LIST ARTICLES
  // ==================
  describe('listArticles', () => {
    it('should list articles with pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'art-1', title: 'How to Reset Password', total_count: '10', author_id: 'user-1' },
            { id: 'art-2', title: 'VPN Setup Guide', total_count: '10', author_id: 'user-2' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'user-1', name: 'John', email: 'john@test.com' },
            { id: 'user-2', name: 'Jane', email: 'jane@test.com' },
          ],
        });

      const result = await knowledgeService.listArticles(tenantSlug, {}, { page: 1, perPage: 10 });

      expect(result.total).toBe(10);
      expect(result.articles).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.perPage).toBe(10);
      expect(result.pages).toBe(1);
    });

    it('should filter by category', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(tenantSlug, { category: 'cat-1' });

      expect(mockQuery.mock.calls[0][0]).toContain('a.category_id = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('cat-1');
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(tenantSlug, { status: 'published' });

      expect(mockQuery.mock.calls[0][0]).toContain('a.status = $1');
      expect(mockQuery.mock.calls[0][1]).toContain('published');
    });

    it('should filter by type', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(tenantSlug, { type: 'how_to' });

      expect(mockQuery.mock.calls[0][0]).toContain('a.type = $1');
    });

    it('should filter by visibility', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(tenantSlug, { visibility: 'public' });

      expect(mockQuery.mock.calls[0][0]).toContain('a.visibility = $1');
    });

    it('should search with full-text query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(tenantSlug, { q: 'password reset' });

      expect(mockQuery.mock.calls[0][0]).toContain('to_tsvector');
      expect(mockQuery.mock.calls[0][0]).toContain('plainto_tsquery');
      expect(mockQuery.mock.calls[0][1]).toContain('password reset');
    });

    it('should filter by tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(tenantSlug, { tags: ['security', 'password'] });

      expect(mockQuery.mock.calls[0][0]).toContain('a.tags && $1');
      expect(mockQuery.mock.calls[0][1][0]).toEqual(['security', 'password']);
    });

    it('should combine multiple filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(
        tenantSlug,
        { status: 'published', type: 'how_to', visibility: 'public' }
      );

      expect(mockQuery.mock.calls[0][0]).toContain('a.status = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('a.type = $2');
      expect(mockQuery.mock.calls[0][0]).toContain('a.visibility = $3');
    });

    it('should batch fetch users for articles', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'art-1', author_id: 'user-1', reviewer_id: 'user-2', published_by: 'user-1', total_count: '1' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 'user-1', name: 'Author', email: 'author@test.com' },
            { id: 'user-2', name: 'Reviewer', email: 'reviewer@test.com' },
          ],
        });

      const result = await knowledgeService.listArticles(tenantSlug);

      expect(result.articles[0]).toHaveProperty('author');
      expect(result.articles[0]).toHaveProperty('reviewer');
      expect(result.articles[0]).toHaveProperty('publisher');
      // Raw IDs should be cleaned up
      expect(result.articles[0]).not.toHaveProperty('author_id');
    });

    it('should return empty results correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await knowledgeService.listArticles(tenantSlug);

      expect(result.total).toBe(0);
      expect(result.articles).toHaveLength(0);
    });
  });

  // ==================
  // GET ARTICLE BY ID
  // ==================
  describe('getArticleById', () => {
    it('should get article by ID with related data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'art-1',
          title: 'How to Reset Password',
          category_id: 'cat-1',
          category_name: 'Security',
          category_slug: 'security',
          category_icon: 'shield',
          category_description: 'Security articles',
          author_id: 'user-1',
          author_name: 'John',
          author_email: 'john@test.com',
          author_avatar: 'avatar.png',
          reviewer_id: 'user-2',
          reviewer_name: 'Jane',
          reviewer_email: 'jane@test.com',
          publisher_id: 'user-1',
          publisher_name: 'John',
        }],
      });

      const result = await knowledgeService.getArticleById(tenantSlug, 'art-1');

      expect(result).toHaveProperty('title', 'How to Reset Password');
      expect(result.category).toEqual({
        id: 'cat-1',
        name: 'Security',
        slug: 'security',
        icon: 'shield',
        description: 'Security articles',
      });
      expect(result.author).toEqual({
        id: 'user-1',
        name: 'John',
        email: 'john@test.com',
        avatar: 'avatar.png',
      });
      expect(result.reviewer).toEqual({
        id: 'user-2',
        name: 'Jane',
        email: 'jane@test.com',
      });
      expect(result.publisher).toEqual({
        id: 'user-1',
        name: 'John',
      });
    });

    it('should throw NotFoundError if article not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(knowledgeService.getArticleById(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });

    it('should handle article without category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'art-1',
          title: 'Uncategorized Article',
          category_id: null,
          author_id: 'user-1',
          author_name: 'John',
          author_email: 'john@test.com',
          author_avatar: null,
          reviewer_id: null,
          publisher_id: null,
        }],
      });

      const result = await knowledgeService.getArticleById(tenantSlug, 'art-1');

      expect(result.category).toBeNull();
      expect(result.reviewer).toBeNull();
      expect(result.publisher).toBeNull();
    });
  });

  // ==================
  // CREATE ARTICLE
  // ==================
  describe('createArticle', () => {
    it('should create article with all fields', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ current_value: 1 }] }) // sequence
        .mockResolvedValueOnce({
          rows: [{
            id: 'art-1',
            article_number: 'KB000001',
            title: 'New Article',
            slug: 'new-article',
            status: 'draft',
          }],
        });

      const result = await knowledgeService.createArticle(tenantSlug, {
        title: 'New Article',
        content: 'Article content here',
        summary: 'Brief summary',
        type: 'how_to',
        status: 'draft',
        visibility: 'internal',
        categoryId: 'cat-1',
        authorId: 'user-1',
        tags: ['tag1', 'tag2'],
        keywords: ['keyword1'],
        relatedProblemId: 'prob-1',
        relatedIssueId: 'issue-1',
      });

      expect(result).toHaveProperty('article_number', 'KB000001');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO tenant_test.kb_articles');
    });

    it('should generate slug from title', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ current_value: 2 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'art-2', slug: 'how-to-reset-password' }],
        });

      const result = await knowledgeService.createArticle(tenantSlug, {
        title: 'How to Reset Password!',
        content: 'Content',
        authorId: 'user-1',
      });

      // Slug is generated from title
      expect(mockQuery.mock.calls[1][1][2]).toBe('how-to-reset-password');
    });

    it('should use default values when not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ current_value: 3 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 'art-3', type: 'how_to', status: 'draft', visibility: 'internal' }],
        });

      await knowledgeService.createArticle(tenantSlug, {
        title: 'Simple Article',
        content: 'Content',
        authorId: 'user-1',
      });

      // Default type, status, visibility
      expect(mockQuery.mock.calls[1][1][5]).toBe('how_to');
      expect(mockQuery.mock.calls[1][1][6]).toBe('draft');
      expect(mockQuery.mock.calls[1][1][7]).toBe('internal');
    });

    it('should generate correct article number format', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ current_value: 42 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'art-4' }] });

      await knowledgeService.createArticle(tenantSlug, {
        title: 'Test',
        content: 'Content',
        authorId: 'user-1',
      });

      // KB000042 format
      expect(mockQuery.mock.calls[1][1][0]).toBe('KB000042');
    });
  });

  // ==================
  // UPDATE ARTICLE
  // ==================
  describe('updateArticle', () => {
    it('should update article fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'art-1', title: 'Updated Title', status: 'published' }],
      });

      const result = await knowledgeService.updateArticle(tenantSlug, 'art-1', {
        title: 'Updated Title',
        status: 'published',
      });

      expect(result).toHaveProperty('title', 'Updated Title');
      expect(mockQuery.mock.calls[0][0]).toContain('title = $1');
      expect(mockQuery.mock.calls[0][0]).toContain('status = $2');
    });

    it('should update content with sanitization', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'art-1', content: 'New content' }],
      });

      await knowledgeService.updateArticle(tenantSlug, 'art-1', {
        content: 'New content',
      });

      expect(mockQuery.mock.calls[0][0]).toContain('content = $1');
    });

    it('should throw BadRequestError if no fields to update', async () => {
      await expect(
        knowledgeService.updateArticle(tenantSlug, 'art-1', {})
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if article not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        knowledgeService.updateArticle(tenantSlug, 'nonexistent', { title: 'New' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should update all supported fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'art-1' }] });

      await knowledgeService.updateArticle(tenantSlug, 'art-1', {
        title: 'New Title',
        content: 'New Content',
        summary: 'New Summary',
        type: 'troubleshooting',
        status: 'review',
        visibility: 'public',
        categoryId: 'cat-2',
        reviewerId: 'user-2',
        tags: ['new-tag'],
        keywords: ['new-keyword'],
      });

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('title = $1');
      expect(query).toContain('content = $2');
      expect(query).toContain('summary = $3');
      expect(query).toContain('type = $4');
      expect(query).toContain('status = $5');
      expect(query).toContain('visibility = $6');
      expect(query).toContain('category_id = $7');
      expect(query).toContain('reviewer_id = $8');
      expect(query).toContain('tags = $9');
      expect(query).toContain('keywords = $10');
    });
  });

  // ==================
  // DELETE ARTICLE
  // ==================
  describe('deleteArticle', () => {
    it('should delete article', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ article_number: 'KB000001' }],
      });

      const result = await knowledgeService.deleteArticle(tenantSlug, 'art-1');

      expect(result).toEqual({ success: true });
      expect(mockQuery.mock.calls[0][0]).toContain('DELETE FROM tenant_test.kb_articles');
    });

    it('should throw NotFoundError if article not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(knowledgeService.deleteArticle(tenantSlug, 'nonexistent')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  // ==================
  // SEARCH ARTICLES
  // ==================
  describe('searchArticles', () => {
    it('should search articles (delegates to listArticles)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await knowledgeService.searchArticles(tenantSlug, { q: 'password' });

      expect(mockQuery.mock.calls[0][0]).toContain('to_tsvector');
    });
  });

  // ==================
  // LIST CATEGORIES
  // ==================
  describe('listCategories', () => {
    it('should list all categories with parent info', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'cat-1',
            name: 'Security',
            slug: 'security',
            parent_id: null,
            parent_name: null,
            parent_slug: null,
            article_count: '5',
          },
          {
            id: 'cat-2',
            name: 'Password',
            slug: 'password',
            parent_id: 'cat-1',
            parent_name: 'Security',
            parent_slug: 'security',
            article_count: '3',
          },
        ],
      });

      const result = await knowledgeService.listCategories(tenantSlug);

      expect(result).toHaveLength(2);
      expect(result[0].parent).toBeNull();
      expect(result[1].parent).toEqual({
        id: 'cat-1',
        name: 'Security',
        slug: 'security',
      });
      // Raw parent fields should be cleaned up
      expect(result[0]).not.toHaveProperty('parent_id');
      expect(result[0]).not.toHaveProperty('parent_name');
    });

    it('should include article count per category', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'cat-1', name: 'General', article_count: '10', parent_id: null },
        ],
      });

      const result = await knowledgeService.listCategories(tenantSlug);

      expect(result[0]).toHaveProperty('article_count', '10');
    });

    it('should order by sort_order and name', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listCategories(tenantSlug);

      expect(mockQuery.mock.calls[0][0]).toContain('ORDER BY c.sort_order ASC, c.name ASC');
    });
  });

  // ==================
  // INCREMENT VIEW COUNT
  // ==================
  describe('incrementViewCount', () => {
    it('should increment view count', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await knowledgeService.incrementViewCount(tenantSlug, 'art-1');

      expect(mockQuery.mock.calls[0][0]).toContain('view_count = view_count + 1');
      expect(mockQuery.mock.calls[0][1]).toEqual(['art-1']);
    });
  });
});
