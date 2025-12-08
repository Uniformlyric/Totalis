/**
 * Task Analysis Engine
 * Analyzes tasks to compute criticality, dependencies, and scheduling metadata
 */

import type { Task, Milestone, Project } from '@totalis/shared';
import type { 
  SmartTask, 
  TaskFlexibility, 
  ClientPriority, 
  TimeOfDay,
  EnergyProfile 
} from './types';

// ============================================================================
// DATE UTILITIES
// ============================================================================

/**
 * Safely convert Firestore Timestamp or date string to Date
 */
export function toSafeDate(value: unknown): Date | null {
  if (!value) return null;
  try {
    if (typeof value === 'object' && value !== null && 'toDate' in value) {
      return (value as { toDate: () => Date }).toDate();
    }
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * Get the number of working days between two dates
 */
export function getWorkingDaysBetween(
  start: Date, 
  end: Date, 
  workingDays: number[] = [1, 2, 3, 4, 5]
): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  
  const endDate = new Date(end);
  endDate.setHours(23, 59, 59, 999);
  
  while (current <= endDate) {
    if (workingDays.includes(current.getDay())) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Add working days to a date
 */
export function addWorkingDays(
  date: Date, 
  days: number, 
  workingDays: number[] = [1, 2, 3, 4, 5]
): Date {
  const result = new Date(date);
  let added = 0;
  const direction = days >= 0 ? 1 : -1;
  const targetDays = Math.abs(days);
  
  while (added < targetDays) {
    result.setDate(result.getDate() + direction);
    if (workingDays.includes(result.getDay())) {
      added++;
    }
  }
  
  return result;
}

/**
 * Get today's date at midnight
 */
export function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// ============================================================================
// CRITICALITY SCORING
// ============================================================================

/**
 * Priority weights for criticality calculation
 */
const PRIORITY_WEIGHTS = {
  urgent: 40,
  high: 30,
  medium: 15,
  low: 5,
};

/**
 * Client priority weights
 */
const CLIENT_PRIORITY_WEIGHTS = {
  vip: 20,
  standard: 10,
  internal: 5,
};

/**
 * Calculate criticality score for a task (0-100)
 * Higher score = more critical = should be scheduled first
 */
export function calculateCriticality(
  task: Task,
  project?: Project,
  milestone?: Milestone,
  today: Date = getToday()
): number {
  let score = 0;
  
  // 1. Priority component (0-40 points)
  const priority = task.priority as keyof typeof PRIORITY_WEIGHTS || 'medium';
  score += PRIORITY_WEIGHTS[priority] || 15;
  
  // 2. Deadline urgency component (0-30 points)
  const dueDate = toSafeDate(task.dueDate);
  if (dueDate) {
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) {
      // Overdue - maximum urgency
      score += 30;
    } else if (daysUntilDue === 0) {
      // Due today
      score += 28;
    } else if (daysUntilDue <= 1) {
      score += 25;
    } else if (daysUntilDue <= 3) {
      score += 20;
    } else if (daysUntilDue <= 7) {
      score += 15;
    } else if (daysUntilDue <= 14) {
      score += 10;
    } else if (daysUntilDue <= 30) {
      score += 5;
    }
    // > 30 days = 0 additional points
  }
  
  // 3. Project criticality component (0-15 points)
  if (project) {
    // Behind-schedule projects get priority
    if (project.progress !== undefined && project.taskCount > 0) {
      const expectedProgress = calculateExpectedProgress(project, today);
      const behindBy = expectedProgress - (project.progress || 0);
      if (behindBy > 20) score += 15;
      else if (behindBy > 10) score += 10;
      else if (behindBy > 0) score += 5;
    }
  }
  
  // 4. Milestone order component (0-10 points)
  if (milestone) {
    // Earlier milestones are more critical
    if (milestone.order === 1) score += 10;
    else if (milestone.order === 2) score += 7;
    else if (milestone.order <= 4) score += 4;
  }
  
  // 5. Dependency component (0-5 points)
  // Tasks that block other tasks are more critical
  if (task.blocking && task.blocking.length > 0) {
    score += Math.min(5, task.blocking.length * 2);
  }
  
  // Cap at 100
  return Math.min(100, score);
}

/**
 * Calculate expected progress for a project based on elapsed time
 */
function calculateExpectedProgress(project: Project, today: Date): number {
  const startDate = toSafeDate(project.startDate) || toSafeDate(project.createdAt);
  const deadline = toSafeDate(project.deadline);
  
  if (!startDate || !deadline) return 0;
  
  const totalDuration = deadline.getTime() - startDate.getTime();
  const elapsed = today.getTime() - startDate.getTime();
  
  if (totalDuration <= 0) return 100;
  if (elapsed <= 0) return 0;
  if (elapsed >= totalDuration) return 100;
  
  return Math.round((elapsed / totalDuration) * 100);
}

// ============================================================================
// DEPENDENCY ANALYSIS
// ============================================================================

/**
 * Build dependency graph for tasks within a project
 */
export function buildDependencyGraph(
  tasks: Task[],
  milestones: Milestone[]
): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  
  // Initialize all tasks
  for (const task of tasks) {
    graph.set(task.id, []);
  }
  
  // Add explicit task dependencies
  for (const task of tasks) {
    if (task.blockedBy && task.blockedBy.length > 0) {
      graph.set(task.id, [...(task.blockedBy as string[])]);
    }
  }
  
  // Add implicit milestone order dependencies
  // Tasks in milestone 2 depend on all tasks in milestone 1 being complete
  const sortedMilestones = [...milestones].sort((a, b) => a.order - b.order);
  const tasksByMilestone = new Map<string, Task[]>();
  
  for (const task of tasks) {
    if (task.milestoneId) {
      const existing = tasksByMilestone.get(task.milestoneId) || [];
      existing.push(task);
      tasksByMilestone.set(task.milestoneId, existing);
    }
  }
  
  for (let i = 1; i < sortedMilestones.length; i++) {
    const currentMilestone = sortedMilestones[i];
    const previousMilestone = sortedMilestones[i - 1];
    
    const currentTasks = tasksByMilestone.get(currentMilestone.id) || [];
    const previousTasks = tasksByMilestone.get(previousMilestone.id) || [];
    
    // First task of current milestone depends on all tasks of previous milestone
    if (currentTasks.length > 0 && previousTasks.length > 0) {
      const firstCurrentTask = currentTasks[0];
      const deps = graph.get(firstCurrentTask.id) || [];
      for (const prevTask of previousTasks) {
        if (!deps.includes(prevTask.id)) {
          deps.push(prevTask.id);
        }
      }
      graph.set(firstCurrentTask.id, deps);
    }
  }
  
  return graph;
}

/**
 * Calculate dependency depth for a task (how many levels of dependencies before it)
 */
export function calculateDependencyDepth(
  taskId: string,
  graph: Map<string, string[]>,
  visited: Set<string> = new Set()
): number {
  if (visited.has(taskId)) return 0; // Circular dependency protection
  visited.add(taskId);
  
  const deps = graph.get(taskId) || [];
  if (deps.length === 0) return 0;
  
  let maxDepth = 0;
  for (const depId of deps) {
    const depth = calculateDependencyDepth(depId, graph, new Set(visited));
    maxDepth = Math.max(maxDepth, depth + 1);
  }
  
  return maxDepth;
}

/**
 * Get all tasks that a task depends on (transitive closure)
 */
export function getAllDependencies(
  taskId: string,
  graph: Map<string, string[]>,
  visited: Set<string> = new Set()
): string[] {
  if (visited.has(taskId)) return [];
  visited.add(taskId);
  
  const directDeps = graph.get(taskId) || [];
  const allDeps = [...directDeps];
  
  for (const depId of directDeps) {
    const transitiveDeps = getAllDependencies(depId, graph, visited);
    for (const td of transitiveDeps) {
      if (!allDeps.includes(td)) {
        allDeps.push(td);
      }
    }
  }
  
  return allDeps;
}

/**
 * Get all tasks that depend on this task (reverse dependencies)
 */
export function getDependentTasks(
  taskId: string,
  graph: Map<string, string[]>
): string[] {
  const dependents: string[] = [];
  
  for (const [id, deps] of graph.entries()) {
    if (deps.includes(taskId)) {
      dependents.push(id);
    }
  }
  
  return dependents;
}

// ============================================================================
// BUFFER & DATE CALCULATION
// ============================================================================

/**
 * Calculate recommended buffer days based on task characteristics
 */
export function calculateBufferDays(task: Task, project?: Project): number {
  let buffer = 2; // Default buffer
  
  // High priority = more buffer
  if (task.priority === 'urgent') buffer += 1;
  if (task.priority === 'high') buffer += 1;
  
  // Longer tasks need more buffer
  const estimatedMinutes = task.estimatedMinutes || 30;
  if (estimatedMinutes >= 240) buffer += 1; // 4+ hours
  if (estimatedMinutes >= 480) buffer += 1; // 8+ hours
  
  // External deadlines need more buffer (for revision cycles)
  // We'll determine this based on priority being urgent
  if (task.priority === 'urgent') buffer += 1;
  
  // Cap buffer at 5 working days
  return Math.min(5, buffer);
}

/**
 * Calculate the latest date a task can be scheduled without missing deadline
 */
export function calculateLatestEnd(
  task: Task,
  workingDays: number[] = [1, 2, 3, 4, 5]
): Date | null {
  const dueDate = toSafeDate(task.dueDate);
  if (!dueDate) return null;
  
  // Latest end is the due date itself (end of day)
  const latestEnd = new Date(dueDate);
  latestEnd.setHours(23, 59, 59, 999);
  
  return latestEnd;
}

/**
 * Calculate the ideal completion date (with buffer)
 */
export function calculateIdealCompletionDate(
  task: Task,
  bufferDays: number,
  workingDays: number[] = [1, 2, 3, 4, 5]
): Date | null {
  const dueDate = toSafeDate(task.dueDate);
  if (!dueDate) return null;
  
  // Ideal completion is buffer days before due date
  return addWorkingDays(dueDate, -bufferDays, workingDays);
}

/**
 * Calculate the earliest a task can start (based on dependencies)
 */
export function calculateEarliestStart(
  task: Task,
  dependencyCompletionDates: Map<string, Date>,
  today: Date = getToday()
): Date {
  let earliest = today;
  
  // Check dependency completion dates
  if (task.blockedBy && task.blockedBy.length > 0) {
    for (const depId of task.blockedBy as string[]) {
      const depCompletion = dependencyCompletionDates.get(depId);
      if (depCompletion && depCompletion > earliest) {
        earliest = depCompletion;
      }
    }
  }
  
  // Check scheduled start if already set
  const scheduledStart = toSafeDate(task.scheduledStart);
  if (scheduledStart && scheduledStart > earliest) {
    earliest = scheduledStart;
  }
  
  return earliest;
}

// ============================================================================
// TASK CHARACTERISTICS ANALYSIS
// ============================================================================

/**
 * Determine if a task requires high focus
 */
export function requiresHighFocus(task: Task): boolean {
  // High priority tasks
  if (task.priority === 'urgent' || task.priority === 'high') return true;
  
  // Long tasks (> 60 minutes)
  if ((task.estimatedMinutes || 30) >= 60) return true;
  
  // Tasks with focus-related tags
  const focusTags = ['deep-work', 'focus', 'creative', 'coding', 'writing', 'design', 'analysis'];
  if (task.tags?.some(tag => focusTags.some(ft => tag.toLowerCase().includes(ft)))) {
    return true;
  }
  
  return false;
}

/**
 * Determine preferred time of day for a task
 */
export function determinePreferredTimeOfDay(task: Task): TimeOfDay | undefined {
  // Check tags for time hints
  const tags = task.tags || [];
  
  if (tags.some(t => t.toLowerCase().includes('morning'))) return 'morning';
  if (tags.some(t => t.toLowerCase().includes('afternoon'))) return 'afternoon';
  if (tags.some(t => t.toLowerCase().includes('evening'))) return 'evening';
  
  // High-focus tasks default to morning
  if (requiresHighFocus(task)) return 'morning';
  
  // Admin tasks default to afternoon
  if (tags.some(t => ['admin', 'email', 'calls', 'meetings'].includes(t.toLowerCase()))) {
    return 'afternoon';
  }
  
  return undefined; // No preference
}

/**
 * Determine if a task can be split across multiple sessions
 */
export function canBeSplit(task: Task): boolean {
  // Tasks under 30 minutes can't be split meaningfully
  if ((task.estimatedMinutes || 30) < 45) return false;
  
  // Check for "no-split" tag
  if (task.tags?.some(t => t.toLowerCase().includes('no-split'))) return false;
  
  // Meetings, calls can't be split
  if (task.tags?.some(t => ['meeting', 'call', 'appointment'].includes(t.toLowerCase()))) {
    return false;
  }
  
  // Default: tasks over 2 hours can be split
  return (task.estimatedMinutes || 30) >= 120;
}

/**
 * Determine task flexibility
 */
export function determineFlexibility(task: Task): TaskFlexibility {
  // Meetings and appointments are fixed
  if (task.tags?.some(t => ['meeting', 'call', 'appointment', 'fixed'].includes(t.toLowerCase()))) {
    return 'fixed';
  }
  
  // Tasks that can be delegated
  if (task.tags?.some(t => ['delegatable', 'optional'].includes(t.toLowerCase()))) {
    return 'delegatable';
  }
  
  // Long tasks that can be split
  if (canBeSplit(task)) {
    return 'splittable';
  }
  
  return 'movable';
}

/**
 * Determine client priority from task context
 */
export function determineClientPriority(task: Task, project?: Project): ClientPriority {
  const tags = [...(task.tags || []), ...(project?.tags || [])];
  
  if (tags.some(t => ['vip', 'priority-client', 'important-client'].includes(t.toLowerCase()))) {
    return 'vip';
  }
  
  if (tags.some(t => ['internal', 'self', 'personal'].includes(t.toLowerCase()))) {
    return 'internal';
  }
  
  return 'standard';
}

/**
 * Calculate minimum session length for split tasks
 */
export function calculateMinimumSessionMinutes(task: Task): number {
  const estimate = task.estimatedMinutes || 30;
  
  // At least 25 minutes (pomodoro) or 1/4 of total
  return Math.max(25, Math.floor(estimate / 4));
}

/**
 * Calculate maximum session length before a break is needed
 */
export function calculateMaximumSessionMinutes(task: Task): number {
  // High focus tasks should cap at 90 minutes
  if (requiresHighFocus(task)) return 90;
  
  // Default max is 2 hours
  return 120;
}

// ============================================================================
// MAIN CONVERSION FUNCTION
// ============================================================================

/**
 * Convert a regular Task to a SmartTask with full analysis
 */
export function analyzeTask(
  task: Task,
  options: {
    project?: Project;
    milestone?: Milestone;
    allTasks?: Task[];
    allMilestones?: Milestone[];
    workingDays?: number[];
    today?: Date;
    dependencyCompletionDates?: Map<string, Date>;
  } = {}
): SmartTask {
  const {
    project,
    milestone,
    allTasks = [],
    allMilestones = [],
    workingDays = [1, 2, 3, 4, 5],
    today = getToday(),
    dependencyCompletionDates = new Map(),
  } = options;
  
  // Calculate buffer
  const bufferDays = calculateBufferDays(task, project);
  
  // Build dependency graph for this project if we have all tasks
  const projectTasks = task.projectId 
    ? allTasks.filter(t => t.projectId === task.projectId)
    : [];
  const projectMilestones = task.projectId
    ? allMilestones.filter(m => m.projectId === task.projectId)
    : [];
  const depGraph = buildDependencyGraph(projectTasks, projectMilestones);
  
  // Calculate what this task blocks
  const blocks = getDependentTasks(task.id, depGraph);
  
  // Get dependency depth
  const dependencyDepth = calculateDependencyDepth(task.id, depGraph);
  
  const smartTask: SmartTask = {
    // Copy all original task properties
    ...task,
    
    // Criticality
    criticality: calculateCriticality(task, project, milestone, today),
    
    // Flexibility
    flexibility: determineFlexibility(task),
    
    // Dates
    earliestStart: calculateEarliestStart(task, dependencyCompletionDates, today),
    latestEnd: calculateLatestEnd(task, workingDays) || undefined,
    idealCompletionDate: calculateIdealCompletionDate(task, bufferDays, workingDays) || undefined,
    bufferDays,
    
    // Dependencies
    dependsOn: (task.blockedBy as string[]) || [],
    blocks,
    dependencyDepth,
    
    // Client/external
    clientPriority: determineClientPriority(task, project),
    isExternalDeadline: task.priority === 'urgent' && !!toSafeDate(task.dueDate),
    
    // Scheduling hints
    preferredTimeOfDay: determinePreferredTimeOfDay(task),
    canBeSplit: canBeSplit(task),
    minimumSessionMinutes: calculateMinimumSessionMinutes(task),
    maximumSessionMinutes: calculateMaximumSessionMinutes(task),
    requiresHighFocus: requiresHighFocus(task),
    
    // Project context
    projectCriticality: project ? calculateCriticality(
      { ...task, priority: 'medium' } as Task, // Base task to get project-level criticality
      project,
      milestone,
      today
    ) : undefined,
    milestoneOrder: milestone?.order,
  };
  
  return smartTask;
}

/**
 * Analyze all tasks and return SmartTasks sorted by scheduling priority
 */
export function analyzeAllTasks(
  tasks: Task[],
  projects: Project[],
  milestones: Milestone[],
  workingDays: number[] = [1, 2, 3, 4, 5],
  today: Date = getToday()
): SmartTask[] {
  // Create lookup maps
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const milestoneMap = new Map(milestones.map(m => [m.id, m]));
  
  // First pass: analyze all tasks
  const smartTasks = tasks.map(task => {
    const project = task.projectId ? projectMap.get(task.projectId) : undefined;
    const milestone = task.milestoneId ? milestoneMap.get(task.milestoneId) : undefined;
    
    return analyzeTask(task, {
      project,
      milestone,
      allTasks: tasks,
      allMilestones: milestones,
      workingDays,
      today,
    });
  });
  
  // Sort by criticality (highest first), then by dependency depth (lowest first)
  return smartTasks.sort((a, b) => {
    // First by criticality (higher is more critical)
    if (b.criticality !== a.criticality) {
      return b.criticality - a.criticality;
    }
    
    // Then by dependency depth (lower depth = schedule first)
    if (a.dependencyDepth !== b.dependencyDepth) {
      return a.dependencyDepth - b.dependencyDepth;
    }
    
    // Then by due date (earlier first)
    const aDue = toSafeDate(a.dueDate);
    const bDue = toSafeDate(b.dueDate);
    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;
    if (aDue && bDue) {
      return aDue.getTime() - bDue.getTime();
    }
    
    // Finally by milestone order
    if (a.milestoneOrder !== undefined && b.milestoneOrder !== undefined) {
      return a.milestoneOrder - b.milestoneOrder;
    }
    
    return 0;
  });
}

/**
 * Group tasks by project for batch scheduling
 */
export function groupTasksByProject(tasks: SmartTask[]): Map<string, SmartTask[]> {
  const groups = new Map<string, SmartTask[]>();
  groups.set('__unassigned__', []);
  
  for (const task of tasks) {
    const key = task.projectId || '__unassigned__';
    const existing = groups.get(key) || [];
    existing.push(task);
    groups.set(key, existing);
  }
  
  return groups;
}

/**
 * Get tasks that are ready to be scheduled (dependencies satisfied)
 */
export function getReadyTasks(
  tasks: SmartTask[],
  completedTaskIds: Set<string>,
  scheduledTaskIds: Set<string>
): SmartTask[] {
  return tasks.filter(task => {
    // Already scheduled or completed
    if (completedTaskIds.has(task.id) || scheduledTaskIds.has(task.id)) {
      return false;
    }
    
    // Check if all dependencies are satisfied
    for (const depId of task.dependsOn) {
      if (!completedTaskIds.has(depId) && !scheduledTaskIds.has(depId)) {
        return false;
      }
    }
    
    return true;
  });
}
