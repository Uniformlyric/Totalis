/**
 * Smart Scheduling Calculator
 * Calculates realistic start dates and deadlines based on user capacity and existing workload
 */

import type { Task, Project, UserSettings } from '@totalis/shared';

export interface SchedulingContext {
  userWeeklyCapacity: number; // hours per week
  workingHours: { start: string; end: string }; // e.g., "09:00", "17:00"
  existingTasks: Task[];
  existingProjects: Project[];
  holidays?: Date[]; // optional: dates to skip
  preferredStartDate?: Date; // optional: earliest start date
}

export interface SchedulingResult {
  suggestedStartDate: Date;
  calculatedDeadline: Date;
  weeklyHoursRequired: number;
  isOverCapacity: boolean;
  capacityUtilization: number; // 0-1 (e.g., 0.85 = 85% capacity)
  warnings: string[];
  breakdown: WeeklyBreakdown[];
}

export interface WeeklyBreakdown {
  weekStartDate: Date;
  weekEndDate: Date;
  weekLabel: string; // e.g., "Week of Dec 9"
  hoursScheduled: number;
  hoursAvailable: number;
  utilizationPercent: number;
  tasksScheduled: { taskId?: string; title: string; hours: number }[];
  isOverbooked: boolean;
}

export interface DayCapacity {
  date: Date;
  dateString: string; // YYYY-MM-DD
  totalMinutesScheduled: number;
  availableMinutes: number;
  utilizationPercentage: number;
  status: 'available' | 'busy' | 'overbooked';
  tasks: Task[];
  isWeekend: boolean;
  isHoliday: boolean;
}

/**
 * Calculate optimal schedule for a new project or set of tasks
 */
export function calculateOptimalSchedule(
  taskHours: number, // total hours needed
  context: SchedulingContext
): SchedulingResult {
  const result: SchedulingResult = {
    suggestedStartDate: new Date(),
    calculatedDeadline: new Date(),
    weeklyHoursRequired: 0,
    isOverCapacity: false,
    capacityUtilization: 0,
    warnings: [],
    breakdown: [],
  };

  // Start date: use preferred or today
  const startDate = context.preferredStartDate || new Date();
  startDate.setHours(0, 0, 0, 0);
  result.suggestedStartDate = new Date(startDate);

  // Calculate weekly hours needed (average across project duration)
  // Aim for 50-75% capacity utilization for realistic scheduling
  const targetUtilization = 0.65; // 65% of weekly capacity
  const hoursPerWeek = context.userWeeklyCapacity * targetUtilization;
  const weeksNeeded = Math.ceil(taskHours / hoursPerWeek);
  
  result.weeklyHoursRequired = hoursPerWeek;

  // Build weekly breakdown
  let currentWeekStart = new Date(startDate);
  currentWeekStart = getWeekStart(currentWeekStart); // Align to Monday

  for (let i = 0; i < weeksNeeded; i++) {
    const weekEnd = new Date(currentWeekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Calculate existing workload for this week
    const existingHours = calculateWeeklyWorkload(
      currentWeekStart,
      weekEnd,
      context.existingTasks
    );

    const remainingCapacity = context.userWeeklyCapacity - existingHours;
    const hoursToSchedule = Math.min(hoursPerWeek, remainingCapacity, taskHours - (i * hoursPerWeek));
    const totalScheduled = existingHours + hoursToSchedule;
    const utilization = (totalScheduled / context.userWeeklyCapacity) * 100;

    const breakdown: WeeklyBreakdown = {
      weekStartDate: new Date(currentWeekStart),
      weekEndDate: new Date(weekEnd),
      weekLabel: formatWeekLabel(currentWeekStart),
      hoursScheduled: totalScheduled,
      hoursAvailable: context.userWeeklyCapacity,
      utilizationPercent: Math.round(utilization),
      tasksScheduled: [{ title: 'New work', hours: hoursToSchedule }],
      isOverbooked: totalScheduled > context.userWeeklyCapacity,
    };

    result.breakdown.push(breakdown);

    if (breakdown.isOverbooked) {
      result.warnings.push(
        `Week of ${breakdown.weekLabel}: ${Math.round(totalScheduled)}h scheduled (${Math.round(totalScheduled - context.userWeeklyCapacity)}h over capacity)`
      );
      result.isOverCapacity = true;
    }

    // Move to next week
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  }

  // Calculate deadline (end of last week)
  const lastWeek = result.breakdown[result.breakdown.length - 1];
  result.calculatedDeadline = lastWeek ? lastWeek.weekEndDate : new Date(startDate);

  // Calculate overall capacity utilization
  const totalHoursAvailable = weeksNeeded * context.userWeeklyCapacity;
  const existingTotalHours = result.breakdown.reduce((sum, w) => sum + w.hoursScheduled, 0);
  result.capacityUtilization = existingTotalHours / totalHoursAvailable;

  // Add warnings
  if (result.capacityUtilization > 0.9) {
    result.warnings.push('⚠️ Very high capacity utilization - consider extending deadline');
  } else if (result.capacityUtilization < 0.4) {
    result.warnings.push('💡 Low utilization - you could complete this sooner');
  }

  if (weeksNeeded > 12) {
    result.warnings.push('📅 Project duration exceeds 3 months - consider breaking into phases');
  }

  return result;
}

/**
 * Calculate day-by-day capacity for a given date range
 */
export function calculateDayCapacity(
  date: Date,
  tasks: Task[],
  workingHours: { start: string; end: string },
  holidays: Date[] = []
): DayCapacity {
  const dateStr = date.toISOString().split('T')[0];
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = holidays.some(h => h.toISOString().split('T')[0] === dateStr);

  // Calculate available work minutes for the day
  let availableMinutes = 0;
  if (!isWeekend && !isHoliday) {
    const [startHour, startMin] = workingHours.start.split(':').map(Number);
    const [endHour, endMin] = workingHours.end.split(':').map(Number);
    availableMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  }

  // Sum scheduled task minutes for this day
  const dayTasks = tasks.filter(task => {
    if (!task.scheduledStart) return false;
    const taskDate = task.scheduledStart instanceof Date 
      ? task.scheduledStart 
      : new Date(task.scheduledStart);
    return taskDate.toISOString().split('T')[0] === dateStr;
  });

  const totalMinutesScheduled = dayTasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);

  const utilizationPercentage = availableMinutes > 0 
    ? Math.round((totalMinutesScheduled / availableMinutes) * 100) 
    : 0;

  let status: 'available' | 'busy' | 'overbooked';
  if (utilizationPercentage === 0) {
    status = 'available';
  } else if (utilizationPercentage > 100) {
    status = 'overbooked';
  } else {
    status = 'busy';
  }

  return {
    date,
    dateString: dateStr,
    totalMinutesScheduled,
    availableMinutes,
    utilizationPercentage,
    status,
    tasks: dayTasks,
    isWeekend,
    isHoliday,
  };
}

