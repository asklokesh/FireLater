// Add database indexing recommendations for knowledge base search queries
// The following indexes should be created in the database migration files:
//
// CREATE INDEX CONCURRENTLY idx_kb_articles_type ON kb_articles(type);
// CREATE INDEX CONCURRENTLY idx_kb_articles_visibility ON kb_articles(visibility);
// CREATE INDEX CONCURRENTLY idx_kb_articles_category_id ON kb_articles(category_id);
// CREATE INDEX CONCURRENTLY idx_kb_articles_search ON kb_articles USING gin(to_tsvector('english', title || ' ' || content));
// CREATE INDEX CONCURRENTLY idx_kb_articles_type_visibility ON kb_articles(type, visibility);
// CREATE INDEX CONCURRENTLY idx_kb_articles_category_visibility ON kb_articles(category_id, visibility);
//
// These indexes will significantly improve the performance of the search query in KnowledgeService
// which filters by type, visibility, category_id and performs full-text search on title and content