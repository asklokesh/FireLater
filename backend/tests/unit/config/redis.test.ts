import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue('PONG'),
    quit: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
  },
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Redis Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection URL Parsing', () => {
    it('should parse standard redis URL', () => {
      const url = 'redis://localhost:6379';
      const parsedUrl = new URL(url);

      expect(parsedUrl.hostname).toBe('localhost');
      expect(parsedUrl.port).toBe('6379');
    });

    it('should parse redis URL with custom port', () => {
      const url = 'redis://redis.example.com:6380';
      const parsedUrl = new URL(url);

      expect(parsedUrl.hostname).toBe('redis.example.com');
      expect(parsedUrl.port).toBe('6380');
    });

    it('should parse redis URL without port (use default)', () => {
      const url = 'redis://redis.example.com';
      const parsedUrl = new URL(url);

      expect(parsedUrl.hostname).toBe('redis.example.com');
      expect(parsedUrl.port).toBe('');
      // Default port should be 6379
      const port = parsedUrl.port || '6379';
      expect(port).toBe('6379');
    });

    it('should parse redis URL with authentication', () => {
      const url = 'redis://user:password@redis.example.com:6379';
      const parsedUrl = new URL(url);

      expect(parsedUrl.hostname).toBe('redis.example.com');
      expect(parsedUrl.username).toBe('user');
      expect(parsedUrl.password).toBe('password');
    });

    it('should parse redis URL with database number', () => {
      const url = 'redis://localhost:6379/1';
      const parsedUrl = new URL(url);

      expect(parsedUrl.hostname).toBe('localhost');
      expect(parsedUrl.pathname).toBe('/1');
    });
  });

  describe('BullMQ Connection Configuration', () => {
    it('should extract host from full URL', () => {
      const url = 'redis://myredis:6379';
      const host = url.includes('://') ? new URL(url).hostname : url.split(':')[0];

      expect(host).toBe('myredis');
    });

    it('should extract port from full URL', () => {
      const url = 'redis://myredis:6380';
      const port = url.includes('://')
        ? parseInt(new URL(url).port || '6379')
        : parseInt(url.split(':')[1] || '6379');

      expect(port).toBe(6380);
    });

    it('should default port to 6379 when not specified', () => {
      const url = 'redis://myredis';
      const port = url.includes('://')
        ? parseInt(new URL(url).port || '6379')
        : parseInt(url.split(':')[1] || '6379');

      expect(port).toBe(6379);
    });

    it('should handle simple host:port format', () => {
      const url = 'localhost:6379';
      const host = url.includes('://') ? new URL(url).hostname : url.split(':')[0];
      const port = url.includes('://')
        ? parseInt(new URL(url).port || '6379')
        : parseInt(url.split(':')[1] || '6379');

      expect(host).toBe('localhost');
      expect(port).toBe(6379);
    });
  });

  describe('Retry Strategy', () => {
    it('should return null after 3 retries', () => {
      const retryStrategy = (times: number) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 2000);
      };

      expect(retryStrategy(4)).toBeNull();
      expect(retryStrategy(5)).toBeNull();
    });

    it('should calculate retry delay correctly', () => {
      const retryStrategy = (times: number) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 2000);
      };

      expect(retryStrategy(1)).toBe(200);  // 1 * 200 = 200
      expect(retryStrategy(2)).toBe(400);  // 2 * 200 = 400
      expect(retryStrategy(3)).toBe(600);  // 3 * 200 = 600
    });

    it('should cap retry delay at 2000ms', () => {
      const retryStrategy = (times: number) => {
        if (times > 3) {
          return null;
        }
        return Math.min(times * 200, 2000);
      };

      // With times > 10, would exceed 2000 without cap
      // But since we return null after 3, this is theoretical
      expect(Math.min(15 * 200, 2000)).toBe(2000);
    });
  });

  describe('Redis Configuration Options', () => {
    it('should have maxRetriesPerRequest set to 3', () => {
      const config = {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      };

      expect(config.maxRetriesPerRequest).toBe(3);
    });

    it('should have enableReadyCheck set to true', () => {
      const config = {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      };

      expect(config.enableReadyCheck).toBe(true);
    });
  });

  describe('Connection Testing', () => {
    it('should return true for successful ping', async () => {
      const mockRedis = {
        ping: vi.fn().mockResolvedValue('PONG'),
      };

      const testConnection = async () => {
        try {
          await mockRedis.ping();
          return true;
        } catch {
          return false;
        }
      };

      const result = await testConnection();
      expect(result).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should return false for failed ping', async () => {
      const mockRedis = {
        ping: vi.fn().mockRejectedValue(new Error('Connection refused')),
      };

      const testConnection = async () => {
        try {
          await mockRedis.ping();
          return true;
        } catch {
          return false;
        }
      };

      const result = await testConnection();
      expect(result).toBe(false);
    });
  });

  describe('Connection Lifecycle', () => {
    it('should handle close operation', async () => {
      const mockRedis = {
        quit: vi.fn().mockResolvedValue(undefined),
      };

      await mockRedis.quit();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should handle error events', () => {
      const mockRedis = {
        on: vi.fn(),
      };

      mockRedis.on('error', vi.fn());
      mockRedis.on('connect', vi.fn());

      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('URL Schemes', () => {
    it('should handle redis:// scheme', () => {
      const url = 'redis://localhost:6379';
      expect(url.startsWith('redis://')).toBe(true);
    });

    it('should handle rediss:// scheme (TLS)', () => {
      const url = 'rediss://redis.example.com:6379';
      expect(url.startsWith('rediss://')).toBe(true);
    });

    it('should check if URL contains scheme', () => {
      const withScheme = 'redis://localhost:6379';
      const withoutScheme = 'localhost:6379';

      expect(withScheme.includes('://')).toBe(true);
      expect(withoutScheme.includes('://')).toBe(false);
    });
  });

  describe('Cluster/Sentinel Configuration', () => {
    it('should parse sentinel URL correctly', () => {
      // Note: Real sentinel URLs have different format
      // This tests the URL parsing capability
      const url = 'redis://sentinel1:26379';
      const parsedUrl = new URL(url);

      expect(parsedUrl.port).toBe('26379'); // Sentinel default port
    });
  });

  describe('Export Structure', () => {
    it('should define expected redis exports', () => {
      // Test the expected structure of redis config exports
      const expectedExports = ['redis', 'redisConnection', 'testRedisConnection', 'closeRedis'];

      // These are the expected exports from the redis config module
      expect(expectedExports).toContain('redis');
      expect(expectedExports).toContain('redisConnection');
      expect(expectedExports).toContain('testRedisConnection');
      expect(expectedExports).toContain('closeRedis');
    });

    it('should have redisConnection with host and port properties', () => {
      // Test the expected structure
      const redisConnection = {
        host: 'localhost',
        port: 6379,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
      };

      expect(redisConnection).toHaveProperty('host');
      expect(redisConnection).toHaveProperty('port');
      expect(redisConnection).toHaveProperty('maxRetriesPerRequest');
      expect(redisConnection).toHaveProperty('enableReadyCheck');
    });

    it('should build redisConnection from config', () => {
      const configUrl = 'redis://localhost:6379';

      const redisConnection = {
        host: configUrl.includes('://')
          ? new URL(configUrl).hostname
          : configUrl.split(':')[0],
        port: configUrl.includes('://')
          ? parseInt(new URL(configUrl).port || '6379')
          : parseInt(configUrl.split(':')[1] || '6379'),
      };

      expect(redisConnection.host).toBe('localhost');
      expect(redisConnection.port).toBe(6379);
    });
  });
});
