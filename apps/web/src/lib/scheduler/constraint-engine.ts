/**
 * Constraint Engine
 * Handles capacity calculation, conflict detection, and time slot management
 */

import type { Task, Milestone, Habit } from '@totalis/shared';
import type {
  SmartTask,
  DayCapacity,
  TimeSlot,
  BlockSource,
  BlockedTimeSlot,
  WorkingSchedule,
  EnergyProfile,
  ScheduledBlock,
  Conflict,
  ConflictType,
  ConflictSeverity,
  SchedulerWarning,
  WarningType,
} from './types';
import { toSafeDate, getToday, getWorkingDaysBetween } from './task-analyzer';

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Convert HH:MM time string to minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

/**
 * Convert minutes since midnight to HH:MM string
 */
export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Get date string in YYYY-MM-DD format
 */
export function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Parse YYYY-MM-DD to Date
 */
export function fromDateStr(dateStr: string): Date {
  const date = new Date(dateStr + 'T00:00:00');
  return date;
}

// ============================================================================
// ENERGY PROFILE
// ============================================================================

/**
 * Default energy profiles
 */
const DEFAULT_ENERGY_PROFILES: Record<string, { peak: { start: string; end: string }; low: { start: string; end: string } }> = {
  'morning-person': {
    peak: { start: '06:00', end: '11:00' },
    low: { start: '14:00', end: '16:00' },
  },
  'night-owl': {
    peak: { start: '20:00', end: '23:59' },
    low: { start: '08:00', end: '11:00' },
  },
  'steady': {
    peak: { start: '10:00', end: '12:00' },
    low: { start: '14:00', end: '15:00' },
  },
};

/**
 * Check if a time is within peak energy hours
 */
export function isInPeakHours(minutes: number, profile?: EnergyProfile): boolean {
  if (!profile) return false;
  
  const defaults = DEFAULT_ENERGY_PROFILES[profile.type] || DEFAULT_ENERGY_PROFILES['steady'];
  const peakStart = timeToMinutes(profile.peakHours?.start || defaults.peak.start);
  const peakEnd = timeToMinutes(profile.peakHours?.end || defaults.peak.end);
  
  return minutes >= peakStart && minutes <= peakEnd;
}

/**
 * Check if a time is within low energy hours
 */
export function isInLowEnergyHours(minutes: number, profile?: EnergyProfile): boolean {
  if (!profile) return false;
  
  const defaults = DEFAULT_ENERGY_PROFILES[profile.type] || DEFAULT_ENERGY_PROFILES['steady'];
  const lowStart = timeToMinutes(profile.lowEnergyHours?.start || defaults.low.start);
  const lowEnd = timeToMinutes(profile.lowEnergyHours?.end || defaults.low.end);
  
  return minutes >= lowStart && minutes <= lowEnd;
}

// ============================================================================
// BLOCKED TIME CALCULATION
// ============================================================================

/**
 * Get blocked time slots from habits for a specific date
 */
export function getHabitBlockedSlots(habits: Habit[], date: Date): BlockedTimeSlot[] {
  const dayOfWeek = date.getDay();
  const dateStr = toDateStr(date);
  
  return habits
    .filter(habit => {
      if (habit.isArchived) return false;
      if (!habit.scheduledTime) return false;
      
      if (habit.frequency === 'daily') return true;
      if (habit.frequency === 'weekly' && habit.daysOfWeek?.includes(dayOfWeek)) return true;
      if (habit.frequency === 'custom' && habit.daysOfWeek?.includes(dayOfWeek)) return true;
      
      return false;
    })
    .map(habit => {
      const startMins = timeToMinutes(habit.scheduledTime!);
      const duration = habit.estimatedMinutes || 30;
      
      return {
        id: `habit-${habit.id}-${dateStr}`,
        date: dateStr,
        startMinutes: startMins,
        endMinutes: startMins + duration,
        source: 'habit' as BlockSource,
        title: habit.title,
      };
    });
}

/**
 * Get blocked time slots from already scheduled tasks for a date
 */
