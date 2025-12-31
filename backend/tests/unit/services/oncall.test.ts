import { describe, it, expect } from 'vitest';
import { createScheduleSchema, createPolicySchema } from '../../../src/routes/oncall.js';

describe('Oncall Service', () => {
  describe('Schedule Validation', () => {
    it('should validate on-call schedule creation data', () => {
      const validData = {
        name: 'Primary Support Schedule',
        timezone: 'America/New_York',
        rotationType: 'weekly',
        handoffTime: '09:00'
      };
      
      expect(() => createScheduleSchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid schedule data', () => {
      const invalidData = {
        name: 'A', // invalid - too short
        handoffTime: '25:00' // invalid time
      };
      
      expect(() => createScheduleSchema.parse(invalidData)).toThrow();
    });
  });

  describe('Escalation Policy Validation', () => {
    it('should validate escalation policy creation data', () => {
      const validData = {
        name: 'Critical Incident Policy',
        repeatCount: 3,
        repeatDelayMinutes: 10
      };
      
      expect(() => createPolicySchema.parse(validData)).not.toThrow();
    });

    it('should reject invalid policy data', () => {
      const invalidData = {
        name: '', // invalid - empty string
        repeatCount: 15 // invalid - too high
      };
      
      expect(() => createPolicySchema.parse(invalidData)).toThrow();
    });
  });
});