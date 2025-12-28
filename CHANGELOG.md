# Changelog

All notable changes to the FireLater ITSM Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-12-27

### Added
- Initial release of FireLater ITSM Platform
- Multi-tenant architecture with PostgreSQL schema isolation
- JWT-based authentication with refresh token support
- Role-based access control (RBAC) with permissions
- Incident Management module
  - Issue creation, assignment, and tracking
  - Priority and status management
  - SLA tracking and breach detection
- Service Request Management
  - Service catalog with customizable items
  - Approval workflows
  - Request fulfillment tracking
- Change Management
  - Change request creation and approval
  - Risk assessment
  - Change calendar view
  - CAB (Change Advisory Board) support
- Problem Management
  - Root cause analysis
  - Known error database
  - Problem-incident linking
- Asset Management
  - Hardware and software asset tracking
  - Asset lifecycle management
  - Configuration item relationships
- Knowledge Base
  - Article creation and publishing
  - Category organization
  - Search functionality
- Cloud Resource Management
  - AWS, Azure, and GCP integration
  - Resource discovery and sync
  - Cost tracking
- Notification System
  - Email notifications via SendGrid
  - SMS notifications via Twilio
  - In-app notifications
  - Notification templates
- On-Call Scheduling
  - Schedule management
  - Rotation support
  - Override capabilities
- Reporting and Analytics
  - Custom report builder
  - Dashboard widgets
  - Export functionality
- Admin Features
  - User management
  - Group management
  - Role and permission configuration
  - SLA policy management
  - Workflow automation
  - Email configuration
  - Integration settings

### Fixed
- Docker build configuration for templates
- Authentication session logout issues
- Null checks for ID sequence queries
- Missing route handlers for problems and roles
- SLA breach processor schema column names
- Email and SMS delivery status when not configured
- Cloud sync credential decryption error handling
- Azure and GCP connection testing
- Frontend error state handling
- Recharts implementation for dashboards

### Security
- HTTP-only cookies for refresh tokens
- Password hashing with bcrypt
- Input validation with Zod schemas
- SQL injection prevention with parameterized queries
- CORS configuration
- Rate limiting support

### Technical
- Next.js 14 frontend with App Router
- Fastify backend with TypeScript
- PostgreSQL database with multi-tenant schemas
- Redis for caching and job queues
- BullMQ for background job processing
- Docker and Docker Compose support
- Comprehensive test suite (86+ tests)

## [1.1.0] - 2025-12-28

### Added
- Service Requests list page with filters and pagination
- Pending Approvals dashboard with bulk approve/reject actions
- Approval delegation API and UI for workflow flexibility
- Problem RCA Tools (5 Whys analysis, Fishbone diagram, Summary generator)
- CAB Meeting management UI with full lifecycle support
- CAB Meeting API endpoints (CRUD, attendees, decisions)
- Shift Swap workflow UI for on-call schedule management
- Shift Swap API endpoints with approval workflow
- iCal export for on-call schedules with token-based subscriptions
- Real-time dashboard updates with 30-second auto-refresh
- Microsoft Teams integration with Adaptive Cards
- Enhanced Slack integration with Block Kit templates
- Financial impact tracking for Problem records

### Changed
- Dashboard now uses react-query for data freshness indicators
- On-call page consolidated with shift swap management tab

### Database
- Migration 019: RCA JSONB column for problems table
- Migration 020: CAB meetings tables with indexes
- Migration 021: Shift swap requests table
- Migration 022: Financial tracking columns for problems
- Migration 023: Calendar subscription table for iCal

## [Unreleased]

### Planned
- Enhanced accessibility (WCAG 2.1 AA compliance)
- Additional cloud provider integrations
- Mobile application
- Advanced analytics and AI-powered insights
- Webhook integrations
- API rate limiting dashboard