export function getTaskBlockedSlots(tasks: Task[], date: Date): BlockedTimeSlot[] {
  const dateStr = toDateStr(date);
  
  return tasks
    .filter(task => {
      if (task.status === 'completed') return false;
      const scheduledDate = toSafeDate(task.scheduledStart);
      if (!scheduledDate) return false;
      return toDateStr(scheduledDate) === dateStr;
    })
    .map(task => {
      const start = toSafeDate(task.scheduledStart)!;
      const startMins = start.getHours() * 60 + start.getMinutes();
      const duration = task.estimatedMinutes || 30;
      
      return {
        id: `task-${task.id}`,
        date: dateStr,
        startMinutes: startMins,
        endMinutes: startMins + duration,
        source: 'task' as BlockSource,
        title: task.title,
      };
    });
}

/**
 * Get lunch break as blocked slot
 */
export function getLunchBlockedSlot(
  date: Date,
  lunchBreak?: { start: string; end: string }
): BlockedTimeSlot | null {
  if (!lunchBreak) return null;
  
  const dateStr = toDateStr(date);
  return {
    id: `lunch-${dateStr}`,
    date: dateStr,
    startMinutes: timeToMinutes(lunchBreak.start),
    endMinutes: timeToMinutes(lunchBreak.end),
    source: 'lunch',
    title: 'Lunch Break',
  };
}

// ============================================================================
// CAPACITY CALCULATION
// ============================================================================

/**
 * Build time slots for a day, accounting for blocked time and energy profile
 */
export function buildTimeSlots(
  workStart: number,
  workEnd: number,
  blockedSlots: BlockedTimeSlot[],
  energyProfile?: EnergyProfile
): TimeSlot[] {
  // Sort blocked slots by start time
  const sorted = [...blockedSlots].sort((a, b) => a.startMinutes - b.startMinutes);
  
  const slots: TimeSlot[] = [];
  let currentTime = workStart;
  
  for (const blocked of sorted) {
    // Skip blocks outside working hours
    if (blocked.endMinutes <= workStart || blocked.startMinutes >= workEnd) {
      continue;
    }
    
    // Clamp to working hours
    const blockStart = Math.max(blocked.startMinutes, workStart);
    const blockEnd = Math.min(blocked.endMinutes, workEnd);
    
    // Add available slot before this block
    if (currentTime < blockStart) {
      slots.push({
        start: currentTime,
        end: blockStart,
        available: true,
        isPeakEnergy: isInPeakHours(currentTime, energyProfile),
        isLowEnergy: isInLowEnergyHours(currentTime, energyProfile),
      });
    }
    
    // Add the blocked slot
    slots.push({
      start: blockStart,
      end: blockEnd,
      available: false,
      isPeakEnergy: false,
      isLowEnergy: false,
      source: blocked.source,
      title: blocked.title,
    });
    
    currentTime = Math.max(currentTime, blockEnd);
  }
  
  // Add remaining time after last block
  if (currentTime < workEnd) {
    slots.push({
      start: currentTime,
      end: workEnd,
      available: true,
      isPeakEnergy: isInPeakHours(currentTime, energyProfile),
      isLowEnergy: isInLowEnergyHours(currentTime, energyProfile),
    });
  }
  
  return slots;
}

/**
 * Calculate available minutes from time slots
 */
export function calculateAvailableMinutes(slots: TimeSlot[]): number {
  return slots
    .filter(s => s.available)
    .reduce((sum, s) => sum + (s.end - s.start), 0);
}

/**
 * Build day capacity for a specific date
 */
