# FireLater ITSM Platform
## Product Requirements Document (PRD)

**Version:** 1.0.0
**Status:** Production Ready
**Classification:** Proprietary - All Rights Reserved

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Vision & Strategy](#2-product-vision--strategy)
3. [Target Market & Users](#3-target-market--users)
4. [User Personas](#4-user-personas)
5. [Core Modules & Features](#5-core-modules--features)
6. [Detailed Feature Specifications](#6-detailed-feature-specifications)
7. [User Stories & Acceptance Criteria](#7-user-stories--acceptance-criteria)
8. [System Architecture](#8-system-architecture)
9. [Data Models & Relationships](#9-data-models--relationships)
10. [API Specifications](#10-api-specifications)
11. [Security & Compliance](#11-security--compliance)
12. [Integrations](#12-integrations)
13. [Non-Functional Requirements](#13-non-functional-requirements)
14. [Success Metrics & KPIs](#14-success-metrics--kpis)
15. [Competitive Analysis](#15-competitive-analysis)
16. [Pricing Strategy](#16-pricing-strategy)
17. [Glossary](#17-glossary)

---

# 1. Executive Summary

## 1.1 Product Overview

FireLater is a comprehensive, cloud-native IT Service Management (ITSM) platform designed for modern IT operations teams. It provides a unified solution for managing the entire IT service lifecycle, from incident detection to resolution, change management, service requests, and beyond.

## 1.2 Problem Statement

Organizations face critical challenges in IT operations:

- **Fragmented Tools**: Teams use multiple disconnected systems for incidents, changes, and requests
- **Lack of Visibility**: No unified view of IT health, SLAs, and operational metrics
- **Manual Processes**: Time-consuming manual workflows for approvals, escalations, and notifications
- **Cloud Complexity**: Difficulty managing hybrid and multi-cloud infrastructure
- **Compliance Gaps**: Inadequate audit trails and change control for regulatory requirements
- **Cost Inefficiency**: Expensive enterprise ITSM tools with complex licensing models

## 1.3 Solution

FireLater addresses these challenges with:

- **Unified Platform**: Single pane of glass for all ITSM functions
- **Multi-Tenant Architecture**: Secure isolation with schema-per-tenant design
- **Automation First**: Workflow engine, SLA automation, and intelligent routing
- **Cloud-Native Integration**: Native support for AWS, Azure, and GCP
- **Modern UX**: Clean, intuitive interface built with modern web technologies
- **Flexible Pricing**: Transparent, scalable pricing without per-agent fees

## 1.4 Key Differentiators

| Capability | FireLater | Traditional ITSM |
|------------|-----------|------------------|
| Deployment | Cloud-native SaaS | On-premise or hosted |
| Multi-tenancy | Schema isolation | Database per tenant |
| Pricing | Flat rate per tenant | Per agent/user |
| Cloud Integration | Native multi-cloud | Add-on modules |
| **Data Migration** | **Automated with ServiceNow/Jira/Remedy parsers** | **Manual or consulting services** |
| **SSO & Identity** | **SAML 2.0, OIDC, Azure AD native** | **SAML only, limited providers** |
| API-First | Complete REST API | Limited API coverage |
| Modern Stack | Next.js + Fastify | Legacy frameworks |

---

# 2. Product Vision & Strategy

## 2.1 Vision Statement

*"To democratize enterprise-grade IT service management, making powerful ITSM capabilities accessible to organizations of all sizes through a modern, intuitive, and cost-effective platform."*

## 2.2 Mission

Enable IT teams to:
- Resolve incidents faster with intelligent automation
- Manage changes safely with comprehensive workflows
- Deliver services efficiently through self-service catalogs
- Gain visibility into IT operations with real-time dashboards
- Maintain compliance with complete audit trails

## 2.3 Strategic Goals

### Goal 1: Operational Excellence
- Reduce mean time to resolution (MTTR) by 40%
- Achieve 99.9% SLA compliance
- Automate 60% of routine tasks

### Goal 2: User Satisfaction
- Maintain NPS score above 50
- Achieve 90% user adoption within organizations
- Reduce training time to under 2 hours

### Goal 3: Market Expansion
- Serve SMB to mid-enterprise segments
- Support global deployments with multi-region capability
- Enable partner/MSP white-label deployments

### Goal 4: Platform Extensibility
- Comprehensive API coverage for all features
- Webhook support for event-driven integrations
- Marketplace for third-party integrations

## 2.4 Product Principles

1. **Simplicity Over Complexity**: Every feature should be intuitive without documentation
2. **Automation by Default**: Manual steps should be the exception, not the rule
3. **Data-Driven Decisions**: Provide actionable insights, not just raw data
4. **Security First**: Zero-trust architecture with defense in depth
5. **Performance Matters**: Sub-second response times for all operations
6. **Mobile Ready**: Full functionality on any device

---

# 3. Target Market & Users

## 3.1 Target Segments

### Primary: Small to Medium Business (SMB)
- **Company Size**: 50-500 employees
- **IT Team Size**: 3-20 people
- **Characteristics**:
  - Limited budget for enterprise tools
  - Need professional ITSM without complexity
  - Growing cloud infrastructure
  - Compliance requirements emerging

### Secondary: Mid-Market Enterprise
- **Company Size**: 500-5,000 employees
- **IT Team Size**: 20-100 people
- **Characteristics**:
  - Multiple IT teams and locations
  - Complex change management needs
  - Multi-cloud environments
  - Regulatory compliance mandatory

### Tertiary: Managed Service Providers (MSPs)
- **Characteristics**:
  - Manage IT for multiple clients
  - Need multi-tenant isolation
  - White-label requirements
  - API-driven automation

## 3.2 Industry Verticals

| Industry | Key Requirements |
|----------|------------------|
| Technology | Fast deployment, API integration, cloud-native |
| Financial Services | Audit trails, change control, compliance |
| Healthcare | HIPAA compliance, data security, uptime |
| Retail | 24/7 operations, seasonal scaling |
| Manufacturing | OT/IT integration, asset management |
| Professional Services | Client billing, time tracking |

## 3.3 Geographic Markets

- **Primary**: North America, Western Europe
- **Secondary**: Australia, Singapore, India
- **Language Support**: English (initial), with i18n framework for expansion

---

# 4. User Personas

## 4.1 Primary Personas

### Persona 1: IT Service Desk Agent - "Alex"

**Demographics**
- Role: Service Desk Analyst / IT Support Specialist
- Experience: 1-5 years in IT support
- Technical Level: Intermediate

**Goals**
- Resolve tickets quickly and efficiently
- Maintain high customer satisfaction scores
- Reduce repetitive manual tasks
- Access knowledge base for solutions

**Pain Points**
- Too many tools to switch between
- Lack of context when tickets arrive
- Manual escalation processes
- No visibility into SLA status

**Key Tasks**
- Triage and categorize incoming issues
- Investigate and resolve incidents
- Escalate complex issues
- Document solutions in knowledge base
- Communicate with requesters

**Success Metrics**
- First call resolution rate
- Average handle time
- Customer satisfaction score
- Tickets resolved per day

---

### Persona 2: IT Manager - "Sarah"

**Demographics**
- Role: IT Manager / Service Delivery Manager
- Experience: 8-15 years in IT
- Technical Level: Advanced

**Goals**
- Meet SLA commitments
- Optimize team performance
- Reduce operational costs
- Demonstrate IT value to business

**Pain Points**
- Limited visibility into team workload
- Difficulty proving ROI of IT
- Manual reporting and metrics
- Change management overhead

**Key Tasks**
- Monitor team performance dashboards
- Review and approve changes
- Manage SLA policies
- Generate executive reports
- Resource planning and allocation

**Success Metrics**
- SLA compliance percentage
- Team utilization rate
- Cost per ticket
- Change success rate

---

### Persona 3: End User / Requester - "Mike"

**Demographics**
- Role: Business User (non-IT)
- Experience: Varies
- Technical Level: Basic

**Goals**
- Get IT issues resolved quickly
- Request services without friction
- Track status of requests
- Self-serve when possible

**Pain Points**
- Don't know who to contact
- No visibility into ticket status
- Complex request processes
- Long wait times

**Key Tasks**
- Submit IT issues
- Request services from catalog
- Check ticket status
- Provide feedback on resolution

**Success Metrics**
- Time to resolution
- Ease of submission
- Communication clarity
- Overall satisfaction

---

### Persona 4: Change Manager - "David"

**Demographics**
- Role: Change Manager / Release Manager
- Experience: 10+ years in IT operations
- Technical Level: Advanced

**Goals**
- Minimize change-related incidents
- Ensure compliance with change policies
- Streamline CAB processes
- Maintain audit trail

**Pain Points**
- Manual change tracking in spreadsheets
- Lack of risk assessment tools
- Communication gaps during changes
- Post-change review overhead

**Key Tasks**
- Review change requests
- Assess risk and impact
- Schedule CAB meetings
- Coordinate implementation windows
- Conduct post-implementation reviews

**Success Metrics**
- Change success rate
- Emergency change percentage
- CAB meeting efficiency
- Audit compliance

---

### Persona 5: System Administrator - "Lisa"

**Demographics**
- Role: System Administrator / Platform Admin
- Experience: 5-10 years
- Technical Level: Expert

**Goals**
- Configure platform to meet org needs
- Automate repetitive workflows
- Integrate with existing tools
- Maintain security and compliance

**Pain Points**
- Complex configuration interfaces
- Limited automation capabilities
- Poor API documentation
- Vendor lock-in concerns

**Key Tasks**
- Configure roles and permissions
- Set up workflow automations
- Manage integrations
- Configure SLA policies
- Monitor system health

**Success Metrics**
- Configuration accuracy
- Automation coverage
- Integration reliability
- System uptime

---

## 4.2 Secondary Personas

### Persona 6: On-Call Engineer - "James"

**Key Characteristics**
- Responds to critical incidents outside business hours
- Needs mobile access to full functionality
- Requires clear escalation paths
- Values quick acknowledgment workflows

### Persona 7: Executive Stakeholder - "Patricia"

**Key Characteristics**
- Needs high-level dashboards and KPIs
- Focuses on business impact and costs
- Reviews monthly/quarterly reports
- Makes budget decisions

### Persona 8: Compliance Officer - "Robert"

**Key Characteristics**
- Requires comprehensive audit logs
- Reviews change control processes
- Ensures regulatory compliance
- Conducts periodic audits

---

# 5. Core Modules & Features

## 5.1 Module Overview

| Module | Description | Primary Users |
|--------|-------------|---------------|
| Issue Management | Incident and problem tracking | Agents, Managers |
| Problem Management | Root cause analysis and known errors | Senior Engineers |
| Change Management | Change control and CAB workflows | Change Managers |
| Service Catalog | Self-service request portal | End Users |
| Service Requests | Request fulfillment tracking | Agents |
| Application Registry | IT application inventory | All IT Staff |
| Cloud Management | Multi-cloud resource visibility | Admins, Engineers |
| On-Call Management | Schedule and escalation management | On-Call Engineers |
| Knowledge Base | Documentation and solutions | All Users |
| Reporting & Analytics | Dashboards and reports | Managers, Executives |
| Asset Management | Hardware/software inventory | Asset Managers |
| Workflow Automation | Rule-based automation | Admins |
| Integrations | Third-party connectivity | Admins |
| **Data Migration** | **Automated ITSM data import from legacy systems** | **Admins, Migration Specialists** |
| **SSO & Authentication** | **Enterprise SSO with SAML 2.0, OIDC, and Azure AD** | **Admins, Security Teams** |
| Administration | Platform configuration | Admins |

## 5.2 Feature Matrix by Plan

| Feature | Starter | Professional | Enterprise |
|---------|---------|--------------|------------|
| Issue Management | Yes | Yes | Yes |
| Problem Management | Basic | Full | Full |
| Change Management | Standard | Full + CAB | Full + Advanced |
| Service Catalog | 10 items | 50 items | Unlimited |
| Service Requests | Yes | Yes | Yes |
| Application Registry | 20 apps | 100 apps | Unlimited |
| Cloud Accounts | 1 | 5 | Unlimited |
| On-Call Schedules | 2 | 10 | Unlimited |
| Knowledge Base | Yes | Yes | Yes |
| Reports | Basic | Advanced | Custom + BI |
| Asset Management | 100 assets | 1000 assets | Unlimited |
| Workflow Rules | 5 | 25 | Unlimited |
| **Data Migration** | **1 migration job** | **5 migration jobs** | **Unlimited** |
| **SSO (SAML/OIDC)** | **-** | **Yes** | **Yes + Azure AD** |
| API Access | Limited | Full | Full + Premium |
| Users | 10 | 50 | Unlimited |
| Support | Email | Priority | Dedicated |
| SLA | 99.5% | 99.9% | 99.99% |

---

# 6. Detailed Feature Specifications

## 6.1 Issue Management Module

### 6.1.1 Overview

The Issue Management module handles the complete lifecycle of IT incidents, from initial report through resolution and closure. It implements ITIL best practices while remaining flexible for organizations of all maturity levels.

### 6.1.2 Issue Attributes

**Core Fields**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Issue Number | Auto-generated | Yes | Unique identifier (ISS-00001) |
| Title | Text (255 chars) | Yes | Brief description of issue |
| Description | Rich Text | Yes | Detailed issue description |
| Status | Enum | Yes | Current workflow state |
| Priority | Enum | Yes | Business priority level |
| Severity | Enum | No | Technical severity (S1-S4) |
| Impact | Enum | No | Scope of impact |
| Urgency | Enum | No | Time sensitivity |
| Source | Enum | Yes | How issue was reported |

**Assignment Fields**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Assigned To | User Reference | No | Individual assignee |
| Assignment Group | Group Reference | No | Team assignment |
| Escalated | Boolean | No | Escalation flag |
| Escalation Level | Integer | No | Current escalation tier |

**Relationship Fields**
| Field | Type | Description |
|-------|------|-------------|
| Application | Reference | Affected application |
| Related Changes | References | Associated change requests |
| Related Problems | References | Linked problems |
| Parent Issue | Reference | For sub-tasks |
| Requester | User Reference | Person who reported |

**SLA Fields**
| Field | Type | Description |
|-------|------|-------------|
| Response Due | Timestamp | SLA response deadline |
| Resolution Due | Timestamp | SLA resolution deadline |
| Response Met | Boolean | Response SLA status |
| Resolution Met | Boolean | Resolution SLA status |
| SLA Breached | Boolean | Any SLA breach flag |

**Tracking Fields**
| Field | Type | Description |
|-------|------|-------------|
| Created At | Timestamp | Creation time |
| Updated At | Timestamp | Last modification |
| Resolved At | Timestamp | Resolution time |
| Closed At | Timestamp | Closure time |
| First Response At | Timestamp | First agent response |
| Time to Resolution | Duration | Calculated resolution time |

### 6.1.3 Issue Status Workflow

```
                    +---> PENDING ---+
                    |                |
                    |                v
NEW --> ASSIGNED --> IN_PROGRESS --> RESOLVED --> CLOSED
                    |                ^
                    |                |
                    +---> ESCALATED -+
```

**Status Definitions**

| Status | Description | Allowed Transitions |
|--------|-------------|---------------------|
| New | Newly created, unassigned | Assigned |
| Assigned | Assigned to agent/group | In Progress, Pending |
| In Progress | Actively being worked | Pending, Resolved, Escalated |
| Pending | Waiting for external input | In Progress, Resolved |
| Escalated | Escalated to higher tier | In Progress, Resolved |
| Resolved | Solution implemented | Closed, In Progress (reopen) |
| Closed | Confirmed resolved | None (terminal) |

### 6.1.4 Priority Matrix

| Priority | Response Target | Resolution Target | Examples |
|----------|----------------|-------------------|----------|
| Critical (P1) | 15 minutes | 4 hours | Production down, data breach |
| High (P2) | 1 hour | 8 hours | Major feature broken, VIP issue |
| Medium (P3) | 4 hours | 24 hours | Standard issues, workaround exists |
| Low (P4) | 8 hours | 72 hours | Minor issues, cosmetic problems |

### 6.1.5 Issue Features

**Comments System**
- Public comments (visible to requester)
- Internal notes (agent-only)
- Rich text with attachments
- @mentions for notifications
- Comment history tracking

**Work Logging**
- Time spent tracking
- Work description
- Billable/non-billable flag
- Agent attribution
- Aggregated time reports

**Activity Timeline**
- Chronological activity feed
- Status changes
- Assignment changes
- Comments added
- Attachments uploaded
- SLA events
- Escalations

**Bulk Operations**
- Multi-select issues
- Bulk status change
- Bulk assignment
- Bulk priority update
- Bulk close

### 6.1.6 Issue Automation

**Auto-Assignment Rules**
- Based on category/type
- Round-robin distribution
- Skill-based routing
- Load balancing
- Time-based routing (business hours)

**Auto-Escalation**
- SLA breach approaching (warning)
- SLA breach occurred
- No response timeout
- Customer escalation request

**Auto-Notifications**
- Issue created
- Status changed
- Assignment changed
- Comment added
- SLA warning
- Resolution notification

---

## 6.2 Problem Management Module

### 6.2.1 Overview

Problem Management focuses on identifying root causes of incidents and preventing future occurrences. It supports both reactive (incident-driven) and proactive (trend-driven) problem identification.

### 6.2.2 Problem Attributes

**Core Fields**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Problem Number | Auto-generated | Yes | Unique identifier (PRB-00001) |
| Title | Text | Yes | Problem summary |
| Description | Rich Text | Yes | Detailed description |
| Status | Enum | Yes | Workflow state |
| Priority | Enum | Yes | Business priority |
| Category | Enum | No | Problem category |
| Source | Enum | No | How identified (reactive/proactive) |

**Investigation Fields**
| Field | Type | Description |
|-------|------|-------------|
| Root Cause | Rich Text | Documented root cause |
| Workaround | Rich Text | Temporary solution |
| Resolution | Rich Text | Permanent fix |
| Known Error | Boolean | Flagged as known error |
| Known Error ID | Reference | Link to known error DB |

**Relationship Fields**
| Field | Type | Description |
|-------|------|-------------|
| Related Issues | References | Affected incidents |
| Related Changes | References | Fix changes |
| Application | Reference | Affected application |

### 6.2.3 Problem Status Workflow

```
NEW --> ASSIGNED --> INVESTIGATING --> ROOT_CAUSE_IDENTIFIED --> KNOWN_ERROR --> RESOLVED --> CLOSED
                          |                                          |
                          +-------> WORKAROUND_AVAILABLE <-----------+
```

**Status Definitions**

| Status | Description |
|--------|-------------|
| New | Newly identified problem |
| Assigned | Assigned for investigation |
| Investigating | Active investigation |
| Root Cause Identified | Cause documented |
| Known Error | Added to known error database |
| Workaround Available | Temporary solution documented |
| Resolved | Permanent fix implemented |
| Closed | Verified and closed |

### 6.2.4 Known Error Database (KEDB)

**Purpose**: Document known issues with workarounds for faster incident resolution

**Known Error Record**
| Field | Description |
|-------|-------------|
| Error ID | Unique identifier (KE-00001) |
| Title | Brief description |
| Symptoms | How to identify |
| Root Cause | Why it happens |
| Workaround | Temporary fix steps |
| Permanent Fix | Long-term solution |
| Affected Systems | Applications/services |
| Status | Active/Resolved |

### 6.2.5 Problem Features

**Root Cause Analysis Tools**
- 5 Whys template
- Fishbone diagram support
- Timeline reconstruction
- Related incident analysis

**Impact Assessment**
- Affected incident count
- User impact scope
- Business service impact
- Financial impact estimation

**Trend Analysis**
- Recurring incident patterns
- Category-based trends
- Application-based trends
- Time-based patterns

---

## 6.3 Change Management Module

### 6.3.1 Overview

Change Management provides controlled processes for managing IT changes, minimizing risk and ensuring compliance. It supports standard, normal, and emergency change workflows with configurable approval processes.

### 6.3.2 Change Attributes

**Core Fields**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| Change Number | Auto-generated | Yes | Unique identifier (CHG-00001) |
| Title | Text | Yes | Change summary |
| Description | Rich Text | Yes | Detailed description |
| Justification | Rich Text | Yes | Business justification |
| Type | Enum | Yes | Standard/Normal/Emergency |
| Status | Enum | Yes | Workflow state |
| Risk Level | Enum | Yes | Low/Medium/High/Critical |
| Impact | Enum | Yes | None to Major |

**Planning Fields**
| Field | Type | Description |
|-------|------|-------------|
| Implementation Plan | Rich Text | Step-by-step implementation |
| Rollback Plan | Rich Text | Reversion procedure |
| Test Plan | Rich Text | Validation steps |
| Planned Start | Timestamp | Scheduled start time |
| Planned End | Timestamp | Scheduled end time |
| Actual Start | Timestamp | Actual start time |
| Actual End | Timestamp | Actual end time |
| Downtime Required | Boolean | Service impact expected |
| Downtime Duration | Duration | Expected outage length |

**Approval Fields**
| Field | Type | Description |
|-------|------|-------------|
| CAB Required | Boolean | Needs CAB review |
| CAB Date | Timestamp | Scheduled CAB meeting |
| Approvers | User References | Required approvers |
| Approval Status | Enum | Pending/Approved/Rejected |

### 6.3.3 Change Types

**Standard Change**
- Pre-approved, low-risk changes
- Follows documented procedure
- No CAB approval required
- Examples: Password resets, standard software installs

**Normal Change**
- Requires assessment and approval
- Follows normal change process
- CAB review for higher risk
- Examples: Server upgrades, network changes

**Emergency Change**
- Expedited approval process
- Post-implementation review required
- Used for critical fixes only
- Examples: Security patches, production outages

### 6.3.4 Change Status Workflow

```
                              +---> CANCELLED
                              |
DRAFT --> SUBMITTED --> ASSESSMENT --> CAB_REVIEW --> APPROVED --> SCHEDULED --> IMPLEMENTING --> REVIEW --> CLOSED
              |              |              |              |                          |
              v              v              v              v                          v
          REJECTED       REJECTED       REJECTED       REJECTED                   FAILED
```

**Status Definitions**

| Status | Description |
|--------|-------------|
| Draft | Change being prepared |
| Submitted | Submitted for review |
| Assessment | Technical assessment |
| CAB Review | Awaiting CAB decision |
| Approved | Approved for implementation |
| Scheduled | Scheduled in change window |
| Implementing | Currently being implemented |
| Review | Post-implementation review |
| Closed | Successfully completed |
| Failed | Implementation failed |
| Rejected | Not approved |
| Cancelled | Withdrawn |

### 6.3.5 Risk Assessment Matrix

| Impact / Likelihood | Low | Medium | High |
|---------------------|-----|--------|------|
| High | Medium | High | Critical |
| Medium | Low | Medium | High |
| Low | Low | Low | Medium |

**Risk Factors Evaluated**
- Service criticality
- User impact scope
- Complexity of change
- Rollback feasibility
- Testing coverage
- Change window appropriateness
- Resource availability
- Dependencies

### 6.3.6 Change Windows

**Window Types**
| Type | Description | Restrictions |
|------|-------------|--------------|
| Maintenance | Regular maintenance periods | Standard changes only |
| Freeze | No changes allowed | Emergency only |
| Emergency Only | Critical fixes only | Emergency with approval |
| Blackout | Complete change freeze | None allowed |

**Window Configuration**
- Recurring schedules (weekly, monthly)
- Custom RRULE support
- Per-application restrictions
- Tier-based policies
- Notification setup

### 6.3.7 Change Advisory Board (CAB)

**CAB Functions**
- Review normal and emergency changes
- Assess risk and impact
- Approve or reject changes
- Schedule implementation windows
- Resolve conflicts

**CAB Meeting Management**
- Agenda generation
- Attendee management
- Decision recording
- Action item tracking
- Minutes distribution

### 6.3.8 Change Tasks

**Task Breakdown**
- Implementation steps as tasks
- Task assignment
- Task dependencies
- Progress tracking
- Task completion verification

**Task Fields**
| Field | Description |
|-------|-------------|
| Task Number | Sequence within change |
| Title | Task description |
| Assignee | Responsible person |
| Status | Not Started/In Progress/Complete |
| Order | Execution sequence |
| Notes | Implementation notes |

---

## 6.4 Service Catalog Module

### 6.4.1 Overview

The Service Catalog provides a self-service portal for users to browse and request IT services. It features a drag-and-drop form builder, approval workflows, and fulfillment tracking.

### 6.4.2 Catalog Structure

**Categories**
- Hierarchical organization
- Icon and description
- Display order control
- Active/inactive status

**Example Category Structure**
```
IT Services
├── Hardware
│   ├── Laptops
│   ├── Monitors
│   └── Peripherals
├── Software
│   ├── Business Applications
│   ├── Development Tools
│   └── Security Software
├── Access & Permissions
│   ├── System Access
│   ├── Network Access
│   └── Application Access
└── Support Services
    ├── Training
    ├── Consultation
    └── Data Services
```

### 6.4.3 Catalog Item Attributes

**Basic Information**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Service name |
| Short Description | Text | Brief description (catalog listing) |
| Full Description | Rich Text | Detailed description |
| Category | Reference | Parent category |
| Icon | Image/Icon | Visual identifier |
| Status | Enum | Active/Inactive/Coming Soon |
| Display Order | Integer | Sort order in category |

**Request Configuration**
| Field | Type | Description |
|-------|------|-------------|
| Form Schema | JSON | Dynamic form definition |
| Approval Required | Boolean | Needs approval |
| Approval Workflow | Reference | Approval process |
| Fulfillment Group | Reference | Default assignment |
| Expected Completion | Duration | SLA target |
| Cost | Decimal | Service cost (if applicable) |
| Cost Center | Text | Billing allocation |

**Visibility**
| Field | Type | Description |
|-------|------|-------------|
| Visibility | Enum | Public/Internal/Restricted |
| Allowed Groups | References | Groups that can request |
| Allowed Roles | References | Roles that can request |

### 6.4.4 Form Builder

**Supported Field Types**
| Type | Description | Options |
|------|-------------|---------|
| text | Single line text | Max length, pattern |
| textarea | Multi-line text | Max length, rows |
| email | Email address | Validation |
| phone | Phone number | Format validation |
| number | Numeric input | Min, max, step |
| date | Date picker | Min date, max date |
| datetime | Date and time | Timezone support |
| select | Dropdown | Options, default |
| multiselect | Multiple selection | Options list |
| checkbox | Boolean checkbox | Default value |
| radio | Radio buttons | Options list |
| user_picker | User selection | Filter by group/role |
| group_picker | Group selection | Filter options |
| application_picker | Application selection | Filter options |
| file | File upload | Allowed types, max size |

**Field Properties**
| Property | Description |
|----------|-------------|
| label | Display label |
| name | Field identifier |
| required | Mandatory field |
| placeholder | Placeholder text |
| helpText | Help description |
| defaultValue | Pre-filled value |
| validation | Validation rules |
| conditional | Show/hide conditions |
| order | Display sequence |

**Conditional Logic**
```json
{
  "field": "request_type",
  "operator": "equals",
  "value": "new_laptop",
  "action": "show",
  "targetFields": ["laptop_model", "accessories"]
}
```

### 6.4.5 Form Sections

**Section Configuration**
- Section title
- Section description
- Collapsible sections
- Conditional sections
- Field grouping

### 6.4.6 Approval Workflows

**Workflow Stages**
| Stage | Description |
|-------|-------------|
| Manager Approval | Direct manager approval |
| Department Approval | Department head approval |
| Finance Approval | Budget/cost approval |
| Security Approval | Security review |
| Technical Approval | Technical feasibility |
| Executive Approval | Final executive sign-off |

**Approval Configuration**
- Sequential or parallel approvals
- Conditional approval paths
- Delegation support
- Timeout and escalation
- Auto-approval rules

---

## 6.5 Service Request Module

### 6.5.1 Overview

Service Requests track the fulfillment of catalog item requests from submission through completion.

### 6.5.2 Request Attributes

**Core Fields**
| Field | Type | Description |
|-------|------|-------------|
| Request Number | Auto-generated | REQ-00001 |
| Catalog Item | Reference | Requested service |
| Requester | User Reference | Who submitted |
| Status | Enum | Workflow state |
| Priority | Enum | Request priority |
| Form Data | JSON | Submitted form values |

**Assignment Fields**
| Field | Type | Description |
|-------|------|-------------|
| Assigned To | User Reference | Fulfillment assignee |
| Fulfillment Group | Group Reference | Assigned team |
| Expected By | Timestamp | Target completion |

**Tracking Fields**
| Field | Type | Description |
|-------|------|-------------|
| Created At | Timestamp | Submission time |
| Approved At | Timestamp | Approval time |
| Completed At | Timestamp | Completion time |
| Cancelled At | Timestamp | Cancellation time |

### 6.5.3 Request Status Workflow

```
SUBMITTED --> PENDING_APPROVAL --> APPROVED --> ASSIGNED --> IN_PROGRESS --> PENDING --> COMPLETED
     |               |                                                          |
     v               v                                                          v
 CANCELLED       REJECTED                                                   CANCELLED
```

**Status Definitions**

| Status | Description |
|--------|-------------|
| Submitted | Request submitted |
| Pending Approval | Awaiting approval(s) |
| Approved | All approvals received |
| Rejected | Approval denied |
| Assigned | Assigned for fulfillment |
| In Progress | Being fulfilled |
| Pending | Waiting for input/resources |
| Completed | Request fulfilled |
| Cancelled | Request withdrawn |

### 6.5.4 Request Features

**My Requests View**
- Personal request history
- Status tracking
- Filtering and search
- Quick actions

**Approval Management**
- Pending approvals queue
- Approve/reject actions
- Delegation
- Bulk approvals

**Fulfillment Tracking**
- Task breakdown
- Progress updates
- Time tracking
- Completion verification

---

## 6.6 Application Registry Module

### 6.6.1 Overview

The Application Registry maintains an inventory of IT applications and services, tracking health, dependencies, and ownership.

### 6.6.2 Application Attributes

**Basic Information**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Application name |
| Short Name | Text | Abbreviation |
| Description | Rich Text | Full description |
| Status | Enum | Active/Inactive/Deprecated |
| Tier | Enum | P1/P2/P3/P4 (criticality) |
| Type | Enum | Internal/External/SaaS |

**Ownership**
| Field | Type | Description |
|-------|------|-------------|
| Owner | User Reference | Business owner |
| Technical Owner | User Reference | Technical lead |
| Support Group | Group Reference | Support team |
| Cost Center | Text | Financial allocation |

**Technical Details**
| Field | Type | Description |
|-------|------|-------------|
| Technology Stack | Tags | Tech components |
| URL | URL | Application URL |
| Documentation URL | URL | Docs location |
| Repository URL | URL | Code repository |
| Environments | JSON | Environment list |

**Relationships**
| Field | Type | Description |
|-------|------|-------------|
| Dependencies | References | Upstream dependencies |
| Dependents | References | Downstream dependents |
| Cloud Resources | References | Linked cloud resources |
| Related Issues | Computed | Open issues |
| Related Changes | Computed | Pending changes |

### 6.6.3 Application Tier Definitions

| Tier | Name | Description | SLA |
|------|------|-------------|-----|
| P1 | Critical | Business critical, no downtime | 99.99% |
| P2 | High | Important, minimal downtime | 99.9% |
| P3 | Medium | Standard business apps | 99.5% |
| P4 | Low | Non-critical applications | 99% |

### 6.6.4 Health Score System

**Health Score Calculation (0-100)**

```
Health Score = (Issue Score * 0.4) + (SLA Score * 0.3) + (Change Score * 0.2) + (Uptime Score * 0.1)
```

**Score Components**

| Component | Weight | Calculation |
|-----------|--------|-------------|
| Issue Score | 40% | Based on open issues, severity, age |
| SLA Score | 30% | SLA compliance percentage |
| Change Score | 20% | Change success rate |
| Uptime Score | 10% | Availability percentage |

**Health Status Thresholds**
| Score Range | Status | Color |
|-------------|--------|-------|
| 90-100 | Healthy | Green |
| 70-89 | Warning | Yellow |
| 50-69 | At Risk | Orange |
| 0-49 | Critical | Red |

### 6.6.5 Environment Management

**Environment Types**
- Development
- Testing/QA
- Staging/UAT
- Production
- DR (Disaster Recovery)

**Environment Attributes**
| Field | Description |
|-------|-------------|
| Name | Environment name |
| Type | Environment type |
| URL | Environment URL |
| Status | Active/Inactive |
| Cloud Resources | Linked resources |

---

## 6.7 Cloud Management Module

### 6.7.1 Overview

Cloud Management provides visibility into multi-cloud infrastructure, enabling resource tracking, cost management, and application mapping.

### 6.7.2 Supported Cloud Providers

| Provider | Resources | Metrics | Costs |
|----------|-----------|---------|-------|
| AWS | EC2, RDS, S3, Lambda, ECS, EKS | CloudWatch | Cost Explorer |
| Azure | VMs, App Services, SQL, Functions | Monitor | Cost Management |
| GCP | Compute, Cloud SQL, GKE, Functions | Monitoring | Billing |

### 6.7.3 Cloud Account Configuration

**Account Fields**
| Field | Type | Description |
|-------|------|-------------|
| Provider | Enum | AWS/Azure/GCP |
| Account ID | Text | Provider account ID |
| Name | Text | Display name |
| Credential Type | Enum | Access key/Role/Service account |
| Credentials | Encrypted | Authentication credentials |
| Regions | Array | Enabled regions |
| Sync Enabled | Boolean | Auto-sync active |
| Sync Interval | Duration | Sync frequency |

**Sync Options**
| Option | Description |
|--------|-------------|
| Sync Resources | Discover and update resources |
| Sync Costs | Retrieve cost data |
| Sync Metrics | Collect performance metrics |

### 6.7.4 Cloud Resource Attributes

**Core Fields**
| Field | Type | Description |
|-------|------|-------------|
| Resource ID | Text | Provider resource ID |
| Name | Text | Resource name |
| Type | Text | Resource type |
| Region | Text | Deployment region |
| Status | Enum | Running/Stopped/Terminated |
| Provider | Enum | AWS/Azure/GCP |

**Metadata**
| Field | Type | Description |
|-------|------|-------------|
| Tags | Key-Value | Provider tags |
| Properties | JSON | Type-specific properties |
| Created At | Timestamp | Creation time |
| Last Seen | Timestamp | Last sync time |

**Mapping**
| Field | Type | Description |
|-------|------|-------------|
| Application | Reference | Mapped application |
| Environment | Reference | Mapped environment |
| Mapping Source | Enum | Manual/Tag-based/Rule |

### 6.7.5 Resource Mapping Rules

**Rule Configuration**
| Field | Description |
|-------|-------------|
| Name | Rule name |
| Priority | Execution order |
| Provider | Target provider (or all) |
| Resource Type | Target resource type |
| Tag Key | Tag to match |
| Tag Pattern | Value pattern (regex) |
| Target Application | Application to map to |
| Target Environment | Environment type |

**Example Mapping Rules**
```
Rule: "Production App Mapping"
- Tag Key: "Environment"
- Tag Pattern: "prod*"
- Target Environment: Production

Rule: "App Name Mapping"
- Tag Key: "Application"
- Target Application: Match tag value to app name
```

### 6.7.6 Cost Management

**Cost Data Fields**
| Field | Description |
|-------|-------------|
| Period | Month/day of costs |
| Service | Cloud service name |
| Region | Resource region |
| Resource ID | Specific resource |
| Cost | Amount |
| Currency | Cost currency |

**Cost Views**
- By cloud account
- By service
- By region
- By application
- By tag
- Trend over time
- Forecast projection

### 6.7.7 Cloud Dashboard Widgets

- Total cloud spend
- Spend by provider
- Top 10 costly resources
- Cost trend chart
- Resource count by type
- Resource health overview

---

## 6.8 On-Call Management Module

### 6.8.1 Overview

On-Call Management handles scheduling, rotations, and escalations for incident response teams.

### 6.8.2 Schedule Configuration

**Schedule Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Schedule name |
| Description | Text | Schedule description |
| Timezone | Timezone | Schedule timezone |
| Rotation Type | Enum | Daily/Weekly/Bi-weekly/Custom |
| Handoff Time | Time | Shift change time |
| Handoff Day | Enum | Day for weekly rotations |
| Color | Color | Calendar display color |

**Rotation Types**

| Type | Description |
|------|-------------|
| Daily | Rotates every day |
| Weekly | Rotates every week |
| Bi-weekly | Rotates every 2 weeks |
| Custom | Custom rotation pattern |

### 6.8.3 Rotation Management

**Rotation Members**
- Ordered list of on-call engineers
- Position in rotation
- Active/inactive status
- Coverage gaps detection

**Rotation Operations**
- Add/remove members
- Reorder rotation
- Preview upcoming schedule
- Export calendar (iCal)

### 6.8.4 Schedule Overrides

**Override Fields**
| Field | Type | Description |
|-------|------|-------------|
| Schedule | Reference | Parent schedule |
| Start Time | Timestamp | Override start |
| End Time | Timestamp | Override end |
| Original User | User Reference | Replaced user |
| Override User | User Reference | Covering user |
| Reason | Text | Override reason |

**Override Types**
- Single shift coverage
- Vacation coverage
- Temporary swap
- Emergency coverage

### 6.8.5 Shift Swaps

**Swap Process**
1. User requests swap
2. Potential swappers notified
3. Swap accepted by another user
4. Swap confirmed and recorded

### 6.8.6 Escalation Policies

**Policy Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Policy name |
| Description | Text | Policy description |
| Repeat | Integer | Times to repeat escalation |
| Repeat Interval | Duration | Time between repeats |

**Escalation Steps**
| Field | Type | Description |
|-------|------|-------------|
| Step Number | Integer | Escalation order |
| Delay | Duration | Wait before this step |
| Targets | References | Users/schedules to notify |
| Channels | Array | Notification channels |

**Example Escalation Policy**
```
Policy: "Critical Incident"
Step 1 (0 min):  Notify on-call via SMS + Phone
Step 2 (5 min):  Notify backup on-call via SMS + Phone
Step 3 (10 min): Notify team lead via SMS + Phone + Email
Step 4 (15 min): Notify IT Manager via Phone + Email
Repeat: 3 times every 15 minutes
```

### 6.8.7 On-Call Dashboard

**Current On-Call View**
- Who's on call now (per schedule)
- Upcoming shifts
- Recent incidents
- Coverage gaps

**My On-Call View**
- My upcoming shifts
- Swap requests
- Override requests
- Incident history

---

## 6.9 Knowledge Base Module

### 6.9.1 Overview

The Knowledge Base provides a centralized repository for documentation, solutions, and procedures.

### 6.9.2 Article Attributes

**Core Fields**
| Field | Type | Description |
|-------|------|-------------|
| Article ID | Auto-generated | KB-00001 |
| Title | Text | Article title |
| Content | Rich Text | Article body (Markdown) |
| Summary | Text | Brief summary |
| Status | Enum | Draft/Review/Published/Archived |
| Type | Enum | How-to/Troubleshooting/FAQ/Reference/Policy |
| Visibility | Enum | Public/Internal/Restricted |

**Categorization**
| Field | Type | Description |
|-------|------|-------------|
| Category | Reference | Primary category |
| Tags | Array | Search tags |
| Applications | References | Related applications |

**Authorship**
| Field | Type | Description |
|-------|------|-------------|
| Author | User Reference | Original author |
| Last Editor | User Reference | Last modifier |
| Reviewers | User References | Approved reviewers |

**Metrics**
| Field | Type | Description |
|-------|------|-------------|
| View Count | Integer | Total views |
| Helpful Count | Integer | Helpful votes |
| Not Helpful Count | Integer | Not helpful votes |
| Last Viewed | Timestamp | Most recent view |

### 6.9.3 Article Types

| Type | Description | Use Case |
|------|-------------|----------|
| How-to | Step-by-step instructions | Procedures, tutorials |
| Troubleshooting | Problem resolution guides | Issue resolution |
| FAQ | Frequently asked questions | Common queries |
| Reference | Technical reference | API docs, configs |
| Policy | Policy documentation | Compliance, standards |
| Known Error | Known issue documentation | KEDB entries |

### 6.9.4 Article Workflow

```
DRAFT --> REVIEW --> PUBLISHED --> ARCHIVED
  ^          |           |
  |          v           v
  +------ REJECTED   REVISION
```

### 6.9.5 Version Control

**Version Tracking**
- Automatic versioning on publish
- Version comparison (diff)
- Rollback capability
- Version history

### 6.9.6 Article Features

**Rich Content**
- Markdown support
- Code syntax highlighting
- Image embedding
- File attachments
- Table support
- Anchor links

**Search**
- Full-text search
- Tag-based filtering
- Category browsing
- Recent articles
- Popular articles

**Feedback System**
- Helpful/Not helpful voting
- Comment feedback
- Improvement suggestions
- Usage analytics

**Related Content**
- Related articles (manual)
- Suggested articles (auto)
- Linked issues/problems

---

## 6.10 Reporting & Analytics Module

### 6.10.1 Overview

Reporting provides dashboards, reports, and analytics for operational insights and executive visibility.

### 6.10.2 Dashboard System

**Dashboard Layout**
- 12-column grid system
- Drag-and-drop widgets
- Configurable refresh rates
- Personal and shared dashboards

**Widget Types**
| Type | Description | Use Cases |
|------|-------------|-----------|
| Stat | Single metric display | KPIs, counts |
| Chart | Line/bar/pie/area charts | Trends, distributions |
| Table | Data table | Lists, details |
| List | Item list | Recent items, top N |

**Widget Configuration**
| Field | Description |
|-------|-------------|
| Title | Widget title |
| Data Source | Data query |
| Chart Type | Visualization type |
| Filters | Data filters |
| Refresh Interval | Auto-refresh rate |
| Size | Grid width/height |
| Position | Grid X/Y position |

### 6.10.3 Built-in Dashboards

**Executive Dashboard**
- Total open issues
- SLA compliance rate
- Change success rate
- Top problem areas
- Trend charts

**Service Desk Dashboard**
- Open tickets by priority
- Tickets by status
- Agent workload
- SLA at risk
- Recent activity

**Change Dashboard**
- Pending changes
- Changes by status
- Upcoming change windows
- Change calendar
- Success/failure rates

**Application Health Dashboard**
- Health score overview
- Critical applications
- Health by tier
- Trend analysis

### 6.10.4 Report Templates

**Template Configuration**
| Field | Description |
|-------|-------------|
| Name | Report name |
| Description | Report purpose |
| Type | Report type |
| Query Config | Data query definition |
| Filters | Available filters |
| Groupings | Data groupings |
| Metrics | Included metrics |
| Chart Config | Visualization settings |
| Output Format | Default export format |

**Built-in Report Types**
| Report | Description |
|--------|-------------|
| Issue Summary | Issue statistics and trends |
| SLA Performance | SLA compliance metrics |
| Agent Performance | Agent workload and metrics |
| Change Analysis | Change success and risk analysis |
| Problem Analysis | Problem trends and root causes |
| Application Health | Health scores and trends |
| Cloud Cost Report | Cloud spending analysis |
| Audit Report | Activity audit trail |

### 6.10.5 Scheduled Reports

**Schedule Configuration**
| Field | Description |
|-------|-------------|
| Template | Report template |
| Frequency | Daily/Weekly/Monthly/Custom |
| Cron Expression | Custom schedule |
| Timezone | Schedule timezone |
| Date Range | Report date range type |
| Filters | Applied filters |
| Format | Output format |
| Delivery | Delivery method |
| Recipients | Email recipients |

**Delivery Methods**
| Method | Description |
|--------|-------------|
| Email | Send as attachment |
| Webhook | POST to URL |
| Slack | Post to channel |
| Storage | Save to file storage |

### 6.10.6 Export Formats

| Format | Description | Use Case |
|--------|-------------|----------|
| JSON | Raw data | API integration |
| CSV | Comma-separated | Spreadsheet import |
| Excel | XLSX workbook | Business users |
| PDF | Formatted document | Printing, sharing |

### 6.10.7 Custom Report Builder

**Builder Features**
- Visual query builder
- Drag-and-drop fields
- Filter configuration
- Grouping options
- Chart selection
- Preview mode
- Save as template

---

## 6.11 Asset Management Module

### 6.11.1 Overview

Asset Management tracks IT hardware, software, and other assets throughout their lifecycle.

### 6.11.2 Asset Attributes

**Core Fields**
| Field | Type | Description |
|-------|------|-------------|
| Asset Tag | Auto-generated | AST-00001 |
| Name | Text | Asset name |
| Type | Enum | Hardware/Software/Network/Cloud |
| Category | Enum | Detailed category |
| Status | Enum | Lifecycle status |
| Serial Number | Text | Manufacturer serial |

**Hardware Details**
| Field | Type | Description |
|-------|------|-------------|
| Manufacturer | Text | Device manufacturer |
| Model | Text | Model name/number |
| Specifications | JSON | Technical specs |
| MAC Address | Text | Network MAC |
| IP Address | Text | Assigned IP |
| Hostname | Text | Network hostname |

**Software Details**
| Field | Type | Description |
|-------|------|-------------|
| Vendor | Text | Software vendor |
| Version | Text | Current version |
| License Type | Enum | License model |
| License Count | Integer | Licensed seats |
| License Key | Encrypted | License key |
| Expiry Date | Date | License expiration |

**Ownership**
| Field | Type | Description |
|-------|------|-------------|
| Owner | User Reference | Assigned user |
| Department | Text | Department |
| Location | Text | Physical location |
| Cost Center | Text | Financial code |

**Procurement**
| Field | Type | Description |
|-------|------|-------------|
| Purchase Date | Date | Acquisition date |
| Purchase Cost | Decimal | Original cost |
| Vendor | Text | Purchase vendor |
| PO Number | Text | Purchase order |
| Warranty Expiry | Date | Warranty end date |

**Depreciation**
| Field | Type | Description |
|-------|------|-------------|
| Depreciation Method | Enum | Calculation method |
| Useful Life | Integer | Years |
| Salvage Value | Decimal | End value |
| Current Value | Computed | Calculated value |

### 6.11.3 Asset Categories

**Hardware Categories**
- Server
- Workstation
- Laptop
- Mobile Device
- Printer
- Network Device
- Storage
- Peripheral

**Software Categories**
- Operating System
- Business Application
- Development Tool
- Security Software
- SaaS Subscription
- Database
- Middleware

**Network Categories**
- Router
- Switch
- Firewall
- Load Balancer
- Access Point
- VPN Appliance

### 6.11.4 Asset Lifecycle

```
ORDERED --> RECEIVED --> IN_STOCK --> DEPLOYED --> IN_USE --> MAINTENANCE --> RETIRED --> DISPOSED
                                         |                        |
                                         +---- RESERVED <---------+
```

**Status Definitions**
| Status | Description |
|--------|-------------|
| Ordered | Purchase ordered |
| Received | Delivered, not inventoried |
| In Stock | Available in inventory |
| Reserved | Reserved for deployment |
| Deployed | Assigned and active |
| In Use | Actively being used |
| Maintenance | Under repair/maintenance |
| Retired | End of life |
| Disposed | Physically disposed |

### 6.11.5 Asset Features

**Inventory Management**
- Barcode/QR code support
- Bulk import/export
- Stock levels
- Reorder alerts

**License Management**
- License compliance tracking
- Expiration alerts
- Usage tracking
- Cost optimization

**Audit Trail**
- Assignment history
- Location changes
- Status changes
- Maintenance records

---

## 6.12 Workflow Automation Module

### 6.12.1 Overview

Workflow Automation enables rule-based automation of routine tasks, routing, and notifications.

### 6.12.2 Workflow Rule Structure

**Rule Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Rule name |
| Description | Text | Rule purpose |
| Entity Type | Enum | Target entity |
| Trigger | Enum | When to execute |
| Enabled | Boolean | Active status |
| Priority | Integer | Execution order |
| Stop on Match | Boolean | Halt processing |

### 6.12.3 Supported Entity Types

| Entity | Triggers | Actions |
|--------|----------|---------|
| Issue | Create, Update, Status Change, Assignment | Set fields, Assign, Notify, Escalate |
| Problem | Create, Update, Status Change | Set fields, Assign, Notify, Link |
| Change | Create, Update, Approval, Implementation | Set fields, Assign, Notify |
| Request | Create, Update, Approval, Completion | Set fields, Assign, Notify |

### 6.12.4 Trigger Types

| Trigger | Description |
|---------|-------------|
| on_create | When entity is created |
| on_update | When entity is modified |
| on_status_change | When status changes |
| on_assignment | When assigned/reassigned |
| on_sla_warning | When SLA warning threshold |
| on_sla_breach | When SLA is breached |
| scheduled | Time-based trigger |

### 6.12.5 Condition Configuration

**Condition Structure**
```json
{
  "field": "priority",
  "operator": "equals",
  "value": "critical"
}
```

**Supported Operators**
| Operator | Description | Field Types |
|----------|-------------|-------------|
| equals | Exact match | All |
| not_equals | Not equal | All |
| contains | Contains substring | Text |
| not_contains | Doesn't contain | Text |
| starts_with | Starts with | Text |
| ends_with | Ends with | Text |
| greater_than | Greater than | Number, Date |
| less_than | Less than | Number, Date |
| is_empty | Is null/empty | All |
| is_not_empty | Has value | All |
| in | In list | All |
| not_in | Not in list | All |
| matches | Regex match | Text |

**Condition Groups**
- AND logic within group
- OR logic between groups
- Nested condition support

### 6.12.6 Action Types

| Action | Description | Parameters |
|--------|-------------|------------|
| set_field | Set field value | Field, Value |
| assign_to_user | Assign to user | User ID |
| assign_to_group | Assign to group | Group ID |
| change_status | Change status | New status |
| change_priority | Change priority | New priority |
| add_comment | Add comment | Comment text, Internal flag |
| send_notification | Send notification | Template, Recipients |
| send_email | Send email | Template, Recipients |
| escalate | Escalate entity | Escalation policy |
| link_to_problem | Link to problem | Problem ID or auto |
| create_task | Create related task | Task template |
| webhook | Call external URL | URL, Payload |

### 6.12.7 Example Workflow Rules

**Auto-Assign Critical Issues**
```
Name: "Auto-assign P1 to Senior Team"
Entity: Issue
Trigger: on_create
Conditions:
  - priority equals "critical"
Actions:
  - assign_to_group: "senior-engineers"
  - send_notification: "critical-issue-alert"
```

**SLA Breach Escalation**
```
Name: "Escalate SLA Breaches"
Entity: Issue
Trigger: on_sla_breach
Conditions:
  - status not_equals "resolved"
Actions:
  - set_field: escalated = true
  - escalate: "standard-escalation"
  - add_comment: "Automatically escalated due to SLA breach"
```

**Auto-Close Resolved Issues**
```
Name: "Auto-close after 5 days"
Entity: Issue
Trigger: scheduled (daily)
Conditions:
  - status equals "resolved"
  - resolved_at less_than "5 days ago"
Actions:
  - change_status: "closed"
  - add_comment: "Auto-closed after 5 days in resolved status"
```

---

## 6.13 Integrations Module

### 6.13.1 Overview

Integrations enable connectivity with external systems through APIs, webhooks, and pre-built connectors.

### 6.13.2 API Keys

**API Key Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Key identifier |
| Key | Generated | API key (hashed) |
| Permissions | Array | Allowed scopes |
| Rate Limit | Integer | Requests per minute |
| IP Whitelist | Array | Allowed IPs |
| Expires At | Timestamp | Expiration date |
| Last Used | Timestamp | Last usage |

**Permission Scopes**
- read:issues
- write:issues
- read:changes
- write:changes
- read:requests
- write:requests
- read:users
- admin:all

### 6.13.3 Webhooks

**Webhook Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Webhook name |
| URL | URL | Target endpoint |
| Events | Array | Subscribed events |
| Headers | Key-Value | Custom headers |
| Secret | Text | Signing secret |
| Enabled | Boolean | Active status |
| Retry Count | Integer | Retry attempts |
| Retry Delay | Duration | Delay between retries |

**Webhook Events**
| Category | Events |
|----------|--------|
| Issues | issue.created, issue.updated, issue.resolved, issue.closed |
| Problems | problem.created, problem.updated, problem.resolved |
| Changes | change.created, change.approved, change.rejected, change.implemented |
| Requests | request.created, request.approved, request.completed |
| Users | user.created, user.updated, user.deactivated |

**Webhook Payload Structure**
```json
{
  "event": "issue.created",
  "timestamp": "2024-01-15T10:30:00Z",
  "tenant": "acme",
  "data": {
    "id": "uuid",
    "issueNumber": "ISS-00001",
    "title": "Issue title",
    "priority": "high",
    "status": "new"
  },
  "actor": {
    "id": "user-uuid",
    "email": "user@example.com"
  }
}
```

**Webhook Security**
- HMAC-SHA256 signature
- Signature in X-Webhook-Signature header
- Timestamp validation
- IP verification (optional)

### 6.13.4 Pre-built Integrations

**Communication**
| Integration | Features |
|-------------|----------|
| Slack | Notifications, commands, approvals |
| Microsoft Teams | Notifications, cards |
| Email (SendGrid) | Notifications, inbound |
| SMS (Twilio) | Alerts, notifications |

**Monitoring**
| Integration | Features |
|-------------|----------|
| PagerDuty | Incident sync, on-call |
| Datadog | Alerts, metrics |
| New Relic | Alerts, APM data |
| Prometheus | Metrics ingestion |

**Cloud Providers**
| Integration | Features |
|-------------|----------|
| AWS | Resources, costs, CloudWatch |
| Azure | Resources, costs, Monitor |
| GCP | Resources, costs, Monitoring |

**DevOps**
| Integration | Features |
|-------------|----------|
| GitHub | Issues, PRs, deployments |
| GitLab | Issues, MRs, pipelines |
| Jira | Issue sync, bidirectional |
| Jenkins | Build status, deployments |

### 6.13.5 Integration Configuration

**Common Settings**
| Field | Description |
|-------|-------------|
| Name | Integration name |
| Type | Integration type |
| Enabled | Active status |
| Credentials | Authentication |
| Sync Interval | Auto-sync frequency |
| Field Mappings | Field mapping rules |

**Field Mapping**
```json
{
  "source_field": "priority",
  "target_field": "urgency",
  "mapping": {
    "critical": "P1",
    "high": "P2",
    "medium": "P3",
    "low": "P4"
  }
}
```

---

## 6.14 Administration Module

### 6.14.1 Overview

Administration provides platform configuration, user management, and system settings.

### 6.14.2 User Management

**User Operations**
- Create users (manual or invite)
- Update user details
- Deactivate users
- Reset passwords
- Manage roles
- View activity

**User Fields**
| Field | Type | Description |
|-------|------|-------------|
| Email | Email | Login email |
| First Name | Text | First name |
| Last Name | Text | Last name |
| Display Name | Text | Display name |
| Phone | Phone | Contact phone |
| Title | Text | Job title |
| Department | Text | Department |
| Status | Enum | Active/Inactive |
| Roles | References | Assigned roles |
| Groups | References | Group memberships |

### 6.14.3 Role Management

**Built-in Roles**
| Role | Description | Key Permissions |
|------|-------------|-----------------|
| admin | Full system access | All permissions |
| manager | Team management | Approve, assign, report |
| agent | Service desk work | Issues, requests, KB |
| requester | End user | Submit requests, view own |
| readonly | View only access | Read all, write none |

**Custom Roles**
- Create custom roles
- Assign specific permissions
- Copy from existing roles
- Role hierarchy (inheritance)

**Permission Categories**
| Category | Permissions |
|----------|-------------|
| Users | read, create, update, delete, manage_roles |
| Groups | read, create, update, delete, manage_members |
| Issues | read, create, update, delete, assign, escalate |
| Problems | read, create, update, delete, assign |
| Changes | read, create, update, approve, implement |
| Requests | read, create, update, approve, fulfill |
| Catalog | read, manage |
| Applications | read, create, update, delete |
| Cloud | read, manage |
| Reports | read, create, manage |
| KB | read, create, update, publish |
| Settings | read, manage |
| Integrations | read, manage |
| Workflows | read, manage |
| SLA | read, manage |

### 6.14.4 Group Management

**Group Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Group name |
| Description | Text | Group purpose |
| Type | Enum | Team/Department/Assignment |
| Members | References | Group members |
| Managers | References | Group managers |
| Parent | Reference | Parent group |

**Group Uses**
- Assignment targets
- Permission inheritance
- Notification recipients
- Approval groups
- On-call teams

### 6.14.5 Tenant Settings

**Branding**
| Setting | Description |
|---------|-------------|
| Company Name | Organization name |
| Logo | Company logo |
| Primary Color | Theme color |
| Favicon | Browser icon |

**Localization**
| Setting | Description |
|---------|-------------|
| Timezone | Default timezone |
| Date Format | Date display format |
| Time Format | Time display format |
| Language | UI language |

**Security**
| Setting | Description |
|---------|-------------|
| Password Policy | Minimum requirements |
| Session Timeout | Inactivity timeout |
| 2FA Required | Enforce 2FA |
| IP Restrictions | Allowed IP ranges |

**Email**
| Setting | Description |
|---------|-------------|
| From Address | Sender email |
| Reply-To | Reply address |
| Email Provider | SendGrid/SES/SMTP |
| Provider Config | API keys, credentials |

**Notifications**
| Setting | Description |
|---------|-------------|
| Email Enabled | Send email notifications |
| Slack Enabled | Send Slack notifications |
| SMS Enabled | Send SMS notifications |
| Digest Frequency | Notification digest |

### 6.14.6 SLA Policy Management

**SLA Policy Fields**
| Field | Type | Description |
|-------|------|-------------|
| Name | Text | Policy name |
| Description | Text | Policy description |
| Entity Type | Enum | Issue/Problem/Request |
| Conditions | JSON | When policy applies |
| Targets | Array | SLA targets |

**SLA Target Fields**
| Field | Type | Description |
|-------|------|-------------|
| Metric | Enum | Response/Resolution/First Update |
| Priority | Enum | Target priority |
| Target | Duration | Target time |
| Warning | Percentage | Warning threshold |
| Business Hours | Boolean | Use business hours |

### 6.14.7 Email Configuration

**Inbound Email**
| Field | Description |
|-------|-------------|
| Provider | SendGrid/Mailgun/Generic |
| Webhook URL | Provider webhook endpoint |
| Default Priority | Auto-assign priority |
| Default Group | Auto-assign group |
| Domain Whitelist | Allowed sender domains |
| Domain Blacklist | Blocked domains |
| Auto-Reply | Enable auto-reply |
| Reply Template | Auto-reply template |

**Outbound Email**
| Field | Description |
|-------|-------------|
| Provider | SendGrid/SES/SMTP |
| API Key | Provider API key |
| From Address | Sender address |
| Templates | Email templates |

### 6.14.8 Audit & Compliance

**Audit Log Access**
- View all user actions
- Filter by user, action, entity
- Export audit data
- Retention policy configuration

**Compliance Features**
- Data retention policies
- Export user data (GDPR)
- Delete user data (GDPR)
- Audit report generation

---

## 6.15 Data Migration Module

### 6.15.1 Overview

The Data Migration module provides automated tools for importing ITSM data from legacy systems such as ServiceNow, BMC Remedy, Jira Service Management, and generic CSV files. It enables organizations to migrate historical data while maintaining data integrity and minimizing downtime during platform transitions.

### 6.15.2 Key Capabilities

**Supported Source Systems**
- ServiceNow (XML, JSON, REST API)
- BMC Remedy (CSV export)
- Jira Service Management (JSON export)
- Generic CSV files (configurable mappings)

**Entity Types**
- Incidents
- Service Requests
- Changes
- Users and Groups
- Applications
- Problems (roadmap)

**Migration Features**
- Upload and parse data files (CSV, XML, JSON)
- Preview data with field mapping visualization
- Intelligent field mapping with transformation rules
- Duplicate detection and conflict resolution
- Batch processing with progress tracking
- Rollback capability for failed migrations
- Migration history and audit trail

### 6.15.3 Migration Workflow

**Phase 1: Upload & Parse**
1. Upload source system export file
2. Automatic format detection (CSV/XML/JSON)
3. Parse and validate file structure
4. Extract records with metadata

**Phase 2: Field Mapping**
1. Auto-detect field mappings based on source system
2. Preview mapping suggestions
3. Customize field transformations
4. Map user emails and group names
5. Define status and priority mappings
6. Save mapping as reusable template

**Phase 3: Preview & Validate**
1. Generate preview with sample records
2. Identify unmapped fields
3. Validate required field mappings
4. Display recommendations and warnings
5. Estimate import duration

**Phase 4: Execute Migration**
1. Create migration job
2. Process records in configurable batches
3. Apply field transformations
4. Handle duplicates per configuration
5. Track imported records for rollback
6. Generate detailed migration report

**Phase 5: Review & Rollback**
1. View migration status and statistics
2. Review errors and warnings
3. Export migration report
4. Rollback if needed (deletes imported records)

### 6.15.4 Field Mapping Engine

**Built-in Transformations**
- `uppercase` - Convert to uppercase
- `lowercase` - Convert to lowercase
- `trim` - Remove whitespace
- `date` - Parse various date formats
- `boolean` - Convert to true/false
- Custom JavaScript functions (Enterprise plan)

**Default Mappings**

ServiceNow Incident:
```
number → external_id
short_description → title
description → description
priority → priority (1-4 scale)
state → status
assigned_to → assigned_to_email
assignment_group → assigned_group
opened_at → created_at
```

BMC Remedy Incident:
```
Incident Number → external_id
Description → title
Detailed Description → description
Priority → priority
Status → status
Assigned To → assigned_to_email
```

Jira Issue:
```
key → external_id
fields.summary → title
fields.description → description
fields.priority.id → priority
fields.status.name → status
fields.assignee.emailAddress → assigned_to_email
```

### 6.15.5 API Endpoints

```
POST   /v1/migration/upload           Upload file and create migration job
GET    /v1/migration/:jobId           Get migration job status
POST   /v1/migration/:jobId/execute   Execute migration job
GET    /v1/migration                  List migration jobs for tenant
POST   /v1/migration/templates        Save field mapping template
GET    /v1/migration/templates        List mapping templates
DELETE /v1/migration/:jobId/rollback  Rollback migration
```

### 6.15.6 Database Schema

**migration_jobs** (public schema)
- Tracks migration job status and metadata
- Stores mapping configuration
- Records processing statistics
- Maintains error logs

**migration_mappings** (public schema)
- Reusable field mapping templates
- Source system configurations
- Custom transformation rules

**migration_imported_records** (public schema)
- Tracks imported records by source ID
- Enables rollback functionality
- Prevents duplicate imports
- Audit trail for data lineage

### 6.15.7 Performance Characteristics

- Parse rate: 10,000 records/minute (CSV)
- Import rate: 5,000 records/minute (with validation)
- Max file size: 100 MB (Professional), 500 MB (Enterprise)
- Batch size: Configurable (default 100 records)
- Concurrent migrations: 1 (Professional), 5 (Enterprise)

### 6.15.8 Security & Compliance

- File upload validation and sanitization
- Encrypted storage of uploaded files
- Access control by tenant isolation
- Audit logging of all migration operations
- Data retention policy compliance
- Rollback capability for data governance

---

## 6.16 SSO & Authentication Module

### 6.16.1 Overview

The SSO & Authentication module provides enterprise-grade single sign-on capabilities using industry-standard protocols (SAML 2.0 and OIDC). It enables organizations to integrate FireLater with their existing identity providers for centralized authentication and user management.

### 6.16.2 Supported Protocols

**SAML 2.0 (Security Assertion Markup Language)**
- Industry standard for enterprise SSO
- Supports Identity Provider (IdP) initiated and Service Provider (SP) initiated flows
- XML-based assertions with digital signatures
- Single Logout (SLO) support

**OIDC (OpenID Connect)**
- Modern authentication protocol built on OAuth 2.0
- JSON-based tokens (JWT)
- UserInfo endpoint integration
- Authorization code flow with PKCE

### 6.16.3 Supported Identity Providers

**Native Integrations**
- **Azure AD / Entra ID** (Microsoft 365, Office 365)
- Okta
- Google Workspace
- Auth0
- Generic SAML 2.0 providers
- Generic OIDC providers

**Azure AD Specific Features**
- Microsoft Graph API integration
- Automatic user sync from Azure AD
- Group membership synchronization
- Conditional Access Policy support
- Multi-factor authentication (MFA) passthrough

### 6.16.4 Key Capabilities

**SSO Provider Management**
- Configure multiple SSO providers per tenant
- Set default provider for automatic redirects
- Enable/disable providers without deletion
- Test SSO configuration before activation

**Just-In-Time (JIT) Provisioning**
- Automatically create users on first SSO login
- Update user attributes from IdP
- Assign default role to new users
- Map IdP groups to FireLater roles

**Attribute Mapping**
- Map IdP attributes to user fields:
  - Email (required)
  - First Name / Last Name
  - Display Name
  - Department
  - Job Title
  - Phone Number
  - Groups / Roles

**Session Management**
- Track active SSO sessions
- Support for Single Logout (SLO)
- Session timeout configuration
- Force logout on role/group changes

### 6.16.5 Configuration Options

**SAML 2.0 Configuration**
```yaml
Entry Point URL: IdP SSO endpoint
Issuer/Entity ID: Unique identifier
Certificate: X.509 public certificate
Callback URL: SP assertion consumer service
Logout URL: IdP single logout endpoint
Signature Algorithm: RSA-SHA256 (default)
Name ID Format: Email address (default)
```

**OIDC Configuration**
```yaml
Issuer: IdP base URL
Authorization URL: OAuth 2.0 auth endpoint
Token URL: OAuth 2.0 token endpoint
UserInfo URL: OIDC userinfo endpoint
Client ID: Application identifier
Client Secret: Application secret
Callback URL: Redirect URI
Scope: openid profile email
```

**Azure AD Configuration**
```yaml
Tenant ID: Azure AD tenant identifier
Client ID: Application (client) ID
Client Secret: Client secret value
Directory ID: Optional directory filter
Graph Endpoint: Microsoft Graph API URL
Sync Schedule: hourly/daily/weekly/manual
```

### 6.16.6 Security Features

**Authentication Security**
- Encrypted credential storage (AES-256)
- Certificate validation for SAML
- Token signature verification
- CSRF protection on callbacks
- Replay attack prevention

**Access Control**
- Require verified email addresses
- Enforce MFA from IdP
- Conditional access based on user attributes
- IP whitelist/blacklist (Enterprise)
- Device trust verification (Enterprise)

**Audit & Compliance**
- Log all SSO authentication attempts
- Track session creation and termination
- Record attribute changes from IdP
- Export audit logs for compliance
- SAML assertion archiving (Enterprise)

### 6.16.7 API Endpoints

```
# SSO Provider Management
POST   /v1/sso/providers              Create SSO provider
GET    /v1/sso/providers              List SSO providers
GET    /v1/sso/providers/:id          Get provider details
PUT    /v1/sso/providers/:id          Update provider
DELETE /v1/sso/providers/:id          Delete provider

# SSO Authentication Flow
GET    /v1/sso/:tenant/login          Initiate SSO login
POST   /v1/sso/:tenant/callback       SSO callback handler
GET    /v1/sso/:tenant/logout         Initiate single logout
POST   /v1/sso/:tenant/logout/callback Logout callback

# Azure AD Sync
POST   /v1/sso/azure/sync             Trigger Azure AD sync
GET    /v1/sso/azure/sync/history     Get sync history
GET    /v1/sso/azure/sync/status      Get current sync status
```

### 6.16.8 Database Schema

**sso_providers** (tenant schema)
- SSO provider configurations
- SAML/OIDC settings
- Attribute mappings
- JIT provisioning rules

**sso_sessions** (tenant schema)
- Active SSO sessions
- Session metadata and expiry
- Single logout correlation

**azure_ad_integration** (tenant schema)
- Azure AD specific configuration
- Sync schedule and filters
- Graph API credentials

**azure_ad_sync_history** (tenant schema)
- Sync execution logs
- User/group sync statistics
- Error tracking

### 6.16.9 User Experience

**End User Login Flow**
1. User visits FireLater login page
2. Enters tenant slug or email
3. Automatically redirected to configured IdP
4. Authenticates with corporate credentials
5. Redirected back to FireLater with SSO token
6. Session created, user logged in
7. (Optional) User created if JIT provisioning enabled

**Admin Configuration Flow**
1. Navigate to SSO settings
2. Select provider type (SAML/OIDC/Azure AD)
3. Enter provider configuration details
4. Configure attribute mappings
5. Enable JIT provisioning (optional)
6. Test SSO flow
7. Activate provider

### 6.16.10 Limitations & Considerations

**Professional Plan**
- Up to 2 SSO providers per tenant
- SAML 2.0 and OIDC support
- Basic attribute mapping
- Email-only support

**Enterprise Plan**
- Unlimited SSO providers
- Azure AD native integration with sync
- Advanced attribute mapping
- Phone and email support
- Conditional access policies
- Custom claim transformations

---

# 7. User Stories & Acceptance Criteria

## 7.1 Issue Management User Stories

### US-ISS-001: Create Issue
**As an** IT agent
**I want to** create a new issue
**So that** I can track and resolve the reported problem

**Acceptance Criteria:**
- [ ] Can enter title, description, priority, and category
- [ ] Can select affected application
- [ ] Can assign to user or group
- [ ] Issue number is auto-generated
- [ ] SLA timers start based on priority
- [ ] Requester receives confirmation notification
- [ ] Issue appears in queue immediately

### US-ISS-002: Update Issue Status
**As an** IT agent
**I want to** update issue status
**So that** stakeholders know the current progress

**Acceptance Criteria:**
- [ ] Can change status through allowed transitions
- [ ] Status change is recorded in activity log
- [ ] Notifications sent to relevant parties
- [ ] SLA timers adjust based on status
- [ ] Cannot skip required statuses

### US-ISS-003: Assign Issue
**As an** IT manager
**I want to** assign issues to team members
**So that** work is distributed appropriately

**Acceptance Criteria:**
- [ ] Can assign to individual user
- [ ] Can assign to group (auto-routing)
- [ ] Assignee receives notification
- [ ] Assignment recorded in history
- [ ] Can reassign at any time

### US-ISS-004: Add Comment
**As an** IT agent
**I want to** add comments to issues
**So that** I can communicate progress and findings

**Acceptance Criteria:**
- [ ] Can add public comments (visible to requester)
- [ ] Can add internal notes (agent only)
- [ ] Can @mention users for notification
- [ ] Can attach files to comments
- [ ] Comments appear in activity timeline

### US-ISS-005: Escalate Issue
**As an** IT agent
**I want to** escalate an issue
**So that** it receives appropriate attention

**Acceptance Criteria:**
- [ ] Can manually escalate issue
- [ ] Escalation policy is triggered
- [ ] Escalation notifications sent
- [ ] Escalation recorded in history
- [ ] Issue marked as escalated

### US-ISS-006: View My Issues
**As an** IT agent
**I want to** see issues assigned to me
**So that** I can manage my workload

**Acceptance Criteria:**
- [ ] See list of assigned issues
- [ ] Filter by status, priority
- [ ] Sort by various fields
- [ ] See SLA status indicators
- [ ] Quick actions available

### US-ISS-007: Search Issues
**As an** IT user
**I want to** search for issues
**So that** I can find relevant tickets

**Acceptance Criteria:**
- [ ] Full-text search on title/description
- [ ] Filter by status, priority, assignee
- [ ] Filter by date range
- [ ] Filter by application
- [ ] Save search filters

---

## 7.2 Change Management User Stories

### US-CHG-001: Submit Change Request
**As an** IT engineer
**I want to** submit a change request
**So that** I can implement planned changes

**Acceptance Criteria:**
- [ ] Can enter change details and justification
- [ ] Can specify implementation/rollback plans
- [ ] Can select change type (standard/normal/emergency)
- [ ] Risk assessment is captured
- [ ] Change window is selected
- [ ] Approvers are auto-assigned based on type

### US-CHG-002: Review Change Request
**As a** change manager
**I want to** review change requests
**So that** I can assess risk and approve/reject

**Acceptance Criteria:**
- [ ] See pending changes in queue
- [ ] View all change details
- [ ] Add review comments
- [ ] Approve or reject with reason
- [ ] Request additional information
- [ ] Approval recorded in history

### US-CHG-003: Schedule CAB Meeting
**As a** change manager
**I want to** schedule CAB meetings
**So that** changes can be reviewed collectively

**Acceptance Criteria:**
- [ ] Can create CAB meeting
- [ ] Can add changes to agenda
- [ ] Attendees are notified
- [ ] Agenda is generated
- [ ] Meeting minutes can be recorded

### US-CHG-004: Implement Change
**As an** IT engineer
**I want to** mark change as implementing
**So that** stakeholders know work is in progress

**Acceptance Criteria:**
- [ ] Can start implementation
- [ ] Implementation steps tracked
- [ ] Can add implementation notes
- [ ] Can mark steps complete
- [ ] Notifications sent on status change

### US-CHG-005: View Change Calendar
**As an** IT manager
**I want to** view scheduled changes
**So that** I can see the change landscape

**Acceptance Criteria:**
- [ ] Calendar view of changes
- [ ] Change windows displayed
- [ ] Freeze periods highlighted
- [ ] Can filter by application/type
- [ ] Can click to view details

---

## 7.3 Service Request User Stories

### US-REQ-001: Browse Service Catalog
**As an** end user
**I want to** browse available services
**So that** I can find what I need

**Acceptance Criteria:**
- [ ] See categorized catalog items
- [ ] Search catalog items
- [ ] View item details
- [ ] See expected completion time
- [ ] Only see items I can request

### US-REQ-002: Submit Service Request
**As an** end user
**I want to** submit a service request
**So that** I can get the service I need

**Acceptance Criteria:**
- [ ] Fill out service form
- [ ] Required fields validated
- [ ] Can attach supporting files
- [ ] Request confirmation shown
- [ ] Confirmation email sent
- [ ] Request number provided

### US-REQ-003: Track My Requests
**As an** end user
**I want to** track my requests
**So that** I know the status

**Acceptance Criteria:**
- [ ] See list of my requests
- [ ] View current status
- [ ] See approval status
- [ ] View comments/updates
- [ ] Can add comments

### US-REQ-004: Approve Request
**As a** manager
**I want to** approve requests
**So that** team members can get services

**Acceptance Criteria:**
- [ ] See pending approvals
- [ ] View request details
- [ ] Approve or reject
- [ ] Add approval comments
- [ ] Requester notified of decision

### US-REQ-005: Fulfill Request
**As an** IT agent
**I want to** fulfill service requests
**So that** users receive their services

**Acceptance Criteria:**
- [ ] See assigned requests
- [ ] View fulfillment details
- [ ] Update progress
- [ ] Mark as complete
- [ ] Requester notified on completion

---

## 7.4 On-Call User Stories

### US-ONC-001: View On-Call Schedule
**As an** IT engineer
**I want to** see the on-call schedule
**So that** I know who's on call

**Acceptance Criteria:**
- [ ] See current on-call person
- [ ] View schedule calendar
- [ ] See upcoming shifts
- [ ] View by schedule/team
- [ ] Export to calendar app

### US-ONC-002: Request Shift Swap
**As an** on-call engineer
**I want to** request a shift swap
**So that** I can handle scheduling conflicts

**Acceptance Criteria:**
- [ ] Select shift to swap
- [ ] Specify reason
- [ ] Team notified of request
- [ ] Can accept swap offers
- [ ] Swap recorded in system

### US-ONC-003: Create Schedule Override
**As an** IT manager
**I want to** create schedule overrides
**So that** I can handle coverage gaps

**Acceptance Criteria:**
- [ ] Select schedule
- [ ] Specify date/time range
- [ ] Assign override person
- [ ] Original person notified
- [ ] Override shown on schedule

### US-ONC-004: Configure Escalation
**As an** IT manager
**I want to** configure escalation policies
**So that** incidents are handled appropriately

**Acceptance Criteria:**
- [ ] Create escalation policy
- [ ] Define escalation steps
- [ ] Set notification channels
- [ ] Configure delays between steps
- [ ] Link to schedules

---

## 7.5 Reporting User Stories

### US-RPT-001: View Dashboard
**As an** IT manager
**I want to** view operational dashboard
**So that** I can monitor team performance

**Acceptance Criteria:**
- [ ] See key metrics
- [ ] View trend charts
- [ ] Filter by date range
- [ ] Drill down to details
- [ ] Refresh automatically

### US-RPT-002: Generate Report
**As an** IT manager
**I want to** generate reports
**So that** I can analyze performance

**Acceptance Criteria:**
- [ ] Select report template
- [ ] Configure filters
- [ ] Preview report
- [ ] Export to PDF/Excel
- [ ] Save configuration

### US-RPT-003: Schedule Report
**As an** IT manager
**I want to** schedule automatic reports
**So that** I receive regular updates

**Acceptance Criteria:**
- [ ] Select report template
- [ ] Configure schedule
- [ ] Set recipients
- [ ] Choose delivery method
- [ ] Reports delivered on schedule

### US-RPT-004: Create Custom Dashboard
**As an** IT manager
**I want to** create custom dashboards
**So that** I see the metrics I care about

**Acceptance Criteria:**
- [ ] Create new dashboard
- [ ] Add widgets
- [ ] Configure widget data sources
- [ ] Arrange layout
- [ ] Save and share dashboard

---

# 8. System Architecture

## 8.1 Architecture Overview

```
                                    ┌─────────────────────────────────────────────┐
                                    │                  CLIENTS                     │
                                    │  Web Browser │ Mobile App │ API Consumers   │
                                    └─────────────────────────────────────────────┘
                                                         │
                                                         ▼
                                    ┌─────────────────────────────────────────────┐
                                    │              LOAD BALANCER                   │
                                    │           (nginx / AWS ALB)                  │
                                    └─────────────────────────────────────────────┘
                                                         │
                              ┌──────────────────────────┴──────────────────────────┐
                              │                                                      │
                              ▼                                                      ▼
               ┌──────────────────────────┐                        ┌──────────────────────────┐
               │       FRONTEND           │                        │        BACKEND           │
               │      (Next.js)           │                        │       (Fastify)          │
               │                          │                        │                          │
               │  - Server Components     │                        │  - REST API              │
               │  - Client Components     │                        │  - Authentication        │
               │  - API Routes            │◄──────────────────────►│  - Business Logic        │
               │  - Static Assets         │                        │  - Job Processing        │
               │                          │                        │                          │
               └──────────────────────────┘                        └──────────────────────────┘
                                                                                │
                              ┌──────────────────────────┬──────────────────────┴────────────────────────┐
                              │                          │                                               │
                              ▼                          ▼                                               ▼
               ┌──────────────────────────┐ ┌──────────────────────────┐              ┌──────────────────────────┐
               │      POSTGRESQL          │ │         REDIS            │              │       S3/MINIO           │
               │                          │ │                          │              │                          │
               │  - Multi-tenant schemas  │ │  - Session cache         │              │  - File attachments      │
               │  - Tenant data isolation │ │  - API rate limiting     │              │  - Report exports        │
               │  - Full-text search      │ │  - Job queues (BullMQ)   │              │  - Backup storage        │
               │                          │ │  - Pub/sub               │              │                          │
               └──────────────────────────┘ └──────────────────────────┘              └──────────────────────────┘
```

## 8.2 Multi-Tenancy Architecture

### Schema-Per-Tenant Model

```
PostgreSQL Database
├── public (shared schema)
│   ├── tenants
│   ├── plans
│   └── tenant_settings
│
├── tenant_acme (tenant schema)
│   ├── users
│   ├── roles
│   ├── issues
│   ├── changes
│   └── ... (all tenant tables)
│
├── tenant_globex (tenant schema)
│   ├── users
│   ├── roles
│   ├── issues
│   └── ...
│
└── tenant_... (additional tenants)
```

### Benefits

| Benefit | Description |
|---------|-------------|
| Data Isolation | Complete data separation between tenants |
| Security | No risk of cross-tenant data leakage |
| Compliance | Easier per-tenant compliance (GDPR) |
| Performance | Per-tenant query optimization |
| Backup | Per-tenant backup/restore capability |
| Customization | Per-tenant schema extensions possible |

### Trade-offs

| Trade-off | Mitigation |
|-----------|------------|
| Schema management | Automated migration system |
| Connection pooling | Shared pool with schema switching |
| Cross-tenant queries | Not supported by design |

## 8.3 Technology Stack

### Backend
| Component | Technology | Purpose |
|-----------|------------|---------|
| Runtime | Node.js 20+ | JavaScript runtime |
| Framework | Fastify 4.x | HTTP framework |
| Language | TypeScript 5.x | Type safety |
| Database | PostgreSQL 15+ | Primary datastore |
| Cache | Redis 7+ | Caching, sessions, queues |
| Queue | BullMQ | Background job processing |
| Storage | S3/MinIO | File storage |
| Email | SendGrid | Email delivery |
| SMS | Twilio | SMS delivery |

### Frontend
| Component | Technology | Purpose |
|-----------|------------|---------|
| Framework | Next.js 15+ | React framework |
| Language | TypeScript 5.x | Type safety |
| UI Library | React 19 | Component library |
| Styling | TailwindCSS 4 | Utility CSS |
| State | Zustand | Client state |
| Data Fetching | TanStack Query | Server state |
| Charts | Recharts | Data visualization |
| Icons | Lucide React | Icon library |
| Forms | React Hook Form | Form handling |
| Validation | Zod | Schema validation |

### Infrastructure
| Component | Technology | Purpose |
|-----------|------------|---------|
| Containerization | Docker | Application packaging |
| Orchestration | Docker Compose / K8s | Container orchestration |
| CI/CD | GitHub Actions | Automation pipeline |
| Monitoring | Prometheus + Grafana | Metrics and alerting |
| Logging | Pino | Structured logging |

## 8.4 API Architecture

### RESTful Design Principles

- Resource-based URLs (`/v1/issues`, `/v1/changes`)
- HTTP methods for actions (GET, POST, PUT, DELETE)
- JSON request/response bodies
- Consistent error response format
- Pagination for list endpoints
- Filtering and sorting support

### API Versioning

- Version in URL path (`/v1/...`)
- Backward compatibility within major version
- Deprecation notices before breaking changes

### Authentication Flow

```
┌────────┐                    ┌────────┐                    ┌────────┐
│ Client │                    │  API   │                    │  Redis │
└───┬────┘                    └───┬────┘                    └───┬────┘
    │                             │                             │
    │  POST /auth/login           │                             │
    │  {email, password, tenant}  │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │                             │  Validate credentials       │
    │                             │  Generate JWT tokens        │
    │                             │                             │
    │                             │  Store refresh token        │
    │                             │────────────────────────────►│
    │                             │                             │
    │  {accessToken, user}        │                             │
    │  Set-Cookie: refreshToken   │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
    │  GET /issues                │                             │
    │  Authorization: Bearer xxx  │                             │
    │────────────────────────────►│                             │
    │                             │                             │
    │                             │  Verify JWT                 │
    │                             │  Check permissions          │
    │                             │                             │
    │  {issues: [...]}            │                             │
    │◄────────────────────────────│                             │
    │                             │                             │
```

### Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Authentication | 10 requests | 1 minute |
| API (Standard) | 100 requests | 1 minute |
| API (Premium) | 1000 requests | 1 minute |
| Webhooks | 50 requests | 1 minute |

## 8.5 Job Processing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            JOB PROCESSING SYSTEM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Producer   │    │    Redis     │    │   Worker     │                  │
│  │              │    │   (BullMQ)   │    │              │                  │
│  │  API Server  │───►│              │───►│  Processor   │                  │
│  │  Scheduler   │    │  Job Queues  │    │              │                  │
│  └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                             │
│  Queues:                                                                    │
│  ├── notifications     - Email, Slack, SMS delivery                        │
│  ├── health-scores     - Application health calculation                    │
│  ├── sla-breaches      - SLA monitoring and alerts                         │
│  ├── cloud-sync        - Cloud resource synchronization                    │
│  ├── scheduled-reports - Report generation and delivery                    │
│  └── cleanup           - Data maintenance and archival                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Job Types

| Queue | Schedule | Purpose |
|-------|----------|---------|
| notifications | Event-driven | Deliver notifications across channels |
| health-scores | Hourly | Calculate application health scores |
| sla-breaches | Every 5 min | Detect SLA warnings and breaches |
| cloud-sync | Per account config | Sync cloud resources and costs |
| scheduled-reports | Per schedule config | Generate and deliver reports |
| cleanup | Daily (2 AM) | Archive old data, cleanup tokens |

---

# 9. Data Models & Relationships

## 9.1 Entity Relationship Overview

```
                                    ┌─────────────┐
                                    │   TENANT    │
                                    └──────┬──────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              │                            │                            │
              ▼                            ▼                            ▼
       ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
       │    USERS    │             │   GROUPS    │             │    ROLES    │
       └──────┬──────┘             └──────┬──────┘             └──────┬──────┘
              │                            │                            │
              │    ┌───────────────────────┴───────────────────────┐   │
              │    │                                               │   │
              ▼    ▼                                               ▼   ▼
       ┌─────────────────────────────────────────────────────────────────┐
       │                         PERMISSIONS                             │
       └─────────────────────────────────────────────────────────────────┘

       ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
       │   ISSUES    │◄───────────►│  PROBLEMS   │◄───────────►│   CHANGES   │
       └──────┬──────┘             └──────┬──────┘             └──────┬──────┘
              │                            │                            │
              └────────────────────────────┼────────────────────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │ APPLICATIONS│
                                    └──────┬──────┘
                                           │
                              ┌────────────┴────────────┐
                              │                         │
                              ▼                         ▼
                       ┌─────────────┐          ┌─────────────┐
                       │   CLOUD     │          │   ASSETS    │
                       │  RESOURCES  │          │             │
                       └─────────────┘          └─────────────┘
```

## 9.2 Core Entity Models

### User Model
```typescript
interface User {
  id: UUID;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone?: string;
  title?: string;
  department?: string;
  avatarUrl?: string;
  status: 'active' | 'inactive' | 'pending';
  emailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Relations
  roles: Role[];
  groups: Group[];
}
```

### Issue Model
```typescript
interface Issue {
  id: UUID;
  issueNumber: string;  // ISS-00001
  title: string;
  description: string;
  status: IssueStatus;
  priority: Priority;
  severity?: Severity;
  impact?: Impact;
  urgency?: Urgency;
  source: IssueSource;

  // Assignment
  assignedToId?: UUID;
  assignmentGroupId?: UUID;
  escalated: boolean;
  escalationLevel: number;

  // Relationships
  applicationId?: UUID;
  requesterId: UUID;
  parentIssueId?: UUID;

  // SLA
  responseDue?: Date;
  resolutionDue?: Date;
  responseMet?: boolean;
  resolutionMet?: boolean;
  slaBreached: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  closedAt?: Date;

  // Relations
  comments: Comment[];
  attachments: Attachment[];
  relatedChanges: Change[];
  relatedProblems: Problem[];
  worklogs: Worklog[];
}
```

### Change Model
```typescript
interface Change {
  id: UUID;
  changeNumber: string;  // CHG-00001
  title: string;
  description: string;
  justification: string;
  type: ChangeType;
  status: ChangeStatus;
  riskLevel: RiskLevel;
  impact: ChangeImpact;

  // Plans
  implementationPlan: string;
  rollbackPlan: string;
  testPlan: string;

  // Scheduling
  plannedStart?: Date;
  plannedEnd?: Date;
  actualStart?: Date;
  actualEnd?: Date;
  downtimeRequired: boolean;
  downtimeDuration?: number;

  // CAB
  cabRequired: boolean;
  cabDate?: Date;

  // Relationships
  applicationId?: UUID;
  requesterId: UUID;
  assignedToId?: UUID;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  tasks: ChangeTask[];
  approvals: ChangeApproval[];
  comments: Comment[];
  relatedIssues: Issue[];
}
```

### Service Request Model
```typescript
interface ServiceRequest {
  id: UUID;
  requestNumber: string;  // REQ-00001
  catalogItemId: UUID;
  requesterId: UUID;
  status: RequestStatus;
  priority: Priority;
  formData: Record<string, any>;

  // Assignment
  assignedToId?: UUID;
  fulfillmentGroupId?: UUID;

  // SLA
  expectedBy?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;

  // Relations
  catalogItem: CatalogItem;
  approvals: RequestApproval[];
  comments: Comment[];
  attachments: Attachment[];
}
```

### Application Model
```typescript
interface Application {
  id: UUID;
  name: string;
  shortName: string;
  description: string;
  status: AppStatus;
  tier: AppTier;
  type: AppType;

  // Ownership
  ownerId?: UUID;
  technicalOwnerId?: UUID;
  supportGroupId?: UUID;
  costCenter?: string;

  // Technical
  technologyStack: string[];
  url?: string;
  documentationUrl?: string;
  repositoryUrl?: string;

  // Health
  healthScore: number;
  healthStatus: HealthStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Relations
  environments: Environment[];
  dependencies: Application[];
  cloudResources: CloudResource[];
  issues: Issue[];
  changes: Change[];
}
```

## 9.3 Database Schema Details

### Primary Tables (Per Tenant Schema)

| Table | Description | Key Columns |
|-------|-------------|-------------|
| users | User accounts | id, email, password_hash, status |
| roles | Role definitions | id, name, description, is_system |
| permissions | Permission definitions | id, resource, action |
| role_permissions | Role-permission mapping | role_id, permission_id |
| user_roles | User-role assignments | user_id, role_id |
| groups | Team/group definitions | id, name, type |
| group_members | Group membership | group_id, user_id |
| issues | Incident tickets | id, issue_number, title, status, priority |
| issue_comments | Issue comments | id, issue_id, content, is_internal |
| problems | Problem records | id, problem_number, title, status |
| problem_relationships | Problem-issue links | problem_id, issue_id |
| changes | Change requests | id, change_number, title, status, type |
| change_tasks | Change implementation tasks | id, change_id, title, status |
| change_approvals | Change approval records | id, change_id, approver_id, status |
| catalog_categories | Service catalog categories | id, name, parent_id |
| catalog_items | Service catalog items | id, name, form_schema, category_id |
| service_requests | Service requests | id, request_number, catalog_item_id |
| request_approvals | Request approval records | id, request_id, approver_id |
| applications | Application registry | id, name, tier, health_score |
| application_health_scores | Health metrics | id, application_id, score |
| cloud_accounts | Cloud provider accounts | id, provider, account_id |
| cloud_resources | Cloud resources | id, account_id, resource_id, type |
| oncall_schedules | On-call schedules | id, name, rotation_type |
| oncall_shifts | On-call shifts | id, schedule_id, user_id, start, end |
| escalation_policies | Escalation policies | id, name, repeat_count |
| kb_articles | Knowledge articles | id, title, content, status |
| report_templates | Report definitions | id, name, type, query_config |
| scheduled_reports | Report schedules | id, template_id, schedule |
| assets | IT assets | id, asset_tag, name, type, status |
| workflow_rules | Automation rules | id, name, entity_type, trigger |
| sla_policies | SLA policy definitions | id, name, entity_type |
| sla_targets | SLA targets | id, policy_id, metric, priority, target |
| notifications | User notifications | id, user_id, type, title, read |
| audit_logs | Audit trail | id, user_id, action, entity_type |
| attachments | File attachments | id, filename, storage_path |
| api_keys | API access keys | id, name, key_hash, permissions |
| webhooks | Webhook configurations | id, name, url, events |

### Indexes Strategy

| Table | Index | Columns | Purpose |
|-------|-------|---------|---------|
| issues | idx_issues_status | status | Filter by status |
| issues | idx_issues_priority | priority | Filter by priority |
| issues | idx_issues_assigned | assigned_to_id | Filter by assignee |
| issues | idx_issues_application | application_id | Filter by application |
| issues | idx_issues_created | created_at | Sort by date |
| changes | idx_changes_status | status | Filter by status |
| changes | idx_changes_planned | planned_start | Calendar queries |
| audit_logs | idx_audit_user | user_id | User activity |
| audit_logs | idx_audit_entity | entity_type, entity_id | Entity history |
| audit_logs | idx_audit_created | created_at | Date range queries |

---

# 10. API Specifications

## 10.1 API Overview

**Base URL**: `https://api.firelater.com/v1`

**Authentication**: Bearer token in Authorization header

**Content-Type**: `application/json`

## 10.2 Common Response Formats

### Success Response
```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

### Paginated Response
```json
{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Error Response
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  }
}
```

## 10.3 Authentication Endpoints

### POST /auth/login
Authenticate user and receive tokens.

**Request**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "tenant": "acme"
}
```

**Response**
```json
{
  "data": {
    "accessToken": "eyJhbG...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "roles": ["agent"]
    }
  }
}
```

### POST /auth/refresh
Refresh access token.

**Request**
```json
{
  "tenant": "acme"
}
```
*Note: Refresh token sent via httpOnly cookie*

**Response**
```json
{
  "data": {
    "accessToken": "eyJhbG..."
  }
}
```

### POST /auth/logout
Invalidate session.

**Response**
```json
{
  "data": {
    "message": "Logged out successfully"
  }
}
```

## 10.4 Issue Endpoints

### GET /issues
List issues with filters.

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| page | integer | Page number (default: 1) |
| pageSize | integer | Items per page (default: 20) |
| status | string | Filter by status |
| priority | string | Filter by priority |
| assignedTo | uuid | Filter by assignee |
| applicationId | uuid | Filter by application |
| search | string | Search in title/description |
| sort | string | Sort field |
| order | string | Sort order (asc/desc) |

**Response**
```json
{
  "data": [
    {
      "id": "uuid",
      "issueNumber": "ISS-00001",
      "title": "Cannot login to application",
      "status": "in_progress",
      "priority": "high",
      "assignedTo": {
        "id": "uuid",
        "displayName": "John Doe"
      },
      "application": {
        "id": "uuid",
        "name": "Customer Portal"
      },
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150
  }
}
```

### POST /issues
Create new issue.

**Request**
```json
{
  "title": "Cannot login to application",
  "description": "Users are receiving 500 error when trying to login",
  "priority": "high",
  "applicationId": "uuid",
  "assignedToId": "uuid"
}
```

**Response**
```json
{
  "data": {
    "id": "uuid",
    "issueNumber": "ISS-00001",
    "title": "Cannot login to application",
    "status": "new",
    "priority": "high",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

### GET /issues/:id
Get issue details.

**Response**
```json
{
  "data": {
    "id": "uuid",
    "issueNumber": "ISS-00001",
    "title": "Cannot login to application",
    "description": "Users are receiving 500 error...",
    "status": "in_progress",
    "priority": "high",
    "severity": "S2",
    "impact": "moderate",
    "urgency": "high",
    "source": "portal",
    "assignedTo": { ... },
    "assignmentGroup": { ... },
    "application": { ... },
    "requester": { ... },
    "sla": {
      "responseDue": "2024-01-15T11:30:00Z",
      "resolutionDue": "2024-01-15T18:30:00Z",
      "responseMet": true,
      "resolutionMet": null
    },
    "comments": [ ... ],
    "attachments": [ ... ],
    "activities": [ ... ],
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

### PUT /issues/:id
Update issue.

**Request**
```json
{
  "status": "resolved",
  "resolutionNotes": "Fixed the authentication service configuration"
}
```

### POST /issues/:id/comments
Add comment to issue.

**Request**
```json
{
  "content": "Investigating the root cause",
  "isInternal": false
}
```

### POST /issues/:id/assign
Assign issue.

**Request**
```json
{
  "assignedToId": "uuid"
}
```

### POST /issues/:id/escalate
Escalate issue.

**Request**
```json
{
  "reason": "Requires senior engineer attention"
}
```

## 10.5 Change Endpoints

### GET /changes
List changes.

### POST /changes
Create change request.

**Request**
```json
{
  "title": "Upgrade database to PostgreSQL 16",
  "description": "Upgrade production database from PostgreSQL 15 to 16",
  "justification": "Security patches and performance improvements",
  "type": "normal",
  "riskLevel": "medium",
  "implementationPlan": "1. Take backup\n2. Stop application\n3. Upgrade database\n4. Verify data\n5. Restart application",
  "rollbackPlan": "1. Stop application\n2. Restore from backup\n3. Restart application",
  "testPlan": "1. Verify application connectivity\n2. Run smoke tests\n3. Verify data integrity",
  "plannedStart": "2024-01-20T02:00:00Z",
  "plannedEnd": "2024-01-20T04:00:00Z",
  "downtimeRequired": true,
  "downtimeDuration": 120,
  "applicationId": "uuid"
}
```

### POST /changes/:id/approve
Approve change request.

**Request**
```json
{
  "comments": "Approved - please ensure backup is verified before proceeding"
}
```

### POST /changes/:id/implement
Start change implementation.

**Request**
```json
{
  "notes": "Starting implementation as planned"
}
```

## 10.6 Service Request Endpoints

### GET /catalog
List catalog items.

### GET /catalog/:id
Get catalog item details.

### POST /requests
Submit service request.

**Request**
```json
{
  "catalogItemId": "uuid",
  "formData": {
    "laptop_type": "MacBook Pro 14",
    "accessories": ["mouse", "keyboard"],
    "justification": "New hire equipment"
  }
}
```

### POST /requests/:id/approve
Approve service request.

### POST /requests/:id/complete
Complete service request.

## 10.7 Dashboard Endpoints

### GET /dashboard
Get dashboard overview.

**Response**
```json
{
  "data": {
    "issues": {
      "open": 45,
      "critical": 3,
      "breached": 2
    },
    "changes": {
      "pending": 12,
      "scheduled": 5,
      "implementing": 1
    },
    "requests": {
      "pending": 23,
      "pendingApproval": 8
    },
    "sla": {
      "compliance": 94.5,
      "atRisk": 4
    }
  }
}
```

### GET /dashboard/trends/issues
Get issue trends.

**Query Parameters**
| Parameter | Type | Description |
|-----------|------|-------------|
| days | integer | Number of days (default: 30) |

**Response**
```json
{
  "data": [
    {
      "date": "2024-01-01",
      "created": 15,
      "resolved": 12
    },
    ...
  ]
}
```

---

# 11. Security & Compliance

## 11.1 Authentication Security

### Password Requirements
| Requirement | Minimum |
|-------------|---------|
| Length | 8 characters |
| Uppercase | 1 character |
| Lowercase | 1 character |
| Number | 1 digit |
| Special | 1 character |

### Token Security
| Token Type | Lifetime | Storage |
|------------|----------|---------|
| Access Token | 1 hour | Memory/localStorage |
| Refresh Token | 7 days | httpOnly cookie |

### Session Management
- Automatic session expiration
- Concurrent session limits (configurable)
- Session invalidation on password change
- Force logout capability for admins

## 11.2 Authorization Model

### RBAC Implementation
- Role-based access control
- Permission-based fine-grained control
- Group-based permission inheritance
- Resource-level access control

### Permission Structure
```
{resource}:{action}

Examples:
- issues:read
- issues:create
- issues:update
- issues:delete
- issues:assign
- changes:approve
- settings:manage
```

## 11.3 Data Protection

### Encryption
| Data Type | At Rest | In Transit |
|-----------|---------|------------|
| User passwords | bcrypt hash | N/A |
| API credentials | AES-256 | TLS 1.3 |
| Database | Transparent | TLS 1.3 |
| File storage | S3 encryption | TLS 1.3 |

### Data Isolation
- Schema-per-tenant isolation
- No cross-tenant queries
- Tenant context in all queries
- Audit logging of access

## 11.4 API Security

### Rate Limiting
| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| Authentication | 10 | 1 minute |
| Standard API | 100 | 1 minute |
| Bulk operations | 10 | 1 minute |

### Input Validation
- Zod schema validation
- SQL injection prevention
- XSS prevention
- Request size limits

### Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000
Content-Security-Policy: default-src 'self'
```

## 11.5 Compliance Features

### Audit Logging
- All user actions logged
- Login/logout events
- Data access logging
- Configuration changes
- Immutable audit trail

### GDPR Compliance
- Data export capability
- Data deletion (right to forget)
- Consent management
- Data retention policies

### SOC 2 Alignment
- Access controls
- Change management
- Incident response
- Availability monitoring

---

# 12. Integrations

## 12.1 Email Integration

### Outbound Email (SendGrid)
| Feature | Description |
|---------|-------------|
| Notifications | Issue updates, approvals |
| Alerts | SLA warnings, escalations |
| Reports | Scheduled report delivery |
| Templates | Customizable email templates |

### Inbound Email
| Feature | Description |
|---------|-------------|
| Issue creation | Email-to-ticket |
| Thread tracking | Reply association |
| Attachments | File extraction |
| Routing | Domain-based routing |

## 12.2 Cloud Provider Integration

### AWS
| Service | Integration |
|---------|-------------|
| EC2 | Instance inventory |
| RDS | Database inventory |
| S3 | Bucket inventory |
| Lambda | Function inventory |
| CloudWatch | Metrics and alerts |
| Cost Explorer | Cost data |

### Azure
| Service | Integration |
|---------|-------------|
| Virtual Machines | VM inventory |
| App Services | Web app inventory |
| SQL Database | Database inventory |
| Functions | Function inventory |
| Monitor | Metrics and alerts |
| Cost Management | Cost data |

### GCP
| Service | Integration |
|---------|-------------|
| Compute Engine | VM inventory |
| Cloud SQL | Database inventory |
| GKE | Kubernetes inventory |
| Cloud Functions | Function inventory |
| Monitoring | Metrics |
| Billing | Cost data |

## 12.3 Communication Integration

### Slack
| Feature | Description |
|---------|-------------|
| Notifications | Channel notifications |
| Commands | Slash commands |
| Interactive | Button actions |
| Approvals | Approval workflows |

### Microsoft Teams
| Feature | Description |
|---------|-------------|
| Notifications | Channel cards |
| Adaptive Cards | Rich formatting |

### SMS (Twilio)
| Feature | Description |
|---------|-------------|
| Alerts | Critical notifications |
| On-call | Escalation notifications |

## 12.4 Webhook Integration

### Outbound Webhooks
- Event-driven notifications
- Configurable retry logic
- HMAC signature verification
- Custom headers support

### Supported Events
- Issue lifecycle events
- Change lifecycle events
- Request lifecycle events
- User events
- System events

---

# 13. Non-Functional Requirements

## 13.1 Performance Requirements

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time (p50) | < 100ms | 50th percentile |
| API Response Time (p95) | < 500ms | 95th percentile |
| API Response Time (p99) | < 1000ms | 99th percentile |
| Page Load Time | < 2s | Time to interactive |
| Database Query Time | < 50ms | Average query time |
| Job Processing Time | < 30s | Average job duration |

## 13.2 Scalability Requirements

| Metric | Target |
|--------|--------|
| Concurrent Users | 10,000 per tenant |
| API Requests | 1,000/second |
| Database Size | 100GB per tenant |
| File Storage | 1TB per tenant |
| Tenants | 1,000+ per deployment |

## 13.3 Availability Requirements

| Environment | SLA | Downtime/Month |
|-------------|-----|----------------|
| Production | 99.9% | 43 minutes |
| Staging | 99% | 7 hours |
| Development | Best effort | N/A |

### High Availability Design
- Multi-AZ deployment
- Database replication
- Redis clustering
- Load balancer health checks
- Automatic failover

## 13.4 Reliability Requirements

| Metric | Target |
|--------|--------|
| Mean Time Between Failures | > 720 hours |
| Mean Time to Recovery | < 30 minutes |
| Recovery Point Objective | < 1 hour |
| Recovery Time Objective | < 4 hours |

### Disaster Recovery
- Daily database backups
- Point-in-time recovery
- Cross-region replication (optional)
- Documented recovery procedures

## 13.5 Maintainability Requirements

| Metric | Target |
|--------|--------|
| Code Coverage | > 80% |
| Documentation | 100% of public APIs |
| Deployment Time | < 15 minutes |
| Rollback Time | < 5 minutes |

## 13.6 Observability Requirements

### Logging
- Structured JSON logging
- Log levels (debug, info, warn, error)
- Correlation IDs
- Tenant context in logs

### Metrics
- System metrics (CPU, memory, disk)
- Application metrics (requests, errors)
- Business metrics (issues created, resolved)
- Custom dashboards

### Alerting
- Error rate thresholds
- Latency thresholds
- Resource utilization
- Business metric anomalies

---

# 14. Success Metrics & KPIs

## 14.1 Business Metrics

### Adoption Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Active Users | 80% of licensed | Monthly active users |
| Feature Adoption | 60% | Features used per tenant |
| Mobile Usage | 20% | Mobile app sessions |
| API Usage | Growing | API calls per month |

### Customer Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Net Promoter Score | > 50 | Quarterly survey |
| Customer Satisfaction | > 4.5/5 | Post-interaction survey |
| Churn Rate | < 5% | Annual customer retention |
| Expansion Revenue | 20% | Upsell/cross-sell |

## 14.2 Operational Metrics

### IT Operations Impact
| Metric | Target | Baseline |
|--------|--------|----------|
| Mean Time to Resolution | -40% | Current MTTR |
| First Call Resolution | +25% | Current FCR |
| SLA Compliance | > 95% | Current compliance |
| Change Success Rate | > 98% | Current success rate |
| Self-Service Rate | > 30% | Requests via portal |

### Efficiency Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Automation Rate | 60% | Automated actions/total |
| Time Saved | 10 hrs/agent/week | Manual task reduction |
| Cost per Ticket | -30% | Total cost/tickets |

## 14.3 Platform Health Metrics

### Technical Health
| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Uptime | 99.9% | < 99.5% |
| Error Rate | < 0.1% | > 1% |
| API Latency (p95) | < 500ms | > 1000ms |
| Job Success Rate | > 99% | < 95% |

### Security Metrics
| Metric | Target |
|--------|--------|
| Failed Login Rate | < 5% |
| Security Incidents | 0 critical |
| Vulnerability Patches | < 48 hours |
| Audit Findings | 0 critical |

---

# 15. Competitive Analysis

## 15.1 Market Landscape

### Enterprise Segment
| Competitor | Strengths | Weaknesses |
|------------|-----------|------------|
| ServiceNow | Market leader, extensive features | Complex, expensive, long implementation |
| BMC Helix | Strong enterprise features | Legacy architecture, high cost |
| Ivanti | Asset management focus | Fragmented product suite |

### Mid-Market Segment
| Competitor | Strengths | Weaknesses |
|------------|-----------|------------|
| Freshservice | Modern UI, good pricing | Limited enterprise features |
| Jira Service Management | Developer-friendly, Atlassian ecosystem | ITSM features still maturing |
| ManageEngine | Comprehensive features | Dated UI, complex setup |

### SMB Segment
| Competitor | Strengths | Weaknesses |
|------------|-----------|------------|
| Zendesk | Easy to use, modern | Limited ITSM features |
| Spiceworks | Free tier available | Limited scalability |
| HappyFox | Good value | Limited automation |

## 15.2 Competitive Positioning

### FireLater Advantages
| Advantage | Description |
|-----------|-------------|
| Modern Architecture | Cloud-native, API-first design |
| Multi-Cloud Native | Built-in AWS/Azure/GCP integration |
| Pricing Model | Predictable, no per-agent fees |
| Implementation Speed | Days, not months |
| Customization | Flexible without complexity |
| Performance | Sub-second response times |

### Target Competitive Wins
| Scenario | Primary Competitors |
|----------|---------------------|
| SMB first ITSM | Zendesk, Freshservice |
| Mid-market modernization | ManageEngine, Jira SM |
| Cloud-heavy organizations | All competitors |
| Cost-conscious enterprises | ServiceNow, BMC |

## 15.3 Feature Comparison

| Feature | FireLater | ServiceNow | Freshservice | Jira SM |
|---------|-----------|------------|--------------|---------|
| Issue Management | Yes | Yes | Yes | Yes |
| Problem Management | Yes | Yes | Yes | Limited |
| Change Management | Yes | Yes | Yes | Yes |
| Service Catalog | Yes | Yes | Yes | Yes |
| CMDB | Planned | Yes | Yes | Limited |
| Cloud Integration | Native | Add-on | Limited | Limited |
| On-Call Management | Yes | Add-on | Add-on | Opsgenie |
| Workflow Automation | Yes | Yes | Yes | Yes |
| API Access | Full | Limited | Full | Full |
| Multi-Tenant | Yes | Limited | No | No |
| Pricing | Flat | Per agent | Per agent | Per agent |

---

# 16. Pricing Strategy

## 16.1 Pricing Model

### Subscription Tiers

| Tier | Price | Users | Key Features |
|------|-------|-------|--------------|
| Starter | Contact Sales | Up to 10 | Core ITSM, 1 cloud account |
| Professional | Contact Sales | Up to 50 | Full ITSM, 5 cloud accounts, API |
| Enterprise | Contact Sales | Unlimited | Everything, unlimited, priority support |

### Pricing Philosophy
- No per-agent fees
- Predictable monthly cost
- No hidden charges
- Inclusive support

## 16.2 Feature Tiers

### Starter Tier
- Issue Management
- Basic Problem Management
- Standard Change Management
- Service Catalog (10 items)
- 20 Applications
- 1 Cloud Account
- 2 On-Call Schedules
- Basic Reports
- 5 Workflow Rules
- Email Support

### Professional Tier
*Everything in Starter, plus:*
- Full Problem Management
- Full Change Management + CAB
- Service Catalog (50 items)
- 100 Applications
- 5 Cloud Accounts
- 10 On-Call Schedules
- Advanced Reports
- 25 Workflow Rules
- Full API Access
- Priority Support

### Enterprise Tier
*Everything in Professional, plus:*
- Unlimited Service Catalog
- Unlimited Applications
- Unlimited Cloud Accounts
- Unlimited On-Call Schedules
- Custom Reports + BI Integration
- Unlimited Workflow Rules
- Premium API Access
- SSO/SAML
- Dedicated Support
- Custom SLA

## 16.3 Add-Ons

| Add-On | Description |
|--------|-------------|
| Additional Storage | Extra file storage |
| Advanced Security | Enhanced security features |
| Professional Services | Implementation assistance |
| Training | User and admin training |
| Custom Development | Custom integrations |

---

# 17. Glossary

## 17.1 ITSM Terms

| Term | Definition |
|------|------------|
| ITSM | IT Service Management - practices for delivering IT services |
| ITIL | IT Infrastructure Library - framework for ITSM best practices |
| Incident | Unplanned interruption or reduction in quality of IT service |
| Problem | Root cause of one or more incidents |
| Change | Addition, modification, or removal of anything that could affect IT services |
| Service Request | User request for information, advice, standard change, or access |
| SLA | Service Level Agreement - commitment between provider and customer |
| CAB | Change Advisory Board - group that assesses and approves changes |
| CMDB | Configuration Management Database - repository of IT assets |
| KEDB | Known Error Database - documented known issues and workarounds |

## 17.2 Technical Terms

| Term | Definition |
|------|------------|
| Multi-Tenant | Architecture supporting multiple customers in shared infrastructure |
| Schema Isolation | Database design with separate schemas per tenant |
| JWT | JSON Web Token - secure token format for authentication |
| REST API | Representational State Transfer - API architectural style |
| Webhook | HTTP callback for event-driven integration |
| BullMQ | Redis-based queue for background job processing |

## 17.3 Business Terms

| Term | Definition |
|------|------------|
| MTTR | Mean Time to Resolution - average time to resolve issues |
| FCR | First Call Resolution - issues resolved on first contact |
| NPS | Net Promoter Score - customer satisfaction metric |
| Churn | Customer attrition rate |
| ARR | Annual Recurring Revenue |
| MRR | Monthly Recurring Revenue |

---

# Document Control

| Version | Description |
|---------|-------------|
| 1.0.0 | Initial comprehensive PRD |

---

*This document is proprietary and confidential. All rights reserved.*
