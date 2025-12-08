/**
 * Emergency Insertion Module
 * 
 * Handles inserting urgent/high-priority tasks into an existing schedule
 * with cascade rescheduling and ripple effect preview.
 */

import type {
  SmartTask,
  SchedulerState,
  ScheduledBlock,
  Conflict,
  DayCapacity,
  EmergencyInsertResult,
  ScheduleChange,
  ScheduleSlot
} from './types';
import {
  findBestSlot,
  reserveSlot,
  detectAllConflicts,
  timeToMinutes,
  minutesToTime,
  toDateStr
} from './constraint-engine';
import { analyzeTask, toSafeDate } from './task-analyzer';
import type { Task, Project, Milestone } from '@totalis/shared';

// ============================================================================
// TYPES
// ============================================================================

export interface EmergencyInsertionRequest {
  task: Task;
  project?: Project;
  milestone?: Milestone;
  targetDate?: Date;              // Preferred date (defaults to today/tomorrow)
  targetTime?: string;            // Preferred time (defaults to first available)
  mustComplete: boolean;          // If true, will push other items aggressively
  maxDaysToDefer?: number;        // How far out we can push other items
}

export interface RippleEffect {
  originalBlock: ScheduledBlock;
  newStartTime: Date;
  newEndTime: Date;
  deferredByMinutes: number;
  severity: 'minor' | 'moderate' | 'significant';
  impactDescription: string;
}

export interface InsertionPreview {
  canInsert: boolean;
  proposedSlot: ScheduleSlot | null;
  rippleEffects: RippleEffect[];
  conflicts: Conflict[];
  warnings: string[];
  totalItemsAffected: number;
  summary: string;
}

// ============================================================================
// PREVIEW INSERTION
// ============================================================================

/**
 * Preview what would happen if we insert an urgent task
 * This shows the ripple effect before committing
 */
export function previewEmergencyInsertion(
  request: EmergencyInsertionRequest,
  state: SchedulerState
): InsertionPreview {
  const { task, project, milestone, targetDate, targetTime, mustComplete, maxDaysToDefer = 7 } = request;
  const warnings: string[] = [];
  
  // Analyze the incoming task
  const smartTask = analyzeTask(task, { project, milestone });
  const requiredMinutes = smartTask.estimatedMinutes || 60;

  // Determine target date
  const insertDate = targetDate || getNextAvailableDate(state);
  const dateStr = toDateStr(insertDate);
  
  // Get capacity for target date
  const capacity = state.schedule.get(dateStr);
  if (!capacity) {
    return {
      canInsert: false,
      proposedSlot: null,
      rippleEffects: [],
      conflicts: [],
      warnings: ['Target date is outside scheduling range'],
      totalItemsAffected: 0,
      summary: 'Cannot insert task - date not in schedule'
    };
  }

  // Try to find a clean slot first (no displacement needed)
  const cleanSlot = findBestSlot(
    capacity,
    requiredMinutes,
    smartTask.requiresHighFocus,
    false
  );

  if (cleanSlot && !mustComplete) {
    const proposedSlot = createSlotFromTimeRange(smartTask, insertDate, cleanSlot.start, requiredMinutes);
    
    return {
      canInsert: true,
      proposedSlot,
      rippleEffects: [],
      conflicts: [],
      warnings: [],
      totalItemsAffected: 0,
      summary: `Task can be scheduled at ${minutesToTime(cleanSlot.start)} without affecting other items`
    };
  }

  // Need to displace items - calculate ripple effects
  const targetStartMinutes = targetTime ? timeToMinutes(targetTime) : getWorkStartMinutes(state);
  const rippleEffects = calculateRippleEffects(
    smartTask,
    insertDate,
    targetStartMinutes,
    requiredMinutes,
    state,
    maxDaysToDefer
  );

  // Check for deadline violations in ripple effects
  for (const effect of rippleEffects) {
    const blockTask = effect.originalBlock.task;
    const dueDate = toSafeDate(blockTask.dueDate);
    
    if (dueDate && effect.newEndTime > dueDate) {
      warnings.push(`"${blockTask.title}" will miss its deadline if moved`);
    }
  }

  const proposedSlot = createSlotFromTimeRange(smartTask, insertDate, targetStartMinutes, requiredMinutes);

  return {
    canInsert: mustComplete || rippleEffects.every(r => r.severity !== 'significant'),
    proposedSlot,
    rippleEffects,
    conflicts: [],
    warnings,
    totalItemsAffected: rippleEffects.length,
    summary: buildInsertionSummary(rippleEffects, proposedSlot)
  };
}

