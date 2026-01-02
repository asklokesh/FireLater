# FireLater Product Requirements Document (PRD)

**Version**: 1.0
**Generated**: 2026-01-02
**Status**: Active Development
**Classification**: Living Document (Auto-Generated from Codebase Analysis)

---

## Executive Summary

FireLater is a lightweight IT Service Management (ITSM) SaaS platform designed for organizations requiring core IT operations capabilities without enterprise-grade complexity or cost. Built on modern technologies (Fastify, Next.js, PostgreSQL, Redis), the platform implements schema-per-tenant multi-tenancy and provides essential ITSM features including service catalog, issue tracking, change management, on-call scheduling, and cloud resource integration.

**Current State**: Production-ready core features (~71,500 LOC, 63 database tables, 100+ API endpoints)
**Maturity Level**: MVP+ with identified enhancement opportunities
**Target Market**: Mid-market organizations (50-500 employees) seeking affordable ITSM

---

## 1. Product Vision & Goals

### Vision Statement
Democratize IT service management by providing enterprise-class ITSM capabilities at SMB-accessible pricing with modern UX and cloud-native architecture.

### Strategic Goals
1. **Simplicity**: 80% faster onboarding vs. ServiceNow/Jira Service Management
2. **Affordability**: 60% cost reduction compared to enterprise alternatives
3. **Modern UX**: Consumer-grade interface with <500ms average response time
4. **Cloud-Native**: Multi-cloud integration (AWS, Azure, GCP) out-of-the-box
5. **Extensibility**: Open API architecture for custom integrations

### Success Metrics (Current Targets)
- **Uptime**: 99.9% availability SLA
- **Performance**: <200ms API response time (p95)
- **Adoption**: 1,000 active tenants by Q4 2026
- **NPS**: >50 Net Promoter Score
- **Test Coverage**: >80% code coverage (backend/frontend)

---

## 2. Current System Overview

### 2.1 Core Features (Implemented)

#### Feature 1: Service Catalog & Request Management
**Purpose**: Self-service portal for requesting IT services and resources
**Key Capabilities**:
- Drag-and-drop catalog builder with customizable forms
- Service bundling (group related services)
- Multi-stage approval workflows with delegation
- SLA tracking on request lifecycle
- Request status tracking with email notifications
- Approval templates for common workflows

**Technical Implementation**:
- Routes: `/v1/catalog/*`, `/v1/requests/*`
- Services: `catalog.ts`, `workflow.ts`
- Tables: `catalog_items`, `catalog_bundles`, `service_requests`, `request_approvals`
- Frontend: `/requests`, `/catalog` pages

**Status**: ✅ Complete (with known performance gaps)

---

#### Feature 2: Issue Management
**Purpose**: Incident and service request tracking system
**Key Capabilities**:
- Issue creation with priority/severity classification
- Assignment to users/teams with workload balancing
- Status tracking (Open → In Progress → Resolved → Closed)
- Comments and worklogs with time tracking
- Impact tracking by linked applications
- SLA breach detection and alerts
- Issue categorization and tagging

**Technical Implementation**:
- Routes: `/v1/issues/*`
- Services: `issues.ts`, `sla.ts`
- Tables: `issues`, `issue_comments`, `issue_worklogs`, `issue_status_history`
- Frontend: `/issues` with list/detail views

**Status**: ✅ Complete (missing comprehensive tests)

---

#### Feature 3: Change Management
**Purpose**: Structured change control with risk assessment and approvals
**Key Capabilities**:
- Change request lifecycle (RFC → Approved → Scheduled → Implemented → Closed)
- Change window/maintenance window scheduling
- Risk assessment (Low/Medium/High/Critical)
- Task breakdown within changes
- CAB (Change Advisory Board) meeting management
  - Attendee tracking
  - Meeting decisions and voting
  - Meeting minutes with timestamps
- Change calendar view for scheduling conflicts
- Rollback planning

**Technical Implementation**:
- Routes: `/v1/changes/*`
- Services: `changes.ts` (39KB, most complex service)
- Tables: `changes`, `change_tasks`, `change_impacts`, `cab_meetings`, `cab_meeting_attendees`, `cab_meeting_decisions`
- Frontend: `/changes`, `/changes/cab` pages

**Status**: ✅ Complete (complex logic, needs more tests)

---

#### Feature 4: Problem Management
**Purpose**: Root cause analysis and known error management
**Key Capabilities**:
- Problem record creation with RCA tools
- Root Cause Analysis frameworks:
  - 5 Whys methodology
  - Fishbone diagram (Ishikawa)
  - Summary generator
- Known error database
- Problem-incident linking (many-to-one)
- Financial impact tracking
- Resolution documentation
- Trend analysis across problems

**Technical Implementation**:
- Routes: `/v1/problems/*`
- Services: `problems.ts`
- Tables: `problems`, `problem_incidents`, `financial_impact`
- Frontend: `/problems` with RCA visualizations

