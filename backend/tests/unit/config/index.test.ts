import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Test the config schema validation logic
describe('Config Schema Validation', () => {
  describe('Environment Schema', () => {
    // Replicate the schema for testing
    const envSchema = z.object({
      PORT: z.string().default('3001'),
      HOST: z.string().default('0.0.0.0'),
      NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
      DATABASE_URL: z.string(),
      REDIS_URL: z.string().default('redis://localhost:6379'),
      JWT_SECRET: z.string().min(32),
      JWT_ACCESS_EXPIRY: z.string().default('1h'),
      JWT_REFRESH_EXPIRY: z.string().default('7d'),
      ENCRYPTION_KEY: z.string().min(32).optional(),
      LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
      SENDGRID_API_KEY: z.string().optional(),
      EMAIL_FROM: z.string().email().optional(),
      EMAIL_FROM_NAME: z.string().default('FireLater'),
      SLACK_DEFAULT_WEBHOOK_URL: z.string().url().optional(),
      TEAMS_DEFAULT_WEBHOOK_URL: z.string().url().optional(),
      S3_ENDPOINT: z.string().url().optional(),
      S3_REGION: z.string().default('us-east-1'),
      S3_BUCKET: z.string().optional(),
      S3_ACCESS_KEY: z.string().optional(),
      S3_SECRET_KEY: z.string().optional(),
      S3_FORCE_PATH_STYLE: z.string().default('false'),
      CORS_ORIGIN: z.string().default('http://localhost:3000'),
    });

    const validEnv = {
      DATABASE_URL: 'postgresql://localhost:5432/firelater',
      JWT_SECRET: 'this-is-a-very-long-secret-key-for-jwt-signing-12345',
    };

    it('should validate required fields', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
    });

    it('should fail without DATABASE_URL', () => {
      const result = envSchema.safeParse({
        JWT_SECRET: 'this-is-a-very-long-secret-key-for-jwt-signing-12345',
      });
      expect(result.success).toBe(false);
    });

    it('should fail without JWT_SECRET', () => {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/firelater',
      });
      expect(result.success).toBe(false);
    });

    it('should fail with JWT_SECRET less than 32 characters', () => {
      const result = envSchema.safeParse({
        DATABASE_URL: 'postgresql://localhost:5432/firelater',
        JWT_SECRET: 'short-secret',
      });
      expect(result.success).toBe(false);
    });

    it('should use default PORT when not provided', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe('3001');
      }
    });

    it('should use custom PORT when provided', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        PORT: '8080',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe('8080');
      }
    });

    it('should use default HOST when not provided', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.HOST).toBe('0.0.0.0');
      }
    });

    it('should use custom HOST when provided', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        HOST: '127.0.0.1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.HOST).toBe('127.0.0.1');
      }
    });

    it('should default NODE_ENV to development', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('should accept production NODE_ENV', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        NODE_ENV: 'production',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('production');
      }
    });

    it('should accept test NODE_ENV', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        NODE_ENV: 'test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('test');
      }
    });

    it('should reject invalid NODE_ENV', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        NODE_ENV: 'staging',
      });
      expect(result.success).toBe(false);
    });

    it('should default REDIS_URL to localhost', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.REDIS_URL).toBe('redis://localhost:6379');
      }
    });

    it('should accept custom REDIS_URL', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        REDIS_URL: 'redis://redis.example.com:6379',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.REDIS_URL).toBe('redis://redis.example.com:6379');
      }
    });

    it('should default LOG_LEVEL to info', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.LOG_LEVEL).toBe('info');
      }
    });

    it('should accept all valid LOG_LEVEL values', () => {
      const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
      for (const level of levels) {
        const result = envSchema.safeParse({
          ...validEnv,
          LOG_LEVEL: level,
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.LOG_LEVEL).toBe(level);
        }
      }
    });

    it('should reject invalid LOG_LEVEL', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        LOG_LEVEL: 'verbose',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional ENCRYPTION_KEY with 32+ characters', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        ENCRYPTION_KEY: 'this-is-a-32-character-encryption-key-12345',
      });
      expect(result.success).toBe(true);
    });

    it('should reject ENCRYPTION_KEY with less than 32 characters', () => {
      const result = envSchema.safeParse({
        ...validEnv,
        ENCRYPTION_KEY: 'short-key',
      });
      expect(result.success).toBe(false);
    });

    it('should allow missing ENCRYPTION_KEY', () => {
      const result = envSchema.safeParse(validEnv);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.ENCRYPTION_KEY).toBeUndefined();
      }
    });
  });

  describe('JWT Configuration', () => {
    const envSchema = z.object({
      JWT_ACCESS_EXPIRY: z.string().default('1h'),
      JWT_REFRESH_EXPIRY: z.string().default('7d'),
    });

    it('should default JWT_ACCESS_EXPIRY to 1h', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_ACCESS_EXPIRY).toBe('1h');
      }
    });

    it('should default JWT_REFRESH_EXPIRY to 7d', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_REFRESH_EXPIRY).toBe('7d');
      }
    });

    it('should accept custom JWT expiry values', () => {
      const result = envSchema.safeParse({
        JWT_ACCESS_EXPIRY: '30m',
        JWT_REFRESH_EXPIRY: '30d',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_ACCESS_EXPIRY).toBe('30m');
        expect(result.data.JWT_REFRESH_EXPIRY).toBe('30d');
      }
    });
  });

  describe('Email Configuration', () => {
    const envSchema = z.object({
      SENDGRID_API_KEY: z.string().optional(),
      EMAIL_FROM: z.string().email().optional(),
      EMAIL_FROM_NAME: z.string().default('FireLater'),
    });

    it('should allow missing email configuration', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should default EMAIL_FROM_NAME to FireLater', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.EMAIL_FROM_NAME).toBe('FireLater');
      }
    });

    it('should accept valid email address', () => {
      const result = envSchema.safeParse({
        EMAIL_FROM: 'noreply@firelater.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid email address', () => {
      const result = envSchema.safeParse({
        EMAIL_FROM: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Webhook Configuration', () => {
    const envSchema = z.object({
      SLACK_DEFAULT_WEBHOOK_URL: z.string().url().optional(),
      TEAMS_DEFAULT_WEBHOOK_URL: z.string().url().optional(),
    });

    it('should allow missing webhook URLs', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept valid Slack webhook URL', () => {
      const result = envSchema.safeParse({
        SLACK_DEFAULT_WEBHOOK_URL: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid Teams webhook URL', () => {
      const result = envSchema.safeParse({
        TEAMS_DEFAULT_WEBHOOK_URL: 'https://outlook.office.com/webhook/XXX',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid webhook URL', () => {
      const result = envSchema.safeParse({
        SLACK_DEFAULT_WEBHOOK_URL: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('S3 Configuration', () => {
    const envSchema = z.object({
      S3_ENDPOINT: z.string().url().optional(),
      S3_REGION: z.string().default('us-east-1'),
      S3_BUCKET: z.string().optional(),
      S3_ACCESS_KEY: z.string().optional(),
      S3_SECRET_KEY: z.string().optional(),
      S3_FORCE_PATH_STYLE: z.string().default('false'),
    });

    it('should default S3_REGION to us-east-1', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.S3_REGION).toBe('us-east-1');
      }
    });

    it('should default S3_FORCE_PATH_STYLE to false', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.S3_FORCE_PATH_STYLE).toBe('false');
      }
    });

    it('should accept valid S3 endpoint URL', () => {
      const result = envSchema.safeParse({
        S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
      });
      expect(result.success).toBe(true);
    });

    it('should accept MinIO endpoint URL', () => {
      const result = envSchema.safeParse({
        S3_ENDPOINT: 'http://localhost:9000',
      });
      expect(result.success).toBe(true);
    });

    it('should allow complete S3 configuration', () => {
      const result = envSchema.safeParse({
        S3_ENDPOINT: 'http://minio:9000',
        S3_REGION: 'us-west-2',
        S3_BUCKET: 'firelater-uploads',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
        S3_FORCE_PATH_STYLE: 'true',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.S3_BUCKET).toBe('firelater-uploads');
        expect(result.data.S3_FORCE_PATH_STYLE).toBe('true');
      }
    });
  });

  describe('CORS Configuration', () => {
    const envSchema = z.object({
      CORS_ORIGIN: z.string().default('http://localhost:3000'),
    });

    it('should default CORS_ORIGIN to localhost:3000', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGIN).toBe('http://localhost:3000');
      }
    });

    it('should accept custom CORS_ORIGIN', () => {
      const result = envSchema.safeParse({
        CORS_ORIGIN: 'https://app.firelater.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.CORS_ORIGIN).toBe('https://app.firelater.com');
      }
    });

    it('should accept multiple origins as comma-separated string', () => {
      const result = envSchema.safeParse({
        CORS_ORIGIN: 'http://localhost:3000,https://app.firelater.com',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Config Object Structure', () => {
    it('should transform port to number', () => {
      const parsed = { PORT: '3001' };
      const config = {
        port: parseInt(parsed.PORT, 10),
      };
      expect(config.port).toBe(3001);
      expect(typeof config.port).toBe('number');
    });

    it('should transform S3_FORCE_PATH_STYLE to boolean', () => {
      const testCases = [
        { input: 'true', expected: true },
        { input: 'false', expected: false },
        { input: 'TRUE', expected: false }, // strict comparison
      ];

      for (const { input, expected } of testCases) {
        const result = input === 'true';
        expect(result).toBe(expected);
      }
    });

    it('should set isDev flag correctly', () => {
      const envs = [
        { NODE_ENV: 'development', isDev: true, isProd: false },
        { NODE_ENV: 'production', isDev: false, isProd: true },
        { NODE_ENV: 'test', isDev: false, isProd: false },
      ];

      for (const env of envs) {
        const config = {
          isDev: env.NODE_ENV === 'development',
          isProd: env.NODE_ENV === 'production',
        };
        expect(config.isDev).toBe(env.isDev);
        expect(config.isProd).toBe(env.isProd);
      }
    });
  });
});
