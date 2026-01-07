import { FastifyRequest, FastifyReply } from 'fastify';

export async function extractTenantContext(request: FastifyRequest, reply: FastifyReply) {
  const tenant = request.tenant;
  if (!tenant) {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
  return tenant;
}