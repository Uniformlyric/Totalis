/**
 * Smart Scheduler Core Types
 * Comprehensive type definitions for the intelligent scheduling system
 */

import type { Task, Milestone, Habit, Project } from '@totalis/shared';

// ============================================================================
// ENHANCED TASK TYPES
// ============================================================================

/**
 * Extended task with scheduling metadata
 */
export interface SmartTask extends Task {
  // Criticality analysis
  criticality: number;                    // 0-100 score based on multiple factors
  flexibility: TaskFlexibility;
  
  // Date constraints
  earliestStart?: Date;                   // Can't start before this
  latestEnd?: Date;                       // "Drop dead" date - absolute deadline
  idealCompletionDate?: Date;             // When we'd ideally finish
  bufferDays: number;                     // Days before deadline to target
  
  // Dependency tracking
  dependsOn: string[];                    // Task IDs this task depends on
  blocks: string[];                       // Task IDs blocked by this task
  dependencyDepth: number;                // How deep in dependency chain
  
  // Client/external factors
  clientId?: string;
  clientPriority: ClientPriority;
  isExternalDeadline: boolean;            // Can't be negotiated
  
  // Scheduling hints
  preferredTimeOfDay?: TimeOfDay;
  canBeSplit: boolean;
  minimumSessionMinutes: number;          // Min minutes if split
  maximumSessionMinutes: number;          // Max before break needed
  requiresHighFocus: boolean;
  
  // Project context
  projectCriticality?: number;            // How critical is the parent project
  milestoneOrder?: number;                // Order within milestone
  
  // Computed scheduling info
  scheduledSessions?: ScheduledSession[]; // For split tasks
}

export type TaskFlexibility = 'fixed' | 'movable' | 'splittable' | 'delegatable';
export type ClientPriority = 'vip' | 'standard' | 'internal';
export type TimeOfDay = 'early-morning' | 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * A scheduled session for a task (when task is split)
 */
export interface ScheduledSession {
  id: string;
  taskId: string;
  startTime: Date;
  endTime: Date;
  sessionNumber: number;
  totalSessions: number;
  minutesInSession: number;
}

// ============================================================================
// SCHEDULING STATE & CAPACITY
// ============================================================================

/**
 * Time slot representation
 */
export interface TimeSlot {
  start: number;                          // Minutes since midnight
  end: number;
  available: boolean;
  isPeakEnergy: boolean;
  isLowEnergy: boolean;
  source?: BlockSource;
  title?: string;
}

/**
 * Daily capacity information
 */
export interface DayCapacity {
  date: Date;
  dateStr: string;                        // YYYY-MM-DD
  totalMinutes: number;                   // Total work minutes
  availableMinutes: number;               // Currently available
  scheduledMinutes: number;               // Already scheduled
  utilization: number;                    // 0-100%
  isOverloaded: boolean;
  overtimeMinutes: number;                // Minutes over capacity
  timeSlots: TimeSlot[];
  scheduledTasks: ScheduledBlock[];
  isWorkingDay: boolean;
}

/**
 * Source of blocked time
 */
export type BlockSource = 'task' | 'habit' | 'calendar' | 'break' | 'lunch' | 'focus-block';

/**
 * A scheduled block on the calendar
 */
export interface ScheduledBlock {
  id: string;
  taskId: string;
  task: SmartTask;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  reasoning: string;
  isLocked: boolean;                      // Can't be moved by auto-scheduler
  sessionInfo?: {
    sessionNumber: number;
    totalSessions: number;
  };
}

/**
 * Full scheduler state
 */
export interface SchedulerState {
  // Task data
  allTasks: SmartTask[];
  unscheduledTasks: SmartTask[];
  scheduledTasks: SmartTask[];
  
  // Schedule data
  schedule: Map<string, DayCapacity>;     // dateStr -> DayCapacity
  scheduledBlocks: ScheduledBlock[];
  
  // Constraints
  workingSchedule: WorkingSchedule;
  blockedTime: BlockedTimeSlot[];
  energyProfile?: EnergyProfile;
  
  // Analysis results
  conflicts: Conflict[];
  warnings: SchedulerWarning[];
  recommendations: Recommendation[];
  
  // Capacity overview
  totalCapacityMinutes: number;
  totalDemandMinutes: number;
  overallUtilization: number;
  overloadedDays: string[];               // dateStr[]
  