**Status**: ✅ Complete (RCA tools basic implementation)

---

#### Feature 5: On-Call Management
**Purpose**: Engineer scheduling and escalation management
**Key Capabilities**:
- Calendar-based schedule visualization
- Rotation support:
  - Daily rotations
  - Weekly rotations
  - Custom rotation patterns
- Shift overrides and swap functionality
  - Approval workflow for swaps
  - Reason tracking for overrides
- Escalation policy definitions
- iCal export for external calendar subscriptions
- Timezone handling for distributed teams
- Multi-level escalation chains

**Technical Implementation**:
- Routes: `/v1/oncall/*`
- Services: `oncall.ts` (33KB, complex scheduling logic)
- Tables: `oncall_schedules`, `oncall_rotations`, `shift_swap_requests`, `ical_subscriptions`
- Frontend: `/oncall`, `/oncall/schedules/:id` pages

**Status**: ✅ Complete (timezone edge cases need testing)

---

#### Feature 6: Application Registry & Health Scoring
**Purpose**: CMDB-lite with automated health monitoring
**Key Capabilities**:
- Application inventory with unique IDs (APP-00001, etc.)
- Environment management (dev, staging, prod)
- Tier classification (P1/P2/P3/P4 for priority)
- Owner and team assignments
- Automated health scoring algorithm:
  - Issue volume impact
  - Change success rate
  - SLA performance
  - Incident frequency
  - Computed periodically via background jobs
- Application dependency mapping
- Multi-cloud resource linkage

**Technical Implementation**:
- Routes: `/v1/applications/*`, `/v1/health/*`
- Services: `health.ts`, background job in `jobs/processors/healthScores.ts`
- Tables: `applications`, `environments`, `application_health`
- Frontend: `/applications` with health distribution charts

**Status**: ✅ Complete (health algorithm basic)

---

#### Feature 7: Cloud Integration
**Purpose**: Multi-cloud resource discovery and cost tracking
**Key Capabilities**:
- **AWS Integration**:
  - EC2 instance discovery
  - RDS database tracking
  - Lambda function inventory
  - S3 bucket monitoring
  - Cost Explorer integration
- **Azure Integration**:
  - Compute resource discovery
  - Resource group management
  - Cost management integration
- **GCP Integration**:
  - Compute Engine tracking
  - BigQuery dataset monitoring
  - Billing API integration
- Automated resource sync (periodic background jobs)
- Cost reporting and trending
- Resource tagging and categorization

**Technical Implementation**:
- Routes: `/v1/cloud/*`, `/v1/integrations/*`
- Services: `cloud.ts`, `integrations.ts`, background job `jobs/processors/cloudSync.ts`
- SDKs: `@aws-sdk/*`, `@azure/*`, `@google-cloud/*`
- Tables: `cloud_providers`, `cloud_resources`, `integrations`
- Frontend: `/cloud` resource explorer

**Status**: ✅ Complete (error handling gaps in sync jobs)

---

### 2.2 Supporting Capabilities

#### Identity & Access Management
- User authentication (local + SSO)
  - SSO providers: Google, Okta, Azure AD (SAML/OIDC)
- JWT + refresh token mechanism
- Role-Based Access Control (RBAC)
  - Predefined roles: Admin, Manager, Agent, Requester
  - Granular permissions (resource:action pairs)
- Group/team hierarchies
- User invitation flow with email verification

#### Notification System
- Multi-channel delivery:
  - Email (SendGrid integration)
  - SMS (Twilio integration)
  - Slack (Web API)
  - Microsoft Teams (webhook)
  - In-app notifications
- Notification templates with variable substitution
- User preferences (per-channel opt-in/opt-out)
- Delivery tracking and retry logic (partial implementation)
- BullMQ queue for async processing

#### Knowledge Base
- Article creation with rich text (Markdown support)
- Category hierarchization
- Full-text search (PostgreSQL FTS)
- Article versioning (basic)
- Attachment support (files, images)
- Access control per article

#### Asset Management
- Hardware/software inventory
- Asset lifecycle tracking
- Configuration item (CI) relationships
- Asset history and audit trail
- Bulk import/export

#### Reporting & Analytics
- Dashboard with real-time widgets:
  - Issue trends (line chart)
  - Health distribution (pie chart)
  - SLA compliance metrics
  - 30-second auto-refresh
- Custom report builder (basic UI)
- Excel export (ExcelJS)
- PDF export (Puppeteer)
- Scheduled report generation (background job)

#### Workflow Automation
- Visual workflow builder (basic)
- Approval chain definitions
- Conditional routing (basic logic)
- Automation triggers:
  - On creation
  - On status change
  - On field update
- Workflow execution history

#### Email Management
- Inbound email parsing (reply-to-ticket)
- Outbound email templates
- Email threading and conversation tracking
- Email verification tokens

