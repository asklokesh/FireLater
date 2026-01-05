# FireLater Backend Test Plan

## Overview

This document outlines the comprehensive test strategy for the FireLater backend, covering unit tests, integration tests, and end-to-end tests for all major features.

## Test Categories

### 1. Unit Tests
### 2. Integration Tests
### 3. End-to-End Tests

---

## 1. Unit Tests

### 1.1 Authentication Middleware Tests

**File**: `tests/unit/middleware/auth.test.ts`

**Test Cases**:

1. **authenticate() - Valid JWT Token**
   - Setup: Create valid JWT token with user payload
   - Action: Call authenticate middleware
   - Assert: request.user is populated correctly
   - Assert: Next handler is called

2. **authenticate() - Missing Token**
   - Setup: Request without Authorization header
   - Action: Call authenticate middleware
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates missing token

3. **authenticate() - Invalid Token Format**
   - Setup: Authorization header with invalid format (not "Bearer ...")
   - Action: Call authenticate middleware
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates invalid token format

4. **authenticate() - Expired Token**
   - Setup: Create expired JWT token
   - Action: Call authenticate middleware
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates expired token

5. **authenticate() - Invalid Signature**
   - Setup: Create token signed with wrong secret
   - Action: Call authenticate middleware
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates invalid signature

6. **requirePermission() - User Has Permission**
   - Setup: User with specific permission
   - Action: Call requirePermission middleware
   - Assert: Next handler is called

7. **requirePermission() - User Lacks Permission**
   - Setup: User without required permission
   - Action: Call requirePermission middleware
   - Assert: Returns 403 Forbidden

8. **requireRole() - User Has Role**
   - Setup: User with specific role
   - Action: Call requireRole middleware
   - Assert: Next handler is called

9. **requireRole() - User Lacks Role**
   - Setup: User without required role
   - Action: Call requireRole middleware
   - Assert: Returns 403 Forbidden

---

### 1.2 API Key Service Tests

**File**: `tests/unit/services/apiKeys.test.ts`

**Test Cases**:

1. **create() - Valid API Key**
   - Setup: Valid tenant and user
   - Action: Create API key with name and description
   - Assert: API key is created in database
   - Assert: Returned key is properly hashed
   - Assert: keyPreview shows last 8 characters
   - Assert: createdBy matches userId

2. **create() - With Expiration Date**
   - Setup: Valid tenant and user
   - Action: Create API key with expiresAt date
   - Assert: API key is created with correct expiration
   - Assert: expiresAt matches provided date

3. **create() - With IP Whitelist**
   - Setup: Valid tenant and user
   - Action: Create API key with IP whitelist array
   - Assert: API key is created with ipWhitelist
   - Assert: ipWhitelist array is stored correctly

4. **create() - With Rate Limit**
   - Setup: Valid tenant and user
   - Action: Create API key with custom rate limit
   - Assert: API key is created with rateLimit
   - Assert: rateLimit matches provided value

5. **list() - Returns All Active Keys**
   - Setup: Create multiple API keys for tenant
   - Action: List API keys
   - Assert: Returns all active keys
   - Assert: Keys do not include keyHash (security)
   - Assert: Keys include keyPreview

6. **findById() - Existing Key**
   - Setup: Create API key
   - Action: Find by ID
   - Assert: Returns correct API key
   - Assert: Does not include keyHash

7. **findById() - Non-existent Key**
   - Setup: No API key with given ID
   - Action: Find by ID
   - Assert: Returns null

8. **findById() - Wrong Tenant**
   - Setup: API key belonging to different tenant
   - Action: Find by ID with wrong tenant
   - Assert: Returns null (tenant isolation)

9. **validateKey() - Valid Key**
   - Setup: Create active, non-expired API key
   - Action: Validate with correct key
   - Assert: Returns API key object
   - Assert: lastUsedAt is updated

