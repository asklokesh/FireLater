import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userService, tenantService } from '../services/index.js';
import { createJWT, createRefreshToken, verifyRefreshToken } from '../utils/auth.js';
import { sendEmail } from '../utils/email.js';
import { isValidUUID } from '../utils/errors.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantSlug: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).min(3).max(63).optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  tenantName: z.string().min(1),
  tenantSlug: z.string().regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/).min(3).max(63),
});

export default async function authRoutes(app: FastifyInstance) {
  // Login route with stricter rate limiting
  app.post('/login', {
    config: {
      rateLimit: {
        max: 5, // Only 5 attempts per minute
        timeWindow: 60000,
        keyGenerator: (req) => {
          const { tenantSlug } = req.body as { tenantSlug?: string };
          return `login_${tenantSlug || 'default'}_${req.ip}`;
        }
      }
    }
  }, async (request, reply) => {
    const { email, password, tenantSlug } = loginSchema.parse(request.body);
    
    // ... existing login logic
  });

  // Registration route with stricter rate limiting
  app.post('/register', {
    config: {
      rateLimit: {
        max: 3, // Only 3 registrations per hour
        timeWindow: 3600000,
        keyGenerator: (req) => {
          const { tenantSlug } = req.body as { tenantSlug: string };
          return `register_${tenantSlug}_${req.ip}`;
        }
      }
    }
  }, async (request, reply) => {
    const data = registerSchema.parse(request.body);
    
    // ... existing registration logic
  });

  // Password reset request with rate limiting
  app.post('/reset-password', {
    config: {
      rateLimit: {
        max: 3, // Only 3 reset requests per hour
        timeWindow: 3600000,
        keyGenerator: (req) => {
          const { email } = req.body as { email: string };
          return `reset_${email}_${req.ip}`;
        }
      }
    }
  }, async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    
    // ... existing password reset logic
  });
}