#### Audit & Compliance
- Comprehensive audit logging:
  - Who (user)
  - What (action)
  - When (timestamp)
  - Where (IP address, user agent)
  - Before/After (change tracking)
- Audit log query interface
- Retention policies

---

### 2.3 Technical Architecture

#### Frontend Architecture
**Framework**: Next.js 16 (App Router) with React 19
**Styling**: TailwindCSS 4 with shadcn/ui components
**State Management**:
- TanStack Query (server state, caching)
- Zustand (client state, auth store)

**Key Patterns**:
- Server-side rendering (SSR) for public pages
- Client components for interactive features
- Optimistic updates with React Query
- Route-based code splitting
- API client abstraction (axios-based)

**Directory Structure**:
```
/app/(auth)       - Authentication pages
/app/(dashboard)  - Protected pages with sidebar layout
/components/ui    - Base UI components
/hooks            - Custom React hooks
/stores           - Zustand stores
/lib              - Utilities (API client, export helpers)
```

---

#### Backend Architecture
**Framework**: Fastify 5 (high-performance Node.js framework)
**ORM**: Drizzle ORM (type-safe SQL)
**Validation**: Zod schemas for all inputs

**Key Patterns**:
- Route → Service → Database layering
- Middleware pipeline:
  - CORS (configurable origins)
  - Helmet (security headers)
  - Rate limiting (per-IP, per-tenant)
  - JWT authentication
  - Audit logging
- Error handling with standardized responses
- Pagination helpers (limit/offset)
- SSRF protection for user-provided URLs

**Directory Structure**:
```
/routes         - API endpoint handlers
/services       - Business logic layer
/jobs           - Background job processors
/migrations     - Database schema changes
/middleware     - Request/response interceptors
/utils          - Shared utilities
/docs           - Swagger/OpenAPI definitions
```

---

#### Database Architecture
**Engine**: PostgreSQL 15+
**Multi-Tenancy**: Schema-per-tenant isolation

**Schema Structure**:
```
public                  - Shared tables (tenants, plans)
tenant_<id>             - Per-tenant schema (63 tables)
  ├─ Identity (users, roles, permissions)
  ├─ Applications (apps, environments, health)
  ├─ SLA (policies, targets, schedules)
  ├─ Issues (issues, comments, worklogs)
  ├─ Catalog (items, bundles, requests)
  ├─ Changes (changes, tasks, CAB meetings)
  ├─ Problems (problems, incidents, RCA)
  ├─ Notifications (channels, templates, delivery)
  ├─ Cloud (providers, resources)
  ├─ Assets (inventory, relationships)
  ├─ Knowledge (articles, categories)
  ├─ Workflows (definitions, executions)
  └─ Audit (audit_logs, tokens)
```

**Key Indexes** (implemented):
- Primary keys (auto-generated IDs)
- Unique constraints (email, app IDs)
- Foreign key indexes
- **Missing**: Full-text search indexes on knowledge base, composite indexes for common queries

---

#### Background Job Architecture
**Queue**: BullMQ (Redis-backed)
**Processors**:
- `notifications.ts` - Email/SMS/Slack delivery
- `healthScores.ts` - Periodic health score computation
- `slaBreaches.ts` - SLA breach detection
- `cloudSync.ts` - Cloud resource synchronization
- `cleanup.ts` - Data retention cleanup
- `scheduledReports.ts` - Report generation

**Configuration**:
- Retry logic: Basic (needs enhancement)
- Rate limiting: Per-processor limits
- Dead letter queue: Implemented
- Job monitoring: Basic dashboard

---

#### Integration Architecture
**Patterns**: REST API clients, webhook handlers
**Integrations**:
- **Cloud Providers**: AWS SDK, Azure SDK, GCP SDK
- **Communication**: SendGrid, Twilio, Slack API, Teams webhook
- **SSO**: OAuth2/OIDC, SAML 2.0
- **Storage**: AWS S3, local filesystem fallback

**Webhook Security**:
- HMAC signature verification
- IP allowlisting
- Rate limiting per endpoint

---

### 2.4 Deployment & Infrastructure

#### Containerization
**Docker**: Multi-stage builds for backend + frontend
**Compose**: `docker-compose.yml` for full stack
- Backend service (Fastify)
- Frontend service (Next.js)
- PostgreSQL 15
- Redis 7
- (Optional) Monitoring stack (Prometheus, Grafana)

#### CI/CD
**Platform**: GitHub Actions
**Workflows**:
- `.github/workflows/ci.yml` - Lint, test, build on every push/PR
- `.github/workflows/deploy.yml` - Docker image build + push on main/tags

**Pipeline Steps**:
1. Lint (ESLint backend + frontend)
2. Type check (TypeScript)
3. Unit tests (Vitest)
4. Integration tests (Playwright)
5. Docker build
6. Image push to registry

