// Remove inline tenant validation logic and replace with:
import { validateTenantSchema } from '../middleware/tenantMiddleware';

fastify.get('/settings', {
  preHandler: [authMiddleware, tenantMiddleware],
  schema: {
    // ... existing schema
  }
}, async (request, reply) => {
  const { tenantSlug } = request;
  validateTenantSchema(tenantSlug); // Add this line
  // ... rest of handler
});