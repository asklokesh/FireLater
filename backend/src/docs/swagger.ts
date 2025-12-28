import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config/index.js';

// ============================================
// SWAGGER/OPENAPI CONFIGURATION
// ============================================

export async function setupSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'FireLater API',
        description: `
## Overview

FireLater is a modern, open-source IT Service Management (ITSM) platform designed as an alternative to ServiceNow.

## Features

- **Issue Management**: Create, track, and resolve IT issues
- **Change Management**: Plan and execute changes with approval workflows
- **Service Catalog**: Self-service portal for common requests
- **Application Portfolio**: Track and manage IT applications
- **On-Call Management**: Schedule and manage on-call rotations
- **Reporting**: Generate reports and dashboards
- **Cloud Integrations**: Connect with AWS, Azure, GCP
- **Notifications**: Email and Slack notifications

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <access_token>
\`\`\`

## Rate Limiting

API requests are limited to 100 requests per minute per user.

## Pagination

List endpoints support pagination with \`page\` and \`limit\` query parameters.
        `,
        version: '1.0.0',
        contact: {
          name: 'FireLater Support',
          email: 'support@firelater.io',
          url: 'https://firelater.io',
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      },
      externalDocs: {
        url: 'https://docs.firelater.io',
        description: 'Full documentation',
      },
      servers: [
        {
          url: config.isDev ? `http://localhost:${config.port}` : 'https://api.firelater.io',
          description: config.isDev ? 'Development server' : 'Production server',
        },
      ],
      tags: [
        { name: 'Auth', description: 'Authentication and authorization' },
        { name: 'Users', description: 'User management' },
        { name: 'Groups', description: 'Group management' },
        { name: 'Roles', description: 'Role and permission management' },
        { name: 'Issues', description: 'Issue/Incident management' },
        { name: 'Changes', description: 'Change management' },
        { name: 'Catalog', description: 'Service catalog and requests' },
        { name: 'Applications', description: 'Application portfolio management' },
        { name: 'Health', description: 'Application health monitoring' },
        { name: 'Cloud', description: 'Cloud integrations' },
        { name: 'On-Call', description: 'On-call schedule management' },
        { name: 'Notifications', description: 'User notifications' },
        { name: 'Reports', description: 'Reporting and analytics' },
        { name: 'Attachments', description: 'File attachments' },
        { name: 'Audit', description: 'Audit logging' },
        { name: 'Jobs', description: 'Background job management' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT token obtained from /v1/auth/login',
          },
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'access_token',
            description: 'JWT token stored in httpOnly cookie',
          },
        },
      },
      security: [
        { bearerAuth: [] },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
      tryItOutEnabled: config.isDev,
    },
    uiHooks: {
      onRequest: function (request, reply, next) {
        next();
      },
      preHandler: function (request, reply, next) {
        next();
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, _request, _reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });
}

