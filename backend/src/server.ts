import fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { connectDatabase } from './config/database.js';
import { redisClient } from './config/redis.js';
import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
// ... other route imports

const app = fastify({ logger: true });

// Register rate limiting plugin
await app.register(fastifyRateLimit, {
  global: true,
  max: 1000, // Default max requests per minute
  timeWindow: 60000, // 1 minute
  cache: 5000,
  redis: redisClient,
  allowList: ['127.0.0.1'], // Add any IPs that should be exempt
  skipOnError: false,
});

// Register other plugins
await app.register(fastifyCors, {
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL!] 
    : true,
});
await app.register(fastifyHelmet);

// Register routes
app.register(authRoutes, { prefix: '/api/auth' });
app.register(tenantRoutes, { prefix: '/api/tenants' });
// ... other route registrations

app.get('/health', async () => {
  return { status: 'ok' };
});

export default app;