10. **validateKey() - Invalid Key**
    - Setup: No matching key in database
    - Action: Validate with random key
    - Assert: Returns null

11. **validateKey() - Expired Key**
    - Setup: Create expired API key
    - Action: Validate with key
    - Assert: Returns null

12. **validateKey() - Inactive Key**
    - Setup: Create inactive API key
    - Action: Validate with key
    - Assert: Returns null

13. **validateKey() - IP Whitelist Match**
    - Setup: Create API key with IP whitelist
    - Action: Validate with whitelisted IP
    - Assert: Returns API key object

14. **validateKey() - IP Whitelist Mismatch**
    - Setup: Create API key with IP whitelist
    - Action: Validate with non-whitelisted IP
    - Assert: Returns null

15. **update() - Valid Update**
    - Setup: Create API key
    - Action: Update name and description
    - Assert: API key is updated
    - Assert: Returns updated API key

16. **update() - Deactivate Key**
    - Setup: Create active API key
    - Action: Update isActive to false
    - Assert: API key is deactivated
    - Assert: Validation fails for deactivated key

17. **delete() - Existing Key**
    - Setup: Create API key
    - Action: Delete API key
    - Assert: Returns true
    - Assert: Key no longer exists in database

18. **delete() - Non-existent Key**
    - Setup: No API key with given ID
    - Action: Delete API key
    - Assert: Returns false

---

### 1.3 Webhook Service Tests

**File**: `tests/unit/services/webhooks.test.ts`

**Test Cases**:

1. **create() - Valid Webhook**
   - Setup: Valid tenant and user
   - Action: Create webhook with name, URL, events
   - Assert: Webhook is created in database
   - Assert: secret is hashed if provided
   - Assert: Default retry values are set

2. **create() - With Custom Headers**
   - Setup: Valid tenant and user
   - Action: Create webhook with customHeaders
   - Assert: Webhook is created with custom headers
   - Assert: Headers are stored correctly

3. **create() - With Filters**
   - Setup: Valid tenant and user
   - Action: Create webhook with event filters
   - Assert: Webhook is created with filters
   - Assert: Filters are stored as JSONB

4. **list() - Returns All Active Webhooks**
   - Setup: Create multiple webhooks
   - Action: List webhooks
   - Assert: Returns all active webhooks
   - Assert: secret is not exposed

5. **findById() - Existing Webhook**
   - Setup: Create webhook
   - Action: Find by ID
   - Assert: Returns correct webhook
   - Assert: secret is masked

6. **update() - Valid Update**
   - Setup: Create webhook
   - Action: Update URL and events
   - Assert: Webhook is updated
   - Assert: Returns updated webhook

7. **update() - Deactivate Webhook**
   - Setup: Create active webhook
   - Action: Update isActive to false
   - Assert: Webhook is deactivated
   - Assert: No deliveries for deactivated webhook

8. **delete() - Existing Webhook**
   - Setup: Create webhook
   - Action: Delete webhook
   - Assert: Returns true
   - Assert: Webhook no longer exists

9. **testWebhook() - Successful Delivery**
   - Setup: Create webhook with valid URL
   - Action: Test webhook
   - Assert: Returns success status
   - Assert: Test delivery is logged

10. **testWebhook() - Failed Delivery**
    - Setup: Create webhook with invalid URL
    - Action: Test webhook
    - Assert: Returns failure status
    - Assert: Error is logged

11. **triggerWebhook() - Event Match**
    - Setup: Create webhook for specific event
    - Action: Trigger matching event
    - Assert: Webhook is queued for delivery
    - Assert: Payload is correctly formatted

12. **triggerWebhook() - Event Mismatch**
    - Setup: Create webhook for specific event
    - Action: Trigger different event
    - Assert: Webhook is not triggered

13. **triggerWebhook() - Filter Match**
    - Setup: Create webhook with filters
    - Action: Trigger event matching filters
    - Assert: Webhook is triggered

