// In the oncallScheduleService, we need to modify the updateRotation method to handle DST transitions
async updateRotation(tenantSlug, scheduleId, rotationData) {
  const schedule = await this.getSchedule(tenantSlug, scheduleId);
  const timezone = schedule.timezone || 'UTC';
  
  // Use timezone-aware date calculations instead of simple arithmetic
  const now = new Date();
  const tzAdjustedNow = new Date(now.toLocaleString("en-US", {timeZone: timezone}));
  
  // Calculate next handoff with timezone awareness
  const nextHandoff = this.calculateNextHandoff(schedule, tzAdjustedNow);
  
  // Update rotation with timezone-safe dates
  return await this.db.oncallSchedule.update({
    where: { id: scheduleId, tenantSlug },
    data: {
      ...rotationData,
      nextHandoffAt: nextHandoff.toISOString()
    }
  });
}

// Add helper method to properly calculate handoff times across DST boundaries
calculateNextHandoff(schedule, startDate) {
  const { handoffTime, handoffDay, rotationType } = schedule;
  const [hours, minutes] = handoffTime.split(':').map(Number);
  
  let nextHandoff = new Date(startDate);
  nextHandoff.setHours(hours, minutes, 0, 0);
  
  // Handle timezone transitions during DST
  const tz = schedule.timezone || 'UTC';
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Adjust for DST transitions
  const formatted = tzFormatter.format(nextHandoff);
  const [datePart, timePart] = formatted.split(', ');
  const [month, day, year] = datePart.split('/');
  const [h, m, s] = timePart.split(':');
  
  nextHandoff = new Date(Date.UTC(year, month-1, day, h, m, s));
  
  // Ensure we're moving forward in time
  if (nextHandoff <= startDate) {
    nextHandoff.setDate(nextHandoff.getDate() + 1);
  }
  
  return nextHandoff;
}