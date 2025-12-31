fastify.get('/health-scores', {
  preHandler: [authenticateTenant],
  schema: {
    tags: ['Assets'],
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            healthScore: { type: 'number' },
            lastChecked: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  }
}, async (request: FastifyRequest, reply) => {
  const { tenantSlug } = request;
  
  // Replace individual health score fetching with single query using JOINs
  const assetsWithHealth = await assetsService.getAssetsWithHealthScores(tenantSlug);
  
  return assetsWithHealth.map(asset => ({
    id: asset.id,
    name: asset.name,
    healthScore: asset.health_score,
    lastChecked: asset.last_checked
  }));
});