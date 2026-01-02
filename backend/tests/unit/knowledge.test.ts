import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pool } from '../../src/config/database.js';
import { knowledgeService } from '../../src/services/knowledge.js';
import { tenantService } from '../../src/services/tenant.js';
import { NotFoundError, BadRequestError } from '../../src/utils/errors.js';

// Mock dependencies
vi.mock('../../src/config/database.js');
vi.mock('../../src/services/tenant.js');
vi.mock('../../src/utils/logger.js');

describe('KnowledgeService - N+1 Query Optimization', () => {
  const mockTenantSlug = 'test-tenant';
  const mockSchema = 'tenant_test_tenant';

  beforeEach(() => {
    vi.clearAllMocks();
    (tenantService.getSchemaName as any) = vi.fn().mockReturnValue(mockSchema);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('listArticles - N+1 Prevention', () => {
    it('should fetch articles with categories in single query using LEFT JOIN', async () => {
      const mockArticles = [
        {
          id: '1',
          article_number: 'KB000001',
          title: 'Test Article 1',
          content: 'Content 1',
          author_id: 'author1',
          reviewer_id: 'reviewer1',
          published_by: 'publisher1',
          category_id: 'cat1',
          category_name: 'Category 1',
          category_slug: 'category-1',
          category_icon: 'icon',
          total_count: '2'
        },
        {
          id: '2',
          article_number: 'KB000002',
          title: 'Test Article 2',
          content: 'Content 2',
          author_id: 'author2',
          reviewer_id: null,
          published_by: null,
          category_id: 'cat2',
          category_name: 'Category 2',
          category_slug: 'category-2',
          category_icon: 'icon2',
          total_count: '2'
        }
      ];

      const mockUsers = [
        { id: 'author1', name: 'Author 1', email: 'author1@test.com', avatar: null },
        { id: 'author2', name: 'Author 2', email: 'author2@test.com', avatar: null },
        { id: 'reviewer1', name: 'Reviewer 1', email: 'reviewer1@test.com', avatar: null },
        { id: 'publisher1', name: 'Publisher 1', email: 'publisher1@test.com', avatar: null }
      ];

      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: mockArticles }) // Main query
        .mockResolvedValueOnce({ rows: mockUsers });    // Batch user query

      const result = await knowledgeService.listArticles(mockTenantSlug, {}, { page: 1, perPage: 20 });

      expect(result.articles).toHaveLength(2);
      expect(result.total).toBe(2);

      // Verify only 2 queries executed (not N+1)
      expect(pool.query).toHaveBeenCalledTimes(2);

      // Verify main query uses LEFT JOIN for categories
      const mainQuery = (pool.query as any).mock.calls[0][0];
      expect(mainQuery).toContain('LEFT JOIN');
      expect(mainQuery).toContain('kb_categories');
      expect(mainQuery).toContain('COUNT(*) OVER()');

      // Verify batch user fetch uses WHERE ... = ANY($1)
      const userQuery = (pool.query as any).mock.calls[1][0];
      expect(userQuery).toContain('WHERE id = ANY($1)');

      // Verify author/reviewer objects are populated
      expect(result.articles[0].author).toEqual({
        id: 'author1',
        name: 'Author 1',
        email: 'author1@test.com',
        avatar: null
      });
    });

    it('should handle articles without categories or users gracefully', async () => {
      const mockArticles = [
        {
          id: '1',
          article_number: 'KB000001',
          title: 'Test Article',
          content: 'Content',
          author_id: null,
          reviewer_id: null,
          published_by: null,
          category_id: null,
          category_name: null,
          category_slug: null,
          category_icon: null,
          total_count: '1'
        }
      ];

      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: mockArticles });

      const result = await knowledgeService.listArticles(mockTenantSlug);

      expect(result.articles).toHaveLength(1);
      // Should only execute 1 query since no users to fetch
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should apply filters correctly without causing additional queries', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [] });

      await knowledgeService.listArticles(mockTenantSlug, {
        category: 'cat1',
        status: 'published',
        type: 'how_to',
        visibility: 'internal',
        q: 'search term'
      });

      const query = (pool.query as any).mock.calls[0][0];
      expect(query).toContain('a.category_id = $1');
      expect(query).toContain('a.status = $2');
      expect(query).toContain('a.type = $3');
      expect(query).toContain('a.visibility = $4');
      expect(query).toContain('plainto_tsquery');
    });
  });

  describe('getArticleById - N+1 Prevention', () => {
    it('should fetch article with all relations in single query', async () => {
      const mockArticle = {
        id: '1',
        article_number: 'KB000001',
        title: 'Test Article',
        content: 'Content',
        category_id: 'cat1',
        category_name: 'Category 1',
        category_slug: 'cat-1',
        category_icon: 'icon',
        category_description: 'Description',
        author_id: 'author1',
        author_name: 'Author',
        author_email: 'author@test.com',
        author_avatar: null,
        reviewer_id: 'reviewer1',
        reviewer_name: 'Reviewer',
        reviewer_email: 'reviewer@test.com',
        publisher_id: 'pub1',
        publisher_name: 'Publisher'
      };

      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [mockArticle] });

      const result = await knowledgeService.getArticleById(mockTenantSlug, '1');

      // Should execute only 1 query
      expect(pool.query).toHaveBeenCalledTimes(1);

      // Verify query uses LEFT JOINs for all relations
      const query = (pool.query as any).mock.calls[0][0];
      expect(query).toContain('LEFT JOIN');
      expect(query).toContain('kb_categories');
      expect(query).toContain('users au');
      expect(query).toContain('users rv');
      expect(query).toContain('users pb');

      // Verify nested objects are properly formatted
      expect(result.category).toEqual({
        id: 'cat1',
        name: 'Category 1',
        slug: 'cat-1',
        icon: 'icon',
        description: 'Description'
      });

      expect(result.author).toEqual({
        id: 'author1',
        name: 'Author',
        email: 'author@test.com',
        avatar: null
      });
    });

    it('should throw NotFoundError if article does not exist', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        knowledgeService.getArticleById(mockTenantSlug, 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('listCategories - N+1 Prevention', () => {
    it('should fetch categories with parent and article count in single query', async () => {
      const mockCategories = [
        {
          id: 'cat1',
          name: 'Category 1',
          slug: 'cat-1',
          parent_id: null,
          parent_name: null,
          parent_slug: null,
          article_count: '5'
        },
        {
          id: 'cat2',
          name: 'Category 2',
          slug: 'cat-2',
          parent_id: 'cat1',
          parent_name: 'Category 1',
          parent_slug: 'cat-1',
          article_count: '3'
        }
      ];

      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: mockCategories });

      const result = await knowledgeService.listCategories(mockTenantSlug);

      expect(result).toHaveLength(2);

      // Should execute only 1 query
      expect(pool.query).toHaveBeenCalledTimes(1);

      // Verify query uses self-join and aggregation
      const query = (pool.query as any).mock.calls[0][0];
      expect(query).toContain('LEFT JOIN');
      expect(query).toContain('kb_categories p');
      expect(query).toContain('COUNT(a.id)');
      expect(query).toContain('GROUP BY');

      // Verify parent is properly nested
      expect(result[1].parent).toEqual({
        id: 'cat1',
        name: 'Category 1',
        slug: 'cat-1'
      });

      expect(result[1].article_count).toBe('3');
    });
  });

  describe('createArticle', () => {
    it('should create article with auto-generated number', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [{ current_value: 1 }] })  // Sequence
        .mockResolvedValueOnce({ rows: [{ id: '1', article_number: 'KB000001' }] }); // Insert

      const params = {
        title: 'New Article',
        content: 'Content',
        authorId: 'author1'
      };

      const result = await knowledgeService.createArticle(mockTenantSlug, params);

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect(result.article_number).toBe('KB000001');
    });
  });

  describe('updateArticle', () => {
    it('should update only provided fields', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: '1', title: 'Updated' }] });

      const result = await knowledgeService.updateArticle(mockTenantSlug, '1', {
        title: 'Updated'
      });

      const query = (pool.query as any).mock.calls[0][0];
      expect(query).toContain('title = $1');
      expect(query).toContain('updated_at = NOW()');
      expect(result.title).toBe('Updated');
    });

    it('should throw BadRequestError if no fields to update', async () => {
      await expect(
        knowledgeService.updateArticle(mockTenantSlug, '1', {})
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if article does not exist', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        knowledgeService.updateArticle(mockTenantSlug, 'nonexistent', { title: 'New' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteArticle', () => {
    it('should delete article and return success', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [{ article_number: 'KB000001' }] });

      const result = await knowledgeService.deleteArticle(mockTenantSlug, '1');

      expect(result.success).toBe(true);
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundError if article does not exist', async () => {
      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        knowledgeService.deleteArticle(mockTenantSlug, 'nonexistent')
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('Query Efficiency Metrics', () => {
    it('listArticles should execute exactly 2 queries for populated articles', async () => {
      const mockArticles = Array.from({ length: 20 }, (_, i) => ({
        id: `${i + 1}`,
        article_number: `KB${String(i + 1).padStart(6, '0')}`,
        title: `Article ${i + 1}`,
        author_id: `author${(i % 3) + 1}`,
        total_count: '20'
      }));

      const mockUsers = [
        { id: 'author1', name: 'Author 1', email: 'a1@test.com', avatar: null },
        { id: 'author2', name: 'Author 2', email: 'a2@test.com', avatar: null },
        { id: 'author3', name: 'Author 3', email: 'a3@test.com', avatar: null }
      ];

      (pool.query as any) = vi.fn()
        .mockResolvedValueOnce({ rows: mockArticles })
        .mockResolvedValueOnce({ rows: mockUsers });

      await knowledgeService.listArticles(mockTenantSlug, {}, { page: 1, perPage: 20 });

      // Critical: Should be 2 queries regardless of article count
      // Before optimization: would be 1 + N + N queries (1 + 20 + 20 = 41 queries!)
      // After optimization: 2 queries (1 main + 1 batch user fetch)
      expect(pool.query).toHaveBeenCalledTimes(2);
    });
  });
});
