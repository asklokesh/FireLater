import { FastifyInstance } from 'fastify';
import { redisClient } from '../config/redis';
import pRetry from 'p-retry';
import CircuitBreaker from 'opossum';

// Create circuit breaker for Redis operations
const redisCircuitBreaker = new CircuitBreaker(
  async (key: string, data: any) => {
    return await redisClient.setex(key, 3600, JSON.stringify(data));
  },
  {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
  }
);

// Add fallback for circuit breaker
redisCircuitBreaker.fallback(() => {
  console.warn('Redis circuit breaker is open. Using fallback.');
  return Promise.resolve(null);
});

export async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get('/notifications', async (request, reply) => {
    const userId = (request.user as any).id;
    const cacheKey = `notifications:${userId}`;

    try {
      // Try to get from cache first
      const cached = await redisClient.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Fetch from database if not in cache
      const notifications = await fastify.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      // Cache the result with retry logic and circuit breaker
      await pRetry(
        async () => {
          await redisCircuitBreaker.fire(cacheKey, notifications);
        },
        {
          retries: 3,
          minTimeout: 1000,
          onFailedAttempt: (error) => {
            console.warn(
              `Redis cache attempt ${error.attemptNumber} failed. Retries left: ${error.retriesLeft}`
            );
          },
        }
      ).catch((error) => {
        console.error('Failed to cache notifications:', error);
        // Continue without caching if Redis fails
      });

      return notifications;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      reply.code(500).send({ error: 'Failed to fetch notifications' });
    }
  });
}