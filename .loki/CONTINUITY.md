# Loki Mode Continuity - FireLater ITSM Platform

## Current Status
- **Phase**: DEVELOPMENT / TESTING
- **Iteration**: 16
- **Last Updated**: 2026-01-07
- **Overall Health**: PASSING

## Test Status Summary
- **Backend Tests**: 5579 passed, 29 skipped
- **Frontend Tests**: 2844 passed, 3 skipped
- **TypeScript**: No errors (backend clean, frontend test files excluded from tsc)
- **ESLint**: No errors
- **Coverage**: 94.86% for services

## Services with Unit Tests
- applications, asset, audit, auth, awsService, cabMeetings, catalog, changes
- cloud, dashboard, database, email, groups, health, integrations, issues
- knowledge, notifications, oncall, problems, reporting, requests
- shiftSwaps, sla, slack, sso, storage, teams, tenant, users, workflow
- notification-delivery, email-inbound, report-export

## Jobs with Unit Tests
- slaMonitor, scheduler, integrationSync, queues, index (exports, initialization, shutdown)
- processors/notifications, processors/cleanup, processors/cloudSync
- processors/healthScores, processors/slaBreaches, processors/scheduledReports

## Config with Unit Tests
- index (environment schema validation), redis (connection configuration), database (pool configuration)

## Routes with Unit Tests
- health (schema validation, permissions), dashboard (service integration, defaults)
- issues (CRUD schemas, filters, permissions), changes (windows, templates, requests, CAB)
- requests (CRUD schemas, approval actions, cancel flow), problems (RCA, worklogs, issue linking)
- catalog (categories, items, form schemas), users (CRUD, roles, groups)
- groups (members, roles, types), applications (environments, health, lifecycle)
- assets (types, categories, statuses, filters)
- knowledge (articles, types, visibility, search), sla (policies, targets, metrics)
- oncall (schedules, rotations, shifts, overrides, escalation policies, shift swaps, iCal)
- roles (CRUD, permissions, system role protection), notifications (channels, templates, preferences)
- workflow (rules, conditions, actions, triggers, test/dry-run)
- integrations (API keys, webhooks, CRUD, permissions, rate limits)
- reporting (templates, schedules, executions, widgets, dashboard endpoints)
- cloud (accounts, resources, costs, mapping rules, providers)
- audit (query, entity history, user activity, security events, settings)
- settings (theme, notifications, security, email provider configuration)
- attachments (upload URLs, entity attachments, storage usage)
- email (configs, SendGrid/Mailgun webhooks, generic inbound)
- sso (SAML/OIDC login, callbacks, logout, metadata)
- jobs (queue statuses, scheduler, pause/resume, retry, cleanup)
- auth (login, logout, refresh, register, password reset, email verification)
- migration (upload, execute, mapping templates, job status)

## Middleware with Unit Tests
- auditLog, auth, rateLimit, sanitization, tenant, tenantMiddleware, tenantValidation

## Utilities with Unit Tests
- sanitization, contentSanitization, cache (23 tests including TTL, flush, prefix, error handling), circuitBreaker, encryption, errors, errorUtils, network, pagination, ssrf (45 tests including async DNS, edge cases, URL parsing), tenantContext
- logger (pino configuration, levels, child logger), tenant (getTenantSlug extraction)

## Migration Services with Unit Tests
- parsers/generic-csv (CSV parsing, delimiter detection, validation, sampling)
- parsers/servicenow (XML/JSON parsing, format detection, field flattening)
- mappers/field-mapper (field mapping, transformations, validation, suggestions)
- importers/incident-importer (import, rollback, duplicate handling, update existing)
- importers/request-importer (import, rollback, duplicate handling, update existing)

## Frontend Lib with Unit Tests
- lib/export (CSV/JSON/PDF export utilities, header formatting, value formatting)
- lib/api (token management, CSRF handling, auth API, issues API, problems API, changes API, applications API, catalog API, notifications API, users API, groups API, roles API, reports API, dashboard API, cloud API, oncall API, knowledge base API, settings API, SLA API, asset API, workflow API, integrations API, email API)
- stores/auth (login, logout, checkAuth, persistence, hydration)
- hooks/useApi (70 tests - issues, problems, changes, applications, catalog, users, groups, notifications, reports, dashboard, cloud, oncall, shift swaps, knowledge base, SLA, workflow, assets, email, integrations, service requests, CAB meetings)

