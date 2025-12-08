/**
 * AI Scheduling Commands
 * 
 * Comprehensive scheduling command system for the AI assistant.
 * Handles natural language scheduling requests and executes them via the smart scheduler.
 */

import type { Task, Milestone, Project, Habit } from '@totalis/shared';
import {
  scheduleAll,
  previewEmergencyInsertion,
  executeEmergencyInsertion,
  quickInsertToday,
  insertNextAvailable,
  createDefaultConfig,
  getScheduleHealthSummary,
  type SchedulerConfig,
  type SchedulingResult,
  type InsertionPreview,
  type EmergencyInsertionRequest
} from '@/lib/scheduler';
import {
  rescheduleDay,
  rescheduleWeek,
  rescheduleMonth,
  generateSchedulePreview,
  generateWeekSchedulePreview,
  generateMonthSchedulePreview,
  generateYearSchedulePreview,
  unscheduleAllTasks,
  applySchedulePreview,
  type LegacySchedulePreview,
  type LegacyWorkingSchedule
} from '@/lib/scheduler/legacy-bridge';

// ============================================================================
// COMMAND TYPES
// ============================================================================

export type SchedulingCommandType =
  | 'schedule_unscheduled'      // "Schedule my unscheduled tasks"
  | 'schedule_specific'         // "Schedule [task] for tomorrow at 2pm"
  | 'reschedule_period'         // "Reschedule my week"
  | 'optimize_schedule'         // "Optimize my overloaded schedule"
  | 'emergency_insert'          // "I need to fit in an urgent meeting"
  | 'find_time'                 // "Find time for a 2-hour task"
  | 'clear_schedule'            // "Clear my schedule for today"
  | 'analyze_schedule'          // "How does my schedule look?"
  | 'move_task'                 // "Move [task] to Thursday"
  | 'batch_schedule'            // "Schedule all my project tasks"
  | 'rebalance';                // "I'm overloaded this week, help me rebalance"

export interface SchedulingCommand {
  type: SchedulingCommandType;
  scope: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';
  targetDate?: Date;
  targetTaskIds?: string[];
  targetProjectId?: string;
  urgency?: 'normal' | 'urgent' | 'emergency';
  constraints?: {
    preferredTime?: 'morning' | 'afternoon' | 'evening';
    mustCompleteBefore?: Date;
    avoidDays?: number[]; // 0-6, Sunday-Saturday
    maxHoursPerDay?: number;
  };
  options?: {
    showPreview?: boolean;
    autoApply?: boolean;
    preserveFixed?: boolean;
  };
}

export interface SchedulingCommandResult {
  success: boolean;
  message: string;
  preview?: LegacySchedulePreview[];
  changes?: {
    scheduled: number;
    rescheduled: number;
    unscheduled: number;
    conflicts: number;
  };
  warnings?: string[];
  suggestions?: string[];
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
}

// ============================================================================
// NATURAL LANGUAGE PARSING
// ============================================================================

/**
 * Parse natural language into a scheduling command
 */
