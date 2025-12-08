/**
 * Legacy Bridge - Compatibility layer for old auto-scheduler API
 * 
 * This module provides backwards-compatible functions that wrap
 * the new smart scheduler, allowing gradual migration of existing code.
 */

import type { Task, Milestone, Habit, Project } from '@totalis/shared';
import type {
  SchedulerConfig,
  SchedulePreview as NewSchedulePreview,
  WorkingSchedule,
  EnergyProfile,
  BlockedTimeSlot
} from './types';
import { scheduleAll } from './scheduler-core';
import { createDefaultConfig } from './index';
import { toSafeDate, getWorkingDaysBetween } from './task-analyzer';
import { buildCapacityMap, timeToMinutes, toDateStr } from './constraint-engine';
import { doc, updateDoc, Timestamp, getFirestore } from 'firebase/firestore';
import { getDb, getAuthInstance } from '@/lib/firebase';

// Helper to get current user ID or throw
function getCurrentUserId(): string {
  const auth = getAuthInstance();
  const userId = auth.currentUser?.uid;
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

// ============================================================================
// LEGACY TYPES (matching old auto-scheduler.ts)
// ============================================================================

/**
 * Legacy schedule preview format
 */
export interface LegacySchedulePreview {
  date: Date;
  slots: Array<{
    task: Task;
    startTime: Date;
    endTime: Date;
    reasoning: string;
  }>;
  summary: string;
  warnings: string[];
}

/**
 * Legacy scheduler config (from old auto-scheduler)
 */
export interface LegacySchedulerConfig {
  startDate: Date;
  endDate: Date;
  focusProjects?: string[];
  focusProjectRatio?: number;
  deadlineBufferDays: number;
  strictDeadlines: boolean;
  maxHoursPerDay: number;
  targetHoursPerDay?: number;
  allowOvertime: boolean;
  maxOvertimeHours: number;
  intensityMode: 'relaxed' | 'balanced' | 'intense' | 'deadline-driven';
  breaksBetweenTasks: number;
  lunchBreak?: { start: string; end: string };
  distributionMode: 'even' | 'front-load' | 'back-load' | 'deadline-aware';
  batchSimilarTasks: boolean;
  energyProfile?: EnergyProfile;
  scheduleHighFocusInPeak: boolean;
}

/**
 * Legacy analysis result
 */
export interface LegacyScheduleAnalysis {
  totalTasks: number;
  schedulableTasks: number;
  totalMinutesNeeded: number;
  totalMinutesAvailable: number;
  utilizationPercent: number;
  warnings: string[];
  recommendations: string[];
  deadlineTasks: Array<{
    task: Task;
    daysUntilDue: number;
    canSchedule: boolean;
  }>;
}

export interface LegacyWorkingSchedule {
  days: number[];
  hours: { start: string; end: string };
}

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

/**
 * Convert legacy config to new SchedulerConfig
 */
function convertConfig(legacy: LegacySchedulerConfig, workingSchedule: LegacyWorkingSchedule): SchedulerConfig {
  return {
    startDate: legacy.startDate,
    endDate: legacy.endDate,
    deadlineBufferDays: legacy.deadlineBufferDays,
    strictDeadlines: legacy.strictDeadlines,
    allowBufferReduction: !legacy.strictDeadlines,
    maxHoursPerDay: legacy.maxHoursPerDay,
    targetHoursPerDay: legacy.targetHoursPerDay ?? legacy.maxHoursPerDay * 0.75,
    allowOvertime: legacy.allowOvertime,
    maxOvertimeHours: legacy.maxOvertimeHours,
    intensityMode: legacy.intensityMode,
    breaksBetweenTasksMinutes: legacy.breaksBetweenTasks,
    distributionMode: legacy.distributionMode,
    batchSimilarTasks: legacy.batchSimilarTasks,
    scheduleHighFocusInPeak: legacy.scheduleHighFocusInPeak,
    autoResolveConflicts: false,
    conflictResolutionStrategy: 'interactive',
    workingDays: workingSchedule.days,
    workingHoursStart: workingSchedule.hours.start,
    workingHoursEnd: workingSchedule.hours.end,
    focusProjectIds: legacy.focusProjects,
    focusProjectRatio: legacy.focusProjectRatio,
    lunchBreak: legacy.lunchBreak,
    energyProfile: legacy.energyProfile
  };
}

/**
 * Convert new preview format to legacy format
 */
function convertToLegacyPreview(previews: NewSchedulePreview[]): LegacySchedulePreview[] {
  return previews.map(preview => ({
    date: preview.date,
    slots: preview.slots.map(slot => ({
      task: slot.task as Task,
      startTime: slot.startTime,
      endTime: slot.endTime,
      reasoning: slot.reasoning || 'Scheduled by smart algorithm'
    })),
    summary: `Scheduled ${preview.slots.length} tasks`,
    warnings: preview.warnings || []
  }));
}

// ============================================================================
// LEGACY API FUNCTIONS
// ============================================================================

/**
 * Get default scheduler configuration (legacy API)
 */
export function getDefaultSchedulerConfig(workingSchedule?: LegacyWorkingSchedule): LegacySchedulerConfig {
  const now = new Date();
  // Default to 3 months - gives plenty of room to schedule everything
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const defaultSchedule: LegacyWorkingSchedule = workingSchedule || {
    days: [1, 2, 3, 4, 5],
    hours: { start: '09:00', end: '17:00' }
  };

  const startHour = parseInt(defaultSchedule.hours.start.split(':')[0]);
  const endHour = parseInt(defaultSchedule.hours.end.split(':')[0]);
  const dailyHours = endHour - startHour;

  return {
    startDate: now,
    endDate: threeMonthsLater,
    deadlineBufferDays: 2,
    strictDeadlines: true,
    maxHoursPerDay: dailyHours,
    targetHoursPerDay: dailyHours * 0.75,
    allowOvertime: false,
    maxOvertimeHours: 2,
    intensityMode: 'balanced',
    breaksBetweenTasks: 15,
    lunchBreak: { start: '12:00', end: '13:00' },
    distributionMode: 'deadline-aware',
    batchSimilarTasks: true,
    scheduleHighFocusInPeak: true
  };
}

/**
 * Analyze schedule without generating (legacy API)
 */
export function analyzeSchedule(
  tasks: Task[],
  config: LegacySchedulerConfig,
  workingSchedule: LegacyWorkingSchedule
): LegacyScheduleAnalysis {
  const now = new Date();
  const schedulableTasks = tasks.filter(t => 
    t.status !== 'completed' && 
    !t.scheduledStart
  );

  // Calculate time needed
  const totalMinutesNeeded = schedulableTasks.reduce((sum, t) => 
    sum + (t.estimatedMinutes || 30), 0
  );

  // Calculate time available
  const workingDays = getWorkingDaysBetween(
    config.startDate, 
    config.endDate, 
    workingSchedule.days
  );
  
  const startMinutes = timeToMinutes(workingSchedule.hours.start);
  const endMinutes = timeToMinutes(workingSchedule.hours.end);
  const lunchMinutes = config.lunchBreak ? 
    timeToMinutes(config.lunchBreak.end) - timeToMinutes(config.lunchBreak.start) : 0;
  
  const dailyMinutes = endMinutes - startMinutes - lunchMinutes;
  const totalMinutesAvailable = workingDays * dailyMinutes * (config.targetHoursPerDay ? 
    config.targetHoursPerDay / config.maxHoursPerDay : 0.75);

  const utilizationPercent = totalMinutesAvailable > 0 
    ? Math.round((totalMinutesNeeded / totalMinutesAvailable) * 100)
    : 0;

  // Find deadline tasks
  const deadlineTasks = schedulableTasks
    .filter(t => t.dueDate)
    .map(t => {
      const dueDate = toSafeDate(t.dueDate);
      const daysUntilDue = dueDate 
        ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      const minutesNeeded = t.estimatedMinutes || 30;
      const daysNeeded = Math.ceil(minutesNeeded / dailyMinutes);
      const canSchedule = daysUntilDue >= daysNeeded + config.deadlineBufferDays;

      return { task: t, daysUntilDue, canSchedule };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

  // Generate warnings and recommendations
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (utilizationPercent > 100) {
    warnings.push(`You have more work (${Math.round(totalMinutesNeeded / 60)}h) than available time (${Math.round(totalMinutesAvailable / 60)}h)`);
  }

  if (utilizationPercent > 90) {
    warnings.push('Schedule is very tight - consider extending the date range');
  }

  const overdueTasks = deadlineTasks.filter(dt => dt.daysUntilDue < 0);
  if (overdueTasks.length > 0) {
    warnings.push(`${overdueTasks.length} task(s) are past their deadline`);
  }

  const atRiskTasks = deadlineTasks.filter(dt => !dt.canSchedule && dt.daysUntilDue >= 0);
  if (atRiskTasks.length > 0) {
    warnings.push(`${atRiskTasks.length} task(s) may not complete before their deadline`);
  }

  if (schedulableTasks.length === 0) {
    recommendations.push('No unscheduled tasks found - great job!');
  } else if (utilizationPercent < 50) {
    recommendations.push('You have plenty of capacity - consider adding more tasks or reducing working hours');
  }

  if (config.focusProjects && config.focusProjects.length > 0) {
    const focusTasks = schedulableTasks.filter(t => 
      config.focusProjects!.includes(t.projectId || '')
    );
    recommendations.push(`${focusTasks.length} task(s) from focus project(s) will be prioritized`);
  }

  return {
    totalTasks: tasks.length,
    schedulableTasks: schedulableTasks.length,
    totalMinutesNeeded,
    totalMinutesAvailable: Math.round(totalMinutesAvailable),
    utilizationPercent,
    warnings,
    recommendations,
    deadlineTasks
  };
}

/**
 * Generate smart schedule (legacy API)
 */
export async function generateSmartSchedule(
  tasks: Task[],
  config: LegacySchedulerConfig,
  workingSchedule: LegacyWorkingSchedule,
  milestones: Milestone[],
  habits: Habit[],
  projects: Project[] = []
): Promise<LegacySchedulePreview[]> {
  const newConfig = convertConfig(config, workingSchedule);
  
  const result = await scheduleAll(
    tasks,
    milestones,
    projects,
    habits,
    newConfig
  );

  return convertToLegacyPreview(result.previews);
}

/**
 * Apply a schedule preview by updating tasks in Firestore (legacy API)
 */
export async function applySchedulePreview(preview: LegacySchedulePreview): Promise<void> {
  const db = getDb();
  const userId = getCurrentUserId();
  
  for (const slot of preview.slots) {
    const taskRef = doc(db, 'users', userId, 'tasks', slot.task.id);
    await updateDoc(taskRef, {
      scheduledStart: Timestamp.fromDate(slot.startTime),
      scheduledEnd: Timestamp.fromDate(slot.endTime),
      updatedAt: Timestamp.now()
    });
  }
}

/**
 * Generate a single day schedule preview (legacy API)
 */
export async function generateSchedulePreview(
  unscheduledTasks: Task[],
  scheduledTasks: Task[],
  date: Date,
  workingHours: { start: string; end: string },
  habits: Habit[] = [],
  energyProfile?: EnergyProfile
): Promise<LegacySchedulePreview> {
  const workingSchedule: LegacyWorkingSchedule = { days: [1, 2, 3, 4, 5], hours: workingHours };
  const config: LegacySchedulerConfig = {
    ...getDefaultSchedulerConfig(workingSchedule),
    startDate: date,
    endDate: new Date(date.getTime() + 86400000), // +1 day
    energyProfile
  };

  const allTasks = [...unscheduledTasks, ...scheduledTasks];
  const previews = await generateSmartSchedule(
    allTasks,
    config,
    workingSchedule,
    [],
    habits,
    []
  );

  return previews[0] || {
    date: date,
    slots: [],
    summary: 'No tasks to schedule',
    warnings: []
  };
}

/**
 * Generate week schedule preview (legacy API)
 */
export async function generateWeekSchedulePreview(
  tasks: Task[],
  startDate: Date,
  workingSchedule: LegacyWorkingSchedule
): Promise<LegacySchedulePreview[]> {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  const config: LegacySchedulerConfig = {
    ...getDefaultSchedulerConfig(workingSchedule),
    startDate,
    endDate
  };

  return generateSmartSchedule(tasks, config, workingSchedule, [], []);
}

/**
 * Generate month schedule preview (legacy API)
 */
export async function generateMonthSchedulePreview(
  tasks: Task[],
  startDate: Date,
  workingSchedule: LegacyWorkingSchedule,
  milestones: Milestone[] = [],
  habits: Habit[] = [],
  energyProfile?: EnergyProfile
): Promise<LegacySchedulePreview[]> {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  const config: LegacySchedulerConfig = {
    ...getDefaultSchedulerConfig(workingSchedule),
    startDate,
    endDate,
    energyProfile
  };

  return generateSmartSchedule(tasks, config, workingSchedule, milestones, habits);
}

/**
 * Generate year schedule preview (legacy API)
 */
export async function generateYearSchedulePreview(
  tasks: Task[],
  startDate: Date,
  workingSchedule: LegacyWorkingSchedule,
  milestones: Milestone[] = [],
  habits: Habit[] = []
): Promise<LegacySchedulePreview[]> {
  const endDate = new Date(startDate);
  endDate.setFullYear(endDate.getFullYear() + 1);

  const config: LegacySchedulerConfig = {
    ...getDefaultSchedulerConfig(workingSchedule),
    startDate,
    endDate
  };

  return generateSmartSchedule(tasks, config, workingSchedule, milestones, habits);
}

/**
 * Unschedule all tasks (legacy API)
 * Note: Can be called with (tasks, scope) or (tasks, startDate, endDate)
 */
export async function unscheduleAllTasks(
  tasks: Task[],
  scopeOrStartDate?: 'all' | 'month' | 'year' | Date,
  endDate?: Date
): Promise<number> {
  const db = getDb();
  const userId = getCurrentUserId();
  let tasksToUnschedule = tasks.filter(t => t.scheduledStart && t.status !== 'completed');
  const today = new Date();

  // Handle scope-based filtering (legacy pattern)
  if (typeof scopeOrStartDate === 'string') {
    const scope = scopeOrStartDate;
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59);

    tasksToUnschedule = tasksToUnschedule.filter(t => {
      const scheduled = toSafeDate(t.scheduledStart);
      if (!scheduled) return false;

      if (scope === 'all') return true;
      if (scope === 'month') return scheduled >= startOfMonth && scheduled <= endOfMonth;
      if (scope === 'year') return scheduled >= startOfYear && scheduled <= endOfYear;
      return false;
    });
  } else if (scopeOrStartDate instanceof Date || endDate) {
    // Handle date range filtering
    const startDate = scopeOrStartDate as Date | undefined;
    tasksToUnschedule = tasksToUnschedule.filter(t => {
      const scheduled = toSafeDate(t.scheduledStart);
      if (!scheduled) return false;
      if (startDate && scheduled < startDate) return false;
      if (endDate && scheduled > endDate) return false;
      return true;
    });
  }

  let unscheduledCount = 0;
  for (const task of tasksToUnschedule) {
    const taskRef = doc(db, 'users', userId, 'tasks', task.id);
    await updateDoc(taskRef, {
      scheduledStart: null,
      scheduledEnd: null,
      updatedAt: Timestamp.now()
    });
    unscheduledCount++;
  }

  return unscheduledCount;
}

/**
 * Reschedule a single day (legacy API)
 */
export async function rescheduleDay(
  tasks: Task[],
  date: Date,
  workingSchedule: LegacyWorkingSchedule
): Promise<LegacySchedulePreview> {
  // First unschedule tasks for this day
  const db = getDb();
  const userId = getCurrentUserId();
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const tasksToReschedule = tasks.filter(t => {
    const scheduled = toSafeDate(t.scheduledStart);
    if (!scheduled) return false;
    return scheduled >= dayStart && scheduled <= dayEnd;
  });

  // Reset scheduled times
  for (const task of tasksToReschedule) {
    const taskRef = doc(db, 'users', userId, 'tasks', task.id);
    await updateDoc(taskRef, {
      scheduledStart: null,
      scheduledEnd: null
    });
  }

  // Re-schedule
  return generateSchedulePreview(
    tasksToReschedule,
    tasks.filter(t => !tasksToReschedule.includes(t)),
    date,
    workingSchedule.hours
  );
}

/**
 * Reschedule a week (legacy API)
 */
export async function rescheduleWeek(
  tasks: Task[],
  startDate: Date,
  workingSchedule: LegacyWorkingSchedule
): Promise<LegacySchedulePreview[]> {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);

  await unscheduleAllTasks(tasks, startDate, endDate);

  return generateWeekSchedulePreview(tasks, startDate, workingSchedule);
}

/**
 * Reschedule a month (legacy API)
 */
export async function rescheduleMonth(
  tasks: Task[],
  startDate: Date,
  workingSchedule: LegacyWorkingSchedule,
  milestones: Milestone[] = []
): Promise<LegacySchedulePreview[]> {
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);

  await unscheduleAllTasks(tasks, startDate, endDate);

  return generateMonthSchedulePreview(tasks, startDate, workingSchedule, milestones);
}

