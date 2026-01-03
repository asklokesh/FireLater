import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import csrf from '@fastify/csrf-protection';
import { config } from './config/index.js';
import { testConnection, closeDatabase } from './config/database.js';
import { testRedisConnection, closeRedis, redis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { AppError } from './utils/errors.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import groupRoutes from './routes/groups.js';
import roleRoutes from './routes/roles.js';
import applicationRoutes from './routes/applications.js';
import issueRoutes from './routes/issues.js';
import catalogRoutes from './routes/catalog.js';
import requestRoutes from './routes/requests.js';
import notificationRoutes from './routes/notifications.js';
import oncallRoutes from './routes/oncall.js';
import changeRoutes from './routes/changes.js';
import healthRoutes from './routes/health.js';
import cloudRoutes from './routes/cloud.js';
import reportingRoutes from './routes/reporting.js';
import jobsRoutes from './routes/jobs.js';
import attachmentsRoutes from './routes/attachments.js';
import auditRoutes from './routes/audit.js';
import dashboardRoutes from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import problemRoutes from './routes/problems.js';
import knowledgeRoutes from './routes/knowledge.js';
import slaRoutes from './routes/sla.js';
import workflowRoutes from './routes/workflow.js';
import assetRoutes from './routes/assets.js';
import emailRoutes from './routes/email.js';
import integrationsRoutes from './routes/integrations.js';
import { initializeJobs, shutdownJobs } from './jobs/index.js';
import { setupSwagger } from './docs/swagger.js';

const app = Fastify({
  logger: {
    level: config.logging.level,
    transport: config.isDev
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  },
});

async function registerPlugins() {
  // Setup Swagger documentation
  await setupSwagger(app);

  await app.register(cors, {
    origin: config.isDev ? true : ['https://firelater.io'],
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: config.isProd,
  });

  await app.register(cookie, {
    secret: config.jwt.secret,
  });

  await app.register(csrf, {
    cookieOpts: {
      signed: true,
      httpOnly: true,
      sameSite: 'strict',
      secure: config.isProd,
    },
    sessionPlugin: '@fastify/cookie',
  });

  // CSRF protection hook for state-changing operations
  // Note: JWT bearer tokens already provide CSRF protection since browsers
  // cannot be forced to send custom Authorization headers cross-origin.
  // This adds defense-in-depth for any cookie-based flows.
  app.addHook('preHandler', async (request, reply) => {
    const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const isPublicRoute = request.url.startsWith('/health') ||
                          request.url.startsWith('/ready') ||
                          request.url === '/csrf-token' ||
                          request.url.startsWith('/v1/auth/login') ||
                          request.url.startsWith('/v1/auth/register') ||
                          request.url.startsWith('/v1/auth/refresh') ||
                          request.url.startsWith('/v1/auth/forgot-password') ||
                          request.url.startsWith('/v1/auth/reset-password');

    // Apply CSRF protection to state-changing operations on protected routes
    if (isStateChanging && !isPublicRoute) {
      // Check if using JWT bearer token (primary auth method)
      const authHeader = request.headers.authorization;
      const hasJWT = authHeader && authHeader.startsWith('Bearer ');

      // If using JWT, CSRF protection is inherent (browsers can't force custom headers)
      // If not using JWT (e.g., API key or cookie auth), require CSRF token
      if (!hasJWT && request.csrfProtection) {
        try {
          await request.csrfProtection();
        } catch (_error) {
          reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Invalid CSRF token',
          });
        }
      }
    }
  });

  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.accessExpiry,
    },
  });

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    redis,
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50 MB
    },
  });
}

