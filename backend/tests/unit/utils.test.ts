import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, BadRequestError } from '../../src/utils/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an error with correct values', () => {
      const error = new AppError(500, 'Internal Error', 'Test error');
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.error).toBe('Internal Error');
    });

    it('should create an error with custom values', () => {
      const error = new AppError(400, 'Custom Error', 'Custom message');
      expect(error.message).toBe('Custom message');
      expect(error.statusCode).toBe(400);
      expect(error.error).toBe('Custom Error');
    });

    it('should convert to JSON', () => {
      const error = new AppError(400, 'JSON_CODE', 'JSON error');
      const json = error.toJSON();
      expect(json).toEqual({
        statusCode: 400,
        error: 'JSON_CODE',
        message: 'JSON error',
      });
    });

    it('should include details in JSON if provided', () => {
      const error = new AppError(400, 'Validation Error', 'Validation failed', {
        email: ['Email is required'],
      });
      const json = error.toJSON();
      expect(json.details).toEqual({ email: ['Email is required'] });
    });
  });

  describe('NotFoundError', () => {
    it('should create a not found error with resource and id', () => {
      const error = new NotFoundError('User', '123');
      expect(error.message).toBe("User with id '123' not found");
      expect(error.statusCode).toBe(404);
      expect(error.error).toBe('Not Found');
    });

    it('should create a not found error without id', () => {
      const error = new NotFoundError('Resource');
      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error with details', () => {
      const error = new ValidationError({ email: ['Invalid email'] });
      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(400);
      expect(error.error).toBe('Validation Error');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create an unauthorized error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.error).toBe('Unauthorized');
    });

    it('should create an unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid token');
      expect(error.message).toBe('Invalid token');
    });
  });

  describe('ForbiddenError', () => {
    it('should create a forbidden error', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Forbidden');
      expect(error.statusCode).toBe(403);
      expect(error.error).toBe('Forbidden');
    });
  });

  describe('BadRequestError', () => {
    it('should create a bad request error', () => {
      const error = new BadRequestError('Missing parameter');
      expect(error.message).toBe('Missing parameter');
      expect(error.statusCode).toBe(400);
      expect(error.error).toBe('Bad Request');
    });
  });
});