// Route documentation helpers for adding to route options
export const routeDocs = {
  auth: {
    login: {
      tags: ['Auth'],
      summary: 'Login with email and password',
      description: 'Authenticate user and receive JWT tokens',
      security: [],
    },
    register: {
      tags: ['Auth'],
      summary: 'Register a new user',
      description: 'Create a new user account',
      security: [],
    },
    refresh: {
      tags: ['Auth'],
      summary: 'Refresh access token',
      description: 'Exchange refresh token for new access token',
      security: [],
    },
    logout: {
      tags: ['Auth'],
      summary: 'Logout user',
      description: 'Invalidate refresh token',
    },
    me: {
      tags: ['Auth'],
      summary: 'Get current user',
      description: 'Get authenticated user profile',
    },
  },
  users: {
    list: {
      tags: ['Users'],
      summary: 'List users',
      description: 'Get paginated list of users',
    },
    get: {
      tags: ['Users'],
      summary: 'Get user by ID',
      description: 'Get detailed user information',
    },
    create: {
      tags: ['Users'],
      summary: 'Create user',
      description: 'Create a new user',
    },
    update: {
      tags: ['Users'],
      summary: 'Update user',
      description: 'Update user information',
    },
    delete: {
      tags: ['Users'],
      summary: 'Delete user',
      description: 'Soft delete a user',
    },
  },
  issues: {
    list: {
      tags: ['Issues'],
      summary: 'List issues',
      description: 'Get paginated list of issues with optional filters',
    },
    get: {
      tags: ['Issues'],
      summary: 'Get issue by ID',
      description: 'Get detailed issue information including comments and work notes',
    },
    create: {
      tags: ['Issues'],
      summary: 'Create issue',
      description: 'Create a new issue/incident',
    },
    update: {
      tags: ['Issues'],
      summary: 'Update issue',
      description: 'Update issue information or state',
    },
    addComment: {
      tags: ['Issues'],
      summary: 'Add comment',
      description: 'Add a comment or work note to an issue',
    },
  },
  changes: {
    list: {
      tags: ['Changes'],
      summary: 'List changes',
      description: 'Get paginated list of change requests',
    },
    get: {
      tags: ['Changes'],
      summary: 'Get change by ID',
      description: 'Get detailed change request information',
    },
    create: {
      tags: ['Changes'],
      summary: 'Create change',
      description: 'Create a new change request',
    },
    update: {
      tags: ['Changes'],
      summary: 'Update change',
      description: 'Update change request information',
    },
    submit: {
      tags: ['Changes'],
      summary: 'Submit for approval',
      description: 'Submit change request for approval',
    },
    approve: {
      tags: ['Changes'],
      summary: 'Approve change',
      description: 'Approve a pending change request',
    },
    reject: {
      tags: ['Changes'],
      summary: 'Reject change',
      description: 'Reject a pending change request',
    },
  },
  catalog: {
    list: {
      tags: ['Catalog'],
      summary: 'List catalog items',
      description: 'Get available service catalog items',
    },
    get: {
      tags: ['Catalog'],
      summary: 'Get catalog item',
      description: 'Get catalog item details and form schema',
    },
    submitRequest: {
      tags: ['Catalog'],
      summary: 'Submit request',
      description: 'Submit a service request',
    },
    listRequests: {
      tags: ['Catalog'],
      summary: 'List requests',
      description: 'Get user\'s service requests',
    },
  },
  applications: {
    list: {
      tags: ['Applications'],
      summary: 'List applications',
      description: 'Get application portfolio',
    },
    get: {
      tags: ['Applications'],
      summary: 'Get application',
      description: 'Get application details',
    },
    create: {
      tags: ['Applications'],
      summary: 'Create application',
      description: 'Register a new application',
    },
    update: {
      tags: ['Applications'],
      summary: 'Update application',
      description: 'Update application information',
    },
  },
  attachments: {
    getUploadUrl: {
      tags: ['Attachments'],
      summary: 'Get upload URL',
      description: 'Get presigned URL for direct S3 upload',
    },
    confirmUpload: {
      tags: ['Attachments'],
      summary: 'Confirm upload',
      description: 'Confirm successful upload and create attachment record',
    },
    list: {
      tags: ['Attachments'],
      summary: 'List attachments',
      description: 'List attachments for an entity',
    },
    download: {
      tags: ['Attachments'],
      summary: 'Download attachment',
      description: 'Get attachment download URL or content',
    },
    delete: {
      tags: ['Attachments'],
      summary: 'Delete attachment',
      description: 'Soft delete an attachment',
    },
  },
  audit: {
    list: {
      tags: ['Audit'],
      summary: 'Query audit logs',
      description: 'Search and filter audit logs',
    },
    entityHistory: {
      tags: ['Audit'],
      summary: 'Entity history',
      description: 'Get change history for a specific entity',
    },
    userActivity: {
      tags: ['Audit'],
      summary: 'User activity',
      description: 'Get activity log for a specific user',
    },
    security: {
      tags: ['Audit'],
      summary: 'Security events',
      description: 'Get security-related events',
    },
  },
  notifications: {
    list: {
      tags: ['Notifications'],
      summary: 'List notifications',
      description: 'Get user notifications',
    },
    markRead: {
      tags: ['Notifications'],
      summary: 'Mark as read',
      description: 'Mark notification as read',
    },
    markAllRead: {
      tags: ['Notifications'],
      summary: 'Mark all as read',
      description: 'Mark all notifications as read',
    },
  },
  reports: {
    list: {
      tags: ['Reports'],
      summary: 'List report templates',
      description: 'Get available report templates',
    },
    execute: {
      tags: ['Reports'],
      summary: 'Execute report',
      description: 'Run a report and get results',
    },
    schedule: {
      tags: ['Reports'],
      summary: 'Schedule report',
      description: 'Schedule recurring report execution',
    },
  },
  health: {
    list: {
      tags: ['Health'],
      summary: 'List health checks',
      description: 'Get health check configurations',
    },
    status: {
      tags: ['Health'],
      summary: 'Get health status',
      description: 'Get current health status for all checks',
    },
  },
  cloud: {
    listAccounts: {
      tags: ['Cloud'],
      summary: 'List cloud accounts',
      description: 'Get connected cloud accounts',
    },
    syncAccount: {
      tags: ['Cloud'],
      summary: 'Sync cloud account',
      description: 'Trigger sync for a cloud account',
    },
    listResources: {
      tags: ['Cloud'],
      summary: 'List cloud resources',
      description: 'Get discovered cloud resources',
    },
  },
  oncall: {
    listSchedules: {
      tags: ['On-Call'],
      summary: 'List schedules',
      description: 'Get on-call schedules',
    },
    getCurrentOncall: {
      tags: ['On-Call'],
      summary: 'Get current on-call',
      description: 'Get currently on-call users',
    },
    createOverride: {
      tags: ['On-Call'],
      summary: 'Create override',
      description: 'Create schedule override',
    },
  },
  jobs: {
    listQueues: {
      tags: ['Jobs'],
      summary: 'List queues',
      description: 'Get background job queues status',
    },
    pauseQueue: {
      tags: ['Jobs'],
      summary: 'Pause queue',
      description: 'Pause a job queue',
    },
    resumeQueue: {
      tags: ['Jobs'],
      summary: 'Resume queue',
      description: 'Resume a paused queue',
    },
  },
};