/**
 * Suggest next task to work on (legacy API)
 */
export async function suggestNextTask(
  unscheduledTasks: Task[],
  currentTime: Date = new Date()
): Promise<{ task: Task | null; reason: string }> {
  if (unscheduledTasks.length === 0) {
    return { task: null, reason: 'No unscheduled tasks available' };
  }

  // Sort by criticality factors
  const scored = unscheduledTasks.map(task => {
    let score = 0;
    const dueDate = toSafeDate(task.dueDate);
    
    // Deadline urgency
    if (dueDate) {
      const daysUntil = Math.ceil((dueDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 0) score += 100; // Overdue
      else if (daysUntil <= 1) score += 50;
      else if (daysUntil <= 3) score += 30;
      else if (daysUntil <= 7) score += 10;
    }

    // Priority
    if (task.priority === 'high') score += 25;
    else if (task.priority === 'medium') score += 10;

    // Duration - prefer shorter tasks
    const duration = task.estimatedMinutes || 30;
    if (duration <= 30) score += 15;
    else if (duration <= 60) score += 10;

    return { task, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored[0];
  let reason = 'Best fit based on priority and deadline';
  
  const dueDate = toSafeDate(top.task.dueDate);
  if (dueDate) {
    const daysUntil = Math.ceil((dueDate.getTime() - currentTime.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) reason = 'This task is overdue!';
    else if (daysUntil <= 1) reason = 'Due tomorrow - needs immediate attention';
    else if (daysUntil <= 3) reason = 'Due soon - should be prioritized';
  }

  return { task: top.task, reason };
}

// Re-export types for backwards compatibility
export type { EnergyProfile, BlockedTimeSlot };