14. **triggerWebhook() - Filter Mismatch**
    - Setup: Create webhook with filters
    - Action: Trigger event not matching filters
    - Assert: Webhook is not triggered

15. **getDeliveries() - Returns Recent Deliveries**
    - Setup: Create webhook and deliveries
    - Action: Get deliveries
    - Assert: Returns deliveries in reverse chronological order
    - Assert: Includes status, response, timestamp

---

### 1.4 Integration Services Tests

**File**: `tests/unit/services/integrations.test.ts`

**Test Cases**:

1. **create() - Valid Integration**
   - Setup: Valid tenant and user
   - Action: Create integration with type and config
   - Assert: Integration is created in database
   - Assert: credentials are encrypted
   - Assert: Initial status is set

2. **create() - Invalid Type**
   - Setup: Valid tenant and user
   - Action: Create integration with unsupported type
   - Assert: Throws error
   - Assert: Error message indicates invalid type

3. **list() - Returns All Integrations**
   - Setup: Create multiple integrations
   - Action: List integrations
   - Assert: Returns all integrations
   - Assert: credentials are not exposed

4. **findById() - Existing Integration**
   - Setup: Create integration
   - Action: Find by ID
   - Assert: Returns correct integration
   - Assert: credentials are masked

5. **update() - Valid Update**
   - Setup: Create integration
   - Action: Update config
   - Assert: Integration is updated
   - Assert: Returns updated integration

6. **delete() - Existing Integration**
   - Setup: Create integration
   - Action: Delete integration
   - Assert: Returns true
   - Assert: Integration no longer exists

7. **testConnection() - Slack - Success**
   - Setup: Create Slack integration with valid credentials
   - Action: Test connection
   - Assert: Returns success status
   - Assert: Verifies token with Slack API

8. **testConnection() - Slack - Invalid Token**
   - Setup: Create Slack integration with invalid token
   - Action: Test connection
   - Assert: Returns failure status
   - Assert: Error message from Slack API

9. **testConnection() - Microsoft Teams - Success**
   - Setup: Create Teams integration with valid credentials
   - Action: Test connection
   - Assert: Returns success status
   - Assert: Verifies credentials with Microsoft Graph

10. **testConnection() - PagerDuty - Success**
    - Setup: Create PagerDuty integration with valid API key
    - Action: Test connection
    - Assert: Returns success status
    - Assert: Verifies API key with PagerDuty

11. **getSyncLogs() - Returns Recent Logs**
    - Setup: Create integration with sync logs
    - Action: Get sync logs
    - Assert: Returns logs in reverse chronological order
    - Assert: Includes direction, status, details

---

### 1.5 Migration Service Tests

**File**: `tests/unit/services/migration.test.ts`

**Test Cases**:

1. **createMigration() - Valid ServiceNow Migration**
   - Setup: Valid tenant and ServiceNow config
   - Action: Create migration
   - Assert: Migration is created in database
   - Assert: Status is 'pending'
   - Assert: Source type is 'servicenow'

2. **createMigration() - Valid Jira Migration**
   - Setup: Valid tenant and Jira config
   - Action: Create migration
   - Assert: Migration is created
   - Assert: Source type is 'jira'

3. **createMigration() - CSV Migration**
   - Setup: Valid tenant and CSV file
   - Action: Create migration
   - Assert: Migration is created
   - Assert: Source type is 'csv'
   - Assert: File is stored

4. **startMigration() - Valid Migration**
   - Setup: Created migration in pending state
   - Action: Start migration
   - Assert: Migration status changes to 'in_progress'
   - Assert: Job is queued

5. **getMigrationStatus() - Existing Migration**
   - Setup: Create migration
   - Action: Get status
   - Assert: Returns migration with current status
   - Assert: Includes progress information