**Missing**: E2E tests in CI, deployment to staging/production environments

---

#### Monitoring (Partial Implementation)
**Setup**: `monitoring/` directory with Prometheus + Grafana configs
**Metrics Collected**:
- HTTP request duration (p50, p95, p99)
- Error rates by endpoint
- Database connection pool utilization
- Redis operation latency
- Background job queue lengths

**Missing**:
- Application performance monitoring (APM)
- Error tracking (e.g., Sentry integration)
- Log aggregation (e.g., ELK stack)
- Uptime monitoring (synthetic checks)

---

## 3. Gap Analysis & Technical Debt

### 3.1 CRITICAL GAPS (Immediate Action Required)

#### GAP-001: Frontend Testing Absence
**Severity**: 🔴 CRITICAL
**Impact**: UI regressions undetected, deployment risk
**Current State**:
- 0 test files in `frontend/`
- No unit tests for React components
- No integration tests for user flows
- No accessibility tests (WCAG compliance unknown)

**Recommendation**:
- Implement Vitest + React Testing Library
- Add component unit tests (target: 80% coverage)
- Add E2E tests with Playwright (critical user flows)
- Add accessibility testing with axe-core

**Effort Estimate**: 3-4 weeks
**Priority**: P0 (Blocker for production confidence)

---

#### GAP-002: N+1 Query Performance Issues
**Severity**: 🔴 CRITICAL
**Impact**: Slow response times, poor user experience at scale
**Affected Routes**:
- `/v1/kb/*` - Knowledge base article loading (articles + categories fetched separately)
- `/v1/oncall/*` - Schedule rotations fetching user details in loop
- `/v1/assets/*` - Asset relationships loaded sequentially

**Example** (`backend/src/routes/knowledge.ts`):
```typescript
// Current: N+1 query
const articles = await db.select().from(knowledgeArticles);
for (const article of articles) {
  article.category = await db.select().from(categories).where(eq(categories.id, article.categoryId));
}

// Should be: Single join query
const articles = await db.select()
  .from(knowledgeArticles)
  .leftJoin(categories, eq(knowledgeArticles.categoryId, categories.id));
```

**Recommendation**:
- Refactor to use JOIN queries
- Add database query monitoring (pg-stat-statements)
- Implement query result caching (Redis)

**Effort Estimate**: 1-2 weeks
**Priority**: P0 (Performance blocker)

---

#### GAP-003: Missing Error Handling in Background Jobs
**Severity**: 🔴 CRITICAL
**Impact**: Silent failures, data inconsistency, failed notifications
**Affected Files**:
- `backend/src/jobs/processors/notifications.ts` - Email/SMS delivery failures not retried properly
- `backend/src/jobs/processors/cloudSync.ts` - API failures cause sync to halt
- `backend/src/routes/integrations.ts` - Webhook deliveries lack retry logic

**Current Behavior**:
- Job fails → moves to failed queue → no retry
- No exponential backoff
- No dead letter processing
- No alerting on repeated failures

**Recommendation**:
- Implement BullMQ retry strategies:
  ```typescript
  queue.add('sendEmail', data, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 }
  });
  ```
- Add dead letter queue monitoring
- Implement alerting for high failure rates

**Effort Estimate**: 1 week
**Priority**: P0 (Data integrity risk)

---

#### GAP-004: Input Validation Vulnerabilities
**Severity**: 🔴 CRITICAL (SECURITY)
**Impact**: SQL injection, XSS, data corruption risks
**Affected Routes**:
- `/v1/reports/*` - Date range parameters not validated (SQL injection risk)
- `/v1/catalog/*` - Form field definitions accept arbitrary JSON
- `/v1/workflow/*` - Workflow step conditions not sanitized

**Example Vulnerability** (`backend/src/routes/reporting.ts`):
```typescript
// UNSAFE: User input directly in SQL
app.get('/reports/custom', async (req, reply) => {
  const { startDate, endDate } = req.query;
  const results = await db.raw(`
    SELECT * FROM issues
    WHERE created_at BETWEEN '${startDate}' AND '${endDate}'
  `); // SQL injection risk
});
```

**Recommendation**:
- Add Zod validation schemas for ALL route inputs
- Use parameterized queries (Drizzle ORM prevents most SQL injection)
- Sanitize user-provided HTML/Markdown
- Implement CSRF protection

**Effort Estimate**: 2 weeks
**Priority**: P0 (Security vulnerability)

---

#### GAP-005: No Caching Strategy for High-Traffic Endpoints
**Severity**: 🟡 HIGH
**Impact**: Database overload, slow response times
**Affected Routes**:
- `/v1/kb/search` - Full-text search hits database every request
- `/v1/dashboard/*` - Dashboard metrics recalculated on every load
- `/v1/catalog/*` - Catalog items fetched fresh every time

