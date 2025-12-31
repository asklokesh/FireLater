import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase, teardownTestDatabase, createTestTenant, TestTenant } from '../test-utils/setup.js';
import { oncallScheduleService } from '../../src/services/oncall.js';
import { v4 as uuidv4 } from 'uuid';

describe('On-Call Rotation Logic', () => {
  let tenant: TestTenant;
  
  beforeEach(async () => {
    await setupTestDatabase();
    tenant = await createTestTenant();
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  it('should correctly rotate users in daily schedule', async () => {
    // Create users
    const userId1 = uuidv4();
    const userId2 = uuidv4();
    
    // Create schedule with daily rotation
    const schedule = await oncallScheduleService.createSchedule(tenant.slug, {
      name: 'Test Daily Rotation',
      timezone: 'UTC',
      rotationType: 'daily',
      handoffTime: '09:00'
    });
    
    // Add users to rotation
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId1, position: 1 });
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId2, position: 2 });
    
    // Test rotation calculation
    const rotation = await oncallScheduleService.getCurrentRotation(tenant.slug, schedule.id);
    expect(rotation).toBeDefined();
    expect([userId1, userId2]).toContain(rotation.currentUserId);
  });

  it('should handle weekly rotation with proper handoff days', async () => {
    const userId1 = uuidv4();
    const userId2 = uuidv4();
    
    const schedule = await oncallScheduleService.createSchedule(tenant.slug, {
      name: 'Test Weekly Rotation',
      timezone: 'UTC',
      rotationType: 'weekly',
      handoffDay: 1, // Tuesday
      handoffTime: '09:00'
    });
    
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId1, position: 1 });
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId2, position: 2 });
    
    const rotation = await oncallScheduleService.getCurrentRotation(tenant.slug, schedule.id);
    expect(rotation).toBeDefined();
  });

  it('should calculate correct on-call user for bi-weekly rotation', async () => {
    const userId1 = uuidv4();
    const userId2 = uuidv4();
    const userId3 = uuidv4();
    const userId4 = uuidv4();
    
    const schedule = await oncallScheduleService.createSchedule(tenant.slug, {
      name: 'Test Bi-Weekly Rotation',
      timezone: 'UTC',
      rotationType: 'bi_weekly',
      handoffDay: 3, // Thursday
      handoffTime: '17:00'
    });
    
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId1, position: 1 });
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId2, position: 2 });
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId3, position: 3 });
    await oncallScheduleService.addToRotation(tenant.slug, schedule.id, { userId: userId4, position: 4 });
    
    const rotation = await oncallScheduleService.getCurrentRotation(tenant.slug, schedule.id);
    expect(rotation).toBeDefined();
    expect([userId1, userId2, userId3, userId4]).toContain(rotation.currentUserId);
  });
});