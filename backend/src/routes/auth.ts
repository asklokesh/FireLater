import { getSafeErrorMessage } from '../utils/errors';

// Centralized error handler for auth routes
fastify.setErrorHandler((error, request, reply) => {
  const message = getSafeErrorMessage(error);
  fastify.log.error({ error }, 'Request failed');
  
  // Handle specific error cases
  if (request.routerPath === '/login') {
    return reply.code(401).send({ error: `Authentication failed: ${message}` });
  }
  
  if (request.routerPath === '/register') {
    return reply.code(400).send({ error: `Registration failed: ${message}` });
  }
  
  // Default error response
  return reply.code(500).send({ error: 'Internal server error' });
});

// Simplified login route without try/catch
fastify.post('/login', {
  // ... existing schema and config
}, async (request, reply) => {
  // ... existing login logic
  // Errors will be handled by the centralized error handler
});

// Simplified register route without try/catch
fastify.post('/register', {
  // ... existing schema and config
}, async (request, reply) => {
  // ... existing registration logic
  // Errors will be handled by the centralized error handler
});