## E2E Test Infrastructure
- **Location**: backend/tests/e2e/
- **Framework**: Playwright (v1.57.0)
- **Test Files**: health.e2e.ts, csrf.e2e.ts, critical-flows.e2e.ts, webhook-notifications.e2e.ts
- **Status**: Infrastructure exists, requires Redis/PostgreSQL to run
- **Run Command**: npm run test:e2e

## Current Task Queue
1. Run E2E tests in CI/CD with infrastructure
2. Performance optimization and monitoring
3. Security audit and hardening
4. Code coverage analysis and improvement

## Integration Tests
- auth (registration, login, logout, token refresh, password management)
- issues (CRUD, filtering, comments, assignment, status changes)
- changes (CRUD, filtering, state transitions, risk assessment, comments)
- requests (CRUD, filtering, approval workflow, cancel, rejection)
- problems (CRUD, filtering, root cause, workaround, known errors, worklogs)
- catalog (categories CRUD, items CRUD, form schemas, request submission)
- oncall (schedules CRUD, rotation members, who-is-on-call, overrides, shift swaps)
- applications (CRUD, filtering, environments, health checks, status management)
- cloud (accounts CRUD, sync, connection testing, resources, costs, resource-application mapping)
- health (health check, readiness, API response format)
- users (CRUD, filtering, pagination, groups, roles assignment) - 21 tests
- groups (CRUD, members, filtering by type, search, pagination) - 23 tests
- assets (CRUD, stats, filtering by type/category/status) - 20 tests
- knowledge (articles CRUD, categories, search, filtering by status/type/visibility) - 20 tests
- sla (policies CRUD, targets CRUD, stats, metrics, validation) - 38 tests
- workflow (rules CRUD, toggle, logs, test/dry-run, fields/actions by entity type) - 58 tests
- dashboard (overview, mobile, trends, health distribution, activity, SLA compliance, cloud costs) - 43 tests
- settings (tenant info, theme, notifications, security, email settings) - 39 tests
- roles (CRUD, permissions listing, system role protection) - 30 tests
- notifications (list, filters, mark read, preferences, channels, templates) - 38 tests
- reporting (templates, schedules, executions, saved reports, widgets, dashboard data) - 53 tests
- jobs (queue statuses, scheduler, pause/resume, retry-failed, clean-failed) - 23 tests
- email (SendGrid/Mailgun/generic webhooks, configs CRUD, logs, test endpoint) - 29 tests
- audit (query, entity history, user activity, security events, failed logins, summaries, settings, cleanup) - 24 tests
- attachments (presigned upload, direct upload, list, download/view URLs, delete, storage usage) - 21 tests
- sso (SAML/OIDC login initiation, callbacks, logout, SAML metadata) - 20 tests
- integrations (API keys CRUD/validate, webhooks CRUD/test/deliveries, integrations CRUD/test/logs, metadata endpoints) - 37 tests
- migration (upload, execute, job status, list jobs, mapping templates CRUD, rollback, errors pagination) - 46 tests
- request-approval-race (concurrent approval race condition tests - skipped, requires DB)

