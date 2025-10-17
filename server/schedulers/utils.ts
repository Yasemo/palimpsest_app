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
 * - Cron expressions: "minute hour day month dayOfWeek" (e.g., "01 18 * * *" = daily at 6:01 PM)
 */
export function parseScheduleAndGetNextRun(schedule: string, lastRun?: Date): ScheduleInfo {
  const now = lastRun || new Date();
  const scheduleStr = schedule.trim();
  const scheduleLower = scheduleStr.toLowerCase();

  // Check if it's a cron expression (5 parts separated by spaces)
  const cronParts = scheduleStr.split(/\s+/);
  if (cronParts.length === 5) {
    try {
      const cronResult = parseCronExpression(cronParts, now);
      if (cronResult) {
        return cronResult;
      }
    } catch (error) {
      console.warn(`Failed to parse cron expression "${schedule}":`, error);
    }
  }

  // Daily schedule - midnight
  if (scheduleLower === "daily") {
    const nextRun = new Date(now);
    nextRun.setDate(nextRun.getDate() + 1);
    nextRun.setHours(0, 0, 0, 0);
    return {
      nextRunAt: nextRun,
      description: "Daily at midnight"
    };
  }

  // Hourly schedule
  if (scheduleLower === "hourly") {
    const nextRun = new Date(now);
    nextRun.setHours(nextRun.getHours() + 1, 0, 0, 0);
    return {
      nextRunAt: nextRun,
      description: "Every hour"
    };
  }

  // Weekly schedule - Sunday at midnight
  if (scheduleLower === "weekly") {
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
  const minutesMatch = scheduleLower.match(/^every\s+(\d+)\s+minutes?$/);
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1], 10);
    const nextRun = new Date(now.getTime() + minutes * 60 * 1000);
    return {
      nextRunAt: nextRun,
      description: `Every ${minutes} minute${minutes !== 1 ? 's' : ''}`
    };
  }

  // "every X hours" format
  const hoursMatch = scheduleLower.match(/^every\s+(\d+)\s+hours?$/);
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
 * Parse a cron expression and calculate the next run time
 * Format: "minute hour dayOfMonth month dayOfWeek"
 * Supports: numbers, * (any), and basic ranges
 */
function parseCronExpression(parts: string[], now: Date): ScheduleInfo | null {
  const [minuteStr, hourStr, dayOfMonthStr, monthStr, dayOfWeekStr] = parts;
  
  // Parse minute (0-59)
  const minute = minuteStr === '*' ? null : parseInt(minuteStr, 10);
  if (minute !== null && (minute < 0 || minute > 59)) {
    throw new Error(`Invalid minute: ${minuteStr}`);
  }
  
  // Parse hour (0-23)
  const hour = hourStr === '*' ? null : parseInt(hourStr, 10);
  if (hour !== null && (hour < 0 || hour > 23)) {
    throw new Error(`Invalid hour: ${hourStr}`);
  }
  
  // Parse day of month (1-31) - currently only supports * or specific day
  const dayOfMonth = dayOfMonthStr === '*' ? null : parseInt(dayOfMonthStr, 10);
  if (dayOfMonth !== null && (dayOfMonth < 1 || dayOfMonth > 31)) {
    throw new Error(`Invalid day of month: ${dayOfMonthStr}`);
  }
  
  // Parse month (1-12) - currently only supports *
  const month = monthStr === '*' ? null : parseInt(monthStr, 10);
  if (month !== null && (month < 1 || month > 12)) {
    throw new Error(`Invalid month: ${monthStr}`);
  }
  
  // Parse day of week (0-6, Sunday=0) - currently only supports *
  const dayOfWeek = dayOfWeekStr === '*' ? null : parseInt(dayOfWeekStr, 10);
  if (dayOfWeek !== null && (dayOfWeek < 0 || dayOfWeek > 6)) {
    throw new Error(`Invalid day of week: ${dayOfWeekStr}`);
  }
  
  // Calculate next run time
  const nextRun = new Date(now);
  
  // Set the time components
  if (minute !== null) {
    nextRun.setMinutes(minute);
  }
  if (hour !== null) {
    nextRun.setHours(hour);
  }
  nextRun.setSeconds(0);
  nextRun.setMilliseconds(0);
  
  // If the calculated time is in the past, move to next occurrence
  if (nextRun <= now) {
    if (dayOfMonth === null && month === null && dayOfWeek === null) {
      // Daily schedule - add one day
      nextRun.setDate(nextRun.getDate() + 1);
    } else if (dayOfWeek !== null) {
      // Weekly schedule - find next matching day of week
      const currentDay = nextRun.getDay();
      let daysToAdd = dayOfWeek - currentDay;
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      nextRun.setDate(nextRun.getDate() + daysToAdd);
    } else if (dayOfMonth !== null) {
      // Monthly schedule - move to next month if needed
      nextRun.setMonth(nextRun.getMonth() + 1);
      nextRun.setDate(dayOfMonth);
    }
  }
  
  // Build description
  let description = "Cron: ";
  if (minute !== null && hour !== null && dayOfMonth === null && month === null && dayOfWeek === null) {
    const hourFormatted = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const period = hour < 12 ? 'AM' : 'PM';
    description = `Daily at ${hourFormatted}:${minute.toString().padStart(2, '0')} ${period}`;
  } else if (minute !== null && hour !== null && dayOfWeek !== null) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const hourFormatted = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    const period = hour < 12 ? 'AM' : 'PM';
    description = `Weekly on ${days[dayOfWeek]} at ${hourFormatted}:${minute.toString().padStart(2, '0')} ${period}`;
  } else {
    description += parts.join(' ');
  }
  
  return {
    nextRunAt: nextRun,
    description
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
