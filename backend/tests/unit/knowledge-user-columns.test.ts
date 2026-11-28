import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The users table has `avatar_url`, not `avatar` (migration 002). Article reads
 * must select that column and keep returning it as `avatar`.
 */
const mockQuery = vi.fn();

vi.mock('../../src/config/database.js', () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

vi.mock('../../src/utils/cache.js', () => ({
  cacheService: { getOrSet: (_key: string, fetcher: () => unknown) => fetcher() },
}));

import { knowledgeService } from '../../src/services/knowledge.js';

describe('knowledge base author avatar column', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('selects users.avatar_url when reading one article', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'a1' }] });

    await knowledgeService.getArticleById('acme', 'a1');

    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toMatch(/au\.avatar_url\s+as\s+author_avatar/i);
  });

  it('selects users.avatar_url as avatar when listing articles', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'a1', author_id: 'u1', total_count: '1' }] })
      .mockResolvedValueOnce({ rows: [] });

    await knowledgeService.listArticles('acme');

    const sql = mockQuery.mock.calls[1][0] as string;
    expect(sql).toMatch(/SELECT id, name, email, avatar_url AS avatar FROM tenant_acme\.users/);
  });
});
