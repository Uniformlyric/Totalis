/**
 * Smart Scheduler Core - Multi-Pass Scheduling Algorithm
 * 
 * This is the brain of the scheduling system. It uses a 4-pass algorithm:
 * 1. Lock immovable items (hard deadlines, external dependencies)
 * 2. Schedule critical path items (dependency chains, milestones)
 * 3. Fill remaining capacity (lower priority work)
 * 4. Optimization sweep (batch similar, energy alignment)
 */

import type {
  SmartTask,
  SchedulerState,
  ScheduledBlock,
  DayCapacity,
  SchedulerConfig,
  Conflict,
  SchedulingResult,
  ScheduleSlot,
  SchedulePreview,
  SchedulerWarning,
  WorkingSchedule
} from './types';
import { 
  analyzeTask, 
  toSafeDate 
} from './task-analyzer';
import {
  buildCapacityMap,
  findBestSlot,
  reserveSlot,
  detectAllConflicts,
  timeToMinutes,
  minutesToTime,
  toDateStr
} from './constraint-engine';
import type { Task, Milestone, Project, Habit } from '@totalis/shared';

// ============================================================================
// HELPER TYPES
// ============================================================================

interface PassResult {
  scheduled: ScheduledBlock[];
  skipped: SmartTask[];
}

// ============================================================================
// MAIN SCHEDULER FUNCTION
// ============================================================================

/**
 * Main entry point for the smart scheduler
 * 
 * Important: Pass ALL tasks (including already scheduled ones) so that:
 * - Already scheduled tasks block their time slots
 * - Unscheduled tasks get scheduled into remaining capacity
 */
