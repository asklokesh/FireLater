export type SearchFieldType = 'text' | 'enum' | 'uuid' | 'boolean' | 'date';

export interface SearchFilterField {
  column: string;
  type: SearchFieldType;
}

export interface EntitySearchConfig {
  table: string;
  alias: string;
  tsvector: string;
  filterFields: SearchFilterField[];
}

export type SearchEntity = 'issues' | 'problems' | 'requests' | 'kb';

const TITLE_DESCRIPTION_TSVECTOR =
  "setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B')";

// Same expression as idx_kb_articles_fulltext in migration 014 (no new index is created)
const KB_TSVECTOR =
  "to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, ''))";

export const ISSUES_TSVECTOR = TITLE_DESCRIPTION_TSVECTOR;
export const PROBLEMS_TSVECTOR = TITLE_DESCRIPTION_TSVECTOR;
export const REQUESTS_TSVECTOR = "setweight(to_tsvector('english', coalesce(notes, '')), 'B')";

export const searchConfig: Record<SearchEntity, EntitySearchConfig> = {
  issues: {
    table: 'issues',
    alias: 'i',
    tsvector: ISSUES_TSVECTOR,
    filterFields: [
      { column: 'status', type: 'enum' },
      { column: 'priority', type: 'enum' },
      { column: 'severity', type: 'enum' },
      { column: 'assigned_to', type: 'uuid' },
      { column: 'assigned_group', type: 'uuid' },
      { column: 'reporter_id', type: 'uuid' },
      { column: 'application_id', type: 'uuid' },
      { column: 'sla_breached', type: 'boolean' },
      { column: 'created_at', type: 'date' },
      { column: 'updated_at', type: 'date' },
      { column: 'resolved_at', type: 'date' },
    ],
  },
  problems: {
    table: 'problems',
    alias: 'p',
    tsvector: PROBLEMS_TSVECTOR,
    filterFields: [
      { column: 'status', type: 'enum' },
      { column: 'priority', type: 'enum' },
      { column: 'problem_type', type: 'enum' },
      { column: 'assigned_to', type: 'uuid' },
      { column: 'assigned_group', type: 'uuid' },
      { column: 'reporter_id', type: 'uuid' },
      { column: 'category_id', type: 'uuid' },
      { column: 'is_known_error', type: 'boolean' },
      { column: 'created_at', type: 'date' },
      { column: 'updated_at', type: 'date' },
      { column: 'resolved_at', type: 'date' },
    ],
  },
  requests: {
    table: 'service_requests',
    alias: 'sr',
    tsvector: REQUESTS_TSVECTOR,
    filterFields: [
      { column: 'status', type: 'enum' },
      { column: 'priority', type: 'enum' },
      { column: 'requester_id', type: 'uuid' },
      { column: 'assigned_to', type: 'uuid' },
      { column: 'catalog_item_id', type: 'uuid' },
      { column: 'cost_center', type: 'text' },
      { column: 'due_date', type: 'date' },
      { column: 'created_at', type: 'date' },
      { column: 'completed_at', type: 'date' },
    ],
  },
  kb: {
    table: 'kb_articles',
    alias: 'kb',
    tsvector: KB_TSVECTOR,
    filterFields: [
      { column: 'status', type: 'enum' },
      { column: 'type', type: 'enum' },
      { column: 'visibility', type: 'enum' },
      { column: 'category_id', type: 'uuid' },
      { column: 'author_id', type: 'uuid' },
      { column: 'published_at', type: 'date' },
      { column: 'created_at', type: 'date' },
    ],
  },
};
