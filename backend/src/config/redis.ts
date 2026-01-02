import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    if (times > 3) {
      return null;
    }
    return Math.min(times * 200, 2000);
  },
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

// Export BullMQ-compatible connection configuration
export const redisConnection = {
  host: config.redis.url.includes('://')
    ? new URL(config.redis.url).hostname
    : config.redis.url.split(':')[0],
  port: config.redis.url.includes('://')
    ? parseInt(new URL(config.redis.url).port || '6379')
    : parseInt(config.redis.url.split(':')[1] || '6379'),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    if (times > 3) {
      logger.error({ times }, 'Redis connection retry limit exceeded');
      return null;
    }
    const delay = Math.min(times * 200, 2000);
    logger.warn({ times, delay }, 'Redis connection retrying');
    return delay;
  },
};

export async function testRedisConnection(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    logger.error({ err: error }, 'Redis connection failed');
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
