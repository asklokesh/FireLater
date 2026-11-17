/**
 * Search entity registry.
 *
 * Every searchable entity declares its table, the weighted tsvector expression
 * used for full-text search, the columns projected into unified results and a
 * whitelist of filterable fields. User input never reaches SQL as an
 * identifier: field names are looked up here and only the mapped column is
 * emitted.
 *
 * The tsvector expression is the single source of truth for both the GIN
 * index (migration 037) and the query layer. If the two drift apart Postgres
 * stops using the index, so always build both from vector().
 */

export type SearchEntityType = 'issue' | 'problem' | 'change' | 'knowledge';

export type SearchFieldType = 'text' | 'uuid' | 'date' | 'boolean';

export interface SearchFieldDef {
  column: string;
  type: SearchFieldType;
}

export interface SearchEntityDef {
  type: SearchEntityType;
  table: string;
  indexName: string;
  /** Permission required to see this entity in search results */
  permission: string;
  /** Frontend route prefix for building result links */
  urlPrefix: string;
  /** Weighted text sources: [column, weight] */
  textColumns: Array<[string, 'A' | 'B' | 'C' | 'D']>;
  numberColumn: string;
  titleColumn: string;
  /** SQL expression (without alias) used as the snippet source */
  bodyExpr: string;
  statusColumn: string | null;
  priorityColumn: string | null;
  assigneeColumn: string | null;
  fields: Record<string, SearchFieldDef>;
  vector: (alias?: string) => string;
}

export const SEARCH_LANGUAGE = 'english';

function buildVector(textColumns: Array<[string, string]>, alias?: string): string {
  const prefix = alias ? `${alias}.` : '';
  return textColumns
    .map(
      ([column, weight]) =>
        `setweight(to_tsvector('${SEARCH_LANGUAGE}'::regconfig, coalesce(${prefix}${column}, '')), '${weight}')`
    )
    .join(' || ');
}

const commonDateFields: Record<string, SearchFieldDef> = {
  created: { column: 'created_at', type: 'date' },
  updated: { column: 'updated_at', type: 'date' },
};

function defineEntity(def: Omit<SearchEntityDef, 'vector'>): SearchEntityDef {
  return { ...def, vector: (alias?: string) => buildVector(def.textColumns, alias) };
}

export const SEARCH_ENTITIES: Record<SearchEntityType, SearchEntityDef> = {
  issue: defineEntity({
    type: 'issue',
    table: 'issues',
    indexName: 'idx_issues_search_fts',
    permission: 'issues:read',
    urlPrefix: '/issues',
    textColumns: [
      ['title', 'A'],
      ['issue_number', 'A'],
      ['description', 'B'],
      ['resolution_notes', 'C'],
    ],
    numberColumn: 'issue_number',
    titleColumn: 'title',
    bodyExpr: 'description',
    statusColumn: 'status',
    priorityColumn: 'priority',
    assigneeColumn: 'assigned_to',
    fields: {
      status: { column: 'status', type: 'text' },
      priority: { column: 'priority', type: 'text' },
      severity: { column: 'severity', type: 'text' },
      source: { column: 'source', type: 'text' },
      issue_type: { column: 'issue_type', type: 'text' },
      sla_breached: { column: 'sla_breached', type: 'boolean' },
      assignee: { column: 'assigned_to', type: 'uuid' },
      group: { column: 'assigned_group', type: 'uuid' },
      application: { column: 'application_id', type: 'uuid' },
      reporter: { column: 'reporter_id', type: 'uuid' },
      resolved: { column: 'resolved_at', type: 'date' },
      ...commonDateFields,
    },
  }),
  problem: defineEntity({
    type: 'problem',
    table: 'problems',
    indexName: 'idx_problems_search_fts',
    permission: 'problems:read',
    urlPrefix: '/problems',
    textColumns: [
      ['title', 'A'],
      ['problem_number', 'A'],
      ['description', 'B'],
      ['root_cause', 'C'],
      ['workaround', 'C'],
    ],
    numberColumn: 'problem_number',
    titleColumn: 'title',
    bodyExpr: 'description',
    statusColumn: 'status',
    priorityColumn: 'priority',
    assigneeColumn: 'assigned_to',
    fields: {
      status: { column: 'status', type: 'text' },
      priority: { column: 'priority', type: 'text' },
      problem_type: { column: 'problem_type', type: 'text' },
      known_error: { column: 'is_known_error', type: 'boolean' },
      assignee: { column: 'assigned_to', type: 'uuid' },
      group: { column: 'assigned_group', type: 'uuid' },
      application: { column: 'application_id', type: 'uuid' },
      reporter: { column: 'reporter_id', type: 'uuid' },
      resolved: { column: 'resolved_at', type: 'date' },
      ...commonDateFields,
    },
  }),
  change: defineEntity({
    type: 'change',
    table: 'change_requests',
    indexName: 'idx_change_requests_search_fts',
    permission: 'changes:read',
    urlPrefix: '/changes',
    textColumns: [
      ['title', 'A'],
      ['change_number', 'A'],
      ['description', 'B'],
      ['justification', 'C'],
    ],
    numberColumn: 'change_number',
    titleColumn: 'title',
    bodyExpr: 'description',
    statusColumn: 'status',
    priorityColumn: null,
    assigneeColumn: 'implementer_id',
    fields: {
      status: { column: 'status', type: 'text' },
      risk: { column: 'risk_level', type: 'text' },
      change_type: { column: 'type', type: 'text' },
      assignee: { column: 'implementer_id', type: 'uuid' },
      group: { column: 'assigned_group', type: 'uuid' },
      application: { column: 'application_id', type: 'uuid' },
      reporter: { column: 'requester_id', type: 'uuid' },
      planned_start: { column: 'planned_start', type: 'date' },
      ...commonDateFields,
    },
  }),
  knowledge: defineEntity({
    type: 'knowledge',
    table: 'kb_articles',
    indexName: 'idx_kb_articles_search_fts',
    permission: 'kb:read',
    urlPrefix: '/knowledge-base',
    textColumns: [
      ['title', 'A'],
      ['article_number', 'A'],
      ['summary', 'B'],
      ['content', 'C'],
    ],
    numberColumn: 'article_number',
    titleColumn: 'title',
    bodyExpr: "coalesce(summary, content, '')",
    statusColumn: 'status',
    priorityColumn: null,
    assigneeColumn: null,
    fields: {
      status: { column: 'status', type: 'text' },
      kb_type: { column: 'type', type: 'text' },
      visibility: { column: 'visibility', type: 'text' },
      reporter: { column: 'author_id', type: 'uuid' },
      ...commonDateFields,
    },
  }),
};

export const SEARCH_ENTITY_TYPES = Object.keys(SEARCH_ENTITIES) as SearchEntityType[];

/** Every field name accepted by at least one entity. */
export const ALL_SEARCH_FIELDS: ReadonlySet<string> = new Set(
  Object.values(SEARCH_ENTITIES).flatMap((e) => Object.keys(e.fields))
);

export function isSearchEntityType(value: string): value is SearchEntityType {
  return (SEARCH_ENTITY_TYPES as string[]).includes(value);
}

/** Entity types the caller may search, given their permissions. */
export function allowedEntityTypes(permissions: string[], isAdmin: boolean): SearchEntityType[] {
  if (isAdmin) return [...SEARCH_ENTITY_TYPES];
  return SEARCH_ENTITY_TYPES.filter((t) => permissions.includes(SEARCH_ENTITIES[t].permission));
}
