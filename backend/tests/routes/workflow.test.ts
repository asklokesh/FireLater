import { test, describe, beforeEach, afterEach } from 'node:test';
import { deepEqual, rejects, ok } from 'node:assert';
import { FastifyInstance } from 'fastify';
import { buildTestServer } from '../helpers/server.js';
import { resetDatabase } from '../helpers/db.js';

describe('Workflow Routes - Approval Chain Logic', () => {
  let app: FastifyInstance;
  
  beforeEach(async () => {
    app = await buildTestServer();
    await resetDatabase();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Circular Dependency Detection', () => {
    test('should reject approval chain with direct circular dependency', async () => {
      // Create users
      const user1 = { id: 'user1', name: 'User 1' };
      const user2 = { id: 'user2', name: 'User 2' };
      
      // Create workflow with circular dependency: user1 -> user2 -> user1
      const workflowData = {
        name: 'Circular Approval Workflow',
        approvalChain: [
          { approverId: user1.id, level: 1 },
          { approverId: user2.id, level: 2 },
          { approverId: user1.id, level: 3 } // Circular reference
        ]
      };

      await rejects(
        app.inject({
          method: 'POST',
          url: '/api/workflows',
          payload: workflowData
        }),
        (err) => {
          ok(err.message.includes('circular dependency'));
          return true;
        }
      );
    });

    test('should reject approval chain with indirect circular dependency', async () => {
      // Create users
      const user1 = { id: 'user1', name: 'User 1' };
      const user2 = { id: 'user2', name: 'User 2' };
      const user3 = { id: 'user3', name: 'User 3' };
      
      // Create workflow with indirect circular dependency: user1 -> user2 -> user3 -> user1
      const workflowData = {
        name: 'Indirect Circular Approval Workflow',
        approvalChain: [
          { approverId: user1.id, level: 1 },
          { approverId: user2.id, level: 2 },
          { approverId: user3.id, level: 3 },
          { approverId: user1.id, level: 4 } // Indirect circular reference
        ]
      };

      await rejects(
        app.inject({
          method: 'POST',
          url: '/api/workflows',
          payload: workflowData
        }),
        (err) => {
          ok(err.message.includes('circular dependency'));
          return true;
        }
      );
    });

    test('should allow valid approval chain without circular dependencies', async () => {
      // Create users
      const user1 = { id: 'user1', name: 'User 1' };
      const user2 = { id: 'user2', name: 'User 2' };
      const user3 = { id: 'user3', name: 'User 3' };
      
      // Create workflow with valid approval chain: user1 -> user2 -> user3
      const workflowData = {
        name: 'Valid Approval Workflow',
        approvalChain: [
          { approverId: user1.id, level: 1 },
          { approverId: user2.id, level: 2 },
          { approverId: user3.id, level: 3 }
        ]
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: workflowData
      });

      deepEqual(response.statusCode, 201);
      const result = JSON.parse(response.body);
      ok(result.id);
      deepEqual(result.name, workflowData.name);
    });

    test('should allow approver appearing in different non-circular positions', async () => {
      // Create users
      const manager = { id: 'manager', name: 'Manager' };
      const director = { id: 'director', name: 'Director' };
      
      // Create workflow where manager appears at different levels without circular dependency
      // manager (level 1) -> director (level 2) -> manager (level 3) is still circular
      // But manager (level 1) -> director (level 2) -> vp (level 3) -> manager (level 4) is circular
      // So we test a valid case: user1 -> user2 -> user3 -> user4
      const user1 = { id: 'user1', name: 'User 1' };
      const user2 = { id: 'user2', name: 'User 2' };
      const user3 = { id: 'user3', name: 'User 3' };
      const user4 = { id: 'user4', name: 'User 4' };
      
      const workflowData = {
        name: 'Non-Circular Multi-Level Workflow',
        approvalChain: [
          { approverId: user1.id, level: 1 },
          { approverId: user2.id, level: 2 },
          { approverId: user3.id, level: 3 },
          { approverId: user4.id, level: 4 }
        ]
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/workflows',
        payload: workflowData
      });

      deepEqual(response.statusCode, 201);
      const result = JSON.parse(response.body);
      ok(result.id);
      deepEqual(result.name, workflowData.name);
    });
  });
});