  // Metadata
  lastUpdated: Date;
  schedulingRangeStart: Date;
  schedulingRangeEnd: Date;
}

// ============================================================================
// CONFLICTS & RESOLUTIONS
// ============================================================================

/**
 * A scheduling conflict
 */
export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  title: string;
  description: string;
  affectedTaskIds: string[];
  affectedDates: string[];                // dateStr[]
  suggestedResolutions: Resolution[];
  autoResolvable: boolean;
  autoResolveAction?: Resolution;
  createdAt: Date;
}

export type ConflictType = 
  | 'overload'                            // Day has too much work
  | 'deadline_miss'                       // Task can't be scheduled before deadline
  | 'dependency_violation'                // Task scheduled before its dependency
  | 'collision'                           // Two tasks in same time slot
  | 'insufficient_buffer'                 // Not enough buffer before deadline
  | 'split_too_small'                     // Split session too short
  | 'energy_mismatch'                     // High-focus task in low-energy slot
  | 'no_capacity';                        // No capacity in entire range

export type ConflictSeverity = 'critical' | 'warning' | 'info';

/**
 * A resolution to a conflict
 */
export interface Resolution {
  id: string;
  type: ResolutionType;
  title: string;
  description: string;
  impact: string[];                       // Human-readable impact statements
  changes: ScheduleChange[];
  preservesDeadlines: boolean;
  estimatedEffort: 'none' | 'low' | 'medium' | 'high';
}

export type ResolutionType = 
  | 'move'                                // Move task to different time
  | 'split'                               // Split task into sessions
  | 'extend_hours'                        // Work overtime
  | 'delegate'                            // Mark for delegation
  | 'reschedule_cascade'                  // Move multiple tasks
  | 'reduce_buffer'                       // Accept less buffer
  | 'compress'                            // Reduce estimated time
  | 'skip'                                // Don't schedule this task
  | 'negotiate_deadline';                 // Flag deadline needs negotiation

/**
 * A single change to the schedule
 */
export interface ScheduleChange {
  type: 'add' | 'move' | 'remove' | 'resize' | 'split';
  taskId: string;
  taskTitle: string;
  from?: {
    date: string;
    startTime: string;
    endTime: string;
  };
  to?: {
    date: string;
    startTime: string;
    endTime: string;
  };
  reason: string;
}

// ============================================================================
// WARNINGS & RECOMMENDATIONS
// ============================================================================

/**
 * A warning about the schedule
 */
export interface SchedulerWarning {
  id: string;
  type: WarningType;
  severity: 'low' | 'medium' | 'high';
  message: string;
  taskIds?: string[];
  dates?: string[];
  actionable: boolean;
  suggestedAction?: string;
}

export type WarningType = 
  | 'approaching_deadline'
  | 'high_utilization'
  | 'dependency_chain_risk'
  | 'no_buffer'
  | 'long_session'
  | 'context_switching'
  | 'project_behind';

/**
 * A recommendation for schedule improvement
 */
export interface Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  benefit: string;
  action: () => Promise<void>;
}

export type RecommendationType = 
  | 'batch_similar'
  | 'rebalance_load'
  | 'add_buffer'
  | 'optimize_energy'
  | 'reduce_context_switch';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Working schedule configuration
 */
export interface WorkingSchedule {
  days: number[];                         // 0 = Sunday, 1 = Monday, etc.
  hours: {
    start: string;                        // HH:MM format
    end: string;
  };
  lunchBreak?: {
    start: string;
    end: string;
  };
  focusBlocks?: FocusBlock[];
}

/**
 * A recurring focus block
 */
export interface FocusBlock {
  id: string;
  title: string;
  days: number[];
  startTime: string;
  endTime: string;
  taskType?: 'high-focus' | 'admin' | 'meetings' | 'creative';
}

/**
 * Energy profile configuration
 */
export interface EnergyProfile {
  type: 'morning-person' | 'night-owl' | 'steady';
  peakHours: { start: string; end: string };
  lowEnergyHours: { start: string; end: string };
}

/**
 * Blocked time slot
 */
export interface BlockedTimeSlot {
  id: string;
  date: string;                           // YYYY-MM-DD
  startMinutes: number;                   // Minutes since midnight
  endMinutes: number;
  source: BlockSource;
  title?: string;
  recurring?: boolean;
  recurrenceRule?: string;
}

// ============================================================================
// SCHEDULER CONFIGURATION
// ============================================================================

/**
 * Configuration for a scheduling run
 */
