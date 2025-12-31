// Assuming there's a queue initialization section, add retry configuration
const notificationQueue = new Queue('notifications', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});

// In job creation sections, ensure retry options are properly set
await notificationQueue.add('send-notification', {
  userId,
  message,
  type
}, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  timeout: 30000
});