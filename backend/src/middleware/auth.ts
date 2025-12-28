import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { authService } from '../services/auth.js';
import { tenantService } from '../services/tenant.js';

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError('Invalid or expired token');
  }
}

export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);

    const { userId, tenantSlug } = request.user;

    // Check cache first
    let userPermissions = await authService.getCachedPermissions(userId, tenantSlug);

    if (!userPermissions) {
      const schema = tenantService.getSchemaName(tenantSlug);
      userPermissions = await authService.getUserPermissions(userId, schema);
      await authService.cacheUserPermissions(userId, tenantSlug, userPermissions);
    }

    // Admin has all permissions
    if (request.user.roles.includes('admin')) {
      return;
    }

    // Check if user has any of the required permissions
    const hasPermission = permissions.some((p) => userPermissions!.includes(p));

    if (!hasPermission) {
      throw new ForbiddenError('You do not have permission to perform this action');
    }
  };
}

export function requireRole(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply);

    const hasRole = roles.some((role) => request.user.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenError('You do not have the required role');
    }
  };
}

export async function optionalAuth(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    // Token not present or invalid, continue without user
  }
}