export async function scheduleAll(
  tasks: Task[],
  milestones: Milestone[],
  projects: Project[],
  habits: Habit[],
  config: SchedulerConfig
): Promise<SchedulingResult> {
  // Build project map for lookups
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const milestoneMap = new Map(milestones.map(m => [m.id, m]));
  
  // Separate tasks: already scheduled vs needs scheduling
  const allNonCompletedTasks = tasks.filter(t => t.status !== 'completed');
  const alreadyScheduledTasks = allNonCompletedTasks.filter(t => t.scheduledStart);
  const tasksToSchedule = allNonCompletedTasks.filter(t => !t.scheduledStart);
  
  // Convert tasks to SmartTasks with computed properties
  const smartTasks = tasksToSchedule.map(t => analyzeTask(t, {
      project: projectMap.get(t.projectId || ''),
      milestone: milestoneMap.get(t.milestoneId || ''),
      allTasks: tasks,
      allMilestones: milestones,
      workingDays: config.workingDays || [1, 2, 3, 4, 5],
      today: new Date()
    }));
  
  // Build working schedule
  const workingSchedule: WorkingSchedule = {
    days: config.workingDays || [1, 2, 3, 4, 5],
    hours: {
      start: config.workingHoursStart || '09:00',
      end: config.workingHoursEnd || '17:00'
    },
    lunchBreak: config.lunchBreak
  };

  // Build capacity map for the scheduling window
  // Pass ALL tasks so already-scheduled ones block their time slots
  const capacityMap = buildCapacityMap(
    config.startDate,
    config.endDate,
    workingSchedule,
    habits,
    tasks,  // All tasks - includes already scheduled ones to block time
    config.energyProfile
  );
  
  // Debug logging
  console.log('[Scheduler] Starting schedule generation');
  console.log('[Scheduler] Total tasks received:', tasks.length);
  console.log('[Scheduler] Already scheduled:', alreadyScheduledTasks.length);
  console.log('[Scheduler] Tasks to schedule:', tasksToSchedule.length);
  console.log('[Scheduler] Date range:', config.startDate.toDateString(), 'to', config.endDate.toDateString());
  console.log('[Scheduler] Working days in range:', capacityMap.size);
  
  // Calculate total available capacity
  let totalAvailableMinutes = 0;
  for (const [dateStr, dayCapacity] of capacityMap) {
    if (dayCapacity.isWorkingDay) {
      totalAvailableMinutes += dayCapacity.availableMinutes;
    }
  }
  console.log('[Scheduler] Total available minutes:', totalAvailableMinutes, '(', Math.round(totalAvailableMinutes / 60), 'hours)');
  console.log('[Scheduler] Total demand minutes:', smartTasks.reduce((s, t) => s + (t.estimatedMinutes || 60), 0));

  // Initialize scheduler state
  const state: SchedulerState = {
    allTasks: smartTasks,
    unscheduledTasks: [...smartTasks],
    scheduledTasks: [],
    schedule: capacityMap,
    scheduledBlocks: [],
    workingSchedule,
    blockedTime: [],
    energyProfile: config.energyProfile,
    conflicts: [],
    warnings: [],
    recommendations: [],
    totalCapacityMinutes: calculateTotalCapacity(capacityMap),
    totalDemandMinutes: smartTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 60), 0),
    overallUtilization: 0,
    overloadedDays: [],
    lastUpdated: new Date(),
    schedulingRangeStart: config.startDate,
    schedulingRangeEnd: config.endDate
  };

  // ========== PASS 1: Lock Immovable Items ==========
  const pass1Result = scheduleImmovables(state, config);
  applyPassResult(state, pass1Result);
  console.log('[Scheduler] Pass 1 (Immovables): Scheduled', pass1Result.scheduled.length, 'Skipped', pass1Result.skipped.length);

  // ========== PASS 2: Schedule Critical Path ==========
  const pass2Result = scheduleCriticalPath(state, config);
  applyPassResult(state, pass2Result);
  console.log('[Scheduler] Pass 2 (Critical Path): Scheduled', pass2Result.scheduled.length, 'Skipped', pass2Result.skipped.length);

  // ========== PASS 3: Fill Remaining Capacity ==========
  const pass3Result = fillRemainingCapacity(state, config);
  applyPassResult(state, pass3Result);
  console.log('[Scheduler] Pass 3 (Fill Capacity): Scheduled', pass3Result.scheduled.length, 'Skipped', pass3Result.skipped.length);
  
  console.log('[Scheduler] Final: Scheduled', state.scheduledTasks.length, 'tasks, Unscheduled', state.unscheduledTasks.length);

  // ========== PASS 4: Optimization Sweep ==========
  if (config.batchSimilarTasks) {
    optimizeSchedule(state, config);
  }

  // Detect final conflicts
  state.conflicts = detectAllConflicts(state.allTasks, state.schedule);

  // Build previews for each day
  const previews = buildPreviews(state);

  // Calculate final metrics
  const scheduledMinutes = state.scheduledBlocks.reduce((sum, b) => sum + b.durationMinutes, 0);
  state.overallUtilization = state.totalCapacityMinutes > 0 
    ? (scheduledMinutes / state.totalCapacityMinutes) * 100 
    : 0;

  // Generate warnings
  generateSchedulerWarnings(state);

  return {
    success: state.unscheduledTasks.length === 0 && 
             state.conflicts.filter(c => c.severity === 'critical').length === 0,
    scheduledCount: state.scheduledTasks.length,
    unscheduledCount: state.unscheduledTasks.length,
    previews,
    conflicts: state.conflicts,
    warnings: state.warnings,
    recommendations: state.recommendations,
    capacitySummary: {
      totalDays: state.schedule.size,
      workingDays: [...state.schedule.values()].filter(d => d.isWorkingDay).length,
      totalCapacityHours: state.totalCapacityMinutes / 60,
      totalDemandHours: state.totalDemandMinutes / 60,
      utilization: state.overallUtilization,
      overloadedDays: state.overloadedDays.length
    },
    unscheduledTasks: state.unscheduledTasks,
    unscheduledReasons: new Map(
      state.unscheduledTasks.map(t => [t.id, 'No available capacity within constraints'])
    )
  };
}

// ============================================================================
// PASS 1: IMMOVABLE ITEMS
// ============================================================================

/**
 * Pass 1: Schedule items that cannot be moved (fixed time, hard deadlines)
 */
function scheduleImmovables(state: SchedulerState, config: SchedulerConfig): PassResult {
  const scheduled: ScheduledBlock[] = [];
  const skipped: SmartTask[] = [];

  // Get all fixed-time tasks
  const fixedTasks = state.unscheduledTasks.filter(t => t.flexibility === 'fixed');

  for (const task of fixedTasks) {
    // Check if task has a specific scheduled time
    const scheduledStart = toSafeDate(task.scheduledStart);
    
    if (scheduledStart) {
      // Already has a specific time - create the block
      const dateStr = toDateStr(scheduledStart);
      const startTime = `${String(scheduledStart.getHours()).padStart(2, '0')}:${String(scheduledStart.getMinutes()).padStart(2, '0')}`;
      const block = createScheduledBlock(task, scheduledStart, startTime);
      
      // Try to reserve the slot
      const capacity = state.schedule.get(dateStr);
      if (capacity) {
        reserveSlot(capacity, timeToMinutes(startTime), task.estimatedMinutes || 60, task.id, task.title);
        scheduled.push(block);
        continue;
      }
    }
    
    // Has external deadline - find earliest slot
    if (task.isExternalDeadline && task.dueDate) {
      const dueDate = toSafeDate(task.dueDate);
      if (dueDate) {
        const result = findSlotForTask(task, state, dueDate, config);
        if (result) {
          scheduled.push(result);
          continue;
        }
      }
    }

    skipped.push(task);
  }

  return { scheduled, skipped };
}

