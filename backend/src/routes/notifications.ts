// At the top of the file, add a reference to store the Redis client
let redisClient: any = null;

// In the function where Redis client is initialized (typically in a service initialization)
// Make sure to store the client reference
const initializeRedis = () => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL);
  }
  return redisClient;
};

// Add a cleanup function to properly close the Redis connection
const closeRedisConnection = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
};

// If using Fastify, add a hook to close Redis connection on server close
fastify.addHook('onClose', async (instance, done) => {
  await closeRedisConnection();
  done();
});