6. **listMigrations() - Returns All Migrations**
   - Setup: Create multiple migrations
   - Action: List migrations
   - Assert: Returns all migrations for tenant
   - Assert: Sorted by creation date

7. **validateFieldMapping() - Valid Mapping**
   - Setup: Source fields and target fields
   - Action: Validate field mapping
   - Assert: Returns validation success
   - Assert: No errors

8. **validateFieldMapping() - Missing Required Field**
   - Setup: Field mapping missing required field
   - Action: Validate field mapping
   - Assert: Returns validation failure
   - Assert: Error indicates missing field

9. **rollbackMigration() - Successful Rollback**
   - Setup: Completed migration
   - Action: Rollback migration
   - Assert: Migration status changes to 'rolled_back'
   - Assert: Migrated data is deleted

10. **rollbackMigration() - Cannot Rollback In Progress**
    - Setup: Migration in progress
    - Action: Attempt rollback
    - Assert: Throws error
    - Assert: Error message indicates cannot rollback

---

## 2. Integration Tests

### 2.1 SSO Integration Tests (SAML)

**File**: `tests/integration/sso/saml.test.ts`

**Test Cases**:

1. **SAML Login Flow - Azure AD**
   - Setup: Configure SAML provider for Azure AD
   - Action: Initiate SAML login
   - Assert: Redirects to Azure AD login page
   - Assert: SAML request is correctly formatted
   - Mock: Azure AD SAML response
   - Assert: User is authenticated
   - Assert: Session is created
   - Assert: JWT token is issued

2. **SAML Login Flow - Okta**
   - Setup: Configure SAML provider for Okta
   - Action: Initiate SAML login
   - Assert: Redirects to Okta login page
   - Mock: Okta SAML response
   - Assert: User is authenticated
   - Assert: JWT token is issued

3. **SAML JIT Provisioning - New User**
   - Setup: SAML provider with JIT enabled
   - Mock: SAML response for new user
   - Action: Complete SAML login
   - Assert: New user is created
   - Assert: User attributes are mapped from SAML assertions
   - Assert: User is authenticated

4. **SAML JIT Provisioning - Existing User**
   - Setup: SAML provider with JIT enabled
   - Setup: Existing user in database
   - Mock: SAML response for existing user
   - Action: Complete SAML login
   - Assert: User attributes are updated
   - Assert: User is authenticated

5. **SAML Attribute Mapping**
   - Setup: SAML provider with custom attribute mapping
   - Mock: SAML response with custom attributes
   - Action: Complete SAML login
   - Assert: User attributes are correctly mapped
   - Assert: firstName, lastName, email are correct

6. **SAML Invalid Signature**
   - Setup: SAML provider
   - Mock: SAML response with invalid signature
   - Action: Complete SAML login
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates invalid signature

7. **SAML Expired Assertion**
   - Setup: SAML provider
   - Mock: SAML response with expired assertion
   - Action: Complete SAML login
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates expired assertion

8. **SAML Logout Flow**
   - Setup: Authenticated SAML user
   - Action: Initiate SAML logout
   - Assert: Session is destroyed
   - Assert: Redirects to SAML provider logout

---

### 2.2 SSO Integration Tests (OIDC)

**File**: `tests/integration/sso/oidc.test.ts`

**Test Cases**:

1. **OIDC Login Flow - Azure AD**
   - Setup: Configure OIDC provider for Azure AD
   - Action: Initiate OIDC login
   - Assert: Redirects to Azure AD authorization endpoint
   - Mock: Azure AD authorization code
   - Action: Exchange code for tokens
   - Assert: ID token is validated
   - Assert: User is authenticated
   - Assert: JWT token is issued

2. **OIDC Login Flow - Okta**
   - Setup: Configure OIDC provider for Okta
   - Action: Initiate OIDC login
   - Mock: Okta authorization code and tokens
   - Assert: User is authenticated
   - Assert: JWT token is issued