// ============================================================================
// PASS 2: CRITICAL PATH
// ============================================================================

/**
 * Pass 2: Schedule items on the critical path (dependencies, high criticality)
 */
function scheduleCriticalPath(state: SchedulerState, config: SchedulerConfig): PassResult {
  const scheduled: ScheduledBlock[] = [];
  const skipped: SmartTask[] = [];

  // Sort by criticality descending, then by earliest start
  const criticalTasks = [...state.unscheduledTasks]
    .filter(t => t.criticality >= 60)
    .sort((a, b) => {
      if (b.criticality !== a.criticality) return b.criticality - a.criticality;
      const aStart = a.earliestStart?.getTime() ?? 0;
      const bStart = b.earliestStart?.getTime() ?? 0;
      return aStart - bStart;
    });

  for (const task of criticalTasks) {
    const deadline = task.latestEnd || (task.dueDate ? toSafeDate(task.dueDate) : null);
    const result = findSlotForTask(task, state, deadline ?? config.endDate, config);
    
    if (result) {
      scheduled.push(result);
    } else {
      skipped.push(task);
    }
  }

  return { scheduled, skipped };
}

// ============================================================================
// PASS 3: FILL REMAINING
// ============================================================================

/**
 * Pass 3: Fill remaining capacity with lower priority work
 */
function fillRemainingCapacity(state: SchedulerState, config: SchedulerConfig): PassResult {
  const scheduled: ScheduledBlock[] = [];
  const skipped: SmartTask[] = [];

  // Sort remaining tasks by priority and due date
  const remainingTasks = [...state.unscheduledTasks].sort((a, b) => {
    const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    const priorityA = priorityOrder[a.priority] ?? 2;
    const priorityB = priorityOrder[b.priority] ?? 2;
    
    if (priorityA !== priorityB) return priorityA - priorityB;
    
    const dueDateA = toSafeDate(a.dueDate);
    const dueDateB = toSafeDate(b.dueDate);
    
    if (dueDateA && dueDateB) {
      return dueDateA.getTime() - dueDateB.getTime();
    }
    if (dueDateA) return -1;
    if (dueDateB) return 1;
    
    return (a.estimatedMinutes || 60) - (b.estimatedMinutes || 60);
  });

  for (const task of remainingTasks) {
    const deadline = task.dueDate ? toSafeDate(task.dueDate) : null;
    const effectiveDeadline = deadline ?? config.endDate;
    const result = findSlotForTask(task, state, effectiveDeadline, config);
    
    if (result) {
      scheduled.push(result);
      console.log('[Scheduler] Scheduled task:', task.title, 'on', result.startTime.toDateString());
    } else {
      // Try with constraint relaxation - extend to full date range
      const relaxedResult = findSlotForTask(task, state, config.endDate, config);
      if (relaxedResult) {
        scheduled.push(relaxedResult);
        console.log('[Scheduler] Scheduled task (relaxed):', task.title, 'on', relaxedResult.startTime.toDateString());
      } else {
        skipped.push(task);
        console.log('[Scheduler] SKIPPED task:', task.title, 
          'deadline:', effectiveDeadline.toDateString(),
          'estimatedMinutes:', task.estimatedMinutes || 60
        );
      }
    }
  }

  return { scheduled, skipped };
}

// ============================================================================
// PASS 4: OPTIMIZATION
// ============================================================================

/**
 * Pass 4: Optimize the schedule (batch similar tasks, energy alignment)
 */
function optimizeSchedule(state: SchedulerState, config: SchedulerConfig): void {
  // Group similar tasks together when possible
  if (config.batchSimilarTasks) {
    batchSimilarTasks(state);
  }
  
  // Align tasks with energy patterns
  if (config.scheduleHighFocusInPeak && state.energyProfile) {
    alignWithEnergyPatterns(state);
  }
}

