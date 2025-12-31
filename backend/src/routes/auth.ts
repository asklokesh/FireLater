import { getSafeErrorMessage } from '../utils/errors';

// In the login route error handler
fastify.post('/login', {
  // ... existing schema and config
}, async (request, reply) => {
  try {
    // ... existing login logic
  } catch (error) {
    const message = getSafeErrorMessage(error);
    fastify.log.error({ error }, 'Login failed');
    return reply.code(401).send({ error: `Authentication failed: ${message}` });
  }
});

// In the register route error handler
fastify.post('/register', {
  // ... existing schema and config
}, async (request, reply) => {
  try {
    // ... existing registration logic
  } catch (error) {
    const message = getSafeErrorMessage(error);
    fastify.log.error({ error }, 'Registration failed');
    return reply.code(400).send({ error: `Registration failed: ${message}` });
  }
});