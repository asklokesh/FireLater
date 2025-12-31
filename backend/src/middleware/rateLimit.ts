import { FastifyRequest } from 'fastify';

export const loginRateLimit = {
  max: 5,
  timeWindow: 60000,
  keyGenerator: (req: FastifyRequest) => {
    const { tenantSlug } = req.body as { tenantSlug?: string };
    return `login_${tenantSlug || 'default'}_${req.socket.remoteAddress}`;
  }
};

export const registerRateLimit = {
  max: 3,
  timeWindow: 3600000,
  keyGenerator: (req: FastifyRequest) => {
    const { tenantSlug } = req.body as { tenantSlug: string };
    return `register_${tenantSlug}_${req.socket.remoteAddress}`;
  }
};

export const resetPasswordRateLimit = {
  max: 3,
  timeWindow: 3600000,
  keyGenerator: (req: FastifyRequest) => {
    const { email } = req.body as { email: string };
    return `reset_${email}_${req.socket.remoteAddress}`;
  }
};