3. **OIDC Login Flow - Google**
   - Setup: Configure OIDC provider for Google
   - Action: Initiate OIDC login
   - Mock: Google authorization code and tokens
   - Assert: User is authenticated
   - Assert: JWT token is issued

4. **OIDC JIT Provisioning - New User**
   - Setup: OIDC provider with JIT enabled
   - Mock: ID token for new user
   - Action: Complete OIDC login
   - Assert: New user is created
   - Assert: User claims are mapped from ID token

5. **OIDC JIT Provisioning - Existing User**
   - Setup: OIDC provider with JIT enabled
   - Setup: Existing user in database
   - Mock: ID token for existing user
   - Action: Complete OIDC login
   - Assert: User claims are updated
   - Assert: User is authenticated

6. **OIDC Token Validation - Invalid Signature**
   - Setup: OIDC provider
   - Mock: ID token with invalid signature
   - Action: Complete OIDC login
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates invalid token

7. **OIDC Token Validation - Expired Token**
   - Setup: OIDC provider
   - Mock: Expired ID token
   - Action: Complete OIDC login
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates expired token

8. **OIDC Token Validation - Invalid Issuer**
   - Setup: OIDC provider
   - Mock: ID token with wrong issuer
   - Action: Complete OIDC login
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates invalid issuer

9. **OIDC Token Validation - Invalid Audience**
   - Setup: OIDC provider
   - Mock: ID token with wrong audience
   - Action: Complete OIDC login
   - Assert: Returns 401 Unauthorized
   - Assert: Error message indicates invalid audience

10. **OIDC Logout Flow**
    - Setup: Authenticated OIDC user
    - Action: Initiate OIDC logout
    - Assert: Session is destroyed
    - Assert: Redirects to OIDC provider logout endpoint

---

### 2.3 Slack Integration Tests

**File**: `tests/integration/integrations/slack.test.ts`

**Test Cases**:

1. **Slack OAuth Flow**
   - Setup: Slack OAuth credentials
   - Action: Initiate OAuth flow
   - Assert: Redirects to Slack authorization page
   - Mock: Slack OAuth callback with code
   - Action: Exchange code for access token
   - Assert: Access token is stored
   - Assert: Integration is activated

2. **Send Incident Notification to Slack**
   - Setup: Active Slack integration
   - Action: Create incident
   - Assert: Slack message is sent to configured channel
   - Assert: Message includes incident details
   - Assert: Message includes link to incident

3. **Send Change Notification to Slack**
   - Setup: Active Slack integration
   - Action: Create change request
   - Assert: Slack message is sent
   - Assert: Message includes change details

4. **Slack Command - Create Incident**
   - Setup: Active Slack integration
   - Mock: Slack slash command request
   - Action: Handle command to create incident
   - Assert: Incident is created in database
   - Assert: Response is sent to Slack

5. **Slack Interactive Button - Approve Change**
   - Setup: Active Slack integration
   - Setup: Change request in pending approval
   - Mock: Slack interactive button click
   - Action: Handle approval action
   - Assert: Change request is approved
   - Assert: Status is updated in database
   - Assert: Response is sent to Slack

6. **Test Slack Connection**
   - Setup: Active Slack integration
   - Action: Test connection
   - Assert: Returns success
   - Assert: Verifies token with Slack API

7. **Slack Connection Failure - Invalid Token**
   - Setup: Slack integration with invalid token
   - Action: Test connection
   - Assert: Returns failure
   - Assert: Error message from Slack

---

### 2.4 Microsoft Teams Integration Tests

**File**: `tests/integration/integrations/teams.test.ts`

**Test Cases**:

1. **Teams OAuth Flow**
   - Setup: Teams OAuth credentials (Azure AD app)
   - Action: Initiate OAuth flow
   - Assert: Redirects to Microsoft authorization endpoint
   - Mock: Microsoft OAuth callback with code
   - Action: Exchange code for access token
   - Assert: Access token is stored
   - Assert: Integration is activated