export function buildDayCapacity(
  date: Date,
  workingSchedule: WorkingSchedule,
  habits: Habit[],
  existingTasks: Task[],
  energyProfile?: EnergyProfile
): DayCapacity | null {
  const dayOfWeek = date.getDay();
  const dateStr = toDateStr(date);
  
  // Check if it's a working day
  if (!workingSchedule.days.includes(dayOfWeek)) {
    return null;
  }
  
  const workStart = timeToMinutes(workingSchedule.hours.start);
  const workEnd = timeToMinutes(workingSchedule.hours.end);
  const totalMinutes = workEnd - workStart;
  
  // Collect all blocked time
  const blockedSlots: BlockedTimeSlot[] = [
    ...getHabitBlockedSlots(habits, date),
    ...getTaskBlockedSlots(existingTasks, date),
  ];
  
  // Add lunch break
  const lunchSlot = getLunchBlockedSlot(date, workingSchedule.lunchBreak);
  if (lunchSlot) {
    blockedSlots.push(lunchSlot);
  }
  
  // Build time slots
  const timeSlots = buildTimeSlots(workStart, workEnd, blockedSlots, energyProfile);
  
  // Calculate capacity
  const availableMinutes = calculateAvailableMinutes(timeSlots);
  const scheduledMinutes = totalMinutes - availableMinutes;
  const utilization = totalMinutes > 0 ? (scheduledMinutes / totalMinutes) * 100 : 0;
  const isOverloaded = utilization > 100;
  const overtimeMinutes = isOverloaded ? scheduledMinutes - totalMinutes : 0;
  
  // Get scheduled tasks for this day
  const scheduledTasks: ScheduledBlock[] = existingTasks
    .filter(task => {
      const scheduledDate = toSafeDate(task.scheduledStart);
      return scheduledDate && toDateStr(scheduledDate) === dateStr;
    })
    .map(task => {
      const start = toSafeDate(task.scheduledStart)!;
      const startMins = start.getHours() * 60 + start.getMinutes();
      const duration = task.estimatedMinutes || 30;
      
      const endTime = new Date(start);
      endTime.setMinutes(endTime.getMinutes() + duration);
      
      return {
        id: `block-${task.id}`,
        taskId: task.id,
        task: task as SmartTask,
        startTime: start,
        endTime,
        durationMinutes: duration,
        reasoning: 'Already scheduled',
        isLocked: false,
      };
    });
  
  return {
    date,
    dateStr,
    totalMinutes,
    availableMinutes,
    scheduledMinutes,
    utilization,
    isOverloaded,
    overtimeMinutes,
    timeSlots,
    scheduledTasks,
    isWorkingDay: true,
  };
}

/**
 * Build capacity map for a date range
 */
