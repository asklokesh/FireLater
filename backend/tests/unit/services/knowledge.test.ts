import { describe, it, expect, beforeEach, vi } from 'vitest';
import { knowledgeService } from '../../../src/services/knowledge.js';
import { createArticleSchema } from '../../../src/routes/knowledge.js';

describe('Knowledge Service', () => {
  describe('knowledgeService', () => {
    it('should validate knowledge article creation data', () => {
      const validData = {
        title: 'How to reset password',
        content: 'Detailed steps to reset your password...',
        type: 'how_to',
        visibility: 'public'
      };
      
      expect(() => createArticleSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid article data', () => {
      const invalidData = {
        title: 'Short', // invalid - too short
        content: 'Short content' // invalid - too short
      };
      
      expect(() => createArticleSchema.parse(invalidData)).toThrow();
    });

    it('should create a knowledge article with valid data', async () => {
      const tenantSlug = 'test-tenant';
      const userId = 'user-123';
      const articleData = {
        title: 'How to reset password',
        content: 'Detailed steps to reset your password...',
        type: 'how_to',
        visibility: 'public'
      };

      const result = await knowledgeService.createArticle(tenantSlug, userId, articleData);
      
      expect(result).toMatchObject({
        title: articleData.title,
        content: articleData.content,
        type: articleData.type,
        visibility: articleData.visibility
      });
      expect(result.id).toBeDefined();
      expect(result.slug).toBeDefined();
      expect(result.authorId).toBe(userId);
    });
  });
});