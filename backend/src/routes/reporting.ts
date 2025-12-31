// Add database indexing recommendations for reporting queries
// The following indexes should be created in the database migration files:
// 
// CREATE INDEX CONCURRENTLY idx_report_templates_report_type ON report_templates(report_type);
// CREATE INDEX CONCURRENTLY idx_report_templates_is_public ON report_templates(is_public);
// CREATE INDEX CONCURRENTLY idx_report_templates_created_by ON report_templates(created_by);
// CREATE INDEX CONCURRENTLY idx_report_templates_name ON report_templates(name);
//
// These indexes will significantly improve the performance of the list query in ReportTemplateService
// which filters by report_type, is_public and orders by name