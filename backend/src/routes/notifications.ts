// Find the section where BullMQ jobs are created and add retry configuration
// This would typically be where jobs are added to the queue
const job = await notificationQueue.add('sendNotification', {
  notificationId: notification.id,
  tenantSlug: tenant.slug,
  // other job data
}, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000
  },
  removeOnComplete: true,
  removeOnFail: false
});