**Current State**:
- Redis available but underutilized
- No cache invalidation strategy
- No cache hit/miss metrics

**Recommendation**:
- Implement Redis caching layer:
  ```typescript
  const cacheKey = `kb:search:${query}`;
  let results = await redis.get(cacheKey);
  if (!results) {
    results = await db.searchKnowledge(query);
    await redis.set(cacheKey, results, 'EX', 300); // 5min TTL
  }
  ```
- Add cache invalidation on updates
- Implement cache warming for common queries

**Effort Estimate**: 1 week
**Priority**: P1 (Performance improvement)

---

### 3.2 HIGH PRIORITY GAPS

#### GAP-006: Multi-Tenant Schema Isolation Validation
**Severity**: 🟡 HIGH (SECURITY)
**Impact**: Potential cross-tenant data leakage
**Issue**: Tenant schema switching middleware doesn't validate schema existence before switching

**Current Code** (`backend/src/middleware/tenant.ts`):
```typescript
// UNSAFE: No validation if schema exists
fastify.addHook('preHandler', async (request, reply) => {
  const tenantId = request.headers['x-tenant-id'];
  await db.raw(`SET search_path TO tenant_${tenantId}, public`);
});
```

**Recommendation**:
- Validate tenant existence before schema switch
- Add schema existence cache (Redis)
- Log schema switch attempts for audit
- Add integration tests for tenant isolation

**Effort Estimate**: 3-5 days
**Priority**: P1 (Security hardening)

---

#### GAP-007: Incomplete Test Coverage
**Severity**: 🟡 HIGH
**Impact**: Regressions slip through, maintenance burden increases
**Current Coverage**:
- Backend: ~40% coverage (26 test files, 374 tests)
- Frontend: 0% coverage (0 test files)
- E2E: 1 test file (health check only)

**Missing Test Categories**:
- Auth edge cases (password complexity, token expiration, multi-tenant isolation)
- Workflow approval chains (complex conditional routing)
- On-call timezone handling (DST transitions)
- Integration webhook error scenarios
- SLA breach detection accuracy

**Recommendation**:
- Target 80% backend coverage (add ~50 test files)
- Target 70% frontend coverage (add ~40 test files)
- Add 20+ E2E test scenarios (critical user paths)

**Effort Estimate**: 4-6 weeks
**Priority**: P1 (Quality assurance)

---

#### GAP-008: Notification Delivery Reliability
**Severity**: 🟡 HIGH
**Impact**: Users miss critical alerts (SLA breaches, approvals)
**Issues**:
- Email delivery failures not retried (SendGrid API errors)
- SMS delivery limited to Twilio (no fallback)
- Webhook deliveries fail silently
- No delivery status tracking in UI

**Recommendation**:
- Implement retry logic with exponential backoff
- Add fallback notification channels (email → SMS → Slack)
- Build notification delivery dashboard
- Add webhook delivery status tracking

**Effort Estimate**: 2 weeks
**Priority**: P1 (User experience)

---

#### GAP-009: Workflow Automation Limitations
**Severity**: 🟡 HIGH
**Impact**: Complex business processes not automatable
**Current Limitations**:
- No parallel approval paths (only sequential)
- Conditional routing basic (simple if/else only)
- No loop support for iterative workflows
- No external API calls from workflow steps

**Recommendation**:
- Implement parallel approval support
- Add advanced conditional logic (AND/OR/NOT)
- Add integration actions (HTTP requests, script execution)
- Visual workflow debugger

**Effort Estimate**: 3-4 weeks
**Priority**: P1 (Feature completeness)

---

### 3.3 MEDIUM PRIORITY GAPS

#### GAP-010: Documentation Deficit
**Severity**: 🟢 MEDIUM
**Current State**:
- API documentation: Auto-generated Swagger (basic)
- Architecture documentation: ARCHITECTURE.md exists but outdated
- Deployment guide: Missing
- Developer onboarding: No contributing guide
- ADRs (Architecture Decision Records): None

**Recommendation**:
- Update ARCHITECTURE.md with current state
- Create deployment runbooks (AWS, Azure, GCP, Docker)
- Write API integration guide for third-party developers
- Add ADRs for major architectural decisions
- Create video walkthrough for developers

**Effort Estimate**: 2 weeks
**Priority**: P2 (Developer experience)

---

#### GAP-011: Limited Dashboard Visualizations
**Severity**: 🟢 MEDIUM
**Current Charts**:
- Health distribution (pie chart)
- Issue trends (line chart)
- SLA compliance (basic metric)

**Missing Visualizations**:
- Change success rate over time
- On-call escalation frequency
- Knowledge base search trends
- Cloud cost trending
- User activity heatmaps

**Recommendation**:
- Add 10+ additional chart types
- Implement custom dashboard builder (drag-and-drop widgets)
- Add export to PNG/PDF for presentations

**Effort Estimate**: 2-3 weeks
**Priority**: P2 (User experience)