export function buildCapacityMap(
  startDate: Date,
  endDate: Date,
  workingSchedule: WorkingSchedule,
  habits: Habit[],
  existingTasks: Task[],
  energyProfile?: EnergyProfile
): Map<string, DayCapacity> {
  const capacityMap = new Map<string, DayCapacity>();
  
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  
  while (current <= end) {
    const dayCapacity = buildDayCapacity(
      current,
      workingSchedule,
      habits,
      existingTasks,
      energyProfile
    );
    
    if (dayCapacity) {
      capacityMap.set(dayCapacity.dateStr, dayCapacity);
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return capacityMap;
}

// ============================================================================
// SLOT FINDING
// ============================================================================

/**
 * Find the best time slot for a task on a specific day
 */
export function findBestSlot(
  capacity: DayCapacity,
  durationMinutes: number,
  preferPeakEnergy: boolean,
  avoidPeakEnergy: boolean,
  breakAfterMinutes: number = 5
): TimeSlot | null {
  // Get available slots that can fit the task
  const suitableSlots = capacity.timeSlots.filter(
    s => s.available && (s.end - s.start) >= durationMinutes
  );
  
  if (suitableSlots.length === 0) return null;
  
  // Energy-based selection
  if (preferPeakEnergy) {
    const peakSlot = suitableSlots.find(s => s.isPeakEnergy);
    if (peakSlot) return peakSlot;
  }
  
  if (avoidPeakEnergy) {
    // Prefer low energy slots
    const lowSlot = suitableSlots.find(s => s.isLowEnergy);
    if (lowSlot) return lowSlot;
    
    // Or non-peak slots
    const nonPeakSlot = suitableSlots.find(s => !s.isPeakEnergy);
    if (nonPeakSlot) return nonPeakSlot;
  }
  
  // Default: first available slot
  return suitableSlots[0];
}

/**
 * Reserve a time slot in the capacity (marks it as used)
 */
export function reserveSlot(
  capacity: DayCapacity,
  startMinutes: number,
  durationMinutes: number,
  taskId: string,
  taskTitle: string
): void {
  const endMinutes = startMinutes + durationMinutes;
  
  // Find and update the slot
  const slotIndex = capacity.timeSlots.findIndex(
    s => s.available && s.start <= startMinutes && s.end >= endMinutes
  );
  
  if (slotIndex === -1) return;
  
  const originalSlot = capacity.timeSlots[slotIndex];
  const newSlots: TimeSlot[] = [];
  
  // Add remaining time before the reservation
  if (originalSlot.start < startMinutes) {
    newSlots.push({
      ...originalSlot,
      end: startMinutes,
    });
  }
  
  // Add the blocked slot
  newSlots.push({
    start: startMinutes,
    end: endMinutes,
    available: false,
    isPeakEnergy: false,
    isLowEnergy: false,
    source: 'task',
    title: taskTitle,
  });
  
  // Add remaining time after the reservation (with 5 min break)
  const breakTime = 5;
  if (originalSlot.end > endMinutes + breakTime) {
    newSlots.push({
      ...originalSlot,
      start: endMinutes + breakTime,
    });
  }
  
  // Replace original slot with new slots
  capacity.timeSlots.splice(slotIndex, 1, ...newSlots);
  
  // Update capacity metrics
  capacity.availableMinutes -= durationMinutes;
  capacity.scheduledMinutes += durationMinutes;
  capacity.utilization = (capacity.scheduledMinutes / capacity.totalMinutes) * 100;
  capacity.isOverloaded = capacity.utilization > 100;
  if (capacity.isOverloaded) {
    capacity.overtimeMinutes = capacity.scheduledMinutes - capacity.totalMinutes;
  }
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

let conflictIdCounter = 0;
function generateConflictId(): string {
  return `conflict-${Date.now()}-${++conflictIdCounter}`;
}

/**
 * Detect time collision conflicts
 */
export function detectCollisions(
  capacityMap: Map<string, DayCapacity>
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  for (const [dateStr, capacity] of capacityMap) {
    const scheduledBlocks = capacity.scheduledTasks;
    
    // Check for overlapping blocks
    for (let i = 0; i < scheduledBlocks.length; i++) {
      for (let j = i + 1; j < scheduledBlocks.length; j++) {
        const a = scheduledBlocks[i];
        const b = scheduledBlocks[j];
        
        const aStart = a.startTime.getTime();
        const aEnd = a.endTime.getTime();
        const bStart = b.startTime.getTime();
        const bEnd = b.endTime.getTime();
        
        // Check for overlap
        if (aStart < bEnd && aEnd > bStart) {
          conflicts.push({
            id: generateConflictId(),
            type: 'collision',
            severity: 'critical',
            title: 'Time Collision',
            description: `"${a.task.title}" and "${b.task.title}" are scheduled at overlapping times on ${dateStr}`,
            affectedTaskIds: [a.taskId, b.taskId],
            affectedDates: [dateStr],
            suggestedResolutions: [],
            autoResolvable: true,
            createdAt: new Date(),
          });
        }
      }
    }
  }
  
  return conflicts;
}

/**
 * Detect overload conflicts
 */
export function detectOverloads(
  capacityMap: Map<string, DayCapacity>,
  maxOvertimeMinutes: number = 120
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  for (const [dateStr, capacity] of capacityMap) {
    if (capacity.isOverloaded) {
      const severity: ConflictSeverity = 
        capacity.overtimeMinutes > maxOvertimeMinutes ? 'critical' : 'warning';
      
      conflicts.push({
        id: generateConflictId(),
        type: 'overload',
        severity,
        title: 'Day Overloaded',
        description: `${dateStr} is ${Math.round(capacity.overtimeMinutes)} minutes over capacity`,
        affectedTaskIds: capacity.scheduledTasks.map(t => t.taskId),
        affectedDates: [dateStr],
        suggestedResolutions: [],
        autoResolvable: severity === 'warning',
        createdAt: new Date(),
      });
    }
  }
  
  return conflicts;
}

/**
 * Detect deadline miss conflicts
 */
export function detectDeadlineMisses(
  tasks: SmartTask[],
  capacityMap: Map<string, DayCapacity>,
  today: Date = getToday()
): Conflict[] {
  const conflicts: Conflict[] = [];
  const scheduledTaskIds = new Set<string>();
  
  // Collect all scheduled task IDs
  for (const capacity of capacityMap.values()) {
    for (const block of capacity.scheduledTasks) {
      scheduledTaskIds.add(block.taskId);
    }
  }
  
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    
    const dueDate = toSafeDate(task.dueDate);
    if (!dueDate) continue;
    
    // Check if task is overdue
    if (dueDate < today && !scheduledTaskIds.has(task.id)) {
      conflicts.push({
        id: generateConflictId(),
        type: 'deadline_miss',
        severity: 'critical',
        title: 'Overdue Task',
        description: `"${task.title}" was due on ${toDateStr(dueDate)} and is not scheduled`,
        affectedTaskIds: [task.id],
        affectedDates: [toDateStr(dueDate)],
        suggestedResolutions: [],
        autoResolvable: false,
        createdAt: new Date(),
      });
      continue;
    }
    
    // Check if scheduled task is after its deadline
    if (scheduledTaskIds.has(task.id)) {
      const scheduledDate = toSafeDate(task.scheduledStart);
      if (scheduledDate && scheduledDate > dueDate) {
        conflicts.push({
          id: generateConflictId(),
          type: 'deadline_miss',
          severity: 'critical',
          title: 'Scheduled Past Deadline',
          description: `"${task.title}" is scheduled for ${toDateStr(scheduledDate)} but due on ${toDateStr(dueDate)}`,
          affectedTaskIds: [task.id],
          affectedDates: [toDateStr(scheduledDate), toDateStr(dueDate)],
          suggestedResolutions: [],
          autoResolvable: true,
          createdAt: new Date(),
        });
      }
    }
  }
  
  return conflicts;
}

/**
 * Detect dependency violation conflicts
 */
export function detectDependencyViolations(
  tasks: SmartTask[],
  capacityMap: Map<string, DayCapacity>
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  // Build scheduled date map
  const scheduledDates = new Map<string, Date>();
  for (const capacity of capacityMap.values()) {
    for (const block of capacity.scheduledTasks) {
      scheduledDates.set(block.taskId, block.startTime);
    }
  }
  
  for (const task of tasks) {
    if (task.dependsOn.length === 0) continue;
    
    const taskScheduled = scheduledDates.get(task.id);
    if (!taskScheduled) continue;
    
    for (const depId of task.dependsOn) {
      const depScheduled = scheduledDates.get(depId);
      
      // Dependency not scheduled but this task is
      if (!depScheduled) {
        const depTask = tasks.find(t => t.id === depId);
        if (depTask && depTask.status !== 'completed') {
          conflicts.push({
            id: generateConflictId(),
            type: 'dependency_violation',
            severity: 'warning',
            title: 'Dependency Not Scheduled',
            description: `"${task.title}" depends on "${depTask.title}" which is not scheduled`,
            affectedTaskIds: [task.id, depId],
            affectedDates: [toDateStr(taskScheduled)],
            suggestedResolutions: [],
            autoResolvable: true,
            createdAt: new Date(),
          });
        }
        continue;
      }
      
      // Dependency scheduled after this task
      if (depScheduled >= taskScheduled) {
        const depTask = tasks.find(t => t.id === depId);
        conflicts.push({
          id: generateConflictId(),
          type: 'dependency_violation',
          severity: 'critical',
          title: 'Dependency Order Violation',
          description: `"${task.title}" is scheduled before its dependency "${depTask?.title || depId}"`,
          affectedTaskIds: [task.id, depId],
          affectedDates: [toDateStr(taskScheduled), toDateStr(depScheduled)],
          suggestedResolutions: [],
          autoResolvable: true,
          createdAt: new Date(),
        });
      }
    }
  }
  
  return conflicts;
}

/**
 * Detect insufficient buffer conflicts
 */
export function detectInsufficientBuffer(
  tasks: SmartTask[],
  capacityMap: Map<string, DayCapacity>,
  minimumBufferDays: number = 1
): Conflict[] {
  const conflicts: Conflict[] = [];
  
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    
    const dueDate = toSafeDate(task.dueDate);
    const scheduledDate = toSafeDate(task.scheduledStart);
    
    if (!dueDate || !scheduledDate) continue;
    
    // Calculate working days between scheduled and due
    const bufferDays = getWorkingDaysBetween(scheduledDate, dueDate) - 1;
    
    if (bufferDays < minimumBufferDays && bufferDays >= 0) {
      conflicts.push({
        id: generateConflictId(),
        type: 'insufficient_buffer',
        severity: 'info',
        title: 'Low Buffer Time',
        description: `"${task.title}" has only ${bufferDays} day(s) buffer before its ${toDateStr(dueDate)} deadline`,
        affectedTaskIds: [task.id],
        affectedDates: [toDateStr(scheduledDate), toDateStr(dueDate)],
        suggestedResolutions: [],
        autoResolvable: false,
        createdAt: new Date(),
      });
    }
  }
  
  return conflicts;
}

/**
 * Run all conflict detection
 */
export function detectAllConflicts(
  tasks: SmartTask[],
  capacityMap: Map<string, DayCapacity>,
  options: {
    maxOvertimeMinutes?: number;
    minimumBufferDays?: number;
    today?: Date;
  } = {}
): Conflict[] {
  const {
    maxOvertimeMinutes = 120,
    minimumBufferDays = 1,
    today = getToday(),
  } = options;
  
  return [
    ...detectCollisions(capacityMap),
    ...detectOverloads(capacityMap, maxOvertimeMinutes),
    ...detectDeadlineMisses(tasks, capacityMap, today),
    ...detectDependencyViolations(tasks, capacityMap),
    ...detectInsufficientBuffer(tasks, capacityMap, minimumBufferDays),
  ];
}

// ============================================================================
// WARNINGS
// ============================================================================

let warningIdCounter = 0;
function generateWarningId(): string {
  return `warning-${Date.now()}-${++warningIdCounter}`;
}

/**
 * Generate warnings about the schedule
 */
export function generateWarnings(
  tasks: SmartTask[],
  capacityMap: Map<string, DayCapacity>,
  today: Date = getToday()
): SchedulerWarning[] {
  const warnings: SchedulerWarning[] = [];
  
  // High utilization warning
  let highUtilDays = 0;
  for (const capacity of capacityMap.values()) {
    if (capacity.utilization > 85 && capacity.utilization <= 100) {
      highUtilDays++;
    }
  }
  if (highUtilDays >= 3) {
    warnings.push({
      id: generateWarningId(),
      type: 'high_utilization',
      severity: 'medium',
      message: `${highUtilDays} days have over 85% utilization - consider spreading workload`,
      actionable: true,
      suggestedAction: 'Use auto-balance to redistribute tasks',
    });
  }
  
  // Approaching deadline warning
  for (const task of tasks) {
    if (task.status === 'completed') continue;
    
    const dueDate = toSafeDate(task.dueDate);
    if (!dueDate) continue;
    
    const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil <= 2 && daysUntil > 0 && !toSafeDate(task.scheduledStart)) {
      warnings.push({
        id: generateWarningId(),
        type: 'approaching_deadline',
        severity: 'high',
        message: `"${task.title}" is due in ${daysUntil} day(s) and not scheduled`,
        taskIds: [task.id],
        dates: [toDateStr(dueDate)],
        actionable: true,
        suggestedAction: 'Schedule this task immediately',
      });
    }
  }
  
  // Long session warning
  for (const capacity of capacityMap.values()) {
    for (const block of capacity.scheduledTasks) {
      if (block.durationMinutes > 180) {
        warnings.push({
          id: generateWarningId(),
          type: 'long_session',
          severity: 'low',
          message: `"${block.task.title}" is scheduled for ${Math.round(block.durationMinutes / 60)} hours - consider splitting`,
          taskIds: [block.taskId],
          dates: [capacity.dateStr],
          actionable: true,
          suggestedAction: 'Split into multiple sessions with breaks',
        });
      }
    }
  }
  
  return warnings;
}

