import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { vendorRiskService } from '../services/vendor-risk.js';
import { requirePermission } from '../middleware/auth.js';

// ============================================
// SCHEMAS
// ============================================

const createVendorSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  website: z.string().url().max(500).optional(),
  riskTier: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  criticality: z.enum(['mission_critical', 'important', 'standard', 'non_critical']).optional(),
  contractReviewDate: z.string().date().optional(),
  assessmentReviewDate: z.string().date().optional(),
  primaryContactName: z.string().max(255).optional(),
  primaryContactEmail: z.string().email().max(255).optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(10000).optional(),
});

const updateVendorSchema = createVendorSchema.partial();

const linkApplicationSchema = z.object({
  applicationId: z.string().min(1).max(255),
  dependencyType: z.enum(['service', 'component', 'hosting', 'support', 'licensing']).optional(),
  notes: z.string().max(2000).optional(),
});

const createReviewSchema = z.object({
  reviewType: z.enum(['contract', 'security_assessment', 'due_diligence', 'annual_review']),
  dueDate: z.string().date(),
  reviewerId: z.string().max(255).optional(),
  reviewerEmail: z.string().email().max(255).optional(),
});

const updateReviewSchema = z.object({
  status: z.enum(['scheduled', 'in_progress', 'completed', 'overdue']).optional(),
  completedDate: z.string().date().optional(),
  findings: z.string().max(10000).optional(),
  riskScore: z.number().int().min(1).max(10).optional(),
});

// ============================================
// ROUTE REGISTRATION
// ============================================

export async function vendorRiskRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /vendors — list vendors with optional filters
  fastify.get('/vendors', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const query = request.query as { riskTier?: string; isActive?: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const filters: { riskTier?: string; isActive?: boolean } = {};

    if (query.riskTier) {
      filters.riskTier = query.riskTier;
    }

    if (query.isActive !== undefined) {
      filters.isActive = query.isActive === 'true';
    }

    const vendors = await vendorRiskService.listVendors(tenantSlug, filters);

    return reply.send({ vendors });
  });

  // POST /vendors — create vendor
  fastify.post('/vendors', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;
    const user = (request as unknown as { user: { id: string; email: string } }).user;

    const body = createVendorSchema.parse(request.body);

    const vendor = await vendorRiskService.createVendor(tenantSlug, {
      ...body,
      createdBy: user?.email ?? user?.id,
    });

    return reply.status(201).send({ vendor });
  });

  // GET /vendors/export — export full register (before :id route to avoid collision)
  fastify.get('/vendors/export', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const register = await vendorRiskService.exportRegister(tenantSlug);

    return reply.send({
      exportedAt: new Date().toISOString(),
      ...register,
    });
  });

  // GET /vendors/summary — risk summary
  fastify.get('/vendors/summary', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const summary = await vendorRiskService.getRiskSummary(tenantSlug);

    return reply.send({ summary });
  });

  // GET /vendors/:id — get vendor detail with linked apps
  fastify.get('/vendors/:id', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const [vendor, applications] = await Promise.all([
      vendorRiskService.getVendor(tenantSlug, id),
      vendorRiskService.getVendorApplications(tenantSlug, id),
    ]);

    return reply.send({ vendor: { ...vendor, applications } });
  });

  // PUT /vendors/:id — update vendor
  fastify.put('/vendors/:id', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const body = updateVendorSchema.parse(request.body);

    const vendor = await vendorRiskService.updateVendor(tenantSlug, id, body);

    return reply.send({ vendor });
  });

  // DELETE /vendors/:id — delete vendor
  fastify.delete('/vendors/:id', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    await vendorRiskService.deleteVendor(tenantSlug, id);

    return reply.status(204).send();
  });

  // POST /vendors/:id/applications — link application to vendor
  fastify.post('/vendors/:id/applications', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const body = linkApplicationSchema.parse(request.body);

    await vendorRiskService.linkApplication(
      tenantSlug,
      id,
      body.applicationId,
      body.dependencyType ?? 'service',
      body.notes
    );

    return reply.status(201).send({ message: 'Application linked to vendor' });
  });

  // DELETE /vendors/:id/applications/:appId — unlink application
  fastify.delete('/vendors/:id/applications/:appId', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { id, appId } = request.params as { id: string; appId: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    await vendorRiskService.unlinkApplication(tenantSlug, id, appId);

    return reply.status(204).send();
  });

  // GET /vendors/:id/applications — list linked applications
  fastify.get('/vendors/:id/applications', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const applications = await vendorRiskService.getVendorApplications(tenantSlug, id);

    return reply.send({ applications });
  });

  // GET /applications/:appId/vendors — get vendors for an application (change impact)
  fastify.get('/applications/:appId/vendors', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const { appId } = request.params as { appId: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const impact = await vendorRiskService.getChangeImpactVendors(tenantSlug, appId);

    return reply.send({ changeImpact: impact });
  });

  // GET /vendors/:id/reviews — list reviews for vendor
  fastify.get('/vendors/:id/reviews', {
    preHandler: [requirePermission('admin:read')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const reviews = await vendorRiskService.listReviews(tenantSlug, id);

    return reply.send({ reviews });
  });

  // POST /vendors/:id/reviews — create review
  fastify.post('/vendors/:id/reviews', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const body = createReviewSchema.parse(request.body);

    const review = await vendorRiskService.createReview(tenantSlug, {
      vendorId: id,
      reviewType: body.reviewType,
      dueDate: body.dueDate,
      reviewerId: body.reviewerId,
      reviewerEmail: body.reviewerEmail,
    });

    return reply.status(201).send({ review });
  });

  // PUT /vendors/reviews/:reviewId — update review
  fastify.put('/vendors/reviews/:reviewId', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { reviewId } = request.params as { reviewId: string };
    const tenantSlug = (request as unknown as { tenant: { slug: string } }).tenant.slug;

    const body = updateReviewSchema.parse(request.body);

    const review = await vendorRiskService.updateReview(tenantSlug, reviewId, body);

    return reply.send({ review });
  });
}