---

#### GAP-012: Mobile Native Applications
**Severity**: 🟢 MEDIUM
**Current State**: Web-only (responsive design)
**User Request**: Mobile apps for on-call engineers, approvers

**Recommendation**:
- Build React Native apps (iOS + Android)
- Features:
  - Push notifications for on-call alerts
  - Quick approval workflows
  - Issue triage interface
  - On-call schedule viewer
- Leverage existing API (no backend changes needed)

**Effort Estimate**: 8-12 weeks
**Priority**: P2 (Market expansion)

---

### 3.4 LOW PRIORITY GAPS

#### GAP-013: Internationalization (i18n)
**Current State**: US English only
**Impact**: Limits international market expansion
**Recommendation**: Implement next-intl for frontend, i18next for backend
**Priority**: P3

#### GAP-014: Accessibility (WCAG 2.1 AA Compliance)
**Current State**: Unknown compliance level
**Impact**: Excludes users with disabilities, potential legal risk
**Recommendation**: Accessibility audit + remediation
**Priority**: P3

#### GAP-015: Advanced Analytics & AI
**Current State**: Basic reporting only
**Potential Features**:
- Predictive SLA breach warnings (ML model)
- Intelligent ticket routing (NLP)
- Anomaly detection for health scores
- Chatbot for knowledge base queries

**Recommendation**: Exploratory phase (POC with OpenAI API)
**Priority**: P3 (Future innovation)

---

## 4. Enhancement Roadmap

### Phase 1: Stability & Quality (Weeks 1-6)
**Goal**: Achieve production-grade reliability and test coverage

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| STAB-001 | Implement BullMQ retry logic for all background jobs | 1 week | P0 |
| STAB-002 | Add error handling for Redis connection failures | 3 days | P0 |
| STAB-003 | Fix N+1 query issues in knowledge base routes | 1 week | P0 |
| STAB-004 | Fix N+1 query issues in on-call routes | 3 days | P0 |
| STAB-005 | Fix N+1 query issues in asset routes | 3 days | P0 |
| TEST-001 | Build frontend testing infrastructure (Vitest + RTL) | 1 week | P0 |
| TEST-002 | Add unit tests for all React components (80% coverage) | 3 weeks | P0 |
| TEST-003 | Add E2E tests for critical user flows (20 scenarios) | 2 weeks | P1 |
| TEST-004 | Expand backend test coverage to 80% | 2 weeks | P1 |

**Success Criteria**:
- ✅ Zero silent background job failures
- ✅ All routes respond in <200ms (p95)
- ✅ Frontend test coverage >80%
- ✅ Backend test coverage >80%

---

### Phase 2: Security Hardening (Weeks 7-9)
**Goal**: Eliminate security vulnerabilities and achieve SOC 2 readiness

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| SEC-001 | Add Zod validation schemas for all reporting routes | 1 week | P0 |
| SEC-002 | Implement CSRF protection across all forms | 3 days | P0 |
| SEC-003 | Add input sanitization for user-provided HTML/Markdown | 3 days | P0 |
| SEC-004 | Validate tenant schema existence before switching | 2 days | P1 |
| SEC-005 | Add integration tests for multi-tenant isolation | 1 week | P1 |
| SEC-006 | Implement rate limiting per tenant (not just per IP) | 3 days | P1 |
| SEC-007 | Add security headers audit (OWASP compliance) | 2 days | P2 |
| SEC-008 | Penetration testing (external vendor) | 1 week | P1 |

**Success Criteria**:
- ✅ Zero SQL injection vulnerabilities
- ✅ Zero XSS vulnerabilities
- ✅ Multi-tenant isolation verified by penetration test
- ✅ OWASP Top 10 compliance

---

### Phase 3: Performance Optimization (Weeks 10-12)
**Goal**: Achieve <200ms average API response time at scale

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| PERF-001 | Implement Redis caching for knowledge base search | 3 days | P0 |
| PERF-002 | Implement Redis caching for dashboard metrics | 3 days | P1 |
| PERF-003 | Implement Redis caching for catalog items | 2 days | P1 |
| PERF-004 | Add database indexes for frequently queried fields | 1 week | P1 |
| PERF-005 | Optimize batch queries in asset routes | 3 days | P1 |
| PERF-006 | Add database connection pooling optimization | 2 days | P1 |
| PERF-007 | Implement query result pagination for large datasets | 1 week | P1 |
| PERF-008 | Add frontend code splitting for faster initial load | 3 days | P2 |
| PERF-009 | Load testing with 1000 concurrent users | 1 week | P1 |

**Success Criteria**:
- ✅ <200ms average API response time (p95)
- ✅ <1s initial page load time
- ✅ Support 1000 concurrent users without degradation

---