// ============================================================================
// EXECUTE INSERTION
// ============================================================================

/**
 * Execute emergency insertion with cascade rescheduling
 */
export function executeEmergencyInsertion(
  request: EmergencyInsertionRequest,
  state: SchedulerState
): EmergencyInsertResult {
  const preview = previewEmergencyInsertion(request, state);

  if (!preview.canInsert || !preview.proposedSlot) {
    return {
      success: false,
      insertedAt: preview.proposedSlot!,
      cascadeChanges: [],
      conflicts: preview.conflicts,
      warnings: preview.warnings
    };
  }

  const cascadeChanges: ScheduleChange[] = [];

  // Apply ripple effects
  for (const effect of preview.rippleEffects) {
    const block = state.scheduledBlocks.find(b => b.id === effect.originalBlock.id);
    if (block) {
      const oldDateStr = toDateStr(block.startTime);
      const newDateStr = toDateStr(effect.newStartTime);
      
      cascadeChanges.push({
        type: 'move',
        taskId: block.taskId,
        taskTitle: block.task.title,
        from: {
          date: oldDateStr,
          startTime: formatTime(block.startTime),
          endTime: formatTime(block.endTime)
        },
        to: {
          date: newDateStr,
          startTime: formatTime(effect.newStartTime),
          endTime: formatTime(effect.newEndTime)
        },
        reason: 'Moved to accommodate emergency task'
      });

      // Update block in state
      block.startTime = effect.newStartTime;
      block.endTime = effect.newEndTime;
    }
  }

  // Create the new block for the emergency task
  const smartTask = analyzeTask(request.task, { project: request.project, milestone: request.milestone });
  const insertDate = request.targetDate || getNextAvailableDate(state);
  const startTime = request.targetTime || minutesToTime(getWorkStartMinutes(state));
  
  const newBlock = createScheduledBlock(smartTask, insertDate, startTime);
  newBlock.reasoning = '🚨 Emergency insertion';
  newBlock.isLocked = true; // Lock emergency items
  
  state.scheduledBlocks.push(newBlock);

  // Re-detect conflicts
  const conflicts = detectAllConflicts(state.allTasks, state.schedule);

  return {
    success: true,
    insertedAt: preview.proposedSlot,
    cascadeChanges,
    conflicts,
    warnings: preview.warnings
  };
}

// ============================================================================
// RIPPLE CALCULATION
// ============================================================================

/**
 * Calculate ripple effects of inserting a task
 */
function calculateRippleEffects(
  emergencyTask: SmartTask,
  targetDate: Date,
  targetStartMinutes: number,
  requiredMinutes: number,
  state: SchedulerState,
  _maxDaysToDefer: number
): RippleEffect[] {
  const rippleEffects: RippleEffect[] = [];
  const dateStr = toDateStr(targetDate);
  
  // Get blocks on the target date
  const dayBlocks = state.scheduledBlocks
    .filter(b => toDateStr(b.startTime) === dateStr)
    .filter(b => !b.isLocked)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const insertEnd = targetStartMinutes + requiredMinutes;

  // Find blocks that overlap with our insertion window
  for (const block of dayBlocks) {
    const blockStart = block.startTime.getHours() * 60 + block.startTime.getMinutes();
    const blockEnd = blockStart + block.durationMinutes;
    
    // Check overlap
    if (blockStart < insertEnd && blockEnd > targetStartMinutes) {
      // This block needs to move
      const newStartMinutes = insertEnd;
      const newEndMinutes = newStartMinutes + block.durationMinutes;
      const deferredByMinutes = newStartMinutes - blockStart;
      
      const newStartTime = new Date(targetDate);
      newStartTime.setHours(Math.floor(newStartMinutes / 60), newStartMinutes % 60, 0, 0);
      
      const newEndTime = new Date(targetDate);
      newEndTime.setHours(Math.floor(newEndMinutes / 60), newEndMinutes % 60, 0, 0);
      
      rippleEffects.push({
        originalBlock: block,
        newStartTime,
        newEndTime,
        deferredByMinutes,
        severity: deferredByMinutes > 120 ? 'significant' : deferredByMinutes > 60 ? 'moderate' : 'minor',
        impactDescription: `Moved ${Math.round(deferredByMinutes / 60)}h later on same day`
      });
    }
  }

  return rippleEffects;
}