// ============================================================================
// CAPACITY SUMMARY
// ============================================================================

/**
 * Calculate total capacity across all days
 */
export function calculateTotalCapacity(
  capacityMap: Map<string, DayCapacity>
): {
  totalDays: number;
  workingDays: number;
  totalCapacityMinutes: number;
  totalScheduledMinutes: number;
  totalAvailableMinutes: number;
  overallUtilization: number;
  overloadedDays: string[];
} {
  let totalCapacity = 0;
  let totalScheduled = 0;
  let totalAvailable = 0;
  const overloadedDays: string[] = [];
  
  for (const [dateStr, capacity] of capacityMap) {
    totalCapacity += capacity.totalMinutes;
    totalScheduled += capacity.scheduledMinutes;
    totalAvailable += capacity.availableMinutes;
    
    if (capacity.isOverloaded) {
      overloadedDays.push(dateStr);
    }
  }
  
  return {
    totalDays: capacityMap.size,
    workingDays: capacityMap.size,
    totalCapacityMinutes: totalCapacity,
    totalScheduledMinutes: totalScheduled,
    totalAvailableMinutes: totalAvailable,
    overallUtilization: totalCapacity > 0 ? (totalScheduled / totalCapacity) * 100 : 0,
    overloadedDays,
  };
}

