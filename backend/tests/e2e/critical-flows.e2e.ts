import { test, expect } from '@playwright/test';

/**
 * E2E tests for critical user flows
 * These tests verify end-to-end functionality for key user journeys
 */

let authToken: string;
let tenantSlug: string;
let csrfToken: string;

test.describe('Critical User Flows E2E', () => {
  test.describe('Authentication Flow', () => {
    test('should complete full registration and login flow', async ({ request }) => {
      // Step 1: Register new tenant and admin user
      const timestamp = Date.now();
      const registerData = {
        tenantName: `E2E Test Tenant ${timestamp}`,
        tenantSlug: `e2e-test-${timestamp}`,
        adminName: 'E2E Admin',
        adminEmail: `e2e-admin-${timestamp}@test.com`,
        adminPassword: 'SecurePassword123!',
      };

      const registerResponse = await request.post('/v1/auth/register', {
        data: registerData,
      });

      expect(registerResponse.ok()).toBeTruthy();
      expect(registerResponse.status()).toBe(201);

      const registerBody = await registerResponse.json();
      expect(registerBody).toHaveProperty('accessToken');
      expect(registerBody).toHaveProperty('refreshToken');
      expect(registerBody).toHaveProperty('user');
      expect(registerBody).toHaveProperty('tenant');
      expect(registerBody.user.email).toBe(registerData.adminEmail);
      expect(registerBody.tenant.slug).toBe(registerData.tenantSlug);

      // Store auth token and tenant for subsequent tests
      authToken = registerBody.accessToken;
      tenantSlug = registerBody.tenant.slug;

      // Step 2: Verify token works by fetching user profile
      const profileResponse = await request.get('/v1/auth/me', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(profileResponse.ok()).toBeTruthy();
      const profileBody = await profileResponse.json();
      expect(profileBody.email).toBe(registerData.adminEmail);

      // Step 3: Logout (if endpoint exists)
      const logoutResponse = await request.post('/v1/auth/logout', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      // Logout may or may not exist, but shouldn't error catastrophically
      expect([200, 204, 404]).toContain(logoutResponse.status());

      // Step 4: Login with credentials
      const loginResponse = await request.post('/v1/auth/login', {
        data: {
          tenant: registerData.tenantSlug,
          email: registerData.adminEmail,
          password: registerData.adminPassword,
        },
      });

      expect(loginResponse.ok()).toBeTruthy();
      expect(loginResponse.status()).toBe(200);

      const loginBody = await loginResponse.json();
      expect(loginBody).toHaveProperty('accessToken');
      expect(loginBody).toHaveProperty('refreshToken');
      expect(loginBody).toHaveProperty('user');

      // Update auth token with fresh one from login
      authToken = loginBody.accessToken;
    });

    test('should reject invalid credentials', async ({ request }) => {
      const loginResponse = await request.post('/v1/auth/login', {
        data: {
          tenant: 'invalid-tenant',
          email: 'invalid@test.com',
          password: 'wrongpassword',
        },
      });

      expect(loginResponse.ok()).toBeFalsy();
      expect(loginResponse.status()).toBe(401);
    });

    test('should validate registration input', async ({ request }) => {
      const invalidRegisterResponse = await request.post('/v1/auth/register', {
        data: {
          tenantName: '',
          tenantSlug: '',
          adminName: '',
          adminEmail: 'invalid-email',
          adminPassword: 'weak',
        },
      });

      expect(invalidRegisterResponse.ok()).toBeFalsy();
      expect(invalidRegisterResponse.status()).toBe(400);
    });
  });

  test.describe('Issue Management Flow', () => {
    test.beforeAll(async ({ request }) => {
      // Ensure we have auth token from previous test or create new one
      if (!authToken) {
        const timestamp = Date.now();
        const registerResponse = await request.post('/v1/auth/register', {
          data: {
            tenantName: `Issue Test Tenant ${timestamp}`,
            tenantSlug: `issue-test-${timestamp}`,
            adminName: 'Issue Admin',
            adminEmail: `issue-admin-${timestamp}@test.com`,
            adminPassword: 'SecurePassword123!',
          },
        });

        const registerBody = await registerResponse.json();
        authToken = registerBody.accessToken;
        tenantSlug = registerBody.tenant.slug;
      }
    });

    test('should complete full issue lifecycle', async ({ request }) => {
      // Step 1: Create new issue
      const issueData = {
        title: 'E2E Test Issue - Database Performance',
        description: 'Testing end-to-end issue creation and management',
        priority: 'high',
        severity: 'major',
        source: 'manual',
      };

      const createResponse = await request.post('/v1/issues', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: issueData,
      });

      expect(createResponse.ok()).toBeTruthy();
      expect(createResponse.status()).toBe(201);

      const createBody = await createResponse.json();
      expect(createBody).toHaveProperty('id');
      expect(createBody.title).toBe(issueData.title);
      expect(createBody.priority).toBe(issueData.priority);
      expect(createBody.status).toBe('open');

      const issueId = createBody.id;

      // Step 2: Fetch issue by ID
      const getResponse = await request.get(`/v1/issues/${issueId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(getResponse.ok()).toBeTruthy();
      const getBody = await getResponse.json();
      expect(getBody.id).toBe(issueId);
      expect(getBody.title).toBe(issueData.title);

      // Step 3: Update issue
      const updateResponse = await request.put(`/v1/issues/${issueId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          status: 'in_progress',
          priority: 'critical',
        },
      });

      expect(updateResponse.ok()).toBeTruthy();
      const updateBody = await updateResponse.json();
      expect(updateBody.status).toBe('in_progress');
      expect(updateBody.priority).toBe('critical');

      // Step 4: Add comment to issue
      const commentResponse = await request.post(`/v1/issues/${issueId}/comments`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          content: 'E2E test comment - working on resolution',
        },
      });

      expect(commentResponse.ok()).toBeTruthy();

      // Step 5: Resolve issue
      const resolveResponse = await request.put(`/v1/issues/${issueId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          status: 'resolved',
          resolution: 'Fixed database indexing',
        },
      });

      expect(resolveResponse.ok()).toBeTruthy();
      const resolveBody = await resolveResponse.json();
      expect(resolveBody.status).toBe('resolved');

      // Step 6: List all issues and verify ours is there
      const listResponse = await request.get('/v1/issues', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(listResponse.ok()).toBeTruthy();
      const listBody = await listResponse.json();
      expect(Array.isArray(listBody.issues || listBody)).toBeTruthy();

      const issues = listBody.issues || listBody;
      const ourIssue = issues.find((i: any) => i.id === issueId);
      expect(ourIssue).toBeDefined();
    });

    test('should validate issue creation input', async ({ request }) => {
      const invalidIssueResponse = await request.post('/v1/issues', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          title: '',
          description: '',
          priority: 'invalid-priority',
        },
      });

      expect(invalidIssueResponse.ok()).toBeFalsy();
      expect(invalidIssueResponse.status()).toBe(400);
    });
  });

  test.describe('Change Management Flow', () => {
    test.beforeAll(async ({ request }) => {
      if (!authToken) {
        const timestamp = Date.now();
        const registerResponse = await request.post('/v1/auth/register', {
          data: {
            tenantName: `Change Test Tenant ${timestamp}`,
            tenantSlug: `change-test-${timestamp}`,
            adminName: 'Change Admin',
            adminEmail: `change-admin-${timestamp}@test.com`,
            adminPassword: 'SecurePassword123!',
          },
        });

        const registerBody = await registerResponse.json();
        authToken = registerBody.accessToken;
        tenantSlug = registerBody.tenant.slug;
      }
    });

    test('should complete full change request lifecycle', async ({ request }) => {
      // Step 1: Create change request
      const changeData = {
        title: 'E2E Test Change - Deploy API v2',
        description: 'Testing end-to-end change management',
        risk_level: 'high',
        change_type: 'standard',
        scheduled_start: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        scheduled_end: new Date(Date.now() + 90000000).toISOString(), // Tomorrow + 1 hour
        application_name: 'Core API',
        implementation_plan: 'Deploy new version via CI/CD pipeline',
        rollback_plan: 'Revert to previous version if issues occur',
      };

      const createResponse = await request.post('/v1/changes', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: changeData,
      });

      expect(createResponse.ok()).toBeTruthy();
      expect(createResponse.status()).toBe(201);

      const createBody = await createResponse.json();
      expect(createBody).toHaveProperty('id');
      expect(createBody.title).toBe(changeData.title);
      expect(createBody.risk_level).toBe(changeData.risk_level);
      expect(createBody.status).toBe('scheduled');

      const changeId = createBody.id;

      // Step 2: Fetch change by ID
      const getResponse = await request.get(`/v1/changes/${changeId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(getResponse.ok()).toBeTruthy();
      const getBody = await getResponse.json();
      expect(getBody.id).toBe(changeId);

      // Step 3: Update change
      const updateResponse = await request.put(`/v1/changes/${changeId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          status: 'in_progress',
        },
      });

      expect(updateResponse.ok()).toBeTruthy();
      const updateBody = await updateResponse.json();
      expect(updateBody.status).toBe('in_progress');

      // Step 4: Complete change
      const completeResponse = await request.put(`/v1/changes/${changeId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          status: 'completed',
          completion_notes: 'Deployment successful, all tests passing',
        },
      });

      expect(completeResponse.ok()).toBeTruthy();
      const completeBody = await completeResponse.json();
      expect(completeBody.status).toBe('completed');

      // Step 5: List all changes
      const listResponse = await request.get('/v1/changes', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(listResponse.ok()).toBeTruthy();
      const listBody = await listResponse.json();
      expect(Array.isArray(listBody.changes || listBody)).toBeTruthy();
    });
  });

  test.describe('On-Call Schedule Flow', () => {
    test.beforeAll(async ({ request }) => {
      if (!authToken) {
        const timestamp = Date.now();
        const registerResponse = await request.post('/v1/auth/register', {
          data: {
            tenantName: `OnCall Test Tenant ${timestamp}`,
            tenantSlug: `oncall-test-${timestamp}`,
            adminName: 'OnCall Admin',
            adminEmail: `oncall-admin-${timestamp}@test.com`,
            adminPassword: 'SecurePassword123!',
          },
        });

        const registerBody = await registerResponse.json();
        authToken = registerBody.accessToken;
        tenantSlug = registerBody.tenant.slug;
      }
    });

    test('should create and manage on-call schedule', async ({ request }) => {
      // Step 1: Create on-call schedule
      const scheduleData = {
        name: 'E2E Test Schedule - Production Support',
        description: 'Testing on-call schedule management',
        rotation_type: 'weekly',
        start_date: new Date().toISOString(),
      };

      const createResponse = await request.post('/v1/oncall/schedules', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: scheduleData,
      });

      expect(createResponse.ok()).toBeTruthy();
      expect(createResponse.status()).toBe(201);

      const createBody = await createResponse.json();
      expect(createBody).toHaveProperty('id');
      expect(createBody.name).toBe(scheduleData.name);

      const scheduleId = createBody.id;

      // Step 2: Fetch schedule by ID
      const getResponse = await request.get(`/v1/oncall/schedules/${scheduleId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(getResponse.ok()).toBeTruthy();
      const getBody = await getResponse.json();
      expect(getBody.id).toBe(scheduleId);

      // Step 3: Update schedule
      const updateResponse = await request.put(`/v1/oncall/schedules/${scheduleId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          description: 'Updated E2E test schedule description',
        },
      });

      expect(updateResponse.ok()).toBeTruthy();

      // Step 4: List all schedules
      const listResponse = await request.get('/v1/oncall/schedules', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(listResponse.ok()).toBeTruthy();
      const listBody = await listResponse.json();
      expect(Array.isArray(listBody.schedules || listBody)).toBeTruthy();
    });
  });

  test.describe('Request Approval Flow', () => {
    test.beforeAll(async ({ request }) => {
      if (!authToken) {
        const timestamp = Date.now();
        const registerResponse = await request.post('/v1/auth/register', {
          data: {
            tenantName: `Approval Test Tenant ${timestamp}`,
            tenantSlug: `approval-test-${timestamp}`,
            adminName: 'Approval Admin',
            adminEmail: `approval-admin-${timestamp}@test.com`,
            adminPassword: 'SecurePassword123!',
          },
        });

        const registerBody = await registerResponse.json();
        authToken = registerBody.accessToken;
        tenantSlug = registerBody.tenant.slug;
      }
    });

    test('should complete full approval workflow', async ({ request }) => {
      // Step 1: Create a request that needs approval (e.g., catalog item request)
      const requestData = {
        item_type: 'vm_instance',
        item_name: 'E2E Test VM',
        description: 'Testing approval workflow',
        justification: 'E2E testing purposes',
        requested_config: {
          cpu: 4,
          memory: 16,
          storage: 100,
        },
      };

      const createResponse = await request.post('/v1/requests', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: requestData,
      });

      expect(createResponse.ok()).toBeTruthy();
      expect(createResponse.status()).toBe(201);

      const createBody = await createResponse.json();
      expect(createBody).toHaveProperty('id');
      expect(createBody.status).toBe('pending');

      const requestId = createBody.id;

      // Step 2: Fetch request by ID
      const getResponse = await request.get(`/v1/requests/${requestId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(getResponse.ok()).toBeTruthy();
      const getBody = await getResponse.json();
      expect(getBody.id).toBe(requestId);

      // Step 3: Approve request
      const approveResponse = await request.post(`/v1/requests/${requestId}/approve`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          comments: 'E2E test approval - approved for testing',
        },
      });

      expect(approveResponse.ok()).toBeTruthy();
      const approveBody = await approveResponse.json();
      expect(approveBody.status).toBe('approved');

      // Step 4: List all requests and verify status
      const listResponse = await request.get('/v1/requests', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(listResponse.ok()).toBeTruthy();
      const listBody = await listResponse.json();
      expect(Array.isArray(listBody.requests || listBody)).toBeTruthy();
    });

    test('should allow rejecting requests', async ({ request }) => {
      // Create a request
      const requestData = {
        item_type: 'vm_instance',
        item_name: 'E2E Test VM to Reject',
        description: 'Testing rejection workflow',
        justification: 'E2E testing purposes',
      };

      const createResponse = await request.post('/v1/requests', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: requestData,
      });

      expect(createResponse.ok()).toBeTruthy();
      const createBody = await createResponse.json();
      const requestId = createBody.id;

      // Reject the request
      const rejectResponse = await request.post(`/v1/requests/${requestId}/reject`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          comments: 'E2E test rejection - insufficient justification',
        },
      });

      expect(rejectResponse.ok()).toBeTruthy();
      const rejectBody = await rejectResponse.json();
      expect(rejectBody.status).toBe('rejected');
    });
  });
});
