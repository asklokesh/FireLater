import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Mock config
vi.mock('../../../src/config/index.js', () => ({
  config: {
    isDev: true,
    port: 3000,
  },
}));

import { setupSwagger, routeDocs } from '../../../src/docs/swagger.js';
import { config } from '../../../src/config/index.js';

describe('Swagger Configuration', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('setupSwagger', () => {
    it('should register swagger plugin successfully', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      expect(app.hasPlugin('@fastify/swagger')).toBe(true);
    });

    it('should register swagger-ui plugin successfully', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      expect(app.hasPlugin('@fastify/swagger-ui')).toBe(true);
    });

    it('should expose swagger endpoint', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      // Swagger should expose /docs route
      const response = await app.inject({
        method: 'GET',
        url: '/docs',
      });

      // Should redirect or return HTML
      expect([200, 302, 301]).toContain(response.statusCode);
    });

    it('should expose swagger JSON endpoint', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.openapi).toBe('3.0.3');
    });

    it('should include correct API info', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);
      expect(body.info.title).toBe('FireLater API');
      expect(body.info.version).toBe('1.0.0');
      expect(body.info.contact.email).toBe('support@firelater.io');
      expect(body.info.license.name).toBe('MIT');
    });

    it('should include all API tags', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);
      const tagNames = body.tags.map((t: { name: string }) => t.name);

      expect(tagNames).toContain('Auth');
      expect(tagNames).toContain('Users');
      expect(tagNames).toContain('Groups');
      expect(tagNames).toContain('Roles');
      expect(tagNames).toContain('Issues');
      expect(tagNames).toContain('Changes');
      expect(tagNames).toContain('Catalog');
      expect(tagNames).toContain('Applications');
      expect(tagNames).toContain('Health');
      expect(tagNames).toContain('Cloud');
      expect(tagNames).toContain('On-Call');
      expect(tagNames).toContain('Notifications');
      expect(tagNames).toContain('Reports');
      expect(tagNames).toContain('Attachments');
      expect(tagNames).toContain('Audit');
      expect(tagNames).toContain('Jobs');
    });

    it('should include security schemes', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);

      expect(body.components.securitySchemes.bearerAuth).toBeDefined();
      expect(body.components.securitySchemes.bearerAuth.type).toBe('http');
      expect(body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
      expect(body.components.securitySchemes.bearerAuth.bearerFormat).toBe('JWT');

      expect(body.components.securitySchemes.cookieAuth).toBeDefined();
      expect(body.components.securitySchemes.cookieAuth.type).toBe('apiKey');
      expect(body.components.securitySchemes.cookieAuth.in).toBe('cookie');
      expect(body.components.securitySchemes.cookieAuth.name).toBe('access_token');
    });

    it('should configure development server URL', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);

      expect(body.servers).toHaveLength(1);
      expect(body.servers[0].url).toBe('http://localhost:3000');
      expect(body.servers[0].description).toBe('Development server');
    });

    it('should include external documentation link', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);

      expect(body.externalDocs.url).toBe('https://docs.firelater.io');
      expect(body.externalDocs.description).toBe('Full documentation');
    });

    it('should set default security requirement', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);

      expect(body.security).toEqual([{ bearerAuth: [] }]);
    });

    it('should expose swagger YAML endpoint', async () => {
      app = Fastify({ logger: false });

      await setupSwagger(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/yaml',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('openapi: 3.0.3');
    });
  });

  describe('routeDocs', () => {
    describe('auth routes', () => {
      it('should have login documentation', () => {
        expect(routeDocs.auth.login.tags).toContain('Auth');
        expect(routeDocs.auth.login.summary).toBe('Login with email and password');
        expect(routeDocs.auth.login.security).toEqual([]);
      });

      it('should have register documentation', () => {
        expect(routeDocs.auth.register.tags).toContain('Auth');
        expect(routeDocs.auth.register.summary).toBe('Register a new user');
        expect(routeDocs.auth.register.security).toEqual([]);
      });

      it('should have refresh documentation', () => {
        expect(routeDocs.auth.refresh.tags).toContain('Auth');
        expect(routeDocs.auth.refresh.summary).toBe('Refresh access token');
        expect(routeDocs.auth.refresh.security).toEqual([]);
      });

      it('should have logout documentation', () => {
        expect(routeDocs.auth.logout.tags).toContain('Auth');
        expect(routeDocs.auth.logout.summary).toBe('Logout user');
      });

      it('should have me documentation', () => {
        expect(routeDocs.auth.me.tags).toContain('Auth');
        expect(routeDocs.auth.me.summary).toBe('Get current user');
      });
    });

    describe('users routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.users.list.tags).toContain('Users');
        expect(routeDocs.users.list.summary).toBe('List users');
      });

      it('should have get documentation', () => {
        expect(routeDocs.users.get.tags).toContain('Users');
        expect(routeDocs.users.get.summary).toBe('Get user by ID');
      });

      it('should have create documentation', () => {
        expect(routeDocs.users.create.tags).toContain('Users');
        expect(routeDocs.users.create.summary).toBe('Create user');
      });

      it('should have update documentation', () => {
        expect(routeDocs.users.update.tags).toContain('Users');
        expect(routeDocs.users.update.summary).toBe('Update user');
      });

      it('should have delete documentation', () => {
        expect(routeDocs.users.delete.tags).toContain('Users');
        expect(routeDocs.users.delete.summary).toBe('Delete user');
      });
    });

    describe('issues routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.issues.list.tags).toContain('Issues');
        expect(routeDocs.issues.list.summary).toBe('List issues');
      });

      it('should have get documentation', () => {
        expect(routeDocs.issues.get.tags).toContain('Issues');
        expect(routeDocs.issues.get.summary).toBe('Get issue by ID');
      });

      it('should have create documentation', () => {
        expect(routeDocs.issues.create.tags).toContain('Issues');
        expect(routeDocs.issues.create.summary).toBe('Create issue');
      });

      it('should have update documentation', () => {
        expect(routeDocs.issues.update.tags).toContain('Issues');
        expect(routeDocs.issues.update.summary).toBe('Update issue');
      });

      it('should have addComment documentation', () => {
        expect(routeDocs.issues.addComment.tags).toContain('Issues');
        expect(routeDocs.issues.addComment.summary).toBe('Add comment');
      });
    });

    describe('changes routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.changes.list.tags).toContain('Changes');
        expect(routeDocs.changes.list.summary).toBe('List changes');
      });

      it('should have get documentation', () => {
        expect(routeDocs.changes.get.tags).toContain('Changes');
        expect(routeDocs.changes.get.summary).toBe('Get change by ID');
      });

      it('should have create documentation', () => {
        expect(routeDocs.changes.create.tags).toContain('Changes');
        expect(routeDocs.changes.create.summary).toBe('Create change');
      });

      it('should have update documentation', () => {
        expect(routeDocs.changes.update.tags).toContain('Changes');
        expect(routeDocs.changes.update.summary).toBe('Update change');
      });

      it('should have submit documentation', () => {
        expect(routeDocs.changes.submit.tags).toContain('Changes');
        expect(routeDocs.changes.submit.summary).toBe('Submit for approval');
      });

      it('should have approve documentation', () => {
        expect(routeDocs.changes.approve.tags).toContain('Changes');
        expect(routeDocs.changes.approve.summary).toBe('Approve change');
      });

      it('should have reject documentation', () => {
        expect(routeDocs.changes.reject.tags).toContain('Changes');
        expect(routeDocs.changes.reject.summary).toBe('Reject change');
      });
    });

    describe('catalog routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.catalog.list.tags).toContain('Catalog');
        expect(routeDocs.catalog.list.summary).toBe('List catalog items');
      });

      it('should have get documentation', () => {
        expect(routeDocs.catalog.get.tags).toContain('Catalog');
        expect(routeDocs.catalog.get.summary).toBe('Get catalog item');
      });

      it('should have submitRequest documentation', () => {
        expect(routeDocs.catalog.submitRequest.tags).toContain('Catalog');
        expect(routeDocs.catalog.submitRequest.summary).toBe('Submit request');
      });

      it('should have listRequests documentation', () => {
        expect(routeDocs.catalog.listRequests.tags).toContain('Catalog');
        expect(routeDocs.catalog.listRequests.summary).toBe('List requests');
      });
    });

    describe('applications routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.applications.list.tags).toContain('Applications');
        expect(routeDocs.applications.list.summary).toBe('List applications');
      });

      it('should have get documentation', () => {
        expect(routeDocs.applications.get.tags).toContain('Applications');
        expect(routeDocs.applications.get.summary).toBe('Get application');
      });

      it('should have create documentation', () => {
        expect(routeDocs.applications.create.tags).toContain('Applications');
        expect(routeDocs.applications.create.summary).toBe('Create application');
      });

      it('should have update documentation', () => {
        expect(routeDocs.applications.update.tags).toContain('Applications');
        expect(routeDocs.applications.update.summary).toBe('Update application');
      });
    });

    describe('attachments routes', () => {
      it('should have getUploadUrl documentation', () => {
        expect(routeDocs.attachments.getUploadUrl.tags).toContain('Attachments');
        expect(routeDocs.attachments.getUploadUrl.summary).toBe('Get upload URL');
      });

      it('should have confirmUpload documentation', () => {
        expect(routeDocs.attachments.confirmUpload.tags).toContain('Attachments');
        expect(routeDocs.attachments.confirmUpload.summary).toBe('Confirm upload');
      });

      it('should have list documentation', () => {
        expect(routeDocs.attachments.list.tags).toContain('Attachments');
        expect(routeDocs.attachments.list.summary).toBe('List attachments');
      });

      it('should have download documentation', () => {
        expect(routeDocs.attachments.download.tags).toContain('Attachments');
        expect(routeDocs.attachments.download.summary).toBe('Download attachment');
      });

      it('should have delete documentation', () => {
        expect(routeDocs.attachments.delete.tags).toContain('Attachments');
        expect(routeDocs.attachments.delete.summary).toBe('Delete attachment');
      });
    });

    describe('audit routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.audit.list.tags).toContain('Audit');
        expect(routeDocs.audit.list.summary).toBe('Query audit logs');
      });

      it('should have entityHistory documentation', () => {
        expect(routeDocs.audit.entityHistory.tags).toContain('Audit');
        expect(routeDocs.audit.entityHistory.summary).toBe('Entity history');
      });

      it('should have userActivity documentation', () => {
        expect(routeDocs.audit.userActivity.tags).toContain('Audit');
        expect(routeDocs.audit.userActivity.summary).toBe('User activity');
      });

      it('should have security documentation', () => {
        expect(routeDocs.audit.security.tags).toContain('Audit');
        expect(routeDocs.audit.security.summary).toBe('Security events');
      });
    });

    describe('notifications routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.notifications.list.tags).toContain('Notifications');
        expect(routeDocs.notifications.list.summary).toBe('List notifications');
      });

      it('should have markRead documentation', () => {
        expect(routeDocs.notifications.markRead.tags).toContain('Notifications');
        expect(routeDocs.notifications.markRead.summary).toBe('Mark as read');
      });

      it('should have markAllRead documentation', () => {
        expect(routeDocs.notifications.markAllRead.tags).toContain('Notifications');
        expect(routeDocs.notifications.markAllRead.summary).toBe('Mark all as read');
      });
    });

    describe('reports routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.reports.list.tags).toContain('Reports');
        expect(routeDocs.reports.list.summary).toBe('List report templates');
      });

      it('should have execute documentation', () => {
        expect(routeDocs.reports.execute.tags).toContain('Reports');
        expect(routeDocs.reports.execute.summary).toBe('Execute report');
      });

      it('should have schedule documentation', () => {
        expect(routeDocs.reports.schedule.tags).toContain('Reports');
        expect(routeDocs.reports.schedule.summary).toBe('Schedule report');
      });
    });

    describe('health routes', () => {
      it('should have list documentation', () => {
        expect(routeDocs.health.list.tags).toContain('Health');
        expect(routeDocs.health.list.summary).toBe('List health checks');
      });

      it('should have status documentation', () => {
        expect(routeDocs.health.status.tags).toContain('Health');
        expect(routeDocs.health.status.summary).toBe('Get health status');
      });
    });

    describe('cloud routes', () => {
      it('should have listAccounts documentation', () => {
        expect(routeDocs.cloud.listAccounts.tags).toContain('Cloud');
        expect(routeDocs.cloud.listAccounts.summary).toBe('List cloud accounts');
      });

      it('should have syncAccount documentation', () => {
        expect(routeDocs.cloud.syncAccount.tags).toContain('Cloud');
        expect(routeDocs.cloud.syncAccount.summary).toBe('Sync cloud account');
      });

      it('should have listResources documentation', () => {
        expect(routeDocs.cloud.listResources.tags).toContain('Cloud');
        expect(routeDocs.cloud.listResources.summary).toBe('List cloud resources');
      });
    });

    describe('oncall routes', () => {
      it('should have listSchedules documentation', () => {
        expect(routeDocs.oncall.listSchedules.tags).toContain('On-Call');
        expect(routeDocs.oncall.listSchedules.summary).toBe('List schedules');
      });

      it('should have getCurrentOncall documentation', () => {
        expect(routeDocs.oncall.getCurrentOncall.tags).toContain('On-Call');
        expect(routeDocs.oncall.getCurrentOncall.summary).toBe('Get current on-call');
      });

      it('should have createOverride documentation', () => {
        expect(routeDocs.oncall.createOverride.tags).toContain('On-Call');
        expect(routeDocs.oncall.createOverride.summary).toBe('Create override');
      });
    });

    describe('jobs routes', () => {
      it('should have listQueues documentation', () => {
        expect(routeDocs.jobs.listQueues.tags).toContain('Jobs');
        expect(routeDocs.jobs.listQueues.summary).toBe('List queues');
      });

      it('should have pauseQueue documentation', () => {
        expect(routeDocs.jobs.pauseQueue.tags).toContain('Jobs');
        expect(routeDocs.jobs.pauseQueue.summary).toBe('Pause queue');
      });

      it('should have resumeQueue documentation', () => {
        expect(routeDocs.jobs.resumeQueue.tags).toContain('Jobs');
        expect(routeDocs.jobs.resumeQueue.summary).toBe('Resume queue');
      });
    });

    describe('routeDocs structure', () => {
      it('should have all required route categories', () => {
        expect(routeDocs.auth).toBeDefined();
        expect(routeDocs.users).toBeDefined();
        expect(routeDocs.issues).toBeDefined();
        expect(routeDocs.changes).toBeDefined();
        expect(routeDocs.catalog).toBeDefined();
        expect(routeDocs.applications).toBeDefined();
        expect(routeDocs.attachments).toBeDefined();
        expect(routeDocs.audit).toBeDefined();
        expect(routeDocs.notifications).toBeDefined();
        expect(routeDocs.reports).toBeDefined();
        expect(routeDocs.health).toBeDefined();
        expect(routeDocs.cloud).toBeDefined();
        expect(routeDocs.oncall).toBeDefined();
        expect(routeDocs.jobs).toBeDefined();
      });

      it('should have tags as arrays for all route docs', () => {
        const validateTags = (obj: any, path: string = '') => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
              if ('tags' in value) {
                expect(Array.isArray((value as any).tags)).toBe(true);
              } else {
                validateTags(value, `${path}.${key}`);
              }
            }
          }
        };

        validateTags(routeDocs);
      });

      it('should have summary for all route docs', () => {
        const validateSummary = (obj: any, path: string = '') => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
              if ('summary' in value) {
                expect(typeof (value as any).summary).toBe('string');
                expect((value as any).summary.length).toBeGreaterThan(0);
              } else {
                validateSummary(value, `${path}.${key}`);
              }
            }
          }
        };

        validateSummary(routeDocs);
      });

      it('should have description for all route docs', () => {
        const validateDescription = (obj: any, path: string = '') => {
          for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'object' && value !== null) {
              if ('description' in value) {
                expect(typeof (value as any).description).toBe('string');
                expect((value as any).description.length).toBeGreaterThan(0);
              } else {
                validateDescription(value, `${path}.${key}`);
              }
            }
          }
        };

        validateDescription(routeDocs);
      });
    });
  });

  describe('production configuration', () => {
    it('should configure production server URL when not in dev mode', async () => {
      // Temporarily change isDev
      const originalIsDev = config.isDev;
      (config as any).isDev = false;

      vi.resetModules();

      // Re-import with updated config
      const { setupSwagger: setupSwaggerProd } = await import('../../../src/docs/swagger.js');

      app = Fastify({ logger: false });
      await setupSwaggerProd(app);
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/docs/json',
      });

      const body = JSON.parse(response.body);

      // Restore original value
      (config as any).isDev = originalIsDev;

      expect(body.servers[0].url).toBe('https://api.firelater.io');
      expect(body.servers[0].description).toBe('Production server');
    });
  });
});
