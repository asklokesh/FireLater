import { test, expect, beforeEach, vi } from 'vitest';
import fastify from 'fastify';
import workflowRoutes from '../../src/routes/workflow.js';
import { authenticateTenant, validateTenantAccess } from '../../src/middleware/auth.js';
import { workflowService } from '../../src/services/workflow.js';

// Mock services and middleware
vi.mock('../../src/services/workflow.js');
vi.mock('../../src/middleware/auth.js');

const app = fastify();
app.register(workflowRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

test('should validate workflow creation parameters', async () => {
  const response = await app.inject({
    method: 'POST',
    url: '/workflows',
    payload: {
      // Missing required fields
    }
  });
  
  expect(response.statusCode).toBe(400);
});

test('should create workflow with valid parameters', async () => {
  (authenticateTenant as any).mockImplementation((req, res, next) => next());
  (validateTenantAccess as any).mockImplementation((req, res, next) => next());
  (workflowService.createWorkflow as any).mockResolvedValue({
    id: 'workflow-123',
    name: 'Test Workflow'
  });

  const response = await app.inject({
    method: 'POST',
    url: '/workflows',
    payload: {
      name: 'Test Workflow',
      description: 'A test workflow',
      triggerType: 'manual'
    },
    headers: {
      'x-tenant-slug': 'test-tenant'
    }
  });

  expect(response.statusCode).toBe(201);
  expect(workflowService.createWorkflow).toHaveBeenCalledWith(
    'test-tenant',
    expect.objectContaining({
      name: 'Test Workflow',
      description: 'A test workflow',
      triggerType: 'manual'
    })
  );
});