import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerState } from '../../src/utils/circuitBreaker.js';

/**
 * Unit tests for CircuitBreaker pattern implementation
 * Testing state transitions, failure handling, and recovery behavior
 */

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const defaultOptions = {
    timeout: 1000,
    failureThreshold: 3,
    cooldownPeriod: 5000,
  };

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      const cb = new CircuitBreaker(defaultOptions);

      expect(cb.getState()).toBe('CLOSED');
    });

    it('should start with zero failure count', () => {
      const cb = new CircuitBreaker(defaultOptions);

      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('Successful Operations', () => {
    it('should execute operation and return result', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const operation = vi.fn().mockResolvedValue('success');

      const result = await cb.call(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should remain CLOSED after successful operation', async () => {
      const cb = new CircuitBreaker(defaultOptions);

      await cb.call(() => Promise.resolve('ok'));

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getFailureCount()).toBe(0);
    });

    it('should reset failure count on success', async () => {
      const cb = new CircuitBreaker(defaultOptions);

      // Cause one failure
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }
      expect(cb.getFailureCount()).toBe(1);

      // Success should reset
      await cb.call(() => Promise.resolve('ok'));

      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('Failure Handling', () => {
    it('should increment failure count on operation failure', async () => {
      const cb = new CircuitBreaker(defaultOptions);

      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      expect(cb.getFailureCount()).toBe(1);
      expect(cb.getState()).toBe('CLOSED');
    });

    it('should propagate operation error', async () => {
      const cb = new CircuitBreaker(defaultOptions);
      const error = new Error('Operation failed');

      await expect(cb.call(() => Promise.reject(error))).rejects.toThrow('Operation failed');
    });

    it('should open circuit after reaching failure threshold', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 3,
        cooldownPeriod: 5000,
      });

      // Cause failures up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await cb.call(() => Promise.reject(new Error('fail')));
        } catch (_e) {
          // Expected
        }
      }

      expect(cb.getState()).toBe('OPEN');
      expect(cb.getFailureCount()).toBe(3);
    });

    it('should not open circuit before reaching threshold', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 5,
        cooldownPeriod: 5000,
      });

      for (let i = 0; i < 4; i++) {
        try {
          await cb.call(() => Promise.reject(new Error('fail')));
        } catch (_e) {
          // Expected
        }
      }

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getFailureCount()).toBe(4);
    });
  });

  describe('Open State', () => {
    it('should reject calls when circuit is OPEN', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });

      // Open the circuit
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      // Try another call
      await expect(cb.call(() => Promise.resolve('ok'))).rejects.toThrow(
        'Circuit breaker is OPEN'
      );
    });

    it('should not execute operation when OPEN', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });
      const operation = vi.fn().mockResolvedValue('ok');

      // Open the circuit
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      try {
        await cb.call(operation);
      } catch (_e) {
        // Expected
      }

      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('Half-Open State', () => {
    it('should transition to HALF_OPEN after cooldown period', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });

      // Open the circuit
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }
      expect(cb.getState()).toBe('OPEN');

      // Advance time past cooldown
      vi.advanceTimersByTime(6000);

      // Next call should transition to HALF_OPEN and try the operation
      const result = await cb.call(() => Promise.resolve('recovered'));

      expect(result).toBe('recovered');
      expect(cb.getState()).toBe('CLOSED'); // Success in HALF_OPEN returns to CLOSED
    });

    it('should return to OPEN on failure in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });

      // Open the circuit
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      // Advance past cooldown
      vi.advanceTimersByTime(6000);

      // Fail in HALF_OPEN state
      try {
        await cb.call(() => Promise.reject(new Error('still failing')));
      } catch (_e) {
        // Expected
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('should return to CLOSED on success in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });

      // Open the circuit
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      // Advance past cooldown
      vi.advanceTimersByTime(6000);

      // Succeed in HALF_OPEN state
      await cb.call(() => Promise.resolve('success'));

      expect(cb.getState()).toBe('CLOSED');
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout slow operations', async () => {
      const cb = new CircuitBreaker({
        timeout: 100,
        failureThreshold: 3,
        cooldownPeriod: 5000,
      });

      const slowOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('slow'), 500);
        });

      const callPromise = cb.call(slowOperation);

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(150);

      await expect(callPromise).rejects.toThrow('Operation timeout');
    });

    it('should count timeout as failure', async () => {
      const cb = new CircuitBreaker({
        timeout: 100,
        failureThreshold: 3,
        cooldownPeriod: 5000,
      });

      const slowOperation = () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('slow'), 500);
        });

      try {
        const callPromise = cb.call(slowOperation);
        vi.advanceTimersByTime(150);
        await callPromise;
      } catch (_e) {
        // Expected
      }

      expect(cb.getFailureCount()).toBe(1);
    });

    it('should allow fast operations to succeed', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 3,
        cooldownPeriod: 5000,
      });

      const fastOperation = () => Promise.resolve('fast');

      const result = await cb.call(fastOperation);

      expect(result).toBe('fast');
    });
  });

  describe('Edge Cases', () => {
    it('should handle threshold of 1', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 1000,
      });

      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('should handle very short cooldown period', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 10,
      });

      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      vi.advanceTimersByTime(20);

      const result = await cb.call(() => Promise.resolve('recovered'));

      expect(result).toBe('recovered');
    });

    it('should handle multiple consecutive failures after reset', async () => {
      const cb = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 2,
        cooldownPeriod: 5000,
      });

      // First failure
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      // Success resets
      await cb.call(() => Promise.resolve('ok'));
      expect(cb.getFailureCount()).toBe(0);

      // Two more failures should open
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }
      try {
        await cb.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      expect(cb.getState()).toBe('OPEN');
    });

    it('should handle async operations correctly', async () => {
      vi.useRealTimers(); // Use real timers for this test
      const cb = new CircuitBreaker(defaultOptions);

      const asyncOperation = async () => {
        return 'async result';
      };

      const result = await cb.call(asyncOperation);

      expect(result).toBe('async result');
      vi.useFakeTimers(); // Restore fake timers
    });

    it('should maintain state across multiple instances independently', async () => {
      const cb1 = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });
      const cb2 = new CircuitBreaker({
        timeout: 1000,
        failureThreshold: 1,
        cooldownPeriod: 5000,
      });

      // Open cb1
      try {
        await cb1.call(() => Promise.reject(new Error('fail')));
      } catch (_e) {
        // Expected
      }

      expect(cb1.getState()).toBe('OPEN');
      expect(cb2.getState()).toBe('CLOSED');
    });
  });
});