## Recent Commits
- (uncommitted) test(network): Add 4 IPv6 edge case tests (link-local, zone identifiers, full notation, embedded IPv4)
- (uncommitted) perf(services): Parallelize email sendBatch, webhook trigger, and workflow notifications for 10x throughput
- (uncommitted) test(integrations): Add 4 tests for Teams/Slack failure edge cases (webhook error, auth failures)
- d0167be sec(integrations): Fix HMAC signature security and add job processor tests
- f6ed2ce sec(email): Add webhook signature verification for SendGrid and Mailgun
- (uncommitted) sec(schema): Use centralized getSchemaName for consistent sanitization in SSO, integrations, email-inbound, migration services
- (uncommitted) test(email): Add 22 tests for webhook signature verification (Mailgun HMAC, SendGrid secret)
- (uncommitted) test(notification-delivery): Add 3 SMS delivery tests (success, error, truncation) with Twilio mock
- (uncommitted) test(integrations): Add 14 tests for testConnection (webhook, ServiceNow, Jira, PagerDuty) and syncIntegration not found
- (uncommitted) test(ssrf): Add 8 more SSRF edge case tests (URL encoded async, userinfo, metadata paths)
- (uncommitted) test(integrations): Add 3 tests for unknown integration type testConnection paths
- (uncommitted) test(report-export): Add Chrome detection test for PDF export fallback
- (uncommitted) test(storage): Add 15 S3 storage path tests for download, upload, delete, presigned URLs
- (uncommitted) test(notification-delivery): Add batch delay test for bulk delivery >10 notifications
- (uncommitted) test(requests): Add 2 reject flow tests for approval not found and already processed
- (uncommitted) test(email-inbound): Add 2 tests for JSON string parsing of blocked/allowed domains
- (uncommitted) test(shiftSwaps): Add 3 NotFoundError tests for reject/adminApprove/complete methods
- (uncommitted) test(integrations): Add 2 tests for syncIntegration error re-throw and handleSyncFailure catch paths
- (uncommitted) test(changes): Add 9 tests for updateTask/startTask/completeTask/deleteTask edge cases
- (uncommitted) test(changes): Add 2 edge case tests for getComments/addComment NotFoundError paths
- (uncommitted) refactor(types): Improve FastifyRequest type declarations, remove as any casts for tenant/startTime
- (uncommitted) chore: Remove unused integrations.ts.backup file
- (uncommitted) refactor(app): Replace as any with proper type guard for error handling
- (uncommitted) fix(frontend): Exclude test files from tsconfig.json, fix React Query mock type assertions in test files
- (uncommitted) test(ssrf): Add 8 new tests for URL parsing edge cases, DNS resolution, and authentication credentials
- (uncommitted) test(ssrf,cache): Add 12 new tests for SSRF edge cases and cache error handling paths
- (uncommitted) test(encryption,validation): Add 12 new tests for encryption edge cases and validateTenantContext
- (uncommitted) test(ssrf,cache): Add 16 new tests for SSRF async validation and cache service edge cases
- (uncommitted) perf(sla): Replace N+1 target creation inserts with batch UNNEST query
- (uncommitted) perf(email): Replace N+1 delivery tracking inserts with batch UNNEST query
- (uncommitted) perf(storage): Add caching to attachment lookup methods
- (uncommitted) perf(email-inbound): Add caching to email config lookup methods
- (uncommitted) perf(issues): Add caching to getComments and getWorklogs methods
- (uncommitted) perf(notification-delivery): Replace N+1 status updates with batch UNNEST query
- (uncommitted) test(integration): Add 46 new integration tests for migration routes
- (uncommitted) test(integration): Add 57 new integration tests for sso and integrations routes
- (uncommitted) test(integration): Add 74 new integration tests for email, audit, attachments routes
- (uncommitted) test(integration): Add 144 new integration tests for roles, notifications, reporting, jobs routes
- (uncommitted) test(integration): Add 120 new integration tests for users, groups, assets, knowledge, and sla routes
- (uncommitted) test(integration): Add 123 new route-level integration tests for requests, problems, catalog, oncall, applications, and cloud
- (uncommitted) test(frontend): Add 31 tests for problems/[id] modals (Assign, Link Issue, Root Cause, Workaround, Link KB)
- (uncommitted) test(frontend): Add 53 comprehensive tests for CAB meetings page (tabs, modals, mutations)
- (uncommitted) test(frontend): Add 203 new tests for detail pages (changes/[id], requests/[id], issues/[id])
- (uncommitted) test(sso): Add comprehensive SSO service unit tests (17 tests - getDefaultProvider, createProvider, updateProvider)
- (uncommitted) test(integrations): Add comprehensive integrations service unit tests (52 tests - apiKeys, webhooks, integrations CRUD, caching)
- (uncommitted) test(audit): Add comprehensive audit service unit tests (50 tests - log, query, getEntityHistory, getUserActivity, getSecurityEvents, cleanupOldLogs)
- (uncommitted) test(frontend): Add 153 new tests for dashboard pages (cloud/resources/[id], applications/[id]/edit, reports/[id], reports/builder)
- (uncommitted) test(frontend): Add 111 new tests for auth/dashboard pages (applications/new, applications/[id], catalog/[id], reset-password, verify-email, landing page)
- (uncommitted) test(hooks): Add useApi hook tests (70 tests - React Query hooks for all APIs)
- (uncommitted) test(app): Add app.ts tests (16 tests - error handling, plugins, buildApp)
- (uncommitted) test(migration): Add incident and request importer tests (33 tests)
- (uncommitted) chore: Remove misplaced auth.test.ts and empty validation.ts files
- (uncommitted) test(frontend): Add auth store tests (16 tests - login, logout, checkAuth)
- (uncommitted) test(frontend): Complete API client test coverage (247 tests - all API modules)
- (uncommitted) test(frontend): Add export utility tests (18 tests)
- (uncommitted) test(teams): Add Teams service unit tests (25 tests)
- (uncommitted) test(sso,slack): Add SSO and Slack service tests (46 tests)
- (uncommitted) test(migration): Add migration service unit tests (96 tests)
- (uncommitted) test(docs): Add OpenAPI schema definitions tests (39 tests)
- (uncommitted) test(utils): Add logger and tenant utils tests (23 tests)
- (uncommitted) test(jobs): Add jobs/index module tests (26 tests)
- (uncommitted) test(routes): Complete route test coverage (all 28 routes with tests)
- c05b710 test(changes): Add comprehensive unit tests for ChangesService

