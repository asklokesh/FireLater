import { describe, it, expect, beforeEach, vi } from 'vitest';
import { oncallScheduleService } from '../../src/services/oncall.js';
import { db } from '../../src/utils/db.js';

// Mock database
vi.mock('../../src/utils/db.js', () => ({
  db: {
    query: vi.fn(),
  },
}));

describe('Oncall Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleRotationHandoff', () => {
    it('should handle rotation handoff at end of shift period', async () => {
      const scheduleId = 'test-schedule';
      const currentTime = new Date('2023-05-15T09:00:00Z');
      
      // Mock current shift ending and next shift starting
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'current-shift',
          userId: 'user-1',
          endTime: new Date('2023-05-15T09:00:00Z')
        }]
      });
      
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'next-shift',
          userId: 'user-2',
          startTime: new Date('2023-05-15T09:00:01Z')
        }]
      });

      const result = await oncallScheduleService.handleRotationHandoff(scheduleId, currentTime);
      expect(result.handoffCompleted).toBe(true);
      expect(result.previousUserId).toBe('user-1');
      expect(result.newUserId).toBe('user-2');
    });

    it('should handle rotation handoff failure when no next shift exists', async () => {
      const scheduleId = 'test-schedule';
      const currentTime = new Date('2023-05-15T09:00:00Z');
      
      // Mock current shift but no next shift
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'current-shift',
          userId: 'user-1',
          endTime: new Date('2023-05-15T09:00:00Z')
        }]
      });
      
      (db.query as vi.Mock).mockResolvedValueOnce({
        rows: []
      }); // No next shift

      await expect(oncallScheduleService.handleRotationHandoff(scheduleId, currentTime))
        .rejects.toThrow('No upcoming shift found for rotation handoff');
    });
  });
});