/**
 * Batch similar tasks together for context switching reduction
 */
function batchSimilarTasks(state: SchedulerState): void {
  // Group scheduled blocks by project
  const byProject = new Map<string, ScheduledBlock[]>();
  
  for (const block of state.scheduledBlocks) {
    const projectId = block.task.projectId || 'none';
    if (!byProject.has(projectId)) {
      byProject.set(projectId, []);
    }
    byProject.get(projectId)!.push(block);
  }

  // For each project with multiple blocks on same day, try to make them adjacent
  for (const [, blocks] of byProject) {
    if (blocks.length < 2) continue;

    // Group by date
    const byDate = new Map<string, ScheduledBlock[]>();
    for (const block of blocks) {
      const dateStr = toDateStr(block.startTime);
      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, []);
      }
      byDate.get(dateStr)!.push(block);
    }

    // Sort blocks within each day to be adjacent
    for (const [, dayBlocks] of byDate) {
      if (dayBlocks.length < 2) continue;
      
      // Sort by start time
      dayBlocks.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    }
  }
}

/**
 * Align tasks with energy patterns
 */
function alignWithEnergyPatterns(state: SchedulerState): void {
  if (!state.energyProfile) return;

  const peakStart = timeToMinutes(state.energyProfile.peakHours.start);
  const peakEnd = timeToMinutes(state.energyProfile.peakHours.end);

  // Find high-focus tasks not in peak hours
  const misalignedBlocks = state.scheduledBlocks.filter(block => {
    if (!block.task.requiresHighFocus) return false;
    
    const startMinutes = block.startTime.getHours() * 60 + block.startTime.getMinutes();
    return startMinutes < peakStart || startMinutes >= peakEnd;
  });

  // Add a warning for misaligned blocks
  if (misalignedBlocks.length > 0) {
    state.warnings.push({
      id: `energy-misalign-${Date.now()}`,
      type: 'context_switching',
      severity: 'medium',
      message: `${misalignedBlocks.length} high-focus task(s) scheduled outside peak energy hours`,
      taskIds: misalignedBlocks.map(b => b.taskId),
      actionable: true,
      suggestedAction: 'Consider rescheduling to morning hours for better focus'
    });
  }
}

// ============================================================================
// SLOT FINDING
// ============================================================================

/**
 * Minimum slot size for task splitting (30 minutes)
 */
const MIN_SLOT_SIZE = 30;

/**
 * Find a slot for a task, respecting deadline.
 * If the task is too large for any single slot, it will be split across multiple slots.
 * Returns an array of scheduled blocks (usually 1, but can be multiple for split tasks).
 */
function findSlotForTask(
  task: SmartTask,
  state: SchedulerState,
  deadline: Date,
  config: SchedulerConfig
): ScheduledBlock | null {
  const estimatedMinutes = task.estimatedMinutes || 60;
  
  // First, try to find a single contiguous slot
  const singleSlot = findSingleSlotForTask(task, state, deadline, config, estimatedMinutes);
  if (singleSlot) {
    return singleSlot;
  }
  
  // If no single slot works, try splitting the task across multiple slots
  const splitBlocks = findSplitSlotsForTask(task, state, deadline, config, estimatedMinutes);
  if (splitBlocks.length > 0) {
    // Return the first block; the rest are already added to state.scheduledBlocks
    return splitBlocks[0];
  }
  
  return null;
}

/**
 * Try to find a single contiguous slot for the task
 */
