import { loginRateLimit, registerRateLimit, resetPasswordRateLimit } from '../middleware/rateLimit.js';

export default async function authRoutes(app: FastifyInstance) {
  // Login route with stricter rate limiting
  app.post('/login', {
    config: {
      rateLimit: loginRateLimit
    }
  }, async (request, reply) => {
    const { email, password, tenantSlug } = loginSchema.parse(request.body);
    
    // Validate tenantSlug format to prevent injection
    if (!tenantSlug || typeof tenantSlug !== 'string' || !tenantSlug.match(/^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/)) {
      throw new BadRequestError('Invalid tenant identifier');
    }
    
    // ... existing login logic
  });