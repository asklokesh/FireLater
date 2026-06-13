import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requirePermission } from '../middleware/auth.js';
import { dataSecurityService } from '../services/data-security.js';
import { maskingService } from '../lib/masking.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

const updateSettingsSchema = z.object({
  data_residency_region: z.string().max(50).optional(),
  encryption_key_id: z.string().max(255).nullable().optional(),
  pii_masking_enabled: z.boolean().optional(),
  pci_tokenization_enabled: z.boolean().optional(),
});

const addClassificationSchema = z.object({
  table_name: z.string().max(100),
  field_name: z.string().max(100),
  classification: z.enum(['PII', 'PCI', 'NPI', 'SENSITIVE']),
  masking_strategy: z.enum(['full', 'partial', 'tokenize', 'hash']),
  unmask_permission: z.string().max(100).optional(),
});

const unmaskSchema = z.object({
  table_name: z.string().max(100),
  field_name: z.string().max(100),
  entity_id: z.string().max(255),
  raw_value: z.string(),
  reason: z.string().max(1000).optional(),
});

export default async function dataSecurityRoutes(app: FastifyInstance) {
  /**
   * GET /data-security/settings
   * Returns the tenant's data security settings.
   */
  app.get('/settings', {
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const settings = await dataSecurityService.getSettings(tenantSlug);
    reply.send(settings);
  });

  /**
   * PUT /data-security/settings
   * Update data residency region, encryption key, masking flags.
   * Requires admin:write permission.
   */
  app.put('/settings', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = updateSettingsSchema.parse(request.body);

    const updated = await dataSecurityService.updateSettings(tenantSlug, body);
    reply.send(updated);
  });

  /**
   * GET /data-security/classifications
   * List all field classifications for the tenant.
   */
  app.get('/classifications', {
    preHandler: [requirePermission('settings:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const classifications = await dataSecurityService.listClassifications(tenantSlug);
    reply.send({ classifications });
  });

  /**
   * POST /data-security/classifications
   * Add or update a field classification (upserts on table_name + field_name).
   * Requires admin:write permission.
   */
  app.post('/classifications', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const body = addClassificationSchema.parse(request.body);

    const classification = await dataSecurityService.addClassification(tenantSlug, body);
    reply.code(201).send(classification);
  });

  /**
   * POST /data-security/unmask
   * Record an unmask audit event and return the unmasked value.
   * Requires admin:write permission.
   *
   * The caller submits the raw (plaintext) value so the service can:
   * 1. Verify the field is classified as sensitive.
   * 2. Log the unmask event.
   * 3. Return the raw value — the caller already has it but this creates the audit trail.
   */
  app.post('/unmask', {
    preHandler: [requirePermission('admin:write')],
  }, async (request, reply) => {
    const { tenantSlug, userId, email } = request.user;
    const body = unmaskSchema.parse(request.body);

    // Verify the field is classified
    const classifications = await dataSecurityService.listClassifications(tenantSlug);
    const match = classifications.find(
      (c) => c.table_name === body.table_name && c.field_name === body.field_name
    );

    if (!match) {
      // Fall back to default in-memory classifications
      const defaultClass = maskingService.getClassification(body.field_name);
      if (!defaultClass) {
        throw new NotFoundError(
          'FieldClassification',
          `${body.table_name}.${body.field_name}`
        );
      }
    }

    // Record unmask audit event
    await dataSecurityService.recordUnmaskEvent(tenantSlug, {
      actor_id: userId,
      actor_email: email,
      table_name: body.table_name,
      field_name: body.field_name,
      entity_id: body.entity_id,
      reason: body.reason,
    });

    logger.info(
      {
        tenantSlug,
        actor_id: userId,
        table_name: body.table_name,
        field_name: body.field_name,
        entity_id: body.entity_id,
      },
      'Field unmasked'
    );

    reply.send({
      table_name: body.table_name,
      field_name: body.field_name,
      entity_id: body.entity_id,
      value: body.raw_value,
    });
  });
}