2. **Send Incident Notification to Teams**
   - Setup: Active Teams integration
   - Action: Create incident
   - Assert: Teams message is sent to configured channel
   - Assert: Message uses Adaptive Card format
   - Assert: Card includes incident details

3. **Send Change Notification to Teams**
   - Setup: Active Teams integration
   - Action: Create change request
   - Assert: Teams message is sent
   - Assert: Adaptive Card includes change details

4. **Teams Webhook - Incoming Message**
   - Setup: Active Teams integration
   - Mock: Teams webhook with incoming message
   - Action: Handle webhook
   - Assert: Message is processed
   - Assert: Response is sent to Teams

5. **Test Teams Connection**
   - Setup: Active Teams integration
   - Action: Test connection
   - Assert: Returns success
   - Assert: Verifies credentials with Microsoft Graph

6. **Teams Connection Failure - Invalid Credentials**
   - Setup: Teams integration with invalid credentials
   - Action: Test connection
   - Assert: Returns failure
   - Assert: Error message from Microsoft

---

### 2.5 PagerDuty Integration Tests

**File**: `tests/integration/integrations/pagerduty.test.ts`

**Test Cases**:

1. **Create PagerDuty Integration**
   - Setup: Valid PagerDuty API key
   - Action: Create integration
   - Assert: Integration is created
   - Assert: API key is encrypted

2. **Create PagerDuty Incident from FireLater Incident**
   - Setup: Active PagerDuty integration with bi-directional sync
   - Action: Create incident in FireLater
   - Assert: Incident is created in PagerDuty
   - Assert: Incident details are mapped correctly
   - Assert: Sync log is created

3. **Sync PagerDuty Incident to FireLater**
   - Setup: Active PagerDuty integration
   - Mock: PagerDuty webhook for new incident
   - Action: Handle webhook
   - Assert: Incident is created in FireLater
   - Assert: Status is mapped correctly
   - Assert: Priority is mapped correctly

4. **Update PagerDuty Incident Status**
   - Setup: Active PagerDuty integration
   - Setup: Synced incident
   - Action: Update incident status in FireLater
   - Assert: Status is updated in PagerDuty
   - Assert: Sync log is created

5. **Sync PagerDuty Incident Update to FireLater**
   - Setup: Active PagerDuty integration
   - Setup: Synced incident
   - Mock: PagerDuty webhook for incident update
   - Action: Handle webhook
   - Assert: Incident is updated in FireLater
   - Assert: Status matches PagerDuty

6. **Test PagerDuty Connection**
   - Setup: Active PagerDuty integration
   - Action: Test connection
   - Assert: Returns success
   - Assert: Verifies API key with PagerDuty

7. **PagerDuty Connection Failure - Invalid API Key**
   - Setup: PagerDuty integration with invalid API key
   - Action: Test connection
   - Assert: Returns failure
   - Assert: Error message from PagerDuty

---

## 3. End-to-End Tests

### 3.1 User Authentication Flow E2E

**File**: `tests/e2e/auth-flow.spec.ts`

**Test Cases**:

1. **Complete Login Flow**
   - Action: Navigate to login page
   - Action: Enter valid credentials
   - Action: Submit login form
   - Assert: Redirected to dashboard
   - Assert: JWT token is stored in cookies
   - Assert: User data is loaded

2. **Login with Invalid Credentials**
   - Action: Navigate to login page
   - Action: Enter invalid credentials
   - Action: Submit login form
   - Assert: Error message is displayed
   - Assert: Remains on login page

3. **Token Refresh Flow**
   - Setup: Authenticated user
   - Action: Wait for token to near expiration
   - Action: Make API request
   - Assert: Token is automatically refreshed
   - Assert: New token is stored
   - Assert: Request succeeds

