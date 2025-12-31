// Before: Duplicated tenant validation in preHandler
// After: Use shared tenant validation middleware
import { validateTenantAccess } from '../middleware/tenant-validation';

fastify.get('/knowledge', {
  preHandler: [fastify.authenticate, validateTenantAccess]
}, async (request, reply) => {
  // Route implementation
});