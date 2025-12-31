import { loginRateLimit, registerRateLimit, resetPasswordRateLimit } from '../middleware/rateLimit.js';

export default async function authRoutes(app: FastifyInstance) {
  // Login route with stricter rate limiting
  app.post('/login', {
    config: {
      rateLimit: loginRateLimit
    }
  }, async (request, reply) => {
    const { email, password, tenantSlug } = loginSchema.parse(request.body);
    
    // ... existing login logic
  });

  // Registration route with stricter rate limiting
  app.post('/register', {
    config: {
      rateLimit: registerRateLimit
    }
  }, async (request, reply) => {
    const data = registerSchema.parse(request.body);
    
    // ... existing registration logic
  });

  // Password reset request with rate limiting
  app.post('/reset-password', {
    config: {
      rateLimit: resetPasswordRateLimit
    }
  }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    
    // ... existing password reset logic
  });
}