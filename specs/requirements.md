# FireLater Platform - Requirements Specification

## 1. Overview

FireLater is a multi-tenant IT Service Management (ITSM) platform providing:
- Incident/Issue Management
- Change Management
- Service Request Management
- Service Catalog
- Cloud Resource Management
- On-Call Scheduling
- Reporting and Analytics

## 2. Architecture

### 2.1 Multi-Tenancy
- Schema-per-tenant isolation in PostgreSQL
- Tenant slug used in authentication and routing
- Public schema for tenant metadata only
- Each tenant has isolated: users, applications, issues, changes, requests

### 2.2 Technology Stack

**Backend:**
- Node.js 18+ with Fastify 4.x
- PostgreSQL 15+ with pg client
- Redis for caching and session storage
- BullMQ for background jobs
- S3/MinIO for file storage

**Frontend:**
- Next.js 15 with App Router
- Tailwind CSS for styling
- Zustand for state management
- Axios for API communication
- Lucide React for icons

## 3. Feature Requirements

### 3.1 Authentication (Completed)
- [x] JWT-based authentication
- [x] Multi-tenant login with organization slug
- [x] User registration with tenant creation
- [x] Password reset flow
- [ ] Email verification (pending)
- [x] Session management with Redis

### 3.2 User Management (Completed)
- [x] User CRUD operations
- [x] Role-based access control (RBAC)
- [x] Multiple roles per user
- [x] Permission-based authorization
- [ ] Groups management UI (pending)
- [ ] Roles management UI (pending)

### 3.3 Issues Module (Completed)
- [x] Issue creation and editing
- [x] Status workflow (New -> In Progress -> Resolved -> Closed)
- [x] Priority levels (Low, Medium, High, Critical)
- [x] Assignment to users
- [x] Comments and activity timeline
- [x] SLA tracking
- [x] Related changes linking

### 3.4 Changes Module (Completed)
- [x] Change request creation
- [x] Type classification (Standard, Normal, Emergency)
- [x] Risk assessment (Low, Medium, High)
- [x] Approval workflow
- [x] Implementation scheduling
- [x] Comments and activity
- [ ] Calendar view (pending)

### 3.5 Service Catalog (Completed)
- [x] Catalog categories
- [x] Catalog items with forms
- [x] Request submission
- [x] My requests view
- [ ] Request tracking detail page (pending)

### 3.6 Applications (Partially Complete)
- [x] Application registry
- [x] Health score tracking
- [x] Related issues and changes
- [ ] Create/edit forms (pending)

### 3.7 Cloud Management (Partially Complete)
- [x] Cloud account management (AWS, Azure, GCP)
- [x] Resource inventory
- [x] Cost reporting
- [ ] Resource detail pages (pending)
- [ ] Real cloud SDK integration (placeholder)

### 3.8 On-Call Management (Partially Complete)
- [x] Schedule viewing
- [x] Active incidents
- [x] My shifts
- [ ] Schedule editor (pending)

### 3.9 Reporting (Partially Complete)
- [x] Report templates
- [x] Scheduled reports
- [ ] Report execution UI (pending)
- [ ] Export to CSV/PDF (pending)
- [ ] Custom report builder (pending)

### 3.10 Admin Settings (Completed)
- [x] User management
- [x] Tenant settings
- [x] Notification preferences
- [x] Cloud integrations

### 3.11 Dashboard (Partially Complete)
- [x] Overview statistics
- [x] Quick actions
- [ ] Issue trends chart (pending)
- [ ] Health distribution chart (pending)
- [ ] Real-time data (currently mock)

## 4. API Specifications

### 4.1 Authentication Endpoints
```
POST /v1/auth/login
POST /v1/auth/register
POST /v1/auth/refresh
POST /v1/auth/logout
POST /v1/auth/forgot-password
POST /v1/auth/reset-password
POST /v1/auth/verify-email (pending)
```

### 4.2 Core Endpoints
```
GET/POST /v1/users
GET/PUT/DELETE /v1/users/:id
GET/POST /v1/groups
GET/PUT/DELETE /v1/groups/:id
GET/POST /v1/roles
GET/PUT/DELETE /v1/roles/:id
```

### 4.3 ITSM Endpoints
```
GET/POST /v1/issues
GET/PUT/DELETE /v1/issues/:id
POST /v1/issues/:id/comments
POST /v1/issues/:id/assign

GET/POST /v1/changes
GET/PUT/DELETE /v1/changes/:id
POST /v1/changes/:id/approve
POST /v1/changes/:id/reject
POST /v1/changes/:id/comments

GET/POST /v1/catalog/items
GET /v1/catalog/categories
GET/POST /v1/requests
GET/PUT /v1/requests/:id
```

### 4.4 Additional Endpoints
```
GET/POST /v1/cloud/accounts
GET /v1/cloud/resources
GET /v1/cloud/costs

GET /v1/oncall/schedules
GET /v1/oncall/incidents

GET/POST /v1/reports/templates
GET /v1/reports/scheduled
POST /v1/reports/:id/execute

GET /v1/notifications
PUT /v1/notifications/:id/read

GET/PUT /v1/settings
```

## 5. Database Schema

### 5.1 Public Schema (Shared)
- tenants: Organization metadata
- tenant_settings: Per-tenant configuration

### 5.2 Tenant Schema (Isolated per tenant)
- users: Tenant users
- groups: User groups
- roles: Role definitions
- permissions: Permission grants
- user_roles: User-role assignments
- user_groups: User-group memberships

- applications: IT applications
- app_health_scores: Health metrics

- issues: Incident/problem records
- issue_comments: Issue discussion
- issue_history: Change tracking

- changes: Change requests
- change_approvals: Approval records
- change_comments: Change discussion

- catalog_categories: Service catalog categories
- catalog_items: Service offerings
- service_requests: Request submissions
- request_tasks: Fulfillment tasks

- cloud_accounts: Cloud provider accounts
- cloud_resources: Discovered resources
- cloud_cost_reports: Cost data

- oncall_schedules: On-call rotations
- oncall_shifts: Individual shifts
- oncall_incidents: Active incidents

- report_templates: Report definitions
- scheduled_reports: Report schedules
- report_executions: Execution history

- notifications: User notifications
- attachments: File metadata
- audit_logs: Activity tracking

## 6. Non-Functional Requirements

### 6.1 Security
- JWT tokens with short expiration (15 min)
- Refresh tokens with longer expiration (7 days)
- Password hashing with bcrypt
- SQL injection prevention via parameterized queries
- XSS prevention in frontend
- CORS configuration
- Rate limiting on auth endpoints

### 6.2 Performance
- Database connection pooling
- Redis caching for frequently accessed data
- Background job processing for heavy tasks
- Pagination on all list endpoints

### 6.3 Scalability
- Horizontal scaling via container orchestration
- Stateless backend design
- Redis for session storage (shared across instances)
- S3 for file storage (shared)

### 6.4 Reliability
- Health check endpoints
- Graceful shutdown handling
- Job retry mechanisms
- Database transaction management

## 7. Pending Implementation

### 7.1 High Priority
1. Email verification flow
2. Groups management UI
3. Roles & permissions UI
4. Dashboard real data integration

### 7.2 Medium Priority
5. Issue trends chart
6. Health distribution chart
7. Request tracking page
8. Change calendar view

### 7.3 Lower Priority
9. Resource detail pages
10. Schedule editor
11. Report execution UI
12. Export functionality
13. Custom report builder
14. Theme provider (dark mode)
15. Breadcrumbs navigation

### 7.4 DevOps
16. CI/CD pipeline (GitHub Actions)
17. Monitoring and alerting setup
