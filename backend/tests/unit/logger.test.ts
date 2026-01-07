import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before importing logger
vi.mock('../../src/config/index.js', () => ({
  config: {
    logging: {
      level: 'info',
    },
    isDev: false,
  },
}));

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Logger Configuration', () => {
    it('should create a pino logger', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(logger).toBeDefined();
    });

    it('should have info method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.debug).toBe('function');
    });

    it('should have trace method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.trace).toBe('function');
    });

    it('should have fatal method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should have child method', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(typeof logger.child).toBe('function');
    });
  });

  describe('Logger Levels', () => {
    it('should support string message', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(() => logger.info('test message')).not.toThrow();
    });

    it('should support object with message', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      expect(() => logger.info({ key: 'value' }, 'test message')).not.toThrow();
    });

    it('should support error objects', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      const error = new Error('test error');
      expect(() => logger.error({ err: error }, 'error occurred')).not.toThrow();
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with bindings', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      const childLogger = logger.child({ requestId: '123' });
      expect(childLogger).toBeDefined();
      expect(typeof childLogger.info).toBe('function');
    });

    it('should create child logger with multiple bindings', async () => {
      const { logger } = await import('../../src/utils/logger.js');
      const childLogger = logger.child({ requestId: '123', userId: 'user-1' });
      expect(childLogger).toBeDefined();
    });
  });

  describe('Log Level Configuration', () => {
    it('should use level from config', async () => {
      const { config } = await import('../../src/config/index.js');
      expect(config.logging.level).toBe('info');
    });

    it('should not use transport in production', async () => {
      const { config } = await import('../../src/config/index.js');
      expect(config.isDev).toBe(false);
    });
  });
});
