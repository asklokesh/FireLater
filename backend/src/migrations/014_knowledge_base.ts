import { Pool } from 'pg';

export async function migration014KnowledgeBase(pool: Pool): Promise<void> {
  await pool.query(`
    -- ============================================
    -- KNOWLEDGE BASE MODULE
    -- ============================================
    -- Knowledge Management for self-service support,
    -- known error documentation, and best practices

    SET search_path TO tenant_template;

    -- Add KB article ID sequence if not exists
    INSERT INTO id_sequences (entity_type, prefix, current_value)
    VALUES ('KB', 'KB', 0)
    ON CONFLICT (entity_type) DO NOTHING;

    -- ============================================
    -- KB CATEGORIES
    -- ============================================

    CREATE TABLE IF NOT EXISTS kb_categories (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name            VARCHAR(200) NOT NULL,
        slug            VARCHAR(200) NOT NULL,
        description     TEXT,
        parent_id       UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
        icon            VARCHAR(100),
        sort_order      INTEGER DEFAULT 0,
        is_public       BOOLEAN DEFAULT false,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_categories_slug ON kb_categories(slug);
    CREATE INDEX IF NOT EXISTS idx_kb_categories_parent ON kb_categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_kb_categories_sort ON kb_categories(sort_order);

    -- ============================================
    -- KB ARTICLES
    -- ============================================

    CREATE TABLE IF NOT EXISTS kb_articles (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_number      VARCHAR(50) NOT NULL UNIQUE,
        title               VARCHAR(500) NOT NULL,
        slug                VARCHAR(500) NOT NULL,
        content             TEXT NOT NULL,
        summary             VARCHAR(1000),

        -- Article type and status
        type                VARCHAR(50) DEFAULT 'how_to',
        status              VARCHAR(50) DEFAULT 'draft',
        visibility          VARCHAR(50) DEFAULT 'internal',

        -- Organization
        category_id         UUID REFERENCES kb_categories(id) ON DELETE SET NULL,

        -- Ownership
        author_id           UUID REFERENCES users(id),
        reviewer_id         UUID REFERENCES users(id),

        -- Publication tracking
        published_at        TIMESTAMPTZ,
        published_by        UUID REFERENCES users(id),
        last_reviewed_at    TIMESTAMPTZ,
        next_review_at      TIMESTAMPTZ,

        -- Metrics
        view_count          INTEGER DEFAULT 0,
        helpful_count       INTEGER DEFAULT 0,
        not_helpful_count   INTEGER DEFAULT 0,

        -- Related entities
        related_problem_id  UUID REFERENCES problems(id) ON DELETE SET NULL,
        related_issue_id    UUID REFERENCES issues(id) ON DELETE SET NULL,

        -- Search optimization
        tags                TEXT[],
        keywords            TEXT[],

        -- Versioning
        version             INTEGER DEFAULT 1,

        -- Metadata
        attachments         JSONB DEFAULT '[]',
        metadata            JSONB DEFAULT '{}',

        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(slug);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_number ON kb_articles(article_number);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_type ON kb_articles(type);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category_id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_author ON kb_articles(author_id);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_visibility ON kb_articles(visibility);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON kb_articles(published_at) WHERE status = 'published';
    CREATE INDEX IF NOT EXISTS idx_kb_articles_problem ON kb_articles(related_problem_id) WHERE related_problem_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_kb_articles_issue ON kb_articles(related_issue_id) WHERE related_issue_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON kb_articles USING gin(tags);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_keywords ON kb_articles USING gin(keywords);
    CREATE INDEX IF NOT EXISTS idx_kb_articles_fulltext ON kb_articles USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '')));

    -- ============================================
    -- KB ARTICLE FEEDBACK
    -- ============================================

    CREATE TABLE IF NOT EXISTS kb_article_feedback (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id      UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
        user_id         UUID REFERENCES users(id),
        is_helpful      BOOLEAN NOT NULL,
        comment         TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_feedback_user_article ON kb_article_feedback(article_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON kb_article_feedback(article_id);

    -- ============================================
    -- KB ARTICLE VERSION HISTORY
    -- ============================================

    CREATE TABLE IF NOT EXISTS kb_article_history (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id      UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
        version         INTEGER,
        changed_by      UUID REFERENCES users(id),
        action          VARCHAR(50) NOT NULL,
        content_snapshot TEXT,
        changes         JSONB,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kb_history_article ON kb_article_history(article_id);
    CREATE INDEX IF NOT EXISTS idx_kb_history_created ON kb_article_history(created_at DESC);

    -- ============================================
    -- KB ARTICLE ATTACHMENTS
    -- ============================================

    CREATE TABLE IF NOT EXISTS kb_article_attachments (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        article_id      UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
        file_name       VARCHAR(500) NOT NULL,
        file_type       VARCHAR(100),
        file_size       INTEGER,
        storage_key     VARCHAR(1000) NOT NULL,
        uploaded_by     UUID REFERENCES users(id),
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kb_attachments_article ON kb_article_attachments(article_id);

    -- ============================================
    -- KB PERMISSIONS
    -- ============================================

    INSERT INTO permissions (resource, action, description) VALUES
        ('kb', 'create', 'Create KB articles'),
        ('kb', 'read', 'View KB articles'),
        ('kb', 'update', 'Update KB articles'),
        ('kb', 'delete', 'Delete KB articles'),
        ('kb', 'publish', 'Publish KB articles'),
        ('kb', 'review', 'Review KB articles'),
        ('kb_categories', 'create', 'Create KB categories'),
        ('kb_categories', 'update', 'Update KB categories'),
        ('kb_categories', 'delete', 'Delete KB categories')
    ON CONFLICT (resource, action) DO NOTHING;

    -- Grant permissions to admin role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'admin'
    AND p.resource IN ('kb', 'kb_categories')
    ON CONFLICT DO NOTHING;

    -- Grant permissions to manager role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'manager'
    AND (p.resource, p.action) IN (
        ('kb', 'create'),
        ('kb', 'read'),
        ('kb', 'update'),
        ('kb', 'publish'),
        ('kb', 'review'),
        ('kb_categories', 'create'),
        ('kb_categories', 'update')
    )
    ON CONFLICT DO NOTHING;

    -- Grant permissions to agent role
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'agent'
    AND (p.resource, p.action) IN (
        ('kb', 'create'),
        ('kb', 'read'),
        ('kb', 'update')
    )
    ON CONFLICT DO NOTHING;

    -- Grant read access to requesters
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r, permissions p
    WHERE r.name = 'requester'
    AND (p.resource, p.action) IN (
        ('kb', 'read')
    )
    ON CONFLICT DO NOTHING;

    -- ============================================
    -- SEED DEFAULT CATEGORIES
    -- ============================================

    INSERT INTO kb_categories (name, slug, description, icon, sort_order) VALUES
        ('Getting Started', 'getting-started', 'Guides for new users', 'rocket', 1),
        ('How-To Guides', 'how-to-guides', 'Step-by-step tutorials', 'book-open', 2),
        ('Troubleshooting', 'troubleshooting', 'Common problems and solutions', 'wrench', 3),
        ('FAQs', 'faqs', 'Frequently asked questions', 'help-circle', 4),
        ('Best Practices', 'best-practices', 'Recommended approaches', 'award', 5),
        ('Known Issues', 'known-issues', 'Documented known errors', 'alert-triangle', 6),
        ('Policies', 'policies', 'IT policies and procedures', 'file-text', 7)
    ON CONFLICT DO NOTHING;

    RESET search_path;
  `);

  // Apply to existing tenant schemas
  const tenantsResult = await pool.query(`
    SELECT slug FROM public.tenants WHERE status = 'active'
  `);

  for (const tenant of tenantsResult.rows) {
    const schema = `tenant_${tenant.slug.replace(/-/g, '_')}`;

    try {
      await pool.query(`
        SET search_path TO ${schema};

        -- Add KB article ID sequence if not exists
        INSERT INTO id_sequences (entity_type, prefix, current_value)
        VALUES ('KB', 'KB', 0)
        ON CONFLICT (entity_type) DO NOTHING;

        -- KB Categories
        CREATE TABLE IF NOT EXISTS kb_categories (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name            VARCHAR(200) NOT NULL,
            slug            VARCHAR(200) NOT NULL,
            description     TEXT,
            parent_id       UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
            icon            VARCHAR(100),
            sort_order      INTEGER DEFAULT 0,
            is_public       BOOLEAN DEFAULT false,
            created_at      TIMESTAMPTZ DEFAULT NOW(),
            updated_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_categories_slug ON kb_categories(slug);
        CREATE INDEX IF NOT EXISTS idx_kb_categories_parent ON kb_categories(parent_id);
        CREATE INDEX IF NOT EXISTS idx_kb_categories_sort ON kb_categories(sort_order);

        -- KB Articles
        CREATE TABLE IF NOT EXISTS kb_articles (
            id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            article_number      VARCHAR(50) NOT NULL UNIQUE,
            title               VARCHAR(500) NOT NULL,
            slug                VARCHAR(500) NOT NULL,
            content             TEXT NOT NULL,
            summary             VARCHAR(1000),
            type                VARCHAR(50) DEFAULT 'how_to',
            status              VARCHAR(50) DEFAULT 'draft',
            visibility          VARCHAR(50) DEFAULT 'internal',
            category_id         UUID REFERENCES kb_categories(id) ON DELETE SET NULL,
            author_id           UUID REFERENCES users(id),
            reviewer_id         UUID REFERENCES users(id),
            published_at        TIMESTAMPTZ,
            published_by        UUID REFERENCES users(id),
            last_reviewed_at    TIMESTAMPTZ,
            next_review_at      TIMESTAMPTZ,
            view_count          INTEGER DEFAULT 0,
            helpful_count       INTEGER DEFAULT 0,
            not_helpful_count   INTEGER DEFAULT 0,
            related_problem_id  UUID REFERENCES problems(id) ON DELETE SET NULL,
            related_issue_id    UUID REFERENCES issues(id) ON DELETE SET NULL,
            tags                TEXT[],
            keywords            TEXT[],
            version             INTEGER DEFAULT 1,
            attachments         JSONB DEFAULT '[]',
            metadata            JSONB DEFAULT '{}',
            created_at          TIMESTAMPTZ DEFAULT NOW(),
            updated_at          TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_articles_slug ON kb_articles(slug);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_number ON kb_articles(article_number);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_status ON kb_articles(status);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_type ON kb_articles(type);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_category ON kb_articles(category_id);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_author ON kb_articles(author_id);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_visibility ON kb_articles(visibility);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_published ON kb_articles(published_at) WHERE status = 'published';
        CREATE INDEX IF NOT EXISTS idx_kb_articles_problem ON kb_articles(related_problem_id) WHERE related_problem_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_kb_articles_issue ON kb_articles(related_issue_id) WHERE related_issue_id IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_kb_articles_tags ON kb_articles USING gin(tags);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_keywords ON kb_articles USING gin(keywords);

        -- KB Feedback
        CREATE TABLE IF NOT EXISTS kb_article_feedback (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            article_id      UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
            user_id         UUID REFERENCES users(id),
            is_helpful      BOOLEAN NOT NULL,
            comment         TEXT,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_feedback_user_article ON kb_article_feedback(article_id, user_id);
        CREATE INDEX IF NOT EXISTS idx_kb_feedback_article ON kb_article_feedback(article_id);

        -- KB Version History
        CREATE TABLE IF NOT EXISTS kb_article_history (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            article_id      UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
            version         INTEGER,
            changed_by      UUID REFERENCES users(id),
            action          VARCHAR(50) NOT NULL,
            content_snapshot TEXT,
            changes         JSONB,
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_kb_history_article ON kb_article_history(article_id);
        CREATE INDEX IF NOT EXISTS idx_kb_history_created ON kb_article_history(created_at DESC);

        -- KB Attachments
        CREATE TABLE IF NOT EXISTS kb_article_attachments (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            article_id      UUID REFERENCES kb_articles(id) ON DELETE CASCADE,
            file_name       VARCHAR(500) NOT NULL,
            file_type       VARCHAR(100),
            file_size       INTEGER,
            storage_key     VARCHAR(1000) NOT NULL,
            uploaded_by     UUID REFERENCES users(id),
            created_at      TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_kb_attachments_article ON kb_article_attachments(article_id);

        -- Add permissions
        INSERT INTO permissions (resource, action, description) VALUES
            ('kb', 'create', 'Create KB articles'),
            ('kb', 'read', 'View KB articles'),
            ('kb', 'update', 'Update KB articles'),
            ('kb', 'delete', 'Delete KB articles'),
            ('kb', 'publish', 'Publish KB articles'),
            ('kb', 'review', 'Review KB articles'),
            ('kb_categories', 'create', 'Create KB categories'),
            ('kb_categories', 'update', 'Update KB categories'),
            ('kb_categories', 'delete', 'Delete KB categories')
        ON CONFLICT (resource, action) DO NOTHING;

        -- Grant permissions
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'admin'
        AND p.resource IN ('kb', 'kb_categories')
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'manager'
        AND (p.resource, p.action) IN (
            ('kb', 'create'),
            ('kb', 'read'),
            ('kb', 'update'),
            ('kb', 'publish'),
            ('kb', 'review'),
            ('kb_categories', 'create'),
            ('kb_categories', 'update')
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'agent'
        AND (p.resource, p.action) IN (
            ('kb', 'create'),
            ('kb', 'read'),
            ('kb', 'update')
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id
        FROM roles r, permissions p
        WHERE r.name = 'requester'
        AND (p.resource, p.action) IN (
            ('kb', 'read')
        )
        ON CONFLICT DO NOTHING;

        -- Seed categories
        INSERT INTO kb_categories (name, slug, description, icon, sort_order) VALUES
            ('Getting Started', 'getting-started', 'Guides for new users', 'rocket', 1),
            ('How-To Guides', 'how-to-guides', 'Step-by-step tutorials', 'book-open', 2),
            ('Troubleshooting', 'troubleshooting', 'Common problems and solutions', 'wrench', 3),
            ('FAQs', 'faqs', 'Frequently asked questions', 'help-circle', 4),
            ('Best Practices', 'best-practices', 'Recommended approaches', 'award', 5),
            ('Known Issues', 'known-issues', 'Documented known errors', 'alert-triangle', 6),
            ('Policies', 'policies', 'IT policies and procedures', 'file-text', 7)
        ON CONFLICT DO NOTHING;

        RESET search_path;
      `);
    } catch (err) {
      console.error(`Failed to apply KB migration to tenant ${tenant.slug}:`, err);
    }
  }
}