async function registerRoutes() {
  // CSRF token endpoint - must be called before any state-changing operations
  app.get('/csrf-token', async (request, reply) => {
    const token = await reply.generateCsrf();
    return { csrfToken: token };
  });

  // Basic liveness check - just confirms the server is running
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Readiness check - confirms all dependencies are available
  app.get('/ready', async (request, reply) => {
    const dbOk = await testConnection();
    const redisOk = await testRedisConnection();

    const allHealthy = dbOk && redisOk;

    if (!allHealthy) {
      reply.status(503);
    }

    return {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        database: { status: dbOk ? 'healthy' : 'unhealthy' },
        redis: { status: redisOk ? 'healthy' : 'unhealthy' },
      },
    };
  });

  // Comprehensive health check with detailed status of all dependencies
  app.get('/health/detailed', async (request, reply) => {
    const startTime = Date.now();

    // Database check with latency
    let dbStatus = 'unhealthy';
    let dbLatency = 0;
    let dbVersion = '';
    try {
      const dbStart = Date.now();
      const dbOk = await testConnection();
      dbLatency = Date.now() - dbStart;
      if (dbOk) {
        dbStatus = 'healthy';
        // Get PostgreSQL version
        const { pool } = await import('./config/database.js');
        const versionResult = await pool.query('SELECT version()');
        dbVersion = versionResult.rows[0]?.version?.split(' ').slice(0, 2).join(' ') || 'unknown';
      }
    } catch {
      dbStatus = 'unhealthy';
    }

    // Redis check with latency
    let redisStatus = 'unhealthy';
    let redisLatency = 0;
    let redisInfo = '';
    try {
      const redisStart = Date.now();
      const redisOk = await testRedisConnection();
      redisLatency = Date.now() - redisStart;
      if (redisOk) {
        redisStatus = 'healthy';
        const { redis } = await import('./config/redis.js');
        const info = await redis.info('server');
        const versionMatch = info.match(/redis_version:(\S+)/);
        redisInfo = versionMatch ? `Redis ${versionMatch[1]}` : 'Redis';
      }
    } catch {
      redisStatus = 'unhealthy';
    }

    const allHealthy = dbStatus === 'healthy' && redisStatus === 'healthy';
    const totalLatency = Date.now() - startTime;

    if (!allHealthy) {
      reply.status(503);
    }

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.isDev ? 'development' : 'production',
      responseTime: `${totalLatency}ms`,
      checks: {
        database: {
          status: dbStatus,
          latency: `${dbLatency}ms`,
          version: dbVersion,
        },
        redis: {
          status: redisStatus,
          latency: `${redisLatency}ms`,
          version: redisInfo,
        },
      },
      memory: {
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      },
    };
  });

  // List all registered API routes
  app.get('/api/routes', async () => {
    // Manually define API endpoints since Fastify doesn't expose routes directly
    const apiEndpoints = {
      health: [
        { method: 'GET', path: '/health', description: 'Basic liveness check' },
        { method: 'GET', path: '/ready', description: 'Readiness check with dependencies' },
        { method: 'GET', path: '/health/detailed', description: 'Comprehensive health with latencies' },
        { method: 'GET', path: '/api/routes', description: 'List all API routes' },
      ],
      auth: [
        { method: 'POST', path: '/v1/auth/register', description: 'Register new user' },
        { method: 'POST', path: '/v1/auth/login', description: 'Login user' },
        { method: 'POST', path: '/v1/auth/logout', description: 'Logout user' },
        { method: 'POST', path: '/v1/auth/refresh', description: 'Refresh access token' },
        { method: 'GET', path: '/v1/auth/me', description: 'Get current user' },
      ],
      users: [
        { method: 'GET', path: '/v1/users', description: 'List users' },
        { method: 'GET', path: '/v1/users/:id', description: 'Get user by ID' },
        { method: 'PUT', path: '/v1/users/:id', description: 'Update user' },
        { method: 'DELETE', path: '/v1/users/:id', description: 'Delete user' },
      ],
      groups: [
        { method: 'GET', path: '/v1/groups', description: 'List groups' },
        { method: 'POST', path: '/v1/groups', description: 'Create group' },
        { method: 'GET', path: '/v1/groups/:id', description: 'Get group by ID' },
        { method: 'PUT', path: '/v1/groups/:id', description: 'Update group' },
        { method: 'DELETE', path: '/v1/groups/:id', description: 'Delete group' },
      ],
      applications: [
        { method: 'GET', path: '/v1/applications', description: 'List applications' },
        { method: 'POST', path: '/v1/applications', description: 'Create application' },
        { method: 'GET', path: '/v1/applications/:id', description: 'Get application by ID' },
        { method: 'PUT', path: '/v1/applications/:id', description: 'Update application' },
        { method: 'DELETE', path: '/v1/applications/:id', description: 'Delete application' },
        { method: 'GET', path: '/v1/applications/:id/health', description: 'Get application health' },
      ],
      issues: [
        { method: 'GET', path: '/v1/issues', description: 'List issues' },
        { method: 'POST', path: '/v1/issues', description: 'Create issue' },
        { method: 'GET', path: '/v1/issues/:id', description: 'Get issue by ID' },
        { method: 'PUT', path: '/v1/issues/:id', description: 'Update issue' },
        { method: 'DELETE', path: '/v1/issues/:id', description: 'Delete issue' },
        { method: 'POST', path: '/v1/issues/:id/comments', description: 'Add comment to issue' },
      ],
      changes: [
        { method: 'GET', path: '/v1/changes', description: 'List change requests' },
        { method: 'POST', path: '/v1/changes', description: 'Create change request' },
        { method: 'GET', path: '/v1/changes/:id', description: 'Get change request by ID' },
        { method: 'PUT', path: '/v1/changes/:id', description: 'Update change request' },
        { method: 'DELETE', path: '/v1/changes/:id', description: 'Delete change request' },
      ],
      catalog: [
        { method: 'GET', path: '/v1/catalog', description: 'List catalog items' },
        { method: 'POST', path: '/v1/catalog', description: 'Create catalog item' },
        { method: 'GET', path: '/v1/catalog/:id', description: 'Get catalog item by ID' },
        { method: 'PUT', path: '/v1/catalog/:id', description: 'Update catalog item' },
        { method: 'DELETE', path: '/v1/catalog/:id', description: 'Delete catalog item' },
      ],
      requests: [
        { method: 'GET', path: '/v1/requests', description: 'List service requests' },
        { method: 'POST', path: '/v1/requests', description: 'Create service request' },
        { method: 'GET', path: '/v1/requests/:id', description: 'Get service request by ID' },
        { method: 'PUT', path: '/v1/requests/:id', description: 'Update service request' },
      ],
      oncall: [
        { method: 'GET', path: '/v1/oncall/schedules', description: 'List on-call schedules' },
        { method: 'POST', path: '/v1/oncall/schedules', description: 'Create on-call schedule' },
        { method: 'GET', path: '/v1/oncall/schedules/:id', description: 'Get schedule by ID' },
        { method: 'PUT', path: '/v1/oncall/schedules/:id', description: 'Update schedule' },
      ],
      cloud: [
        { method: 'GET', path: '/v1/cloud/providers', description: 'List cloud providers' },
        { method: 'GET', path: '/v1/cloud/resources', description: 'List cloud resources' },
      ],
      reports: [
        { method: 'GET', path: '/v1/reports', description: 'List reports' },
        { method: 'POST', path: '/v1/reports/generate', description: 'Generate report' },
      ],
      dashboard: [
        { method: 'GET', path: '/v1/dashboard/stats', description: 'Get dashboard statistics' },
      ],
      notifications: [
        { method: 'GET', path: '/v1/notifications', description: 'List notifications' },
        { method: 'PUT', path: '/v1/notifications/:id/read', description: 'Mark notification as read' },
      ],
    };

    const totalRoutes = Object.values(apiEndpoints).flat().length;

    return {
      total: totalRoutes,
      documentation: '/documentation',
      endpoints: apiEndpoints,
    };
  });

  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(userRoutes, { prefix: '/v1/users' });
  await app.register(groupRoutes, { prefix: '/v1/groups' });
  await app.register(roleRoutes, { prefix: '/v1/roles' });
  await app.register(applicationRoutes, { prefix: '/v1/applications' });
  await app.register(issueRoutes, { prefix: '/v1/issues' });
  await app.register(catalogRoutes, { prefix: '/v1/catalog' });
  await app.register(requestRoutes, { prefix: '/v1/requests' });
  await app.register(notificationRoutes, { prefix: '/v1/notifications' });
  await app.register(oncallRoutes, { prefix: '/v1/oncall' });
  await app.register(changeRoutes, { prefix: '/v1/changes' });
  await app.register(healthRoutes, { prefix: '/v1/health' });
  await app.register(cloudRoutes, { prefix: '/v1/cloud' });
  await app.register(reportingRoutes, { prefix: '/v1/reports' });
  await app.register(jobsRoutes, { prefix: '/v1/jobs' });
  await app.register(attachmentsRoutes, { prefix: '/v1/attachments' });
  await app.register(auditRoutes, { prefix: '/v1/audit' });
  await app.register(dashboardRoutes, { prefix: '/v1/dashboard' });
  await app.register(settingsRoutes, { prefix: '/v1/settings' });
  await app.register(problemRoutes, { prefix: '/v1/problems' });
  await app.register(knowledgeRoutes, { prefix: '/v1/kb' });
  await app.register(slaRoutes, { prefix: '/v1/sla' });
  await app.register(workflowRoutes, { prefix: '/v1/workflows' });
  await app.register(assetRoutes, { prefix: '/v1/assets' });
  await app.register(emailRoutes, { prefix: '/v1/email' });
  await app.register(integrationsRoutes, { prefix: '/v1/integrations' });
}

function registerErrorHandler() {
  app.setErrorHandler((error, request, reply) => {
    logger.error({ err: error }, 'Request error');

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toJSON());
    }

    if (error instanceof Error && 'validation' in error) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: (error as { validation: unknown }).validation,
      });
    }

    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: config.isDev ? errorMessage : 'An unexpected error occurred',
    });
  });
}

async function start() {
  try {
    await registerPlugins();
    registerErrorHandler();
    await registerRoutes();

    logger.info('Testing database connection...');
    const dbOk = await testConnection();
    if (!dbOk) {
      throw new Error('Database connection failed');
    }
    logger.info('Database connected');

    logger.info('Testing Redis connection...');
    const redisOk = await testRedisConnection();
    if (!redisOk) {
      throw new Error('Redis connection failed');
    }
    logger.info('Redis connected');

    // Initialize background jobs
    logger.info('Initializing background jobs...');
    await initializeJobs();
    logger.info('Background jobs initialized');

    await app.listen({ port: config.port, host: config.host });
    logger.info(`Server listening on http://${config.host}:${config.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

async function shutdown() {
  logger.info('Shutting down...');
  await shutdownJobs();
  await app.close();
  await closeDatabase();
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
