// In the section where BullMQ workers are configured for notifications processing
// Look for the worker initialization and add retry configuration
const notificationWorker = new Worker(
  'notifications',
  async job => {
    // job processing logic
  },
  {
    connection: redisConnection,
    // Add these retry configuration options
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 }
  }
);