export function parseSchedulingIntent(
  message: string,
  context: {
    tasks: Task[];
    projects: Project[];
    currentDate?: Date;
  }
): SchedulingCommand | null {
  const lowerMessage = message.toLowerCase();
  const today = context.currentDate || new Date();

  // Detect command type patterns
  const patterns: Array<{
    regex: RegExp;
    type: SchedulingCommandType;
    extractor?: (match: RegExpMatchArray) => Partial<SchedulingCommand>;
  }> = [
    // Schedule unscheduled tasks
    {
      regex: /schedule\s+(all\s+)?(my\s+)?(unscheduled|pending|remaining)\s+(tasks?|items?)/i,
      type: 'schedule_unscheduled',
    },
    {
      regex: /find\s+(time|slots?|place)\s+for\s+(my\s+)?(unscheduled|pending)\s+tasks?/i,
      type: 'schedule_unscheduled',
    },
    {
      regex: /auto[- ]?schedule\s+(everything|all|my\s+tasks?)/i,
      type: 'schedule_unscheduled',
    },

    // Reschedule period
    {
      regex: /reschedule\s+(my\s+)?(today|this\s+day)/i,
      type: 'reschedule_period',
      extractor: () => ({ scope: 'day', targetDate: today }),
    },
    {
      regex: /reschedule\s+(my\s+)?(this\s+)?week/i,
      type: 'reschedule_period',
      extractor: () => ({ scope: 'week', targetDate: getStartOfWeek(today) }),
    },
    {
      regex: /reschedule\s+(my\s+)?(this\s+)?month/i,
      type: 'reschedule_period',
      extractor: () => ({ scope: 'month', targetDate: getStartOfMonth(today) }),
    },
    {
      regex: /redo\s+(my\s+)?(entire\s+)?schedule/i,
      type: 'reschedule_period',
      extractor: () => ({ scope: 'week' }),
    },
    {
      regex: /rebuild\s+(my\s+)?schedule/i,
      type: 'reschedule_period',
      extractor: () => ({ scope: 'month' }),
    },

    // Optimize overloaded schedule
    {
      regex: /(optimize|fix|improve|balance)\s+(my\s+)?(overloaded\s+)?schedule/i,
      type: 'optimize_schedule',
    },
    {
      regex: /i('m| am)\s+(overloaded|overwhelmed|swamped|too busy)/i,
      type: 'optimize_schedule',
    },
    {
      regex: /too\s+many\s+(tasks?|things?)\s+(scheduled|to do)/i,
      type: 'optimize_schedule',
    },
    {
      regex: /help\s+me\s+(rebalance|spread out|distribute)/i,
      type: 'rebalance',
    },

    // Emergency insert
    {
      regex: /(urgent|emergency|asap).*?(need|have)\s+to\s+(fit|add|schedule|insert)/i,
      type: 'emergency_insert',
      extractor: () => ({ urgency: 'emergency' as const }),
    },
    {
      regex: /(fit|squeeze|add)\s+(in\s+)?(an?\s+)?(urgent|important|critical)/i,
      type: 'emergency_insert',
      extractor: () => ({ urgency: 'urgent' as const }),
    },
    {
      regex: /something\s+(urgent|important)\s+came\s+up/i,
      type: 'emergency_insert',
      extractor: () => ({ urgency: 'emergency' as const }),
    },

    // Find time for task
    {
      regex: /find\s+(time|a?\s*slot)\s+(for|to)/i,
      type: 'find_time',
    },
    {
      regex: /when\s+can\s+i\s+(do|work on|fit in)/i,
      type: 'find_time',
    },
    {
      regex: /where\s+(should|can)\s+i\s+put/i,
      type: 'find_time',
    },

    // Clear schedule
    {
      regex: /clear\s+(my\s+)?schedule\s+(for\s+)?today/i,
      type: 'clear_schedule',
      extractor: () => ({ scope: 'day', targetDate: today }),
    },
    {
      regex: /clear\s+(my\s+)?schedule\s+(for\s+)?(this\s+)?week/i,
      type: 'clear_schedule',
      extractor: () => ({ scope: 'week' }),
    },
    {
      regex: /unschedule\s+(all|everything)/i,
      type: 'clear_schedule',
      extractor: () => ({ scope: 'all' }),
    },

    // Analyze schedule
    {
      regex: /how\s+(does|is)\s+(my\s+)?schedule\s+(look|looking)/i,
      type: 'analyze_schedule',
    },
    {
      regex: /(analyze|review|check)\s+(my\s+)?schedule/i,
      type: 'analyze_schedule',
    },
    {
      regex: /am\s+i\s+(overbooked|overloaded|too busy)/i,
      type: 'analyze_schedule',
    },

    // Move specific task
    {
      regex: /move\s+["']?(.+?)["']?\s+to\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+\w+)/i,
      type: 'move_task',
    },
    {
      regex: /reschedule\s+["']?(.+?)["']?\s+(to|for)\s+(\d{1,2}(:\d{2})?\s*(am|pm)?)/i,
      type: 'move_task',
    },

    // Batch schedule project
    {
      regex: /schedule\s+(all\s+)?(tasks?\s+(for|from|in)\s+)?["']?(.+?)["']?\s+project/i,
      type: 'batch_schedule',
    },
    {
      regex: /schedule\s+(my\s+)?["']?(.+?)["']?\s+project\s+tasks?/i,
      type: 'batch_schedule',
    },
  ];

  // Try each pattern
  for (const pattern of patterns) {
    const match = lowerMessage.match(pattern.regex);
    if (match) {
      const command: SchedulingCommand = {
        type: pattern.type,
        scope: 'week', // default scope
        options: {
          showPreview: true,
          autoApply: false,
          preserveFixed: true,
        },
        ...(pattern.extractor ? pattern.extractor(match) : {}),
      };

      // Detect scope from message
      if (lowerMessage.includes('today') || lowerMessage.includes('this day')) {
        command.scope = 'day';
        command.targetDate = today;
      } else if (lowerMessage.includes('tomorrow')) {
        command.scope = 'day';
        command.targetDate = addDays(today, 1);
      } else if (lowerMessage.includes('this week') || lowerMessage.includes('week')) {
        command.scope = 'week';
        command.targetDate = getStartOfWeek(today);
      } else if (lowerMessage.includes('this month') || lowerMessage.includes('month')) {
        command.scope = 'month';
        command.targetDate = getStartOfMonth(today);
      } else if (lowerMessage.includes('quarter')) {
        command.scope = 'quarter';
      } else if (lowerMessage.includes('year')) {
        command.scope = 'year';
      }

      // Detect time preference
      if (lowerMessage.includes('morning')) {
        command.constraints = { ...command.constraints, preferredTime: 'morning' };
      } else if (lowerMessage.includes('afternoon')) {
        command.constraints = { ...command.constraints, preferredTime: 'afternoon' };
      } else if (lowerMessage.includes('evening')) {
        command.constraints = { ...command.constraints, preferredTime: 'evening' };
      }

      return command;
    }
  }

  return null;
}

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

/**
 * Execute a scheduling command
 */
export async function executeSchedulingCommand(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    milestones: Milestone[];
    projects: Project[];
    habits: Habit[];
    workingSchedule: LegacyWorkingSchedule;
    userId: string;
  }
): Promise<SchedulingCommandResult> {
  const { tasks, milestones, projects, habits, workingSchedule } = context;
  const today = new Date();

  try {
    switch (command.type) {
      case 'schedule_unscheduled':
        return await handleScheduleUnscheduled(command, { tasks, milestones, projects, habits, workingSchedule });

      case 'reschedule_period':
        return await handleReschedulePeriod(command, { tasks, milestones, workingSchedule });

      case 'optimize_schedule':
      case 'rebalance':
        return await handleOptimizeSchedule(command, { tasks, milestones, projects, habits, workingSchedule });

      case 'emergency_insert':
        return await handleEmergencyInsert(command, { tasks, workingSchedule });

      case 'find_time':
        return await handleFindTime(command, { tasks, workingSchedule });

      case 'clear_schedule':
        return await handleClearSchedule(command, { tasks });

      case 'analyze_schedule':
        return await handleAnalyzeSchedule(command, { tasks, milestones, projects, habits, workingSchedule });

      case 'move_task':
        return await handleMoveTask(command, { tasks, workingSchedule });

      case 'batch_schedule':
        return await handleBatchSchedule(command, { tasks, milestones, projects, habits, workingSchedule });

      default:
        return {
          success: false,
          message: `Unknown scheduling command type: ${command.type}`,
        };
    }
  } catch (error) {
    console.error('Scheduling command failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Scheduling command failed',
    };
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleScheduleUnscheduled(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    milestones: Milestone[];
    projects: Project[];
    habits: Habit[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  const { tasks, milestones, projects, habits, workingSchedule } = context;
  
  const unscheduledTasks = tasks.filter(t => !t.scheduledStart && t.status !== 'completed');
  
  if (unscheduledTasks.length === 0) {
    return {
      success: true,
      message: "Great news! You don't have any unscheduled tasks. Everything is already on your calendar! 🎉",
      changes: { scheduled: 0, rescheduled: 0, unscheduled: 0, conflicts: 0 },
    };
  }

  const startDate = command.targetDate || new Date();
  let previews: LegacySchedulePreview[];

  switch (command.scope) {
    case 'day':
      const dayPreview = await generateSchedulePreview(
        unscheduledTasks,
        tasks.filter(t => t.scheduledStart),
        startDate,
        workingSchedule.hours
      );
      previews = [dayPreview];
      break;

    case 'week':
      previews = await generateWeekSchedulePreview(tasks, startDate, workingSchedule);
      break;

    case 'month':
      previews = await generateMonthSchedulePreview(tasks, startDate, workingSchedule, milestones);
      break;

    case 'year':
      previews = await generateYearSchedulePreview(tasks, startDate, workingSchedule, milestones);
      break;

    default:
      previews = await generateMonthSchedulePreview(tasks, startDate, workingSchedule, milestones);
  }

  const totalSlots = previews.reduce((sum, p) => sum + p.slots.length, 0);

  return {
    success: true,
    message: `I've prepared a schedule for ${totalSlots} task${totalSlots !== 1 ? 's' : ''} across ${previews.length} day${previews.length !== 1 ? 's' : ''}. Would you like me to apply this schedule?`,
    preview: previews,
    changes: { scheduled: totalSlots, rescheduled: 0, unscheduled: 0, conflicts: 0 },
    requiresConfirmation: true,
    confirmationMessage: 'Apply this schedule?',
    suggestions: [
      'You can review each day before confirming',
      'I can adjust the intensity if this feels too packed',
    ],
  };
}

async function handleReschedulePeriod(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    milestones: Milestone[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  const { tasks, milestones, workingSchedule } = context;
  const startDate = command.targetDate || new Date();

  let previews: LegacySchedulePreview[];
  let periodName: string;

  switch (command.scope) {
    case 'day':
      const dayPreview = await rescheduleDay(tasks, startDate, workingSchedule);
      previews = [dayPreview];
      periodName = 'today';
      break;

    case 'week':
      previews = await rescheduleWeek(tasks, startDate, workingSchedule);
      periodName = 'this week';
      break;

    case 'month':
      previews = await rescheduleMonth(tasks, startDate, workingSchedule, milestones);
      periodName = 'this month';
      break;

    default:
      previews = await rescheduleWeek(tasks, startDate, workingSchedule);
      periodName = 'the selected period';
  }

  const totalSlots = previews.reduce((sum, p) => sum + p.slots.length, 0);

  return {
    success: true,
    message: `I've rebuilt your schedule for ${periodName} with ${totalSlots} optimized task slots. The new schedule prioritizes your deadlines and balances your workload. Should I apply it?`,
    preview: previews,
    changes: { scheduled: 0, rescheduled: totalSlots, unscheduled: 0, conflicts: 0 },
    requiresConfirmation: true,
    confirmationMessage: `Apply the rescheduled ${periodName}?`,
  };
}

async function handleOptimizeSchedule(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    milestones: Milestone[];
    projects: Project[];
    habits: Habit[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  const { tasks, milestones, projects, habits, workingSchedule } = context;
  
  // Analyze current schedule health
  const config = createDefaultConfig({
    workingDays: workingSchedule.days,
    workingHoursStart: workingSchedule.hours.start,
    workingHoursEnd: workingSchedule.hours.end,
    intensityMode: 'relaxed', // Use relaxed for optimization to spread load
  });

  const result = await scheduleAll(tasks, milestones, projects, habits, config);
  const health = getScheduleHealthSummary(result);

  if (health.status === 'healthy') {
    return {
      success: true,
      message: `Your schedule looks healthy! Score: ${health.score}/100. No optimization needed right now.`,
      changes: { scheduled: 0, rescheduled: 0, unscheduled: 0, conflicts: 0 },
      suggestions: [
        'Your workload is well-balanced',
        'All deadlines appear achievable',
      ],
    };
  }

  // Generate optimized previews
  const startDate = new Date();
  const previews = await generateMonthSchedulePreview(tasks, startDate, workingSchedule, milestones);

  return {
    success: true,
    message: `I found some issues with your current schedule (Score: ${health.score}/100). ${health.issues.join('. ')}. I've created an optimized version that spreads your workload more evenly. Would you like to apply it?`,
    preview: previews,
    changes: { 
      scheduled: result.scheduledCount, 
      rescheduled: 0, 
      unscheduled: result.unscheduledCount, 
      conflicts: result.conflicts.length 
    },
    warnings: health.issues,
    requiresConfirmation: true,
    confirmationMessage: 'Apply the optimized schedule?',
    suggestions: [
      'Consider reducing scope on some tasks',
      'You might need to delegate or postpone some items',
    ],
  };
}

async function handleEmergencyInsert(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  // For now, provide guidance - actual emergency task would come from the chat
  return {
    success: true,
    message: "I understand you have an urgent item to add. Please tell me:\n\n1. What's the task or meeting?\n2. How long will it take?\n3. When does it need to happen by?\n\nI'll find the best slot and show you what would need to move to accommodate it.",
    requiresConfirmation: false,
    suggestions: [
      'You can say something like "Add a 1-hour urgent client call for today"',
      'I can show you the impact on your existing schedule before making changes',
    ],
  };
}

async function handleFindTime(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  return {
    success: true,
    message: "I can help you find the perfect time slot. What would you like to schedule?\n\nPlease tell me:\n- What's the task or activity?\n- How long do you need?\n- Any time preferences (morning, afternoon, specific day)?",
    suggestions: [
      'Example: "Find time for a 2-hour focus session this week"',
      'Example: "When can I fit in a 30-minute workout tomorrow?"',
    ],
  };
}

async function handleClearSchedule(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
  }
): Promise<SchedulingCommandResult> {
  const { tasks } = context;
  
  const scheduledTasks = tasks.filter(t => t.scheduledStart && t.status !== 'completed');
  
  if (scheduledTasks.length === 0) {
    return {
      success: true,
      message: "Your schedule is already clear - no scheduled tasks found!",
      changes: { scheduled: 0, rescheduled: 0, unscheduled: 0, conflicts: 0 },
    };
  }

  const scopeLabel = command.scope === 'all' ? 'entire schedule' : `${command.scope}'s schedule`;

  return {
    success: true,
    message: `Are you sure you want to clear your ${scopeLabel}? This will unschedule ${scheduledTasks.length} task${scheduledTasks.length !== 1 ? 's' : ''}. They won't be deleted, just moved back to your unscheduled list.`,
    changes: { scheduled: 0, rescheduled: 0, unscheduled: scheduledTasks.length, conflicts: 0 },
    requiresConfirmation: true,
    confirmationMessage: `Clear ${scopeLabel}?`,
    warnings: [`${scheduledTasks.length} tasks will be unscheduled`],
  };
}

async function handleAnalyzeSchedule(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    milestones: Milestone[];
    projects: Project[];
    habits: Habit[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  const { tasks, milestones, projects, habits, workingSchedule } = context;
  
  const config = createDefaultConfig({
    workingDays: workingSchedule.days,
    workingHoursStart: workingSchedule.hours.start,
    workingHoursEnd: workingSchedule.hours.end,
  });

  const result = await scheduleAll(tasks, milestones, projects, habits, config);
  const health = getScheduleHealthSummary(result);

  const scheduledCount = tasks.filter(t => t.scheduledStart && t.status !== 'completed').length;
  const unscheduledCount = tasks.filter(t => !t.scheduledStart && t.status !== 'completed').length;
  const overdueTasks = tasks.filter(t => {
    if (!t.dueDate || t.status === 'completed') return false;
    const due = t.dueDate instanceof Date ? t.dueDate : (t.dueDate as any)?.toDate?.();
    return due && due < new Date();
  });

  let statusEmoji = '🟢';
  let statusMessage = 'Your schedule looks healthy!';
  
  if (health.status === 'warning') {
    statusEmoji = '🟡';
    statusMessage = 'Your schedule has some concerns:';
  } else if (health.status === 'critical') {
    statusEmoji = '🔴';
    statusMessage = 'Your schedule needs attention:';
  }

  const analysis = [
    `${statusEmoji} **Schedule Health Score: ${health.score}/100**`,
    '',
    statusMessage,
    ...health.issues.map(issue => `• ${issue}`),
    '',
    `📊 **Quick Stats:**`,
    `• Scheduled tasks: ${scheduledCount}`,
    `• Unscheduled tasks: ${unscheduledCount}`,
    `• Overdue tasks: ${overdueTasks.length}`,
    `• Active projects: ${projects.filter(p => p.status === 'active').length}`,
  ].join('\n');

  const suggestions: string[] = [];
  if (unscheduledCount > 0) {
    suggestions.push(`You have ${unscheduledCount} unscheduled tasks - I can help find time for them`);
  }
  if (overdueTasks.length > 0) {
    suggestions.push(`${overdueTasks.length} task${overdueTasks.length !== 1 ? 's are' : ' is'} overdue - should we prioritize these?`);
  }
  if (health.status !== 'healthy') {
    suggestions.push('I can optimize your schedule to improve the health score');
  }

  return {
    success: true,
    message: analysis,
    warnings: health.issues,
    suggestions,
  };
}

async function handleMoveTask(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  // Task identification would come from the parsed message
  return {
    success: true,
    message: "Which task would you like to move? Please specify the task name and when you'd like to reschedule it.",
    suggestions: [
      'Example: "Move \'Quarterly Report\' to Thursday at 2pm"',
      'Example: "Reschedule my morning meeting to tomorrow"',
    ],
  };
}

async function handleBatchSchedule(
  command: SchedulingCommand,
  context: {
    tasks: Task[];
    milestones: Milestone[];
    projects: Project[];
    habits: Habit[];
    workingSchedule: LegacyWorkingSchedule;
  }
): Promise<SchedulingCommandResult> {
  const { tasks, milestones, projects, habits, workingSchedule } = context;

  // If a specific project is targeted
  if (command.targetProjectId) {
    const project = projects.find(p => p.id === command.targetProjectId);
    if (!project) {
      return {
        success: false,
        message: "I couldn't find that project. Could you specify which project you'd like to schedule?",
      };
    }

    const projectTasks = tasks.filter(t => t.projectId === project.id && !t.scheduledStart && t.status !== 'completed');
    
    if (projectTasks.length === 0) {
      return {
        success: true,
        message: `All tasks for "${project.title}" are already scheduled or completed! 🎉`,
      };
    }

    const startDate = new Date();
    const previews = await generateMonthSchedulePreview(projectTasks, startDate, workingSchedule, milestones);

    return {
      success: true,
      message: `I've prepared a schedule for ${projectTasks.length} tasks from "${project.title}". Would you like me to apply it?`,
      preview: previews,
      changes: { scheduled: projectTasks.length, rescheduled: 0, unscheduled: 0, conflicts: 0 },
      requiresConfirmation: true,
      confirmationMessage: `Schedule ${projectTasks.length} project tasks?`,
    };
  }

  return {
    success: true,
    message: "Which project would you like to schedule tasks for? Here are your active projects:\n\n" +
      projects.filter(p => p.status === 'active').map(p => `• ${p.title}`).join('\n'),
    suggestions: [
      'Say the project name and I\'ll schedule all its unscheduled tasks',
    ],
  };
}

// ============================================================================
// APPLY CONFIRMED SCHEDULE
// ============================================================================

/**
 * Apply a confirmed schedule preview
 */
export async function applyConfirmedSchedule(
  previews: LegacySchedulePreview[]
): Promise<{ success: boolean; message: string; count: number }> {
  try {
    let totalApplied = 0;
    
    for (const preview of previews) {
      await applySchedulePreview(preview);
      totalApplied += preview.slots.length;
    }

    return {
      success: true,
      message: `✅ Successfully scheduled ${totalApplied} task${totalApplied !== 1 ? 's' : ''}!`,
      count: totalApplied,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to apply schedule',
      count: 0,
    };
  }
}

/**
 * Apply a confirmed clear/unschedule operation
 */
export async function applyConfirmedClear(
  tasks: Task[],
  scope: 'all' | 'day' | 'week' | 'month' | 'year'
): Promise<{ success: boolean; message: string; count: number }> {
  try {
    // Map scope to valid unscheduleAllTasks values
    const unscheduleScope = scope === 'day' || scope === 'week' ? 'all' : scope;
    const count = await unscheduleAllTasks(tasks, unscheduleScope);
    
    return {
      success: true,
      message: `✅ Unscheduled ${count} task${count !== 1 ? 's' : ''}!`,
      count,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to clear schedule',
      count: 0,
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as start of week
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getStartOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