/**
 * Calculate weekly capacity for multiple days
 */
export function calculateWeekCapacity(
  weekStartDate: Date,
  tasks: Task[],
  workingHours: { start: string; end: string },
  holidays: Date[] = []
): DayCapacity[] {
  const days: DayCapacity[] = [];
  const currentDate = new Date(weekStartDate);

  for (let i = 0; i < 7; i++) {
    days.push(calculateDayCapacity(currentDate, tasks, workingHours, holidays));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return days;
}

/**
 * Find next available time slot for a task
 */
export function findNextAvailableSlot(
  taskDurationMinutes: number,
  tasks: Task[],
  workingHours: { start: string; end: string },
  startSearchDate: Date = new Date()
): Date {
  const searchDate = new Date(startSearchDate);
  searchDate.setHours(0, 0, 0, 0);

  // Search up to 90 days ahead
  for (let i = 0; i < 90; i++) {
    const dayCapacity = calculateDayCapacity(searchDate, tasks, workingHours);

    if (!dayCapacity.isWeekend && !dayCapacity.isHoliday) {
      const remainingCapacity = dayCapacity.availableMinutes - dayCapacity.totalMinutesScheduled;
      
      if (remainingCapacity >= taskDurationMinutes) {
        // Found a slot!
        return new Date(searchDate);
      }
    }

    searchDate.setDate(searchDate.getDate() + 1);
  }

  // No slot found in 90 days - return 90 days out anyway
  return new Date(searchDate);
}

/**
 * Get current weekly workload (sum of task hours this week)
 */
export function getCurrentWeeklyWorkload(
  tasks: Task[],
  weekStartDate?: Date
): number {
  const startDate = weekStartDate || getWeekStart(new Date());
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);

  return calculateWeeklyWorkload(startDate, endDate, tasks);
}

/**
 * Calculate total hours scheduled in a date range
 */
function calculateWeeklyWorkload(
  startDate: Date,
  endDate: Date,
  tasks: Task[]
): number {
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  const relevantTasks = tasks.filter(task => {
    if (!task.scheduledStart && !task.dueDate) return false;
    
    const taskDate = task.scheduledStart || task.dueDate;
    const taskTime = (taskDate instanceof Date ? taskDate : new Date(taskDate)).getTime();
    
    return taskTime >= startTime && taskTime <= endTime;
  });

  const totalMinutes = relevantTasks.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);
  return totalMinutes / 60; // Convert to hours
}

/**
 * Get the start of the week (Monday)
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format week label (e.g., "Week of Dec 9")
 */
function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Validate if a deadline is realistic given workload
 */
export function validateDeadline(
  deadline: Date,
  requiredHours: number,
  context: SchedulingContext
): { isRealistic: boolean; suggestions: string[] } {
  const now = new Date();
  const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const weeksUntilDeadline = daysUntilDeadline / 7;

  const hoursNeededPerWeek = requiredHours / weeksUntilDeadline;
  const currentWeeklyLoad = getCurrentWeeklyWorkload(context.existingTasks);
  const totalWeeklyLoad = currentWeeklyLoad + hoursNeededPerWeek;

  const isRealistic = totalWeeklyLoad <= context.userWeeklyCapacity * 0.85; // 85% threshold

  const suggestions: string[] = [];

  if (!isRealistic) {
    const weeksNeeded = Math.ceil(requiredHours / (context.userWeeklyCapacity * 0.65));
    const suggestedDeadline = new Date(now);
    suggestedDeadline.setDate(suggestedDeadline.getDate() + weeksNeeded * 7);

    suggestions.push(
      `⚠️ Deadline may be too aggressive. ${Math.round(hoursNeededPerWeek)}h/week required (current: ${Math.round(currentWeeklyLoad)}h/week)`,
      `💡 Suggested deadline: ${suggestedDeadline.toLocaleDateString()} (${weeksNeeded} weeks)`,
      `📊 This would require ${Math.round((requiredHours / weeksNeeded))}h/week at 65% capacity utilization`
    );
  } else {
    suggestions.push(`✅ Deadline is realistic with ${Math.round((totalWeeklyLoad / context.userWeeklyCapacity) * 100)}% capacity utilization`);
  }

  return { isRealistic, suggestions };
}
