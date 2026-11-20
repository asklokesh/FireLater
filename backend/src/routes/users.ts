import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userService } from '../services/users.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { DEFAULT_LOCALE, RTL_LOCALES, SUPPORTED_LOCALES, isRtl, normalizeLocale, t, type Locale } from '../lib/i18n.js';
import { parsePagination, createPaginatedResponse } from '../utils/pagination.js';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(255),
  password: z.string().min(8).optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  phone: z.string().max(50).optional(),
  timezone: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive', 'pending']).optional(),
  avatarUrl: z.string().url().optional(),
  settings: z.record(z.unknown()).optional(),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});

const setLocaleSchema = z.object({
  // Accepts region tags such as "pt-BR" or "ar_SA"; stored as the base language.
  locale: z.string().min(2).max(10).refine((v) => normalizeLocale(v) !== null, 'Unsupported locale'),
});

const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

// Parameter validation schema
const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export default async function userRoutes(app: FastifyInstance) {
  const localeResponse = (locale: Locale) => ({
    locale,
    dir: isRtl(locale) ? 'rtl' : 'ltr',
    supported: SUPPORTED_LOCALES.map((code) => ({ code, name: t(code, 'language.name'), rtl: RTL_LOCALES.includes(code) })),
    default: DEFAULT_LOCALE,
  });

  // Current user's language preference (any authenticated user)
  app.get('/me/locale', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const saved = normalizeLocale(await userService.getLocale(tenantSlug, userId));
    reply.send(localeResponse(saved ?? request.locale ?? DEFAULT_LOCALE));
  });

  // Update current user's language preference
  app.put('/me/locale', { preHandler: [authenticate] }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = setLocaleSchema.parse(request.body);
    const locale = normalizeLocale(body.locale) as Locale;
    await userService.setLocale(tenantSlug, userId, locale);
    reply.header('Content-Language', locale).send(localeResponse(locale));
  });

  // List users
  app.get('/', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const query = request.query as Record<string, string>;
    const pagination = parsePagination(query);

    const filters = {
      status: query.status,
      search: query.search || query.q,
    };

    const { users, total } = await userService.list(tenantSlug, pagination, filters);

    reply.send(createPaginatedResponse(users, total, pagination));
  });

  // Get user by ID
  app.get<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = userIdParamSchema.parse(request.params);
    const user = await userService.findById(tenantSlug, id);

    if (!user) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `User with id '${id}' not found`,
      });
    }

    reply.send(user);
  });

  // Create user
  app.post('/', {
    preHandler: [requirePermission('users:create')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const body = createUserSchema.parse(request.body);

    const user = await userService.create(tenantSlug, body, userId);
    reply.status(201).send(user);
  });

  // Update user
  app.put<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = userIdParamSchema.parse(request.params);
    const body = updateUserSchema.parse(request.body);

    const user = await userService.update(tenantSlug, id, body, userId);
    reply.send(user);
  });

  // Delete user
  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [requirePermission('users:delete')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = userIdParamSchema.parse(request.params);

    await userService.delete(tenantSlug, id, userId);
    reply.status(204).send();
  });

  // Get user's groups
  app.get<{ Params: { id: string } }>('/:id/groups', {
    preHandler: [requirePermission('users:read')],
  }, async (request, reply) => {
    const { tenantSlug } = request.user;
    const { id } = userIdParamSchema.parse(request.params);

    const groups = await userService.getUserGroups(tenantSlug, id);
    reply.send({ data: groups });
  });

  // Assign roles to user
  app.put<{ Params: { id: string } }>('/:id/roles', {
    preHandler: [requirePermission('users:update')],
  }, async (request, reply) => {
    const { tenantSlug, userId } = request.user;
    const { id } = userIdParamSchema.parse(request.params);
    const body = assignRolesSchema.parse(request.body);

    await userService.assignRoles(tenantSlug, id, body.roleIds, userId);
    reply.send({ message: 'Roles assigned successfully' });
  });
}
