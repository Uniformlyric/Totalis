/**
 * useSchedulingAssistant Hook
 * 
 * React hook that integrates AI scheduling commands with the UI.
 * Provides methods for executing scheduling actions from chat or UI.
 */

import { useState, useCallback } from 'react';
import type { Task, Milestone, Project, Habit } from '@totalis/shared';
import type { ParsedSchedulingCommand } from '@/lib/ai/gemini';
import {
  parseSchedulingIntent,
  executeSchedulingCommand,
  applyConfirmedSchedule,
  applyConfirmedClear,
  type SchedulingCommand,
  type SchedulingCommandResult,
} from '@/lib/ai/scheduling-commands';
import type { LegacySchedulePreview, LegacyWorkingSchedule } from '@/lib/scheduler/legacy-bridge';

export interface SchedulingAssistantState {
  isProcessing: boolean;
  pendingCommand: SchedulingCommand | null;
  pendingResult: SchedulingCommandResult | null;
  pendingPreviews: LegacySchedulePreview[] | null;
  error: string | null;
}

export interface UseSchedulingAssistantReturn {
  state: SchedulingAssistantState;
  
  // Process a natural language scheduling request
  processSchedulingRequest: (message: string) => Promise<SchedulingCommandResult | null>;
  
  // Execute a parsed scheduling command from AI
  executeFromAI: (command: ParsedSchedulingCommand) => Promise<SchedulingCommandResult>;
  
  // Execute a specific command type directly
  executeCommand: (command: SchedulingCommand) => Promise<SchedulingCommandResult>;
  
  // Confirm and apply a pending schedule preview
  confirmSchedule: () => Promise<void>;
  
  // Cancel a pending schedule
  cancelPending: () => void;
  
  // Quick actions
  quickActions: {
    scheduleToday: () => Promise<SchedulingCommandResult>;
    scheduleWeek: () => Promise<SchedulingCommandResult>;
    scheduleMonth: () => Promise<SchedulingCommandResult>;
    rescheduleToday: () => Promise<SchedulingCommandResult>;
    rescheduleWeek: () => Promise<SchedulingCommandResult>;
    optimizeSchedule: () => Promise<SchedulingCommandResult>;
    analyzeSchedule: () => Promise<SchedulingCommandResult>;
    clearToday: () => Promise<SchedulingCommandResult>;
  };
}