export interface SchedulerConfig {
  // Time range
  startDate: Date;
  endDate: Date;
  
  // Working hours (alternative to WorkingSchedule)
  workingDays?: number[];                 // 0 = Sunday, 6 = Saturday
  workingHoursStart?: string;             // HH:MM format
  workingHoursEnd?: string;               // HH:MM format
  lunchBreak?: {
    start: string;
    end: string;
  };
  
  // Project focus mode
  focusProjectIds?: string[];
  focusProjectRatio?: number;             // 0-1, default 0.7
  
  // Deadline handling
  deadlineBufferDays: number;             // Default 2
  strictDeadlines: boolean;               // Never schedule past due
  allowBufferReduction: boolean;          // Can reduce buffer if needed
  
  // Workload management
  maxHoursPerDay: number;
  targetHoursPerDay: number;              // For balanced load
  allowOvertime: boolean;
  maxOvertimeHours: number;
  
  // Intensity
  intensityMode: IntensityMode;
  breaksBetweenTasksMinutes: number;
  
  // Distribution
  distributionMode: DistributionMode;
  batchSimilarTasks: boolean;
  
  // Energy optimization
  energyProfile?: EnergyProfile;
  scheduleHighFocusInPeak: boolean;
  
  // Conflict handling
  autoResolveConflicts: boolean;
  conflictResolutionStrategy: ConflictStrategy;
}

export type IntensityMode = 'relaxed' | 'balanced' | 'intense' | 'deadline-driven';
export type DistributionMode = 'even' | 'front-load' | 'back-load' | 'deadline-aware';
export type ConflictStrategy = 'conservative' | 'aggressive' | 'interactive';

// ============================================================================
// SCHEDULE PREVIEW & RESULTS
// ============================================================================

/**
 * Preview of a scheduling action before applying
 */
export interface SchedulePreview {
  date: Date;
  slots: ScheduleSlot[];
  summary: string;
  warnings: string[];
}

export interface ScheduleSlot {
  task: SmartTask;
  startTime: Date;
  endTime: Date;
  reasoning: string;
  sessionInfo?: {
    sessionNumber: number;
    totalSessions: number;
  };
}

/**
 * Result of a full scheduling run
 */
export interface SchedulingResult {
  success: boolean;
  scheduledCount: number;
  unscheduledCount: number;
  
  previews: SchedulePreview[];
  conflicts: Conflict[];
  warnings: SchedulerWarning[];
  recommendations: Recommendation[];
  
  capacitySummary: {
    totalDays: number;
    workingDays: number;
    totalCapacityHours: number;
    totalDemandHours: number;
    utilization: number;
    overloadedDays: number;
  };
  
  unscheduledTasks: SmartTask[];
  unscheduledReasons: Map<string, string>;
}

/**
 * Result of an emergency insertion
 */
export interface EmergencyInsertResult {
  success: boolean;
  insertedAt: ScheduleSlot;
  cascadeChanges: ScheduleChange[];
  conflicts: Conflict[];
  warnings: string[];
}

/**
 * Result of a drag-reschedule operation
 */
export interface RescheduleResult {
  success: boolean;
  changes: ScheduleChange[];
  conflicts: Conflict[];
  deadlinesPreserved: boolean;
  warnings: string[];
}

// ============================================================================
// LEARNING & ANALYTICS
// ============================================================================

/**
 * Historical task completion data for learning
 */
export interface TaskCompletionRecord {
  taskId: string;
  estimatedMinutes: number;
  actualMinutes: number;
  scheduledDate: string;
  completedDate: string;
  wasRescheduled: boolean;
  rescheduleCount: number;
  priority: string;
  projectId?: string;
  tags: string[];
}

/**
 * Learned adjustments for estimates
 */
export interface EstimateAdjustment {
  category: string;                       // tag, project, priority, etc.
  multiplier: number;                     // e.g., 1.2 means tasks take 20% longer
  sampleSize: number;
  confidence: number;                     // 0-1
  lastUpdated: Date;
}

/**
 * Scheduling analytics
 */
export interface SchedulerAnalytics {
  averageUtilization: number;
  onTimeCompletionRate: number;
  averageEstimateAccuracy: number;
  mostProductiveTimeOfDay: TimeOfDay;
  averageReschedulesPerTask: number;
  commonConflictTypes: ConflictType[];
  estimateAdjustments: EstimateAdjustment[];
}
