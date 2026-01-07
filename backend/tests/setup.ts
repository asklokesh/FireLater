import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/firelater_test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.JWT_ACCESS_EXPIRY = '1h';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.PORT = '3002';
process.env.HOST = '0.0.0.0';

// Mock external services
const mockRedisData = new Map<string, string>();
const mockRedisTTL = new Map<string, number>();

vi.mock('../src/config/redis.js', () => ({
  redis: {
    get: vi.fn((key: string) => Promise.resolve(mockRedisData.get(key) || null)),
    set: vi.fn((key: string, value: string, ...args: any[]) => {
      // Handle both SET key value and SET key value EX seconds
      mockRedisData.set(key, value);
      // Check for EX argument
      const exIdx = args.indexOf('EX');
      if (exIdx >= 0 && args[exIdx + 1]) {
        mockRedisTTL.set(key, args[exIdx + 1]);
      }
      return Promise.resolve('OK');
    }),
    setex: vi.fn((key: string, ttl: number, value: string) => {
      mockRedisData.set(key, value);
      mockRedisTTL.set(key, ttl);
      return Promise.resolve('OK');
    }),
    ttl: vi.fn((key: string) => {
      // Return the TTL if set, -2 if key doesn't exist, -1 if no TTL
      if (!mockRedisData.has(key)) {
        return Promise.resolve(-2);
      }
      const ttl = mockRedisTTL.get(key);
      return Promise.resolve(ttl !== undefined ? ttl : -1);
    }),
    del: vi.fn((...keys: string[]) => {
      const flatKeys = keys.flat();
      flatKeys.forEach(k => {
        mockRedisData.delete(k);
        mockRedisTTL.delete(k);
      });
      return Promise.resolve(flatKeys.length);
    }),
    keys: vi.fn((pattern: string) => {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return Promise.resolve(Array.from(mockRedisData.keys()).filter(k => regex.test(k)));
    }),
    scan: vi.fn((cursor: string, ...args: any[]) => {
      // SCAN cursor MATCH pattern COUNT count
      const matchIdx = args.indexOf('MATCH');
      const pattern = matchIdx >= 0 ? args[matchIdx + 1] : '*';
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      const matchedKeys = Array.from(mockRedisData.keys()).filter(k => regex.test(k));
      // Return all keys at once with cursor '0' to indicate completion
      return Promise.resolve(['0', matchedKeys]);
    }),
    flushdb: vi.fn(() => {
      mockRedisData.clear();
      mockRedisTTL.clear();
      return Promise.resolve('OK');
    }),
    info: vi.fn((section?: string) => {
      if (section === 'keyspace') {
        const keyCount = mockRedisData.size;
        return Promise.resolve(`# Keyspace\ndb0:keys=${keyCount},expires=0,avg_ttl=0`);
      } else if (section === 'memory') {
        return Promise.resolve('# Memory\nused_memory:1000000\nused_memory_human:976.56K');
      } else if (section === 'stats') {
        return Promise.resolve('# Stats\nkeyspace_hits:100\nkeyspace_misses:20');
      }
      return Promise.resolve('redis_version:7.0.0\nused_memory:1000\nconnected_clients:1');
    }),
    dbsize: vi.fn(() => Promise.resolve(mockRedisData.size)),
    quit: vi.fn(() => Promise.resolve('OK')),
  },
  testRedisConnection: vi.fn().mockResolvedValue(true),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

// Mock S3 client
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
  HeadObjectCommand: vi.fn(),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://mock-presigned-url.com'),
}));

// Mock SendGrid
vi.mock('@sendgrid/mail', () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn().mockResolvedValue([{ statusCode: 202 }]),
  },
}));

// Global test lifecycle
beforeAll(async () => {
  // Setup code before all tests
});

afterAll(async () => {
  // Cleanup code after all tests
});