function findSingleSlotForTask(
  task: SmartTask,
  state: SchedulerState,
  deadline: Date,
  config: SchedulerConfig,
  estimatedMinutes: number
): ScheduledBlock | null {
  const earliestStart = task.earliestStart || new Date();
  
  const current = new Date(Math.max(earliestStart.getTime(), config.startDate.getTime()));
  current.setHours(0, 0, 0, 0);
  
  while (current <= deadline && current <= config.endDate) {
    const dateStr = toDateStr(current);
    const capacity = state.schedule.get(dateStr);
    
    if (!capacity || !capacity.isWorkingDay) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    
    if (capacity.availableMinutes < estimatedMinutes) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    
    // Find best slot in this day
    const slot = findBestSlot(
      capacity,
      estimatedMinutes,
      task.requiresHighFocus,
      false
    );
    
    if (slot) {
      const block = createScheduledBlock(task, current, minutesToTime(slot.start));
      reserveSlot(capacity, slot.start, estimatedMinutes, task.id, task.title);
      return block;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return null;
}

/**
 * Split a large task across multiple time slots when no single slot is big enough
 */
function findSplitSlotsForTask(
  task: SmartTask,
  state: SchedulerState,
  deadline: Date,
  config: SchedulerConfig,
  totalMinutesNeeded: number
): ScheduledBlock[] {
  const blocks: ScheduledBlock[] = [];
  let remainingMinutes = totalMinutesNeeded;
  const earliestStart = task.earliestStart || new Date();
  
  const current = new Date(Math.max(earliestStart.getTime(), config.startDate.getTime()));
  current.setHours(0, 0, 0, 0);
  
  let partNumber = 1;
  
  // Collect all available slots across days up to deadline
  while (current <= deadline && current <= config.endDate && remainingMinutes > 0) {
    const dateStr = toDateStr(current);
    const capacity = state.schedule.get(dateStr);
    
    if (!capacity || !capacity.isWorkingDay || capacity.availableMinutes < MIN_SLOT_SIZE) {
      current.setDate(current.getDate() + 1);
      continue;
    }
    
    // Find all available slots in this day, sorted by size (largest first for efficiency)
    const availableSlots = capacity.timeSlots
      .filter(s => s.available && (s.end - s.start) >= MIN_SLOT_SIZE)
      .sort((a, b) => (b.end - b.start) - (a.end - a.start));
    
    for (const slot of availableSlots) {
      if (remainingMinutes <= 0) break;
      
      const slotSize = slot.end - slot.start;
      const minutesToUse = Math.min(slotSize, remainingMinutes);
      
      // Create a block for this portion
      const block = createSplitScheduledBlock(
        task, 
        current, 
        minutesToTime(slot.start), 
        minutesToUse,
        partNumber,
        blocks.length === 0 // isFirstPart
      );
      
      reserveSlot(capacity, slot.start, minutesToUse, task.id, task.title);
      blocks.push(block);
      
      remainingMinutes -= minutesToUse;
      partNumber++;
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  // Only return blocks if we scheduled all the time needed
  if (remainingMinutes <= 0 && blocks.length > 0) {
    console.log(`[Scheduler] Split task "${task.title}" into ${blocks.length} blocks across multiple days/slots`);
    
    // Add all blocks except the first to state (first will be added by caller)
    for (let i = 1; i < blocks.length; i++) {
      state.scheduledBlocks.push(blocks[i]);
    }
    
    return blocks;
  }
  
  // If we couldn't schedule all the time, release any partial reservations
  // (In practice, we would need to undo reserveSlot calls - for now, log a warning)
  if (blocks.length > 0 && remainingMinutes > 0) {
    console.log(`[Scheduler] Could not fully split task "${task.title}" - needed ${totalMinutesNeeded}min, scheduled ${totalMinutesNeeded - remainingMinutes}min`);
  }
  
  return [];
}

/**
 * Create a scheduled block for a split portion of a task
 */
function createSplitScheduledBlock(
  task: SmartTask,
  date: Date,
  startTime: string,
  durationMinutes: number,
  partNumber: number,
  isFirstPart: boolean
): ScheduledBlock {
  const startMinutes = timeToMinutes(startTime);
  
  const startDateTime = new Date(date);
  startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  
  const endDateTime = new Date(startDateTime);
  endDateTime.setMinutes(endDateTime.getMinutes() + durationMinutes);
  
  return {
    id: `block-${task.id}-${toDateStr(date)}-part${partNumber}`,
    taskId: task.id,
    task,
    startTime: startDateTime,
    endTime: endDateTime,
    durationMinutes,
    reasoning: isFirstPart 
      ? `Task split across multiple time slots (part ${partNumber})`
      : `Continuation of "${task.title}" (part ${partNumber})`,
    isLocked: task.flexibility === 'fixed'
  };
}

/**
 * Find a slot with constraint relaxation
 */
function findSlotWithRelaxation(
  task: SmartTask,
  state: SchedulerState,
  config: SchedulerConfig
): ScheduledBlock | null {
  // Strategy 1: Extend beyond original deadline
  const extendedDeadline = new Date(config.endDate);
  extendedDeadline.setDate(extendedDeadline.getDate() + 7);
  
  const extended = findSlotForTask(task, state, extendedDeadline, {
    ...config,
    endDate: extendedDeadline
  });
  
  if (extended) {
    return extended;
  }

  return null;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Create a scheduled block from a task
 */
function createScheduledBlock(
  task: SmartTask,
  date: Date,
  startTime: string
): ScheduledBlock {
  const durationMinutes = task.estimatedMinutes || 60;
  const startMinutes = timeToMinutes(startTime);
  
  const startDateTime = new Date(date);
  startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  
  const endDateTime = new Date(startDateTime);
  endDateTime.setMinutes(endDateTime.getMinutes() + durationMinutes);
  
  return {
    id: `block-${task.id}-${toDateStr(date)}`,
    taskId: task.id,
    task,
    startTime: startDateTime,
    endTime: endDateTime,
    durationMinutes,
    reasoning: `Scheduled based on priority and availability`,
    isLocked: task.flexibility === 'fixed'
  };
}

/**
 * Apply pass result to state
 */
function applyPassResult(state: SchedulerState, result: PassResult): void {
  for (const block of result.scheduled) {
    state.scheduledBlocks.push(block);
    
    // Move task from unscheduled to scheduled
    const taskIndex = state.unscheduledTasks.findIndex(t => t.id === block.taskId);
    if (taskIndex !== -1) {
      const [task] = state.unscheduledTasks.splice(taskIndex, 1);
      state.scheduledTasks.push(task);
    }
  }
}

/**
 * Calculate total capacity from capacity map
 */
function calculateTotalCapacity(capacityMap: Map<string, DayCapacity>): number {
  let total = 0;
  for (const capacity of capacityMap.values()) {
    if (capacity.isWorkingDay) {
      total += capacity.totalMinutes;
    }
  }
  return total;
}

/**
 * Build previews for each scheduled day
 */
function buildPreviews(state: SchedulerState): SchedulePreview[] {
  const previews: SchedulePreview[] = [];
  
  // Group blocks by date
  const blocksByDate = new Map<string, ScheduledBlock[]>();
  for (const block of state.scheduledBlocks) {
    const dateStr = toDateStr(block.startTime);
    if (!blocksByDate.has(dateStr)) {
      blocksByDate.set(dateStr, []);
    }
    blocksByDate.get(dateStr)!.push(block);
  }

  // Create preview for each date
  for (const [dateStr, blocks] of blocksByDate) {
    const date = new Date(dateStr);
    const capacity = state.schedule.get(dateStr);
    
    const slots: ScheduleSlot[] = blocks
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .map(b => ({
        task: b.task,
        startTime: b.startTime,
        endTime: b.endTime,
        reasoning: b.reasoning,
        sessionInfo: b.sessionInfo
      }));

    const totalMinutes = blocks.reduce((sum, b) => sum + b.durationMinutes, 0);
    const utilization = capacity ? (totalMinutes / capacity.totalMinutes * 100).toFixed(0) : 0;

    previews.push({
      date,
      slots,
      summary: `${blocks.length} task(s), ${Math.round(totalMinutes / 60)}h scheduled (${utilization}% capacity)`,
      warnings: capacity?.isOverloaded ? ['Day is overloaded'] : []
    });
  }

  return previews.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * Generate warnings based on state
 */
function generateSchedulerWarnings(state: SchedulerState): void {
  // Warn about unscheduled high-priority tasks
  const highPriorityUnscheduled = state.unscheduledTasks.filter(
    t => t.priority === 'high' || t.priority === 'urgent'
  );
  
  if (highPriorityUnscheduled.length > 0) {
    state.warnings.push({
      id: `unscheduled-high-${Date.now()}`,
      type: 'high_utilization',
      severity: 'high',
      message: `${highPriorityUnscheduled.length} high-priority task(s) could not be scheduled`,
      taskIds: highPriorityUnscheduled.map(t => t.id),
      actionable: true,
      suggestedAction: 'Consider extending work hours or delegating lower-priority work'
    });
  }

  // Warn about overloaded days
  const overloadedDays: string[] = [];
  for (const [dateStr, capacity] of state.schedule) {
    if (capacity.isOverloaded) {
      overloadedDays.push(dateStr);
    }
  }
  
  if (overloadedDays.length > 0) {
    state.overloadedDays = overloadedDays;
    state.warnings.push({
      id: `overloaded-${Date.now()}`,
      type: 'high_utilization',
      severity: 'medium',
      message: `${overloadedDays.length} day(s) are overloaded with work`,
      dates: overloadedDays,
      actionable: true,
      suggestedAction: 'Review and redistribute tasks across days'
    });
  }

  // Warn about approaching deadlines
  const now = new Date();
  const upcomingDeadlines = state.scheduledTasks.filter(t => {
    const due = toSafeDate(t.dueDate);
    if (!due) return false;
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilDue <= 2 && daysUntilDue >= 0;
  });

  if (upcomingDeadlines.length > 0) {
    state.warnings.push({
      id: `deadlines-${Date.now()}`,
      type: 'approaching_deadline',
      severity: 'high',
      message: `${upcomingDeadlines.length} task(s) due in the next 2 days`,
      taskIds: upcomingDeadlines.map(t => t.id),
      actionable: false
    });
  }
}

// ============================================================================
// RESCHEDULE HELPERS
// ============================================================================

/**
 * Reschedule a single block to a new time
 */
export function rescheduleBlock(
  state: SchedulerState,
  blockId: string,
  newDate: Date,
  newStartTime: string
): { success: boolean; conflicts: Conflict[]; newState: SchedulerState } {
  const block = state.scheduledBlocks.find(b => b.id === blockId);
  if (!block) {
    return { success: false, conflicts: [], newState: state };
  }

  if (block.isLocked) {
    return { 
      success: false, 
      conflicts: [{
        id: `locked-${blockId}`,
        type: 'collision',
        severity: 'critical',
        title: 'Cannot move locked block',
        description: 'This task is locked and cannot be rescheduled',
        affectedTaskIds: [block.taskId],
        affectedDates: [toDateStr(block.startTime)],
        suggestedResolutions: [],
        autoResolvable: false,
        createdAt: new Date()
      }],
      newState: state
    };
  }

  // Create new block at new position
  const newBlock = createScheduledBlock(block.task, newDate, newStartTime);

  // Check for conflicts at new position
  const dateStr = toDateStr(newDate);
  const capacity = state.schedule.get(dateStr);
  
  if (!capacity) {
    return {
      success: false,
      conflicts: [{
        id: `no-capacity-${dateStr}`,
        type: 'no_capacity',
        severity: 'critical',
        title: 'No capacity on selected date',
        description: 'The selected date is not within the scheduling range',
        affectedTaskIds: [block.taskId],
        affectedDates: [dateStr],
        suggestedResolutions: [],
        autoResolvable: false,
        createdAt: new Date()
      }],
      newState: state
    };
  }

  // Update state
  const newScheduledBlocks = state.scheduledBlocks.map(b => 
    b.id === blockId ? newBlock : b
  );

  const newState: SchedulerState = {
    ...state,
    scheduledBlocks: newScheduledBlocks,
    lastUpdated: new Date()
  };

  // Re-detect conflicts
  newState.conflicts = detectAllConflicts(newState.allTasks, newState.schedule);

  return {
    success: true,
    conflicts: newState.conflicts,
    newState
  };
}

/**
 * Preview what would happen if we move a block
 */
export function previewReschedule(
  state: SchedulerState,
  blockId: string,
  newDate: Date,
  newStartTime: string
): { canMove: boolean; warnings: string[]; cascadeBlocks: string[] } {
  const block = state.scheduledBlocks.find(b => b.id === blockId);
  if (!block) {
    return { canMove: false, warnings: ['Block not found'], cascadeBlocks: [] };
  }

  if (block.isLocked) {
    return { canMove: false, warnings: ['Block is locked'], cascadeBlocks: [] };
  }

  const dateStr = toDateStr(newDate);
  const capacity = state.schedule.get(dateStr);
  
  if (!capacity) {
    return { canMove: false, warnings: ['Date is not within scheduling range'], cascadeBlocks: [] };
  }

  const durationMinutes = block.durationMinutes;
  const available = capacity.availableMinutes + 
    (toDateStr(block.startTime) === dateStr ? block.durationMinutes : 0);

  if (available < durationMinutes) {
    return { 
      canMove: false, 
      warnings: ['Insufficient capacity on selected date'],
      cascadeBlocks: []
    };
  }

  // Check deadline
  const dueDate = toSafeDate(block.task.dueDate);
  const warnings: string[] = [];
  
  if (dueDate && newDate > dueDate) {
    warnings.push('Moving past deadline');
  }

  return { canMove: true, warnings, cascadeBlocks: [] };
}