/**
 * Find best day to schedule a task
 */
export function findBestDayForTask(
  task: SmartTask,
  capacityMap: Map<string, DayCapacity>,
  options: {
    preferIdealDate?: boolean;
    allowOvertime?: boolean;
    maxOvertimeMinutes?: number;
  } = {}
): string | null {
  const {
    preferIdealDate = true,
    allowOvertime = false,
    maxOvertimeMinutes = 120,
  } = options;
  
  const durationMinutes = task.estimatedMinutes || 30;
  const dueDate = toSafeDate(task.dueDate);
  const idealDate = task.idealCompletionDate;
  
  // Sort days chronologically
  const sortedDays = Array.from(capacityMap.keys()).sort();
  
  // First, try to find day closest to ideal date with capacity
  if (preferIdealDate && idealDate) {
    const idealDateStr = toDateStr(idealDate);
    let bestDay: string | null = null;
    let bestDistance = Infinity;
    
    for (const dateStr of sortedDays) {
      const capacity = capacityMap.get(dateStr)!;
      const dayDate = fromDateStr(dateStr);
      
      // Must be before or on due date
      if (dueDate && dayDate > dueDate) continue;
      
      // Check capacity
      const hasCapacity = capacity.availableMinutes >= durationMinutes;
      const canUseOvertime = allowOvertime && 
        (capacity.availableMinutes + maxOvertimeMinutes) >= durationMinutes;
      
      if (!hasCapacity && !canUseOvertime) continue;
      
      const distance = Math.abs(dayDate.getTime() - idealDate.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestDay = dateStr;
      }
    }
    
    if (bestDay) return bestDay;
  }
  
  // Fallback: find first day with capacity before deadline
  for (const dateStr of sortedDays) {
    const capacity = capacityMap.get(dateStr)!;
    const dayDate = fromDateStr(dateStr);
    
    // Must be before or on due date
    if (dueDate && dayDate > dueDate) continue;
    
    // Check capacity
    const hasCapacity = capacity.availableMinutes >= durationMinutes;
    const canUseOvertime = allowOvertime && 
      (capacity.availableMinutes + maxOvertimeMinutes) >= durationMinutes;
    
    if (hasCapacity || canUseOvertime) {
      return dateStr;
    }
  }
  
  // Last resort: any day with capacity (even past deadline)
  if (allowOvertime) {
    for (const dateStr of sortedDays) {
      const capacity = capacityMap.get(dateStr)!;
      if (capacity.availableMinutes + maxOvertimeMinutes >= durationMinutes) {
        return dateStr;
      }
    }
  }
  
  return null;
}
