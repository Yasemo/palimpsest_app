// Scheduler utility functions for parsing schedules and calculating next run times

export interface ScheduleInfo {
  nextRunAt: Date;
  description: string;
}

/**
 * Parse a schedule string and calculate the next run time
 * Supports formats:
 * - "daily" - runs at midnight
 * - "hourly" - runs every hour
 * - "weekly" - runs on Sunday at midnight
 * - "every X minutes" - runs every X minutes
 * - "every X hours" - runs every X hours
 */
export function parseScheduleAndGetNextRun(schedule: string, lastRun?: Date): ScheduleInfo {
  const now = lastRun || new Date();
  const scheduleStr = schedule.toLowerCase().trim();

  // Daily schedule - midnight
  if (scheduleStr === "daily") {
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(0, 0, 0, 0);
    return {
      nextRunAt: nextRun,
      description: "Daily at midnight"
    };
  }

  // Hourly schedule
  if (scheduleStr === "hourly") {
    const nextRun = new Date(now);
    nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
    return {
      nextRunAt: nextRun,
      description: "Every hour"
    };
  }

  // Weekly schedule - Sunday at midnight
  if (scheduleStr === "weekly") {
    const nextRun = new Date(now);
    const daysUntilSunday = (7 - nextRun.getDay()) % 7 || 7;
    nextRun.setDate(nextRun.getDate() + daysUntilSunday);
    nextRun.setHours(0, 0, 0, 0);
    return {
      nextRunAt: nextRun,
      description: "Weekly on Sunday at midnight"
    };
  }

  // "every X minutes" format
  const minutesMatch = scheduleStr.match(/^every\s+(\d+)\s+minutes?$/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    const nextRun = new Date(now.getTime() + minutes * 60 * 1000);
    return {
      nextRunAt: nextRun,
      description: `Every ${minutes} minute${minutes !== 1 ? 's' : ''}`
    };
  }

  // "every X hours" format
  const hoursMatch = scheduleStr.match(/^every\s+(\d+)\s+hours?$/);
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1], 10);
    const nextRun = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return {
      nextRunAt: nextRun,
      description: `Every ${hours} hour${hours !== 1 ? 's' : ''}`
    };
  }

  // Default fallback: run every 10 minutes
  console.warn(`Unknown schedule format: "${schedule}". Defaulting to every 10 minutes.`);
  const nextRun = new Date(now.getTime() + 10 * 60 * 1000);
  return {
    nextRunAt: nextRun,
    description: "Every 10 minutes (default)"
  };
}

/**
 * Format a date for logging
 */
export function formatDateForLog(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Calculate duration in human-readable format
 */
export function formatDuration(startTime: Date, endTime: Date): string {
  const durationMs = endTime.getTime() - startTime.getTime();
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  return `${seconds}s`;
}