### Phase 4: Feature Enhancements (Weeks 13-20)
**Goal**: Address user-requested features and workflow improvements

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| FEAT-001 | Implement parallel approval workflows | 2 weeks | P1 |
| FEAT-002 | Add advanced conditional logic to workflows | 2 weeks | P1 |
| FEAT-003 | Build notification delivery status dashboard | 1 week | P1 |
| FEAT-004 | Add webhook delivery tracking and retry UI | 1 week | P1 |
| FEAT-005 | Implement fallback notification channels | 1 week | P1 |
| FEAT-006 | Add 10 new dashboard chart types | 2 weeks | P2 |
| FEAT-007 | Build custom dashboard builder (drag-and-drop) | 3 weeks | P2 |
| FEAT-008 | Add external API call actions to workflows | 2 weeks | P2 |

**Success Criteria**:
- ✅ Parallel approvals functional for complex workflows
- ✅ 99% notification delivery rate (with retries)
- ✅ Custom dashboards live for all tenants

---

### Phase 5: Documentation & Developer Experience (Weeks 21-23)
**Goal**: Enable third-party integrations and self-service onboarding

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| DOC-001 | Update ARCHITECTURE.md with current state | 3 days | P2 |
| DOC-002 | Create deployment runbooks (AWS, Azure, GCP) | 1 week | P2 |
| DOC-003 | Write API integration guide for third-party developers | 1 week | P2 |
| DOC-004 | Add ADRs for major architectural decisions | 3 days | P2 |
| DOC-005 | Create video walkthrough for developers | 1 week | P2 |
| DOC-006 | Build interactive API playground (Swagger UI enhancements) | 3 days | P2 |

**Success Criteria**:
- ✅ External developers can integrate in <4 hours
- ✅ Deployment to production in <30 minutes (with runbook)

---

### Phase 6: Mobile & Accessibility (Weeks 24-36)
**Goal**: Expand platform reach to mobile users and ensure accessibility

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| MOBILE-001 | Build React Native app infrastructure | 2 weeks | P2 |
| MOBILE-002 | Implement push notifications (FCM, APNs) | 2 weeks | P2 |
| MOBILE-003 | Build mobile approval workflow UI | 2 weeks | P2 |
| MOBILE-004 | Build mobile on-call schedule viewer | 2 weeks | P2 |
| MOBILE-005 | Build mobile issue triage interface | 2 weeks | P2 |
| MOBILE-006 | iOS App Store submission | 1 week | P2 |
| MOBILE-007 | Android Play Store submission | 1 week | P2 |
| A11Y-001 | Accessibility audit (axe-core + manual testing) | 1 week | P3 |
| A11Y-002 | Remediate WCAG 2.1 AA violations | 3 weeks | P3 |

**Success Criteria**:
- ✅ Mobile apps live in App Store and Play Store
- ✅ WCAG 2.1 AA compliance verified

---

### Phase 7: Advanced Features & AI (Weeks 37-48)
**Goal**: Differentiate with intelligent automation and predictive analytics

| Task ID | Description | Effort | Priority |
|---------|-------------|--------|----------|
| AI-001 | Implement predictive SLA breach warnings (ML model) | 4 weeks | P3 |
| AI-002 | Build intelligent ticket routing (NLP classifier) | 4 weeks | P3 |
| AI-003 | Add anomaly detection for health scores | 3 weeks | P3 |
| AI-004 | Build chatbot for knowledge base queries (OpenAI API) | 3 weeks | P3 |
| I18N-001 | Implement internationalization (5 languages) | 4 weeks | P3 |

**Success Criteria**:
- ✅ SLA breach prediction accuracy >80%
- ✅ Intelligent routing reduces manual triage by 50%
- ✅ Chatbot resolves 40% of knowledge base queries

---

## 5. SDLC Execution Plan

### Development Workflow
1. **Planning**: Bi-weekly sprint planning (2-week sprints)
2. **Development**: Feature branches with PR-based reviews
3. **Testing**: Automated CI/CD pipeline
4. **Deployment**: Blue-green deployment to production
5. **Monitoring**: Post-deployment health checks

### Quality Gates
- ✅ All tests pass (unit, integration, E2E)
- ✅ Code coverage >80% (backend + frontend)
- ✅ Security scan passes (no high/critical vulnerabilities)
- ✅ Performance regression test passes (<200ms p95)
- ✅ Accessibility scan passes (WCAG 2.1 AA)

### Test Phases (Per SDLC Requirement)
1. **UNIT_TESTS**: Vitest (backend), Vitest + RTL (frontend)
2. **API_TESTS**: Supertest integration tests
3. **E2E_TESTS**: Playwright cross-browser tests
4. **SECURITY**: OWASP ZAP automated scans + manual penetration testing
5. **INTEGRATION**: Cross-service integration tests
6. **CODE_REVIEW**: Automated (ESLint, Prettier) + peer review
7. **WEB_RESEARCH**: Competitor analysis, best practices research
8. **PERFORMANCE**: Load testing (k6), query performance analysis
9. **ACCESSIBILITY**: axe-core automated + manual WCAG audit
10. **REGRESSION**: Automated regression suite (critical paths)
11. **UAT**: Beta customer testing (10 pilot customers per feature)

