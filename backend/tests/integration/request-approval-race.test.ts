import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pool } from '../../src/config/database.js';
import { requestService } from '../../src/services/requests.js';
import { tenantService } from '../../src/services/tenant.js';

/**
 * Integration test for concurrent approval race condition fix
 *
 * Scenario: Two approvers attempt to approve a request simultaneously
 * Expected: Only one approval succeeds per approval record
 * Previous Bug: Both approvers could mark the request as 'approved' simultaneously
 *               leading to duplicate notifications and inconsistent state
 */
describe('Request Approval Race Condition', () => {
  const tenantSlug = 'test-tenant-race';
  let schema: string;
  let testRequestId: string;
  let approval1Id: string;
  let approval2Id: string;
  let userId1: string;
  let userId2: string;
  let catalogItemId: string;

  beforeEach(async () => {
    // Create test tenant
    schema = tenantService.getSchemaName(tenantSlug);

    // Create schema if not exists
    await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

    // Create minimal tables for testing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.catalog_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        approval_required BOOLEAN DEFAULT true,
        approval_group_id UUID,
        expected_completion_days INTEGER DEFAULT 5,
        price DECIMAL(10, 2) DEFAULT 0,
        cost_center VARCHAR(100),
        fulfillment_group_id UUID
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.service_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_number VARCHAR(50) NOT NULL,
        catalog_item_id UUID NOT NULL,
        requester_id UUID NOT NULL,
        requested_for_id UUID NOT NULL,
        status VARCHAR(50) NOT NULL,
        priority VARCHAR(20),
        form_data JSONB,
        notes TEXT,
        cost_center VARCHAR(100),
        total_cost DECIMAL(10, 2),
        fulfillment_group_id UUID,
        due_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.request_approvals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL,
        step_number INTEGER NOT NULL,
        approver_group_id UUID,
        approver_user_id UUID,
        status VARCHAR(50) DEFAULT 'pending',
        decision VARCHAR(50),
        comments TEXT,
        decided_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.request_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id UUID NOT NULL,
        from_status VARCHAR(50),
        to_status VARCHAR(50) NOT NULL,
        changed_by UUID NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        action VARCHAR(50),
        entity_type VARCHAR(50),
        entity_id UUID,
        changes JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create test users
    const user1Result = await pool.query(
      `INSERT INTO ${schema}.users (email, name) VALUES ($1, $2) RETURNING id`,
      ['approver1@test.com', 'Approver One']
    );
    userId1 = user1Result.rows[0].id;

    const user2Result = await pool.query(
      `INSERT INTO ${schema}.users (email, name) VALUES ($1, $2) RETURNING id`,
      ['approver2@test.com', 'Approver Two']
    );
    userId2 = user2Result.rows[0].id;

    // Create catalog item
    const catalogResult = await pool.query(
      `INSERT INTO ${schema}.catalog_items (name) VALUES ($1) RETURNING id`,
      ['Test Service']
    );
    catalogItemId = catalogResult.rows[0].id;

    // Create test request requiring 2 approvals
    const requestResult = await pool.query(
      `INSERT INTO ${schema}.service_requests
       (request_number, catalog_item_id, requester_id, requested_for_id, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['REQ-001', catalogItemId, userId1, userId1, 'pending_approval']
    );
    testRequestId = requestResult.rows[0].id;

    // Create 2 pending approvals
    const approval1Result = await pool.query(
      `INSERT INTO ${schema}.request_approvals
       (request_id, step_number, approver_user_id, status)
       VALUES ($1, 1, $2, 'pending') RETURNING id`,
      [testRequestId, userId1]
    );
    approval1Id = approval1Result.rows[0].id;

    const approval2Result = await pool.query(
      `INSERT INTO ${schema}.request_approvals
       (request_id, step_number, approver_user_id, status)
       VALUES ($1, 2, $2, 'pending') RETURNING id`,
      [testRequestId, userId2]
    );
    approval2Id = approval2Result.rows[0].id;
  });

  afterEach(async () => {
    // Cleanup
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  });

  it('should prevent race condition when two approvals happen simultaneously', async () => {
    // Simulate concurrent approvals using Promise.all
    const [result1, result2] = await Promise.allSettled([
      requestService.approve(tenantSlug, testRequestId, approval1Id, 'Approved by user 1', userId1),
      requestService.approve(tenantSlug, testRequestId, approval2Id, 'Approved by user 2', userId2),
    ]);

    // Both approvals should succeed
    expect(result1.status).toBe('fulfilled');
    expect(result2.status).toBe('fulfilled');

    // Verify both approval records are marked as approved
    const approvalCheck = await pool.query(
      `SELECT id, status FROM ${schema}.request_approvals WHERE request_id = $1 ORDER BY step_number`,
      [testRequestId]
    );

    expect(approvalCheck.rows.length).toBe(2);
    expect(approvalCheck.rows[0].status).toBe('approved');
    expect(approvalCheck.rows[1].status).toBe('approved');

    // Verify request status is 'approved' (all approvals complete)
    const requestCheck = await pool.query(
      `SELECT status FROM ${schema}.service_requests WHERE id = $1`,
      [testRequestId]
    );

    expect(requestCheck.rows[0].status).toBe('approved');

    // Verify only ONE status history entry for final approval
    const historyCheck = await pool.query(
      `SELECT COUNT(*) as count FROM ${schema}.request_status_history
       WHERE request_id = $1 AND to_status = 'approved'`,
      [testRequestId]
    );

    expect(parseInt(historyCheck.rows[0].count, 10)).toBe(1);
  });

  it('should prevent double-approval of the same approval record', async () => {
    // Attempt to approve the same approval twice concurrently
    const [result1, result2] = await Promise.allSettled([
      requestService.approve(tenantSlug, testRequestId, approval1Id, 'Approved by user 1', userId1),
      requestService.approve(tenantSlug, testRequestId, approval1Id, 'Duplicate approval', userId1),
    ]);

    // One should succeed, one should fail
    const succeeded = [result1, result2].filter((r) => r.status === 'fulfilled');
    const failed = [result1, result2].filter((r) => r.status === 'rejected');

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);

    // Verify the failure reason
    if (failed[0].status === 'rejected') {
      expect(failed[0].reason.message).toContain('already been processed');
    }

    // Verify approval is marked as approved only once
    const approvalCheck = await pool.query(
      `SELECT status FROM ${schema}.request_approvals WHERE id = $1`,
      [approval1Id]
    );

    expect(approvalCheck.rows[0].status).toBe('approved');
  });

  it('should handle concurrent approve and reject correctly', async () => {
    // Attempt to approve and reject the same request concurrently
    const [result1, result2] = await Promise.allSettled([
      requestService.approve(tenantSlug, testRequestId, approval1Id, 'Approved', userId1),
      requestService.reject(tenantSlug, testRequestId, approval2Id, 'Rejected', userId2),
    ]);

    // Both should succeed (different approvals)
    expect(result1.status).toBe('fulfilled');
    expect(result2.status).toBe('fulfilled');

    // Verify request status is 'rejected' (rejection takes precedence)
    const requestCheck = await pool.query(
      `SELECT status FROM ${schema}.service_requests WHERE id = $1`,
      [testRequestId]
    );

    expect(requestCheck.rows[0].status).toBe('rejected');
  });
});