4. **Logout Flow**
   - Setup: Authenticated user
   - Action: Click logout button
   - Assert: Redirected to login page
   - Assert: Token is cleared from cookies
   - Assert: API requests return 401

---

### 3.2 Incident Creation Workflow E2E

**File**: `tests/e2e/incident-workflow.spec.ts`

**Test Cases**:

1. **Create Incident via UI**
   - Setup: Authenticated user
   - Action: Navigate to incidents page
   - Action: Click "New Incident" button
   - Action: Fill in incident form (title, description, priority)
   - Action: Submit form
   - Assert: Incident is created in database
   - Assert: Incident appears in incidents list
   - Assert: Notification is sent (if configured)

2. **Create Incident with Slack Notification**
   - Setup: Authenticated user
   - Setup: Active Slack integration
   - Action: Create incident via UI
   - Assert: Incident is created
   - Assert: Slack notification is sent
   - Assert: Notification includes incident link

3. **Create Incident Synced to PagerDuty**
   - Setup: Authenticated user
   - Setup: Active PagerDuty integration with sync enabled
   - Action: Create incident via UI
   - Assert: Incident is created in FireLater
   - Assert: Incident is created in PagerDuty
   - Assert: Sync log shows success

4. **Update Incident Status**
   - Setup: Authenticated user
   - Setup: Existing incident
   - Action: Open incident details
   - Action: Change status to "In Progress"
   - Action: Save changes
   - Assert: Status is updated in database
   - Assert: Status change is logged in audit trail
   - Assert: Notification is sent (if configured)

5. **Close Incident**
   - Setup: Authenticated user
   - Setup: Incident in "In Progress" status
   - Action: Change status to "Closed"
   - Action: Add resolution notes
   - Action: Save changes
   - Assert: Incident is closed
   - Assert: closedAt timestamp is set
   - Assert: Resolution notes are saved

---

### 3.3 Migration Complete Workflow E2E

**File**: `tests/e2e/migration-workflow.spec.ts`

**Test Cases**:

1. **CSV Migration - Complete Flow**
   - Setup: Authenticated user with admin role
   - Action: Navigate to migration page
   - Action: Upload CSV file with incidents
   - Action: Configure field mapping
   - Action: Start migration
   - Assert: Migration job is created
   - Assert: Progress is displayed
   - Wait: For migration to complete
   - Assert: All incidents are imported
   - Assert: Migration status is "completed"
   - Assert: Statistics show correct counts

2. **ServiceNow Migration - Complete Flow**
   - Setup: Authenticated user with admin role
   - Setup: Mock ServiceNow API responses
   - Action: Navigate to migration page
   - Action: Select "ServiceNow" source
   - Action: Enter ServiceNow credentials
   - Action: Test connection
   - Assert: Connection test succeeds
   - Action: Configure field mapping
   - Action: Start migration
   - Assert: Migration job is created
   - Wait: For migration to complete
   - Assert: Incidents are imported from ServiceNow
   - Assert: Migration status is "completed"

3. **Migration with Validation Errors**
   - Setup: Authenticated user
   - Action: Upload CSV with invalid data
   - Action: Start migration
   - Assert: Validation errors are displayed
   - Assert: Migration does not proceed
   - Assert: Error details indicate which rows failed

4. **Migration Rollback**
   - Setup: Authenticated user
   - Setup: Completed migration
   - Action: Navigate to migration details
   - Action: Click "Rollback" button
   - Action: Confirm rollback
   - Assert: Rollback job is created
   - Wait: For rollback to complete
   - Assert: Migrated data is deleted
   - Assert: Migration status is "rolled_back"

---

### 3.4 Webhook Notification Flow E2E

**File**: `tests/e2e/webhook-flow.spec.ts`

**Test Cases**:

1. **Create and Test Webhook**
   - Setup: Authenticated user
   - Action: Navigate to webhooks page
   - Action: Click "New Webhook" button
   - Action: Fill in webhook form (name, URL, events)
   - Action: Submit form
   - Assert: Webhook is created
   - Action: Click "Test" button
   - Assert: Test delivery is sent
   - Assert: Delivery log shows success/failure

