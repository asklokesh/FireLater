import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { build } from '../helper.js';
import { mock, mockReset } from 'vitest-mock-extended';
import { FastifyInstance } from 'fastify';
import { workflowService } from '../../src/services/workflow.js';

// Mock the workflow service
vi.mock('../../src/services/workflow.js', () => ({
  workflowService: mock<ReturnType<typeof mock>>()
}));

describe('Workflow Routes', () => {
  let app: FastifyInstance;
  
  beforeEach(async () => {
    app = await build();
    mockReset(workflowService);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /workflows', () => {
    it('should return paginated workflows', async () => {
      const mockWorkflows = {
        data: [
          { id: '1', name: 'Test Workflow', description: 'A test workflow' }
        ],
        pagination: { page: 1, perPage: 20, total: 1 }
      };
      
      workflowService.list.mockResolvedValue(mockWorkflows);
      
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows',
        headers: {
          authorization: 'Bearer test-token'
        },
        query: {
          page: '1',
          perPage: '20'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.data).toHaveLength(1);
      expect(data.pagination.total).toBe(1);
      expect(workflowService.list).toHaveBeenCalledWith(
        expect.any(String),
        { page: 1, perPage: 20 }
      );
    });
  });

  describe('POST /workflows', () => {
    it('should create a new workflow', async () => {
      const workflowData = {
        name: 'New Workflow',
        description: 'A newly created workflow',
        steps: []
      };
      
      const createdWorkflow = { id: '1', ...workflowData };
      workflowService.create.mockResolvedValue(createdWorkflow);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: workflowData
      });
      
      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.body);
      expect(data.name).toBe(workflowData.name);
      expect(workflowService.create).toHaveBeenCalledWith(
        expect.any(String),
        workflowData
      );
    });
  });

  describe('GET /workflows/:id', () => {
    it('should return a workflow by ID', async () => {
      const workflow = {
        id: '1',
        name: 'Test Workflow',
        description: 'A test workflow'
      };
      
      workflowService.getById.mockResolvedValue(workflow);
      
      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/1',
        headers: {
          authorization: 'Bearer test-token'
        }
      });
      
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.id).toBe('1');
      expect(workflowService.getById).toHaveBeenCalledWith(
        expect.any(String),
        '1'
      );
    });
  });

  describe('PUT /workflows/:id', () => {
    it('should update a workflow', async () => {
      const updateData = {
        name: 'Updated Workflow',
        description: 'An updated workflow'
      };
      
      const updatedWorkflow = { id: '1', ...updateData };
      workflowService.update.mockResolvedValue(updatedWorkflow);
      
      const response = await app.inject({
        method: 'PUT',
        url: '/api/workflows/1',
        headers: {
          authorization: 'Bearer test-token'
        },
        payload: updateData
      });
      
      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.name).toBe(updateData.name);
      expect(workflowService.update).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        updateData
      );
    });
  });

  describe('DELETE /workflows/:id', () => {
    it('should delete a workflow', async () => {
      workflowService.delete.mockResolvedValue(undefined);
      
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/workflows/1',
        headers: {
          authorization: 'Bearer test-token'
        }
      });
      
      expect(response.statusCode).toBe(204);
      expect(workflowService.delete).toHaveBeenCalledWith(
        expect.any(String),
        '1'
      );
    });
  });
});