## Mistakes and Learnings
- Security: Never use empty string fallback for HMAC secrets (webhook.secret || '') - always validate secret exists first
- When improving type safety, check for type declaration conflicts with external modules (@fastify/jwt extends FastifyRequest.user, so avoid redeclaring it)
- Always read CONTINUITY.md before starting work
- Run tests before and after changes
- Commit atomically with clear messages
- Check for act() warnings in React tests (async state updates)
- Use vi.hoisted() for mocks needed by module-level code
- Use fixed timestamps in time-sensitive tests to avoid race conditions
- Mock BullMQ Worker/Queue properly with captured processors
- E2E tests require live Redis and PostgreSQL infrastructure
- When text appears in both button labels and modal titles, use screen.getByRole('heading') for specificity
- UI navigation tests should be more focused on API calls than button clicking to avoid brittleness
- For loading spinner tests, make the API mock hang with `new Promise(() => {})` to see loading state
- When form inputs lack proper htmlFor/id associations, use getByPlaceholderText instead of getByLabelText
- Use fireEvent.submit() to bypass HTML5 required validation when testing custom form validation
- Use fireEvent.click() instead of userEvent.click() when state transitions don't work with fake timers
- When multiple elements share same text (e.g., badges in header and sidebar), use getAllByText and index
- When modal opens over table and both show same text (e.g., "Attendees"), use getAllByText().length check instead of getByText
- Use mockReset() before mockResolvedValue when overriding mocks in individual tests
- Avoid vi.useFakeTimers() in tests with async waitFor() - it causes timeouts
- For select elements without accessible labels, use document.querySelectorAll('select') and find by option text
- When modal text overlaps with page text (e.g., "Cancel Request"), use getAllByText and assert on count
- React Query mutation hooks use mutateAsync/isPending, not trigger/isMutating - check component code for actual prop names
- When mocking mutations, match the exact property names used in the component (mutateAsync vs trigger)
- Integration tests must generate tokens inside test functions using `generateTestToken(app)`, NOT at module level where app is undefined
- When optimizing N+1 queries to batch updates, use UNNEST with arrays of arrays for PostgreSQL batch inserts
- In Next.js projects with Vitest, exclude test files from tsconfig.json to avoid TS2582 errors (test types are handled by vitest separately)

## Performance Improvements
- notification-delivery.ts: Replaced N+1 updateDeliveryStatus calls with single batch UNNEST query (N DB calls -> 1 DB call)
- issues.ts: Added caching to getComments() and getWorklogs() methods with 5-minute TTL and cache invalidation on add
- email-inbound.ts: Added caching to getEmailConfig(), getEmailConfigById(), listEmailConfigs() with 10-minute TTL and cache invalidation on CRUD
- storage.ts: Added caching to listByEntity(), getById(), getStorageUsage() with 5-10 minute TTL and cache invalidation on upload/delete
- email/index.ts: Replaced N+1 trackDelivery inserts with single batch UNNEST query (N DB calls -> 1 DB call)
- email/index.ts (Iteration 16): sendBatch now processes emails in parallel batches of 10 instead of sequential for 10x throughput improvement
- integrations.ts (Iteration 16): webhook.trigger now processes multiple webhooks in parallel using Promise.allSettled
- workflow.ts (Iteration 16): send_notification action now queues notifications in parallel instead of sequential
- sla.ts: Replaced N+1 target creation inserts with single batch UNNEST query (N DB calls -> 1 DB call)

## Security Audit Findings (Iteration 14)
1. **Fixed**: HMAC signature using empty string fallback - now validates secret exists
2. **Fixed**: Email webhook endpoints now have signature verification (SendGrid header secret, Mailgun HMAC)
3. **Fixed**: SQL schema interpolation - all services now use centralized tenantService.getSchemaName() for consistent sanitization
4. **Finding**: Cookie secure flag can be disabled via environment variable

## Next Actions
1. Add E2E test scenarios for critical user flows
2. Improve SSRF utility test coverage (currently 68.57%)
3. Add tests for report-export PDF generation paths (currently 82.86%)
4. Review network utility edge cases (currently 83.33%)
