/**
 * Smart Scheduler - Main Entry Point
 * 
 * A comprehensive scheduling system that:
 * - Uses multi-pass algorithm for optimal scheduling
 * - Handles conflicts and constraint relaxation
 * - Supports emergency insertions with ripple preview
 * - Learns from user behavior to improve estimates
 */

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type {
  // Core types
  SmartTask,
  TaskFlexibility,
  ClientPriority,
  TimeOfDay,
  ScheduledSession,
  
  // Scheduling state
  TimeSlot,
  DayCapacity,
  BlockSource,
  ScheduledBlock,
  SchedulerState,
  
  // Conflicts & resolutions
  Conflict,
  ConflictType,
  ConflictSeverity,
  Resolution,
  ResolutionType,
  ScheduleChange,
  
  // Warnings & recommendations
  SchedulerWarning,
  WarningType,
  Recommendation,
  RecommendationType,
  
  // Configuration
  WorkingSchedule,
  FocusBlock,
  EnergyProfile,
  BlockedTimeSlot,
  SchedulerConfig,
  IntensityMode,
  DistributionMode,
  ConflictStrategy,
  
  // Results
  SchedulePreview,
  ScheduleSlot,
  SchedulingResult,
  EmergencyInsertResult,
  RescheduleResult,
  
  // Learning & analytics
  TaskCompletionRecord,
  EstimateAdjustment,
  SchedulerAnalytics
} from './types';

// ============================================================================
// CORE SCHEDULER
// ============================================================================

export {
  scheduleAll,
  rescheduleBlock,
  previewReschedule
} from './scheduler-core';

// ============================================================================
// TASK ANALYSIS
// ============================================================================

export {
  analyzeTask,
  calculateCriticality,
  determineFlexibility,
  buildDependencyGraph,
  calculateBufferDays,
  calculateEarliestStart,
  calculateLatestEnd,
  toSafeDate,
  getWorkingDaysBetween,
  addWorkingDays
} from './task-analyzer';

// ============================================================================
// CONSTRAINT ENGINE
// ============================================================================

export {
  buildCapacityMap,
  buildDayCapacity,
  buildTimeSlots,
  findBestSlot,
  reserveSlot,
  detectAllConflicts,
  detectCollisions,
  detectOverloads,
  detectDeadlineMisses,
  timeToMinutes,
  minutesToTime,
  toDateStr,
  fromDateStr
} from './constraint-engine';

// ============================================================================
// EMERGENCY INSERTION
// ============================================================================

export {
  previewEmergencyInsertion,
  executeEmergencyInsertion,
  quickInsertToday,
  insertNextAvailable,
  type EmergencyInsertionRequest,
  type RippleEffect,
  type InsertionPreview
} from './emergency-insert';

// ============================================================================
// LEARNING MODULE
// ============================================================================

export {
  initializeLearningData,
  loadLearningData,
  saveLearningData,
  recordTaskCompletion,
  adjustEstimate,
  suggestBufferTime,
  getProductivityInsights,
  getRecommendedWorkHours,
  exportAsSchedulerHints,
  type LearningData,
  type ProductivityInsight,
  type AdjustedEstimate
} from './learning-module';

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

import type { SchedulerConfig } from './types';

/**
 * Create a default scheduler configuration
 */
export function createDefaultConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  const now = new Date();
  const twoWeeksLater = new Date(now);
  twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);

  return {
    startDate: now,
    endDate: twoWeeksLater,
    deadlineBufferDays: 2,
    strictDeadlines: true,
    allowBufferReduction: true,
    maxHoursPerDay: 8,
    targetHoursPerDay: 6,
    allowOvertime: false,
    maxOvertimeHours: 2,
    intensityMode: 'balanced',
    breaksBetweenTasksMinutes: 15,
    distributionMode: 'deadline-aware',
    batchSimilarTasks: true,
    scheduleHighFocusInPeak: true,
    autoResolveConflicts: false,
    conflictResolutionStrategy: 'interactive',
    workingDays: [1, 2, 3, 4, 5],
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    ...overrides
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import type { Task, Milestone, Project, Habit } from '@totalis/shared';
import { scheduleAll } from './scheduler-core';
import { loadLearningData, adjustEstimate } from './learning-module';

/**
 * Quick schedule helper - schedules all tasks with default config
 */
export async function quickSchedule(
  tasks: Task[],
  milestones: Milestone[],
  projects: Project[],
  habits: Habit[],
  configOverrides: Partial<SchedulerConfig> = {}
): Promise<import('./types').SchedulingResult> {
  const config = createDefaultConfig(configOverrides);
  return scheduleAll(tasks, milestones, projects, habits, config);
}

/**
 * Get adjusted estimate for a task using learning data
 */
export function getAdjustedEstimate(task: Task): {
  adjustedMinutes: number;
  confidence: number;
  reason: string;
} {
  const learningData = loadLearningData();
  const result = adjustEstimate(task, learningData);
  
  return {
    adjustedMinutes: result.adjustedMinutes,
    confidence: result.confidence,
    reason: result.reason
  };
}

/**
 * Check if the schedule has critical issues
 */
export function hasScheduleIssues(result: import('./types').SchedulingResult): boolean {
  return (
    result.unscheduledCount > 0 ||
    result.conflicts.some(c => c.severity === 'critical')
  );
}

/**
 * Get a summary of schedule health
 */
export function getScheduleHealthSummary(result: import('./types').SchedulingResult): {
  score: number;
  status: 'healthy' | 'warning' | 'critical';
  issues: string[];
} {
  let score = 100;
  const issues: string[] = [];

  // Penalize for unscheduled tasks
  if (result.unscheduledCount > 0) {
    score -= result.unscheduledCount * 5;
    issues.push(`${result.unscheduledCount} task(s) could not be scheduled`);
  }

  // Penalize for conflicts
  const criticalConflicts = result.conflicts.filter(c => c.severity === 'critical');
  const warningConflicts = result.conflicts.filter(c => c.severity === 'warning');
  
  score -= criticalConflicts.length * 15;
  score -= warningConflicts.length * 5;

  if (criticalConflicts.length > 0) {
    issues.push(`${criticalConflicts.length} critical conflict(s)`);
  }
  if (warningConflicts.length > 0) {
    issues.push(`${warningConflicts.length} warning(s)`);
  }

  // Penalize for overloaded days
  if (result.capacitySummary.overloadedDays > 0) {
    score -= result.capacitySummary.overloadedDays * 10;
    issues.push(`${result.capacitySummary.overloadedDays} overloaded day(s)`);
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    status: score >= 80 ? 'healthy' : score >= 50 ? 'warning' : 'critical',
    issues
  };
}
