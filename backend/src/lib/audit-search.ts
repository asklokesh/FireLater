/**
 * Full-text search expression for audit_logs.
 *
 * The expression is defined once and reused by the GIN expression index
 * (migration 038) and by the query layer, so the planner can match the query
 * to the index. It must stay IMMUTABLE (explicit regconfig, no column casts
 * that depend on session settings).
 */
export const AUDIT_SEARCH_VECTOR_SQL =
  "to_tsvector('simple', coalesce(user_email, '') || ' ' || coalesce(user_name, '') || ' ' || " +
  "coalesce(entity_type, '') || ' ' || coalesce(entity_name, '') || ' ' || " +
  "coalesce(action, '') || ' ' || coalesce(request_path, ''))";

export const AUDIT_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

export const AUDIT_OUTCOMES = ['success', 'failure', 'denied'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
