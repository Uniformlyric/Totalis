/**
 * Capacity Visualization Utilities
 * Helper functions for visualizing workload capacity in timeline and calendar views
 */

import type { Task } from '@totalis/shared';
import { calculateDayCapacity, calculateWeekCapacity, type DayCapacity } from './calculator';

export interface CapacityRange {
  startDate: Date;
  endDate: Date;
  days: DayCapacity[];
  totalHoursScheduled: number;
  totalHoursAvailable: number;
  averageUtilization: number;
  overb ookedDays: number;
}

/**
 * Get capacity status color for UI
 */
export function getCapacityColor(utilizationPercent: number): string {
  if (utilizationPercent === 0) return '#10b981'; // green-500 - available
  if (utilizationPercent <= 70) return '#3b82f6'; // blue-500 - comfortable
  if (utilizationPercent <= 90) return '#f59e0b'; // amber-500 - busy
  if (utilizationPercent <= 100) return '#ef4444'; // red-500 - full
  return '#dc2626'; // red-600 - overbooked
}

/**
 * Get capacity status label
 */
export function getCapacityLabel(utilizationPercent: number): string {
  if (utilizationPercent === 0) return 'Available';
  if (utilizationPercent <= 70) return 'Light';
  if (utilizationPercent <= 90) return 'Busy';
  if (utilizationPercent <= 100) return 'Full';
  return 'Overbooked';
}

/**
 * Get capacity icon emoji
 */
export function getCapacityIcon(utilizationPercent: number): string {
  if (utilizationPercent === 0) return '✅';
  if (utilizationPercent <= 70) return '🟢';
  if (utilizationPercent <= 90) return '🟡';
  if (utilizationPercent <= 100) return '🟠';
  return '🔴';
}

/**
 * Calculate capacity for a date range
 */
export function calculateRangeCapacity(
  startDate: Date,
  endDate: Date,
  tasks: Task[],
  workingHours: { start: string; end: string },
  holidays: Date[] = []
): CapacityRange {
  const days: DayCapacity[] = [];
  let totalHoursScheduled = 0;
  let totalHoursAvailable = 0;
  let overbookedDays = 0;

  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayCapacity = calculateDayCapacity(currentDate, tasks, workingHours, holidays);
    days.push(dayCapacity);

    totalHoursScheduled += dayCapacity.totalMinutesScheduled / 60;
    totalHoursAvailable += dayCapacity.availableMinutes / 60;

    if (dayCapacity.status === 'overbooked') {
      overbookedDays++;
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  const averageUtilization = totalHoursAvailable > 0 
    ? (totalHoursScheduled / totalHoursAvailable) * 100 
    : 0;

  return {
    startDate,
    endDate,
    days,
    totalHoursScheduled: Math.round(totalHoursScheduled * 10) / 10,
    totalHoursAvailable: Math.round(totalHoursAvailable * 10) / 10,
    averageUtilization: Math.round(averageUtilization),
    overbookedDays,
  };
}

/**
 * Generate capacity heatmap data for visualization
 */
export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  value: number; // 0-1 (utilization as decimal)
  color: string;
  label: string;
  hours: number;
}

export function generateCapacityHeatmap(
  days: DayCapacity[]
): HeatmapDay[] {
  return days.map(day => ({
    date: day.dateString,
    value: day.utilizationPercentage / 100,
    color: getCapacityColor(day.utilizationPercentage),
    label: `${getCapacityLabel(day.utilizationPercentage)} (${day.utilizationPercentage}%)`,
    hours: Math.round((day.totalMinutesScheduled / 60) * 10) / 10,
  }));
}

/**
 * Get weekly capacity summary
 */
export interface WeeklyCapacitySummary {
  weekLabel: string;
  weekStart: Date;
  weekEnd: Date;
  hoursScheduled: number;
  hoursAvailable: number;
  utilization: number;
  status: 'available' | 'comfortable' | 'busy' | 'full' | 'overbooked';
  color: string;
  daysOverbooked: number;
}