// ============================================================================
// HELPERS
// ============================================================================

function getNextAvailableDate(state: SchedulerState): Date {
  const now = new Date();
  const currentHour = now.getHours();
  
  // If past 4 PM, use tomorrow
  if (currentHour >= 16) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }
  
  return now;
}

function getWorkStartMinutes(state: SchedulerState): number {
  return timeToMinutes(state.workingSchedule.hours.start);
}

function createSlotFromTimeRange(
  task: SmartTask,
  date: Date,
  startMinutes: number,
  durationMinutes: number
): ScheduleSlot {
  const startTime = new Date(date);
  startTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + durationMinutes);
  
  return {
    task,
    startTime,
    endTime,
    reasoning: 'Emergency insertion'
  };
}

function createScheduledBlock(
  task: SmartTask,
  date: Date,
  startTime: string
): ScheduledBlock {
  const startMinutes = timeToMinutes(startTime);
  const durationMinutes = task.estimatedMinutes || 60;
  
  const startDateTime = new Date(date);
  startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  
  const endDateTime = new Date(startDateTime);
  endDateTime.setMinutes(endDateTime.getMinutes() + durationMinutes);
  
  return {
    id: `emergency-${task.id}-${Date.now()}`,
    taskId: task.id,
    task,
    startTime: startDateTime,
    endTime: endDateTime,
    durationMinutes,
    reasoning: 'Emergency insertion',
    isLocked: false
  };
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function buildInsertionSummary(rippleEffects: RippleEffect[], slot: ScheduleSlot | null): string {
  if (!slot) return 'Cannot insert task';
  
  const parts: string[] = [];
  parts.push(`Task scheduled for ${formatTime(slot.startTime)}`);
  
  if (rippleEffects.length > 0) {
    const minor = rippleEffects.filter(r => r.severity === 'minor').length;
    const moderate = rippleEffects.filter(r => r.severity === 'moderate').length;
    const significant = rippleEffects.filter(r => r.severity === 'significant').length;
    
    const impactParts: string[] = [];
    if (significant > 0) impactParts.push(`${significant} significantly delayed`);
    if (moderate > 0) impactParts.push(`${moderate} moderately affected`);
    if (minor > 0) impactParts.push(`${minor} slightly moved`);
    
    if (impactParts.length > 0) {
      parts.push(`Impact: ${impactParts.join(', ')}`);
    }
  }

  return parts.join('. ');
}

// ============================================================================
// QUICK HELPERS
// ============================================================================

/**
 * Quick insert for truly urgent items - finds first available slot today
 */
export function quickInsertToday(
  task: Task,
  state: SchedulerState,
  project?: Project
): EmergencyInsertResult {
  return executeEmergencyInsertion(
    {
      task,
      project,
      targetDate: new Date(),
      mustComplete: true,
      maxDaysToDefer: 3
    },
    state
  );
}

/**
 * Insert at next available slot without displacing anything
 */
export function insertNextAvailable(
  task: Task,
  state: SchedulerState,
  project?: Project
): EmergencyInsertResult {
  const smartTask = analyzeTask(task, { project });
  const requiredMinutes = smartTask.estimatedMinutes || 60;

  // Search for first available slot
  const sortedDates = [...state.schedule.keys()].sort();
  
  for (const dateStr of sortedDates) {
    const capacity = state.schedule.get(dateStr)!;
    
    if (capacity.isWorkingDay && capacity.availableMinutes >= requiredMinutes) {
      const slot = findBestSlot(capacity, requiredMinutes, false, false);
      
      if (slot) {
        const date = new Date(dateStr);
        const proposedSlot = createSlotFromTimeRange(smartTask, date, slot.start, requiredMinutes);
        
        // Create the block
        const newBlock = createScheduledBlock(smartTask, date, minutesToTime(slot.start));
        state.scheduledBlocks.push(newBlock);
        
        // Reserve the slot
        reserveSlot(capacity, slot.start, requiredMinutes, task.id, task.title);
        
        return {
          success: true,
          insertedAt: proposedSlot,
          cascadeChanges: [],
          conflicts: [],
          warnings: []
        };
      }
    }
  }

  return {
    success: false,
    insertedAt: null as any,
    cascadeChanges: [],
    conflicts: [],
    warnings: ['No available slots in scheduling range']
  };
}