export function useSchedulingAssistant(
  context: {
    tasks: Task[];
    milestones: Milestone[];
    projects: Project[];
    habits: Habit[];
    workingSchedule: LegacyWorkingSchedule;
    userId: string;
  }
): UseSchedulingAssistantReturn {
  const [state, setState] = useState<SchedulingAssistantState>({
    isProcessing: false,
    pendingCommand: null,
    pendingResult: null,
    pendingPreviews: null,
    error: null,
  });

  const executeCommand = useCallback(async (command: SchedulingCommand): Promise<SchedulingCommandResult> => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }));
    
    try {
      const result = await executeSchedulingCommand(command, context);
      
      if (result.requiresConfirmation && result.preview) {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          pendingCommand: command,
          pendingResult: result,
          pendingPreviews: result.preview || null,
        }));
      } else {
        setState(prev => ({
          ...prev,
          isProcessing: false,
          pendingCommand: null,
          pendingResult: null,
          pendingPreviews: null,
        }));
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Scheduling failed';
      setState(prev => ({ ...prev, isProcessing: false, error: errorMessage }));
      return {
        success: false,
        message: errorMessage,
      };
    }
  }, [context]);

  const processSchedulingRequest = useCallback(async (message: string): Promise<SchedulingCommandResult | null> => {
    const command = parseSchedulingIntent(message, {
      tasks: context.tasks,
      projects: context.projects,
    });
    
    if (!command) {
      return null; // Not a scheduling request
    }
    
    return executeCommand(command);
  }, [context.tasks, context.projects, executeCommand]);

  const executeFromAI = useCallback(async (aiCommand: ParsedSchedulingCommand): Promise<SchedulingCommandResult> => {
    const command: SchedulingCommand = {
      type: aiCommand.type,
      scope: aiCommand.scope,
      targetDate: aiCommand.targetDate ? new Date(aiCommand.targetDate) : undefined,
      targetTaskIds: aiCommand.targetTaskId ? [aiCommand.targetTaskId] : undefined,
      targetProjectId: aiCommand.targetProjectId,
      urgency: aiCommand.urgency,
      constraints: aiCommand.constraints ? {
        preferredTime: aiCommand.constraints.preferredTime,
        mustCompleteBefore: aiCommand.constraints.mustCompleteBefore 
          ? new Date(aiCommand.constraints.mustCompleteBefore) 
          : undefined,
        maxHoursPerDay: aiCommand.constraints.maxHoursPerDay,
      } : undefined,
      options: {
        showPreview: true,
        autoApply: false,
        preserveFixed: true,
      },
    };
    
    return executeCommand(command);
  }, [executeCommand]);

  const confirmSchedule = useCallback(async () => {
    if (!state.pendingPreviews || !state.pendingCommand) return;
    
    setState(prev => ({ ...prev, isProcessing: true }));
    
    try {
      if (state.pendingCommand.type === 'clear_schedule') {
        // Map quarter to year for clear operations
        const clearScope = state.pendingCommand.scope === 'quarter' 
          ? 'year' 
          : state.pendingCommand.scope as 'day' | 'week' | 'month' | 'year' | 'all';
        await applyConfirmedClear(context.tasks, clearScope);
      } else {
        await applyConfirmedSchedule(state.pendingPreviews);
      }
      
      setState({
        isProcessing: false,
        pendingCommand: null,
        pendingResult: null,
        pendingPreviews: null,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to apply schedule',
      }));
    }
  }, [state.pendingPreviews, state.pendingCommand, context.tasks]);

  const cancelPending = useCallback(() => {
    setState(prev => ({
      ...prev,
      pendingCommand: null,
      pendingResult: null,
      pendingPreviews: null,
    }));
  }, []);

  // Quick action helpers
  const quickActions = {
    scheduleToday: useCallback(() => executeCommand({
      type: 'schedule_unscheduled',
      scope: 'day',
      targetDate: new Date(),
      options: { showPreview: true },
    }), [executeCommand]),
    
    scheduleWeek: useCallback(() => executeCommand({
      type: 'schedule_unscheduled',
      scope: 'week',
      options: { showPreview: true },
    }), [executeCommand]),
    
    scheduleMonth: useCallback(() => executeCommand({
      type: 'schedule_unscheduled',
      scope: 'month',
      options: { showPreview: true },
    }), [executeCommand]),
    
    rescheduleToday: useCallback(() => executeCommand({
      type: 'reschedule_period',
      scope: 'day',
      targetDate: new Date(),
      options: { showPreview: true },
    }), [executeCommand]),
    
    rescheduleWeek: useCallback(() => executeCommand({
      type: 'reschedule_period',
      scope: 'week',
      options: { showPreview: true },
    }), [executeCommand]),
    
    optimizeSchedule: useCallback(() => executeCommand({
      type: 'optimize_schedule',
      scope: 'week',
      options: { showPreview: true },
    }), [executeCommand]),
    
    analyzeSchedule: useCallback(() => executeCommand({
      type: 'analyze_schedule',
      scope: 'week',
    }), [executeCommand]),
    
    clearToday: useCallback(() => executeCommand({
      type: 'clear_schedule',
      scope: 'day',
      targetDate: new Date(),
    }), [executeCommand]),
  };

  return {
    state,
    processSchedulingRequest,
    executeFromAI,
    executeCommand,
    confirmSchedule,
    cancelPending,
    quickActions,
  };
}

/**
 * Format a scheduling result message for display
 */
export function formatSchedulingMessage(result: SchedulingCommandResult): string {
  let message = result.message;
  
  if (result.warnings && result.warnings.length > 0) {
    message += '\n\n⚠️ Warnings:\n' + result.warnings.map(w => `• ${w}`).join('\n');
  }
  
  if (result.suggestions && result.suggestions.length > 0) {
    message += '\n\n💡 Suggestions:\n' + result.suggestions.map(s => `• ${s}`).join('\n');
  }
  
  return message;
}

/**
 * Get a friendly description of a scheduling command
 */
export function describeSchedulingCommand(command: SchedulingCommand): string {
  const scopeLabels: Record<string, string> = {
    day: 'today',
    week: 'this week',
    month: 'this month',
    quarter: 'this quarter',
    year: 'this year',
    all: 'all time',
  };
  
  const scope = scopeLabels[command.scope] || command.scope;
  
  switch (command.type) {
    case 'schedule_unscheduled':
      return `Schedule unscheduled tasks for ${scope}`;
    case 'reschedule_period':
      return `Reschedule ${scope}`;
    case 'optimize_schedule':
      return `Optimize schedule for ${scope}`;
    case 'emergency_insert':
      return 'Insert emergency task';
    case 'find_time':
      return 'Find available time slot';
    case 'clear_schedule':
      return `Clear schedule for ${scope}`;
    case 'analyze_schedule':
      return `Analyze schedule for ${scope}`;
    case 'move_task':
      return 'Move task to new time';
    case 'batch_schedule':
      return 'Schedule project tasks';
    case 'rebalance':
      return `Rebalance workload for ${scope}`;
    default:
      return 'Scheduling action';
  }
}