export function getWeeklyCapacitySummary(
  weekStartDate: Date,
  tasks: Task[],
  workingHours: { start: string; end: string },
  holidays: Date[] = []
): WeeklyCapacitySummary {
  const weekDays = calculateWeekCapacity(weekStartDate, tasks, workingHours, holidays);
  const weekEnd = new Date(weekStartDate);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const hoursScheduled = weekDays.reduce((sum, day) => sum + day.totalMinutesScheduled / 60, 0);
  const hoursAvailable = weekDays.reduce((sum, day) => sum + day.availableMinutes / 60, 0);
  const utilization = hoursAvailable > 0 ? (hoursScheduled / hoursAvailable) * 100 : 0;
  const daysOverbooked = weekDays.filter(d => d.status === 'overbooked').length;

  let status: WeeklyCapacitySummary['status'];
  if (utilization === 0) status = 'available';
  else if (utilization <= 70) status = 'comfortable';
  else if (utilization <= 90) status = 'busy';
  else if (utilization <= 100) status = 'full';
  else status = 'overbooked';

  return {
    weekLabel: weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weekStart: weekStartDate,
    weekEnd,
    hoursScheduled: Math.round(hoursScheduled * 10) / 10,
    hoursAvailable: Math.round(hoursAvailable * 10) / 10,
    utilization: Math.round(utilization),
    status,
    color: getCapacityColor(utilization),
    daysOverbooked,
  };
}

/**
 * Find gaps in schedule (free time slots)
 */
export interface ScheduleGap {
  date: Date;
  availableMinutes: number;
  canFitTask: (minutes: number) => boolean;
}

export function findScheduleGaps(
  tasks: Task[],
  workingHours: { start: string; end: string },
  daysToSearch: number = 14
): ScheduleGap[] {
  const gaps: ScheduleGap[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysToSearch; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    const dayCapacity = calculateDayCapacity(date, tasks, workingHours);

    if (!dayCapacity.isWeekend && !dayCapacity.isHoliday) {
      const availableMinutes = dayCapacity.availableMinutes - dayCapacity.totalMinutesScheduled;

      if (availableMinutes > 30) { // At least 30 minutes free
        gaps.push({
          date,
          availableMinutes,
          canFitTask: (minutes: number) => availableMinutes >= minutes,
        });
      }
    }
  }

  return gaps;
}

/**
 * Check if adding a task would cause overbooking
 */
export function wouldCauseOverbooking(
  taskDate: Date,
  taskMinutes: number,
  tasks: Task[],
  workingHours: { start: string; end: string }
): boolean {
  const dayCapacity = calculateDayCapacity(taskDate, tasks, workingHours);
  const newTotal = dayCapacity.totalMinutesScheduled + taskMinutes;
  return newTotal > dayCapacity.availableMinutes;
}

/**
 * Get suggested alternative dates if date is overbooked
 */
export function getSuggestedAlternatives(
  preferredDate: Date,
  taskMinutes: number,
  tasks: Task[],
  workingHours: { start: string; end: string },
  maxSuggestions: number = 3
): Date[] {
  const alternatives: Date[] = [];
  const searchDate = new Date(preferredDate);

  // Search forward
  for (let i = 1; i <= 30 && alternatives.length < maxSuggestions; i++) {
    const testDate = new Date(searchDate);
    testDate.setDate(testDate.getDate() + i);

    if (!wouldCauseOverbooking(testDate, taskMinutes, tasks, workingHours)) {
      const dayCapacity = calculateDayCapacity(testDate, tasks, workingHours);
      if (!dayCapacity.isWeekend && !dayCapacity.isHoliday) {
        alternatives.push(new Date(testDate));
      }
    }
  }

  return alternatives;
}

/**
 * Calculate buffer recommendation (how much slack to add to estimates)
 */
export function calculateBufferRecommendation(
  tasks: Task[]
): { bufferPercent: number; reasoning: string } {
  // Analyze historical estimate accuracy
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.actualMinutes && t.estimatedMinutes);

  if (completedTasks.length < 5) {
    return {
      bufferPercent: 25,
      reasoning: 'Not enough historical data. Using standard 25% buffer.',
    };
  }

  // Calculate average overrun
  const totalOverrun = completedTasks.reduce((sum, task) => {
    const overrun = ((task.actualMinutes! - task.estimatedMinutes) / task.estimatedMinutes) * 100;
    return sum + overrun;
  }, 0);

  const avgOverrun = totalOverrun / completedTasks.length;

  let bufferPercent = Math.round(Math.max(10, Math.min(50, avgOverrun + 10)));
  let reasoning = '';

  if (avgOverrun < 0) {
    bufferPercent = 10;
    reasoning = 'You tend to finish early! Small 10% buffer recommended.';
  } else if (avgOverrun < 10) {
    bufferPercent = 15;
    reasoning = 'Estimates are generally accurate. 15% buffer for safety.';
  } else if (avgOverrun < 25) {
    bufferPercent = 25;
    reasoning = 'Tasks often take longer. 25% buffer recommended.';
  } else {
    bufferPercent = 35;
    reasoning = 'Significant estimate overruns. Consider 35% buffer or breaking tasks smaller.';
  }

  return { bufferPercent, reasoning };
}