2. **Webhook Triggered by Incident Creation**
   - Setup: Authenticated user
   - Setup: Active webhook for "incident.created" event
   - Setup: Mock webhook endpoint to capture payload
   - Action: Create incident via UI
   - Assert: Incident is created
   - Assert: Webhook is triggered
   - Assert: Webhook payload includes incident data
   - Assert: Delivery log shows success

3. **Webhook with Filters**
   - Setup: Authenticated user
   - Setup: Webhook with filter for high priority incidents
   - Setup: Mock webhook endpoint
   - Action: Create low priority incident
   - Assert: Webhook is NOT triggered
   - Action: Create high priority incident
   - Assert: Webhook IS triggered
   - Assert: Payload includes high priority incident

4. **Webhook Retry on Failure**
   - Setup: Authenticated user
   - Setup: Active webhook
   - Setup: Mock webhook endpoint that fails first time, succeeds second
   - Action: Create incident (triggers webhook)
   - Assert: First delivery attempt fails
   - Wait: For retry delay
   - Assert: Second delivery attempt succeeds
   - Assert: Delivery log shows retry history

---

## Test Execution Strategy

### Phase 1: Unit Tests
1. Write all unit tests for authentication middleware
2. Write all unit tests for services (API keys, webhooks, integrations, migration)
3. Execute unit tests: `npm test`
4. Fix failures iteratively until all pass
5. Target: 80%+ code coverage

### Phase 2: Integration Tests
1. Set up test fixtures and mocks for external services
2. Write SSO integration tests (SAML and OIDC)
3. Write integration tests for third-party services (Slack, Teams, PagerDuty)
4. Execute integration tests: `npm test -- tests/integration`
5. Fix failures iteratively until all pass

### Phase 3: End-to-End Tests
1. Set up Playwright test environment
2. Write E2E tests for critical user journeys
3. Execute E2E tests: `npm run test:e2e`
4. Fix failures iteratively until all pass
5. Run in headed mode for debugging: `npm run test:e2e:headed`

### Phase 4: Full Test Suite
1. Execute all tests together: `npm run test:all`
2. Fix any cross-test failures
3. Verify all tests pass consistently
4. Generate coverage report: `npm run test:coverage`
5. Review coverage and add tests for gaps

---

## Test Infrastructure Requirements

### Tools and Libraries
- **Vitest**: Unit and integration test runner
- **Playwright**: E2E browser testing
- **Supertest**: HTTP request testing
- **Mock Service Worker (MSW)**: API mocking
- **@faker-js/faker**: Test data generation

### Test Database
- Separate PostgreSQL test database
- Automated schema migration before tests
- Cleanup between test suites
- Tenant isolation for multi-tenant tests

### External Service Mocking
- Mock Slack API responses
- Mock Microsoft Graph API responses
- Mock PagerDuty API responses
- Mock SAML IdP responses
- Mock OIDC provider responses

### Continuous Integration
- Run tests on every commit
- Run E2E tests on pull requests
- Block merges if tests fail
- Generate and track coverage trends

---

## Success Criteria

1. **All unit tests pass** (100% pass rate)
2. **All integration tests pass** (100% pass rate)
3. **All E2E tests pass** (100% pass rate)
4. **Code coverage** ≥ 80% for critical paths
5. **No flaky tests** (tests pass consistently)
6. **Fast execution** (unit tests < 30s, integration tests < 2min, E2E tests < 5min)

---

## Next Steps

1. Review this test plan with the team
2. Set up test infrastructure (test DB, mocks)
3. Begin implementation starting with Phase 1 (Unit Tests)
4. Execute tests iteratively, fixing failures immediately
5. Move through phases sequentially
6. Complete with full test suite execution