---

## 6. Success Metrics & KPIs

### Product Metrics
- **Uptime**: 99.9% monthly uptime SLA
- **Performance**: <200ms API response time (p95), <1s page load
- **Reliability**: <0.1% background job failure rate
- **Security**: Zero high/critical vulnerabilities in production

### User Metrics
- **Adoption**: 1,000 active tenants by Q4 2026
- **Engagement**: 70% daily active users (DAU/MAU ratio)
- **Satisfaction**: NPS >50, CSAT >4.5/5
- **Support**: <2hr median response time, <1 day resolution time

### Development Metrics
- **Velocity**: 20 story points per sprint (2-week)
- **Quality**: <5% bug escape rate to production
- **Coverage**: >80% test coverage (backend + frontend)
- **Cycle Time**: <3 days from commit to production

---

## 7. Risk Assessment

### Technical Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| N+1 queries cause production outage | Medium | High | Implement query monitoring, add caching layer |
| Multi-tenant data leakage | Low | Critical | Comprehensive integration tests, security audit |
| Background job failures go unnoticed | High | Medium | Add monitoring, alerting, retry logic |
| Third-party API rate limits (AWS, SendGrid) | Medium | Medium | Implement circuit breakers, fallback providers |

### Business Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Competitor launches similar product | Medium | Medium | Accelerate feature development, focus on UX |
| Security breach damages reputation | Low | Critical | SOC 2 certification, bug bounty program |
| Key customers churn due to bugs | Medium | High | Increase test coverage, faster bug fix cycle |

---

## 8. Open Questions & Decisions Needed

### Technical Decisions
1. **Caching Strategy**: Redis TTL values per endpoint? Cache invalidation patterns?
2. **Mobile Architecture**: Share API client code (monorepo)? Native modules needed?
3. **AI/ML Hosting**: Self-hosted models or OpenAI API? Cost vs. control trade-off?
4. **Database Scaling**: When to implement read replicas? Sharding strategy?

### Product Decisions
5. **Pricing Tiers**: Free tier limits? Premium features for enterprise tier?
6. **Multi-Language**: Which 5 languages first? Professional translation or community?
7. **SLA Guarantees**: 99.9% vs. 99.95%? Credit policy for downtime?
8. **API Rate Limits**: Per-tenant limits? Tiered based on plan?

---

## 9. Appendix

### A. Code Statistics
- **Total Source Files**: 195 (.ts, .tsx files)
- **Lines of Code**: ~71,500 (35,600 backend, 35,900 frontend)
- **Database Tables**: 63 (across tenant schemas)
- **API Endpoints**: 100+ (27 route modules)
- **Test Files**: 26 (backend), 0 (frontend)
- **Test Cases**: 374 total

### B. Technology Stack
| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | Next.js | 16.1.1 |
| Frontend UI | React | 19.2.1 |
| Frontend Styling | TailwindCSS | 4.x |
| Frontend State | TanStack Query + Zustand | 5.90.12 + 5.0.9 |
| Backend Framework | Fastify | 5.6.2 |
| Backend Runtime | Node.js | 20+ |
| Database | PostgreSQL | 15+ |
| Cache/Queue | Redis + BullMQ | 7+ / 5.12.14 |
| ORM | Drizzle ORM | 0.33.0 |
| Validation | Zod | 3.23.8 |
| Testing (Backend) | Vitest + Playwright | 2.0.5 + 1.57.0 |
| Cloud SDKs | AWS SDK v3, Azure, GCP | Latest |

### C. External Dependencies
**Critical Third-Party Services**:
- SendGrid (email delivery) - Fallback needed
- Twilio (SMS delivery) - Fallback needed
- Slack API (notifications) - Webhook-based
- AWS/Azure/GCP (cloud integration) - Multi-cloud mitigates risk

### D. Glossary
- **CAB**: Change Advisory Board (approves changes)
- **CMDB**: Configuration Management Database (asset inventory)
- **ITSM**: IT Service Management
- **N+1 Query**: Performance anti-pattern (sequential queries in loop)
- **RCA**: Root Cause Analysis
- **SLA**: Service Level Agreement
- **SSRF**: Server-Side Request Forgery (security vulnerability)
- **WCAG**: Web Content Accessibility Guidelines

---

## Document Control

**Version History**:
- v1.0 (2026-01-02): Initial PRD generated from codebase analysis

**Review Cycle**: Quarterly (next review: 2026-04-02)

**Distribution**: Engineering team, Product team, Executive stakeholders

**Approval**: Auto-approved (Loki Mode autonomous operation)

---

**END OF PRD**