describe('Utility Functions', () => {
  describe('Priority Calculation', () => {
    it('should calculate priority from urgency and impact', () => {
      // Priority matrix logic
      const calculatePriority = (urgency: number, impact: number): number => {
        const priorityMatrix: Record<string, number> = {
          '1-1': 1, '1-2': 1, '1-3': 2, '1-4': 2, '1-5': 3,
          '2-1': 1, '2-2': 2, '2-3': 2, '2-4': 3, '2-5': 3,
          '3-1': 2, '3-2': 2, '3-3': 3, '3-4': 3, '3-5': 4,
          '4-1': 2, '4-2': 3, '4-3': 3, '4-4': 4, '4-5': 4,
          '5-1': 3, '5-2': 3, '5-3': 4, '5-4': 4, '5-5': 5,
        };
        return priorityMatrix[`${urgency}-${impact}`] || 3;
      };

      expect(calculatePriority(1, 1)).toBe(1); // Critical
      expect(calculatePriority(5, 5)).toBe(5); // Low
      expect(calculatePriority(3, 3)).toBe(3); // Medium
    });
  });

  describe('State Transitions', () => {
    it('should validate issue state transitions', () => {
      const validTransitions: Record<string, string[]> = {
        new: ['in_progress', 'cancelled'],
        in_progress: ['pending', 'resolved', 'cancelled'],
        pending: ['in_progress', 'resolved', 'cancelled'],
        resolved: ['closed', 'in_progress'],
        closed: [],
        cancelled: [],
      };

      const isValidTransition = (from: string, to: string): boolean => {
        return validTransitions[from]?.includes(to) || false;
      };

      expect(isValidTransition('new', 'in_progress')).toBe(true);
      expect(isValidTransition('new', 'closed')).toBe(false);
      expect(isValidTransition('in_progress', 'resolved')).toBe(true);
      expect(isValidTransition('closed', 'new')).toBe(false);
    });

    it('should validate change state transitions', () => {
      const validTransitions: Record<string, string[]> = {
        draft: ['submitted', 'cancelled'],
        submitted: ['pending_approval', 'cancelled'],
        pending_approval: ['approved', 'rejected'],
        approved: ['scheduled', 'cancelled'],
        scheduled: ['in_progress', 'cancelled'],
        in_progress: ['completed', 'failed'],
        completed: ['closed'],
        failed: ['draft', 'closed'],
        closed: [],
        cancelled: [],
        rejected: ['draft'],
      };

      const isValidTransition = (from: string, to: string): boolean => {
        return validTransitions[from]?.includes(to) || false;
      };

      expect(isValidTransition('draft', 'submitted')).toBe(true);
      expect(isValidTransition('pending_approval', 'approved')).toBe(true);
      expect(isValidTransition('completed', 'draft')).toBe(false);
      expect(isValidTransition('rejected', 'draft')).toBe(true);
    });
  });

  describe('SLA Calculations', () => {
    it('should calculate response time SLA breach', () => {
      const calculateSlaStatus = (
        priority: number,
        createdAt: Date,
        firstResponseAt: Date | null,
        slaConfig: Record<number, number>
      ): { breached: boolean; remainingMs: number } => {
        const now = new Date();
        const slaMs = slaConfig[priority] * 60 * 60 * 1000; // hours to ms

        if (firstResponseAt) {
          const responseTimeMs = firstResponseAt.getTime() - createdAt.getTime();
          return {
            breached: responseTimeMs > slaMs,
            remainingMs: 0,
          };
        }

        const elapsedMs = now.getTime() - createdAt.getTime();
        return {
          breached: elapsedMs > slaMs,
          remainingMs: Math.max(0, slaMs - elapsedMs),
        };
      };

      const slaConfig = { 1: 1, 2: 4, 3: 8, 4: 24, 5: 48 }; // hours

      // Use fixed timestamps to avoid timing races
      const baseTime = new Date('2024-01-15T10:00:00Z').getTime();
      const createdAt = new Date(baseTime); // Ticket created at 10:00
      const responded = new Date(baseTime + 59 * 60 * 1000); // Responded at 10:59 (59 minutes)

      // Priority 1 SLA is 1 hour, responded in 59 minutes - should not breach
      const result = calculateSlaStatus(1, createdAt, responded, slaConfig);
      expect(result.breached).toBe(false); // Responded within 1 hour SLA
    });
  });

  describe('Date/Time Utilities', () => {
    it('should format date to ISO string', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(date.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });

    it('should calculate business hours', () => {
      const isBusinessHour = (date: Date): boolean => {
        const hour = date.getUTCHours();
        const day = date.getUTCDay();
        return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
      };

      // Monday 10:00 UTC
      const monday = new Date('2024-01-15T10:00:00Z');
      expect(isBusinessHour(monday)).toBe(true);

      // Saturday 10:00 UTC
      const saturday = new Date('2024-01-13T10:00:00Z');
      expect(isBusinessHour(saturday)).toBe(false);

      // Monday 20:00 UTC
      const evening = new Date('2024-01-15T20:00:00Z');
      expect(isBusinessHour(evening)).toBe(false);
    });
  });

  describe('String Utilities', () => {
    it('should generate issue number with prefix', () => {
      const generateNumber = (prefix: string, sequence: number): string => {
        return `${prefix}${String(sequence).padStart(7, '0')}`;
      };

      expect(generateNumber('INC', 1)).toBe('INC0000001');
      expect(generateNumber('INC', 1234567)).toBe('INC1234567');
      expect(generateNumber('CHG', 42)).toBe('CHG0000042');
      expect(generateNumber('REQ', 999)).toBe('REQ0000999');
    });

    it('should sanitize input strings', () => {
      const sanitize = (input: string): string => {
        return input.replace(/<[^>]*>/g, '').trim();
      };

      expect(sanitize('<script>alert("xss")</script>Test')).toBe('alert("xss")Test');
      expect(sanitize('  Hello World  ')).toBe('Hello World');
      expect(sanitize('<b>Bold</b> text')).toBe('Bold text');
    });

    it('should truncate long strings', () => {
      const truncate = (str: string, maxLength: number): string => {
        if (str.length <= maxLength) return str;
        return str.slice(0, maxLength - 3) + '...';
      };

      expect(truncate('Short', 10)).toBe('Short');
      expect(truncate('This is a very long string', 10)).toBe('This is...');
    });
  });
});
