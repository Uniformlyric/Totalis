import type { Task, Milestone, Habit } from '@totalis/shared';
import { Timestamp } from 'firebase/firestore';

// Get API key from environment
const GEMINI_API_KEY = import.meta.env.PUBLIC_GEMINI_API_KEY || '';

// Helper to safely convert Firestore Timestamp or date string to Date
function toSafeDate(value: unknown): Date | null {
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

interface SchedulingContext {
  unscheduledTasks: Task[];
  scheduledTasks: Task[];
  date: Date;
  workingHours: { start: string; end: string };
}

/**
 * Find the best working day to schedule a task based on its due date
 * If due on a non-working day, find the last working day before it
 */
function findBestScheduleDate(
  task: Task,
  workingDays: number[],
  fromDate: Date,
  toDate: Date
): Date | null {
  const dueDate = toSafeDate(task.dueDate);
  if (!dueDate) return null;
  
  // If due date is before our scheduling window, return null
  if (dueDate < fromDate) return null;
  
  // Start from due date and work backwards to find a working day
  const checkDate = new Date(dueDate);
  checkDate.setHours(0, 0, 0, 0);
  
  // Look backwards up to 7 days to find a working day
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = checkDate.getDay();
    if (workingDays.includes(dayOfWeek) && checkDate >= fromDate) {
      return new Date(checkDate);
    }
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  return null;
}

interface ScheduledSlot {
  taskId: string;
  taskTitle: string;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  reasoning: string;
}

interface AIScheduleResponse {
  schedule: ScheduledSlot[];
  summary: string;
  warnings: string[];
}

export interface SchedulePreview {
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

export interface WorkingSchedule {
  days: number[]; // 0 = Sunday, 1 = Monday, etc.
  hours: { start: string; end: string };
}

export interface EnergyProfile {
  type: 'morning-person' | 'night-owl' | 'steady';
  peakHours?: { start: string; end: string };
  lowEnergyHours?: { start: string; end: string };
}

export interface BlockedTimeSlot {
  start: number; // minutes since midnight
  end: number;
  source: 'calendar' | 'habit' | 'task';
  title?: string;
}

// ============================================================================
// ADVANCED SCHEDULER CONFIGURATION
// ============================================================================

/**
 * Comprehensive scheduler configuration for intelligent task scheduling
 */
export interface SchedulerConfig {
  // Time range
  startDate: Date;
  endDate: Date;
  
  // Project focus mode - prioritize specific project(s) while filling gaps with other tasks
  focusProjects?: string[]; // Project IDs to prioritize
  focusProjectRatio?: number; // 0-1, how much of time to allocate to focus projects (default 0.7)
  
  // Deadline enforcement
  deadlineBufferDays: number; // Days before deadline to schedule tasks (default 2)
  strictDeadlines: boolean; // If true, NEVER schedule past due date (default true)
  
  // Workload management
  maxHoursPerDay: number; // Maximum work hours per day (default from working schedule)
  targetHoursPerDay?: number; // Target hours (for lighter load)
  allowOvertime: boolean; // Can exceed maxHoursPerDay if deadlines require it (default false)
  maxOvertimeHours: number; // Maximum overtime allowed per day (default 2)
  
  // Stress/intensity awareness
  intensityMode: 'relaxed' | 'balanced' | 'intense' | 'deadline-driven';
  breaksBetweenTasks: number; // Minutes between tasks (default 5)
  lunchBreak?: { start: string; end: string }; // e.g., { start: '12:00', end: '13:00' }
  
  // Task distribution
  distributionMode: 'even' | 'front-load' | 'back-load' | 'deadline-aware';
  batchSimilarTasks: boolean; // Group tasks by project/tag (default true)
  
  // Energy optimization
  energyProfile?: EnergyProfile;
  scheduleHighFocusInPeak: boolean; // Schedule demanding tasks during peak energy (default true)
}

/**
 * Result of schedule analysis before applying
 */
export interface ScheduleAnalysis {
  totalTasks: number;
  schedulableTasks: number;
  unschedulableTasks: Task[];
  
  totalMinutesNeeded: number;
  totalMinutesAvailable: number;
  utilizationPercent: number;
  
  deadlineTasks: { task: Task; daysUntilDue: number; canSchedule: boolean }[];
  overloadedDays: { date: Date; hoursOverLimit: number }[];
  
  warnings: string[];
  recommendations: string[];
}

export function getDefaultSchedulerConfig(workingSchedule: WorkingSchedule): SchedulerConfig {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Default to end of month
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  
  // Calculate hours from working schedule
  const workStart = timeToMinutes(workingSchedule.hours.start);
  const workEnd = timeToMinutes(workingSchedule.hours.end);
  const workHours = (workEnd - workStart) / 60;
  
  return {
    startDate: today,
    endDate: endOfMonth,
    
    focusProjects: [],
    focusProjectRatio: 0.7,
    
    deadlineBufferDays: 2,
    strictDeadlines: true,
    
    maxHoursPerDay: workHours,
    targetHoursPerDay: workHours * 0.8, // 80% utilization by default
    allowOvertime: false,
    maxOvertimeHours: 2,
    
    intensityMode: 'balanced',
    breaksBetweenTasks: 5,
    lunchBreak: { start: '12:00', end: '13:00' },
    
    distributionMode: 'deadline-aware',
    batchSimilarTasks: true,
    
    scheduleHighFocusInPeak: true,
  };
}

/**
 * Determine if a task requires high focus based on its properties
 */
function isHighFocusTask(task: Task): boolean {
  // High priority or urgent tasks require focus
  if (task.priority === 'urgent' || task.priority === 'high') return true;
  
  // Longer tasks (over 60 mins) require focus
  if ((task.estimatedMinutes || 30) >= 60) return true;
  
  // Tasks with certain tags require focus
  const focusTags = ['deep-work', 'focus', 'creative', 'coding', 'writing'];
  if (task.tags?.some(tag => focusTags.includes(tag.toLowerCase()))) return true;
  
  return false;
}

/**
 * Get default peak/low energy hours based on profile type
 */
function getDefaultEnergyHours(profile: EnergyProfile['type']): { peak: { start: string; end: string }; low: { start: string; end: string } } {
  switch (profile) {
    case 'morning-person':
      return {
        peak: { start: '06:00', end: '11:00' },
        low: { start: '14:00', end: '16:00' },
      };
    case 'night-owl':
      return {
        peak: { start: '20:00', end: '23:59' },
        low: { start: '08:00', end: '11:00' },
      };
    case 'steady':
    default:
      return {
        peak: { start: '10:00', end: '12:00' },
        low: { start: '14:00', end: '15:00' },
      };
  }
}

/**
 * Check if a time slot is within peak energy hours
 */
function isInPeakHours(timeMinutes: number, energyProfile?: EnergyProfile): boolean {
  if (!energyProfile) return false;
  
  const defaults = getDefaultEnergyHours(energyProfile.type);
  const peakStart = timeToMinutes(energyProfile.peakHours?.start || defaults.peak.start);
  const peakEnd = timeToMinutes(energyProfile.peakHours?.end || defaults.peak.end);
  
  return timeMinutes >= peakStart && timeMinutes <= peakEnd;
}

/**
 * Check if a time slot is within low energy hours
 */
function isInLowEnergyHours(timeMinutes: number, energyProfile?: EnergyProfile): boolean {
  if (!energyProfile) return false;
  
  const defaults = getDefaultEnergyHours(energyProfile.type);
  const lowStart = timeToMinutes(energyProfile.lowEnergyHours?.start || defaults.low.start);
  const lowEnd = timeToMinutes(energyProfile.lowEnergyHours?.end || defaults.low.end);
  
  return timeMinutes >= lowStart && timeMinutes <= lowEnd;
}

/**
 * Convert habits with scheduled times to blocked time slots for a specific date
 */
export function getHabitBlockedSlots(habits: Habit[], date: Date): BlockedTimeSlot[] {
  const dayOfWeek = date.getDay();
  
  return habits
    .filter(habit => {
      if (habit.isArchived) return false;
      if (!habit.scheduledTime) return false;
      
      // Check if habit is scheduled for this day
      if (habit.frequency === 'daily') return true;
      if (habit.frequency === 'weekly' && habit.daysOfWeek?.includes(dayOfWeek)) return true;
      if (habit.frequency === 'custom' && habit.daysOfWeek?.includes(dayOfWeek)) return true;
      
      return false;
    })
    .map(habit => {
      const startMinutes = timeToMinutes(habit.scheduledTime!);
      const duration = habit.estimatedMinutes || 30;
      
      return {
        start: startMinutes,
        end: startMinutes + duration,
        source: 'habit' as const,
        title: habit.title,
      };
    })
    .sort((a, b) => a.start - b.start);
}

/**
 * Parse HH:MM time string to minutes since midnight
 */
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to HH:MM string
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Build AI prompt for auto-scheduling
 */
function buildSchedulingPrompt(context: SchedulingContext): string {
  const { unscheduledTasks, scheduledTasks, date, workingHours } = context;

  const dateStr = date.toLocaleDateString('en-US', { 
    weekday: 'long', 
    month: 'long', 
    day: 'numeric',
    year: 'numeric'
  });

  // Calculate available time windows
  const workStart = timeToMinutes(workingHours.start);
  const workEnd = timeToMinutes(workingHours.end);
  const totalWorkMinutes = workEnd - workStart;

  // Calculate already scheduled time
  const scheduledMinutes = scheduledTasks.reduce((sum, task) => {
    return sum + (task.estimatedMinutes || 30);
  }, 0);

  const availableMinutes = totalWorkMinutes - scheduledMinutes;

  // Build task list with details
  const tasksList = unscheduledTasks.map((task, index) => {
    return `${index + 1}. "${task.title}"
   - Priority: ${task.priority || 'medium'}
   - Estimated: ${task.estimatedMinutes || 30} minutes
   - Status: ${task.status}
   - Description: ${task.description || 'None'}`;
  }).join('\n\n');

  // Build already scheduled blocks
  const scheduledBlocks = scheduledTasks.length > 0
    ? scheduledTasks.map(task => {
        const start = toSafeDate(task.scheduledStart);
        if (!start) return null;
        
        const startTime = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
        const endMinutes = start.getHours() * 60 + start.getMinutes() + (task.estimatedMinutes || 30);
        const endTime = minutesToTime(endMinutes);
        
        return `- ${startTime} - ${endTime}: ${task.title}`;
      }).filter(Boolean).join('\n')
    : '(No tasks scheduled yet)';

  return `You are an intelligent scheduling assistant. Your job is to create an optimal daily schedule.

**Date:** ${dateStr}
**Working Hours:** ${workingHours.start} - ${workingHours.end} (${totalWorkMinutes} minutes total)
**Already Scheduled:** ${scheduledMinutes} minutes
**Available Time:** ${availableMinutes} minutes

**Already Scheduled Blocks:**
${scheduledBlocks}

**Tasks to Schedule (${unscheduledTasks.length} tasks):**
${tasksList}

**Scheduling Rules:**
1. Schedule urgent/high priority tasks first, especially early in the day
2. Group similar tasks together when possible
3. Include 5-10 minute breaks between tasks
4. Don't schedule during already-booked time slots
5. Respect task estimated durations
6. If not enough time, prioritize by urgency and importance
7. Start with working hours: ${workingHours.start}
8. Avoid scheduling tasks back-to-back without breaks
9. Consider mental energy: complex tasks in morning, simpler tasks in afternoon
10. Leave buffer time for unexpected issues

**Response Format (JSON only, no markdown):**
{
  "schedule": [
    {
      "taskId": "task-id-here",
      "taskTitle": "Task title",
      "startTime": "HH:MM",
      "endTime": "HH:MM",
      "reasoning": "Why scheduled at this time"
    }
  ],
  "summary": "Brief overview of the schedule strategy",
  "warnings": ["Warning if overbooked", "Other concerns"]
}

**Important:** Only return valid JSON. Include ALL unscheduled tasks if possible. If time is limited, prioritize urgent/high tasks.`;
}

/**
 * Generate schedule preview without applying (for user approval)
 */
export async function generateSchedulePreview(
  unscheduledTasks: Task[],
  scheduledTasks: Task[],
  date: Date,
  workingHours: { start: string; end: string }
): Promise<SchedulePreview> {
  if (unscheduledTasks.length === 0) {
    throw new Error('No tasks to schedule');
  }

  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const prompt = buildSchedulingPrompt({
    unscheduledTasks,
    scheduledTasks,
    date,
    workingHours,
  });

  try {
    console.log('🤖 Generating schedule preview...');
    
    // Call Gemini API directly
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.candidates[0].content.parts[0].text;
    
    // Remove markdown code blocks if present
    const cleanJson = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();
    
    const aiResponse: AIScheduleResponse = JSON.parse(cleanJson);
    
    console.log('📅 AI Schedule Preview:', aiResponse);

    // Build preview with actual task objects
    const previewSlots = aiResponse.schedule.map(slot => {
      const task = unscheduledTasks.find(
        t => t.id === slot.taskId || t.title === slot.taskTitle
      );
      
      if (!task) return null;

      const [startHours, startMinutes] = slot.startTime.split(':').map(Number);
      const [endHours, endMinutes] = slot.endTime.split(':').map(Number);
      
      const startTime = new Date(date);
      startTime.setHours(startHours, startMinutes, 0, 0);
      
      const endTime = new Date(date);
      endTime.setHours(endHours, endMinutes, 0, 0);

      return {
        task,
        startTime,
        endTime,
        reasoning: slot.reasoning,
      };
    }).filter(Boolean) as SchedulePreview['slots'];

    return {
      date,
      slots: previewSlots,
      summary: aiResponse.summary,
      warnings: aiResponse.warnings || [],
    };

  } catch (error) {
    console.error('AI schedule preview failed:', error);
    throw new Error('Failed to generate schedule preview. Please try again.');
  }
}

/**
 * Apply a schedule preview (commit to Firestore)
 */
export async function applySchedulePreview(preview: SchedulePreview): Promise<void> {
  const { updateTask } = await import('@/lib/db/tasks');
  
  for (const slot of preview.slots) {
    await updateTask(slot.task.id, {
      scheduledStart: Timestamp.fromDate(slot.startTime) as any,
    });
    console.log(`✅ Scheduled: ${slot.task.title} at ${slot.startTime.toLocaleTimeString()}`);
  }
}

/**
 * Auto-schedule a day using AI (legacy - applies immediately)
 */
export async function autoScheduleDay(
  unscheduledTasks: Task[],
  scheduledTasks: Task[],
  date: Date,
  workingHours: { start: string; end: string },
  userId: string
): Promise<void> {
  // Generate preview and apply immediately (for backwards compatibility)
  const preview = await generateSchedulePreview(
    unscheduledTasks,
    scheduledTasks,
    date,
    workingHours
  );
  await applySchedulePreview(preview);
}

/**
 * Generate week schedule preview
 */
export async function generateWeekSchedulePreview(
  allTasks: Task[],
  startDate: Date,
  workingSchedule: WorkingSchedule
): Promise<SchedulePreview[]> {
  const days = 7;
  const previews: SchedulePreview[] = [];
  
  // Get all unscheduled tasks (not just those due on specific days)
  const allUnscheduled = allTasks.filter(t => 
    !t.scheduledStart && t.status !== 'completed'
  );
  
  if (allUnscheduled.length === 0) {
    throw new Error('No unscheduled tasks to schedule');
  }
  
  // Distribute tasks across working days
  let remainingTasks = [...allUnscheduled];
  
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    // Check if this is a working day
    const dayOfWeek = date.getDay();
    if (!workingSchedule.days.includes(dayOfWeek)) {
      continue;
    }
    
    if (remainingTasks.length === 0) break;

    const dateStr = date.toISOString().split('T')[0];
    
    // Get tasks already scheduled for this day
    const scheduled = allTasks.filter(t => {
      if (!t.scheduledStart) return false;
      const schedDate = toSafeDate(t.scheduledStart);
      return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
    });

    // Calculate available capacity for this day
    const workStart = timeToMinutes(workingSchedule.hours.start);
    const workEnd = timeToMinutes(workingSchedule.hours.end);
    const totalMinutes = workEnd - workStart;
    
    const scheduledMinutes = scheduled.reduce((sum, t) => 
      sum + (t.estimatedMinutes || 30), 0
    );
    
    const availableMinutes = totalMinutes - scheduledMinutes - 60; // 60 min buffer
    
    // Select tasks for this day based on priority and available time
    const dayTasks: Task[] = [];
    let allocatedMinutes = 0;
    
    for (const task of [...remainingTasks]) {
      const taskMinutes = task.estimatedMinutes || 30;
      if (allocatedMinutes + taskMinutes <= availableMinutes) {
        dayTasks.push(task);
        allocatedMinutes += taskMinutes;
        remainingTasks = remainingTasks.filter(t => t.id !== task.id);
      }
    }
    
    if (dayTasks.length > 0) {
      try {
        const preview = await generateSchedulePreview(
          dayTasks,
          scheduled,
          date,
          workingSchedule.hours
        );
        previews.push(preview);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        console.error(`Failed to schedule ${dateStr}:`, error);
      }
    }
  }
  
  return previews;
}

/**
 * Apply multiple schedule previews
 */
export async function applyWeekSchedulePreview(previews: SchedulePreview[]): Promise<void> {
  for (const preview of previews) {
    await applySchedulePreview(preview);
  }
}

/**
 * Generate month schedule preview - schedules ALL unscheduled tasks across the month
 * Uses a fast local algorithm instead of AI per day for speed
 * Respects task dependencies within projects by scheduling earlier tasks first
 * Prioritizes by urgency and ensures tasks are scheduled before due dates
 * Supports energy-based scheduling and respects blocked time from habits/calendar
 */
export async function generateMonthSchedulePreview(
  allTasks: Task[],
  startDate: Date,
  workingSchedule: WorkingSchedule,
  milestones?: Milestone[],
  habits?: Habit[],
  calendarBlocks?: BlockedTimeSlot[],
  energyProfile?: EnergyProfile
): Promise<SchedulePreview[]> {
  const previews: SchedulePreview[] = [];
  
  // Ensure we start from today or later, never in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const actualStartDate = startDate >= today ? startDate : today;
  
  // Calculate end of month - FULL month from start date
  const endDate = new Date(actualStartDate.getFullYear(), actualStartDate.getMonth() + 1, 0);
  endDate.setHours(23, 59, 59, 999);
  const daysInRange = Math.ceil((endDate.getTime() - actualStartDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  console.log(`📅 Month scheduling: ${daysInRange} days from ${actualStartDate.toDateString()} to ${endDate.toDateString()}`);
  
  // Get all unscheduled tasks
  const allUnscheduled = allTasks.filter(t => 
    !t.scheduledStart && t.status !== 'completed'
  );
  
  if (allUnscheduled.length === 0) {
    throw new Error('No unscheduled tasks to schedule');
  }
  
  console.log(`📋 Found ${allUnscheduled.length} unscheduled tasks`);
  
  // Create milestone order lookup for smart scheduling
  const milestoneOrderMap = new Map<string, number>();
  if (milestones) {
    milestones.forEach(m => milestoneOrderMap.set(m.id, m.order));
  }
  
  /**
   * Smart sort: Prioritizes by urgency, then project dependencies
   * 1. Urgent/high priority tasks first
   * 2. Tasks with earlier due dates first  
   * 3. Within same project, respect milestone order
   * 4. Tasks with due dates before tasks without
   */
  const smartSort = (tasks: Task[]) => {
    return [...tasks].sort((a, b) => {
      // Priority weight - urgent tasks ALWAYS first
      const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority as keyof typeof priorityWeight] || 2;
      const bPriority = priorityWeight[b.priority as keyof typeof priorityWeight] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }
      
      // Tasks with due dates come before tasks without
      const aDue = toSafeDate(a.dueDate);
      const bDue = toSafeDate(b.dueDate);
      
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      
      // Both have due dates - earlier due date first
      if (aDue && bDue) {
        const dueDiff = aDue.getTime() - bDue.getTime();
        if (dueDiff !== 0) return dueDiff;
      }
      
      // Same priority and due date - check project dependencies
      const aProjectId = a.projectId || '';
      const bProjectId = b.projectId || '';
      
      if (aProjectId && bProjectId && aProjectId === bProjectId) {
        // Same project - sort by milestone order
        if (a.milestoneId && b.milestoneId) {
          const aOrder = milestoneOrderMap.get(a.milestoneId) ?? 999;
          const bOrder = milestoneOrderMap.get(b.milestoneId) ?? 999;
          if (aOrder !== bOrder) return aOrder - bOrder;
        } else if (a.milestoneId && !b.milestoneId) {
          return -1;
        } else if (!a.milestoneId && b.milestoneId) {
          return 1;
        }
        
        // Same milestone - sort by creation date
        const aCreated = toSafeDate(a.createdAt);
        const bCreated = toSafeDate(b.createdAt);
        if (aCreated && bCreated) {
          return aCreated.getTime() - bCreated.getTime();
        }
      }
      
      return 0;
    });
  };
  
  // Sort ALL tasks by priority and due date
  let remainingTasks = smartSort(allUnscheduled);
  let scheduledCount = 0;
  
  // Separate high-focus vs low-focus tasks for energy-based scheduling
  const highFocusTasks = remainingTasks.filter(t => isHighFocusTask(t));
  const lowFocusTasks = remainingTasks.filter(t => !isHighFocusTask(t));
  
  console.log(`🧠 Energy-based: ${highFocusTasks.length} high-focus, ${lowFocusTasks.length} low-focus tasks`);
  
  // Build a map of day capacities with time slots
  interface DayCapacity {
    available: number;
    slots: SchedulePreview['slots'];
    timeSlots: Array<{ start: number; end: number; available: boolean; isPeak: boolean; isLow: boolean }>;
  }
  const dayCapacities = new Map<string, DayCapacity>();
  
  const workStart = timeToMinutes(workingSchedule.hours.start);
  const workEnd = timeToMinutes(workingSchedule.hours.end);
  const totalDayMinutes = workEnd - workStart;
  
  // Initialize capacity for each working day
  for (let i = 0; i < daysInRange; i++) {
    const date = new Date(actualStartDate);
    date.setDate(date.getDate() + i);
    
    if (date < today) continue;
    
    const dayOfWeek = date.getDay();
    if (!workingSchedule.days.includes(dayOfWeek)) continue;
    
    const dateStr = date.toISOString().split('T')[0];
    
    // Get habit blocked time for this day
    const habitBlocks = habits ? getHabitBlockedSlots(habits, date) : [];
    
    // Get calendar blocked time for this day (passed in from caller)
    const dayCalendarBlocks = calendarBlocks?.filter(b => {
      // Calendar blocks should already be filtered by date by the caller
      return true;
    }) || [];
    
    // Calculate already scheduled time from tasks
    const alreadyScheduled = allTasks.filter(t => {
      if (!t.scheduledStart) return false;
      const schedDate = toSafeDate(t.scheduledStart);
      return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
    });
    
    const taskBlocks: BlockedTimeSlot[] = alreadyScheduled.map(t => {
      const start = toSafeDate(t.scheduledStart);
      const startMins = start ? start.getHours() * 60 + start.getMinutes() : workStart;
      return {
        start: startMins,
        end: startMins + (t.estimatedMinutes || 30),
        source: 'task' as const,
        title: t.title,
      };
    });
    
    // Combine all blocked times
    const allBlocks = [...habitBlocks, ...dayCalendarBlocks, ...taskBlocks].sort((a, b) => a.start - b.start);
    
    // Build available time slots (gaps between blocked times)
    const timeSlots: DayCapacity['timeSlots'] = [];
    let currentTime = workStart;
    
    for (const block of allBlocks) {
      // Skip blocks outside working hours
      if (block.end <= workStart || block.start >= workEnd) continue;
      
      // Clamp to working hours
      const blockStart = Math.max(block.start, workStart);
      const blockEnd = Math.min(block.end, workEnd);
      
      // Add available slot before this block
      if (currentTime < blockStart) {
        timeSlots.push({
          start: currentTime,
          end: blockStart,
          available: true,
          isPeak: energyProfile ? isInPeakHours(currentTime, energyProfile) : false,
          isLow: energyProfile ? isInLowEnergyHours(currentTime, energyProfile) : false,
        });
      }
      
      // Mark blocked slot
      timeSlots.push({
        start: blockStart,
        end: blockEnd,
        available: false,
        isPeak: false,
        isLow: false,
      });
      
      currentTime = Math.max(currentTime, blockEnd);
    }
    
    // Add remaining time after last block
    if (currentTime < workEnd) {
      timeSlots.push({
        start: currentTime,
        end: workEnd,
        available: true,
        isPeak: energyProfile ? isInPeakHours(currentTime, energyProfile) : false,
        isLow: energyProfile ? isInLowEnergyHours(currentTime, energyProfile) : false,
      });
    }
    
    // Calculate total available minutes
    const available = timeSlots
      .filter(s => s.available)
      .reduce((sum, s) => sum + (s.end - s.start), 0);
    
    if (available > 0) {
      dayCapacities.set(dateStr, {
        available,
        slots: [],
        timeSlots,
      });
    }
  }
  
  console.log(`📆 ${dayCapacities.size} working days with capacity`);
  
  // Calculate total minutes needed and available
  const totalMinutesNeeded = remainingTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
  const totalCapacity = Array.from(dayCapacities.values()).reduce((sum, d) => sum + d.available, 0);
  const workingDayCount = dayCapacities.size;
  
  console.log(`📊 Total work: ${totalMinutesNeeded} min across ${workingDayCount} days (${totalCapacity} min capacity)`);
  
  // Calculate target minutes per day for even distribution
  const targetMinutesPerDay = Math.ceil(totalMinutesNeeded / workingDayCount);
  console.log(`🎯 Target: ~${targetMinutesPerDay} min/day for even distribution`);
  
  // Separate tasks by due date constraint
  const tasksWithDueDate = remainingTasks.filter(t => toSafeDate(t.dueDate));
  const tasksWithoutDueDate = remainingTasks.filter(t => !toSafeDate(t.dueDate));
  
  // Default buffer: schedule 2 days before due date to give breathing room
  const DEFAULT_BUFFER_DAYS = 2;
  
  // STEP 1: Schedule tasks WITH due dates first - SCHEDULE EARLY with buffer!
  // Sort by due date (earliest first) to prioritize urgent deadlines
  const sortedDeadlineTasks = [...tasksWithDueDate].sort((a, b) => {
    const aDue = toSafeDate(a.dueDate)!;
    const bDue = toSafeDate(b.dueDate)!;
    return aDue.getTime() - bDue.getTime();
  });
  
  for (const task of sortedDeadlineTasks) {
    const taskMinutes = task.estimatedMinutes || 30;
    const taskDue = toSafeDate(task.dueDate)!;
    
    // Calculate the ideal schedule date (buffer days before due)
    const idealDate = new Date(taskDue);
    idealDate.setDate(idealDate.getDate() - DEFAULT_BUFFER_DAYS);
    const idealDateStr = idealDate.toISOString().split('T')[0];
    
    // Find the best day: closest to ideal date, but BEFORE the due date
    let bestDay: string | null = null;
    let bestDistance = Infinity;
    
    const sortedDays = Array.from(dayCapacities.keys()).sort(); // Earliest first
    
    for (const dateStr of sortedDays) {
      const dayDate = new Date(dateStr);
      
      // Must be BEFORE due date (not on due date - we want buffer!)
      if (dayDate >= taskDue) continue;
      
      const capacity = dayCapacities.get(dateStr)!;
      if (capacity.available < taskMinutes) continue;
      
      // Prefer days closest to our ideal date
      const distance = Math.abs(dayDate.getTime() - idealDate.getTime());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestDay = dateStr;
      }
    }
    
    // Fallback: If no day before due date has capacity, try the due date itself
    if (!bestDay) {
      const dueDateStr = taskDue.toISOString().split('T')[0];
      const capacity = dayCapacities.get(dueDateStr);
      if (capacity && capacity.available >= taskMinutes) {
        bestDay = dueDateStr;
      }
    }
    
    // Last resort: any day with capacity (task may be overdue)
    if (!bestDay) {
      for (const [dateStr, capacity] of dayCapacities.entries()) {
        if (capacity.available >= taskMinutes) {
          bestDay = dateStr;
          break;
        }
      }
    }
    
    if (bestDay) {
      scheduleTaskOnDay(task, bestDay, taskMinutes);
    }
  }
  
  // STEP 2: Distribute tasks WITHOUT due dates evenly across all days
  // Use round-robin to spread the workload
  const sortedDays = Array.from(dayCapacities.keys()).sort(); // Chronological
  let dayIndex = 0;
  
  for (const task of tasksWithoutDueDate) {
    const taskMinutes = task.estimatedMinutes || 30;
    let scheduled = false;
    let attempts = 0;
    
    // Round-robin: try each day starting from current index
    while (!scheduled && attempts < workingDayCount) {
      const dateStr = sortedDays[dayIndex % workingDayCount];
      const capacity = dayCapacities.get(dateStr);
      
      if (capacity && capacity.available >= taskMinutes) {
        // Check if this day is already over the target (for even distribution)
        const usedSoFar = totalDayMinutes - capacity.available;
        
        // Allow scheduling if under target, or if no other day has capacity
        if (usedSoFar < targetMinutesPerDay || attempts >= workingDayCount - 1) {
          scheduleTaskOnDay(task, dateStr, taskMinutes);
          scheduled = true;
        }
      }
      
      dayIndex++;
      attempts++;
    }
    
    // If couldn't schedule with even distribution, just find any day with capacity
    if (!scheduled) {
      for (const dateStr of sortedDays) {
        const capacity = dayCapacities.get(dateStr);
        if (capacity && capacity.available >= taskMinutes) {
          scheduleTaskOnDay(task, dateStr, taskMinutes);
          break;
        }
      }
    }
  }
  
  // Helper function to find the best time slot for a task on a specific day
  function findBestTimeSlot(
    capacity: DayCapacity,
    taskMinutes: number,
    preferPeak: boolean,
    avoidPeak: boolean
  ): { start: number; end: number } | null {
    const availableSlots = capacity.timeSlots.filter(s => s.available && (s.end - s.start) >= taskMinutes);
    
    if (availableSlots.length === 0) return null;
    
    // Energy-based slot selection
    if (preferPeak && energyProfile) {
      // High-focus task: prefer peak energy slots
      const peakSlot = availableSlots.find(s => s.isPeak);
      if (peakSlot) return { start: peakSlot.start, end: peakSlot.start + taskMinutes };
    }
    
    if (avoidPeak && energyProfile) {
      // Low-focus task: prefer low energy slots, or non-peak slots
      const lowSlot = availableSlots.find(s => s.isLow);
      if (lowSlot) return { start: lowSlot.start, end: lowSlot.start + taskMinutes };
      
      const nonPeakSlot = availableSlots.find(s => !s.isPeak);
      if (nonPeakSlot) return { start: nonPeakSlot.start, end: nonPeakSlot.start + taskMinutes };
    }
    
    // Default: first available slot
    return { start: availableSlots[0].start, end: availableSlots[0].start + taskMinutes };
  }
  
  // Helper function to schedule a task on a specific day
  function scheduleTaskOnDay(task: Task, dateStr: string, taskMinutes: number) {
    const capacity = dayCapacities.get(dateStr)!;
    const date = new Date(dateStr + 'T00:00:00');
    const taskDue = toSafeDate(task.dueDate);
    const isHighFocus = isHighFocusTask(task);
    
    // Find best time slot based on energy profile
    const slot = findBestTimeSlot(capacity, taskMinutes, isHighFocus, !isHighFocus);
    if (!slot) return;
    
    const startTime = new Date(date);
    startTime.setHours(Math.floor(slot.start / 60), slot.start % 60, 0, 0);
    
    const endTime = new Date(date);
    endTime.setHours(Math.floor(slot.end / 60), slot.end % 60, 0, 0);
    
    capacity.slots.push({
      task,
      startTime,
      endTime,
      reasoning: `${task.priority || 'medium'} priority${isHighFocus ? ' (high focus)' : ''}${taskDue ? `, due ${taskDue.toLocaleDateString()}` : ''}`,
    });
    
    // Mark the used time as unavailable
    const slotIndex = capacity.timeSlots.findIndex(s => s.available && s.start <= slot.start && s.end >= slot.end);
    if (slotIndex !== -1) {
      const originalSlot = capacity.timeSlots[slotIndex];
      const newSlots: DayCapacity['timeSlots'] = [];
      
      // Add remaining time before the task
      if (originalSlot.start < slot.start) {
        newSlots.push({
          ...originalSlot,
          end: slot.start,
        });
      }
      
      // Add the blocked time for this task
      newSlots.push({
        start: slot.start,
        end: slot.end,
        available: false,
        isPeak: false,
        isLow: false,
      });
      
      // Add remaining time after the task
      if (originalSlot.end > slot.end) {
        newSlots.push({
          ...originalSlot,
          start: slot.end + 5, // 5 min break
        });
      }
      
      // Replace the original slot with the new slots
      capacity.timeSlots.splice(slotIndex, 1, ...newSlots);
    }
    
    capacity.available -= taskMinutes;
    scheduledCount++;
  }
  
  // Convert capacities to previews
  for (const [dateStr, capacity] of dayCapacities.entries()) {
    if (capacity.slots.length > 0) {
      previews.push({
        date: new Date(dateStr + 'T00:00:00'),
        slots: capacity.slots,
        summary: `${capacity.slots.length} task(s) scheduled`,
        warnings: [],
      });
    }
  }
  
  // Sort previews by date
  previews.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  console.log(`✅ Scheduled ${scheduledCount} tasks across ${previews.length} days`);
  
  const unscheduledCount = allUnscheduled.length - scheduledCount;
  if (unscheduledCount > 0) {
    console.warn(`⚠️ ${unscheduledCount} tasks could not be scheduled within the month (not enough capacity)`);
  }
  
  return previews;
}

/**
 * Apply month schedule preview
 */
export async function applyMonthSchedulePreview(previews: SchedulePreview[]): Promise<void> {
  for (const preview of previews) {
    await applySchedulePreview(preview);
  }
}

/**
 * Unschedule all tasks - removes scheduledStart and scheduledEnd from all tasks
 * @param tasks - All tasks to unschedule
 * @param scope - 'all' for everything, 'month' for current month, 'year' for current year
 * @returns Number of tasks unscheduled
 */
export async function unscheduleAllTasks(
  tasks: Task[],
  scope: 'all' | 'month' | 'year' = 'all'
): Promise<number> {
  const { updateTask } = await import('@/lib/db/tasks');
  
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const endOfYear = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
  
  // Filter tasks based on scope
  const tasksToUnschedule = tasks.filter(t => {
    if (!t.scheduledStart || t.status === 'completed') return false;
    
    const scheduledDate = toSafeDate(t.scheduledStart);
    if (!scheduledDate) return false;
    
    if (scope === 'all') return true;
    
    if (scope === 'month') {
      return scheduledDate >= startOfMonth && scheduledDate <= endOfMonth;
    }
    
    if (scope === 'year') {
      return scheduledDate >= startOfYear && scheduledDate <= endOfYear;
    }
    
    return false;
  });
  
  console.log(`🗑️ Unscheduling ${tasksToUnschedule.length} tasks (scope: ${scope})`);
  
  let unscheduledCount = 0;
  
  for (const task of tasksToUnschedule) {
    try {
      await updateTask(task.id, {
        scheduledStart: null as any,
        scheduledEnd: null as any,
      });
      unscheduledCount++;
    } catch (error) {
      console.error(`Failed to unschedule task ${task.id}:`, error);
    }
  }
  
  console.log(`✅ Unscheduled ${unscheduledCount} tasks`);
  return unscheduledCount;
}

/**
 * Generate year schedule preview - schedules ALL unscheduled tasks across 12 months
 * Uses a fast local algorithm instead of AI per day for speed
 */
export async function generateYearSchedulePreview(
  allTasks: Task[],
  startDate: Date,
  workingSchedule: WorkingSchedule,
  milestones?: Milestone[]
): Promise<SchedulePreview[]> {
  const previews: SchedulePreview[] = [];
  
  // Ensure we start from today or later, never in the past
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const actualStartDate = startDate >= today ? startDate : today;
  
  // Calculate end of year (12 months from start)
  const endDate = new Date(actualStartDate.getFullYear() + 1, actualStartDate.getMonth(), actualStartDate.getDate());
  const daysInRange = Math.ceil((endDate.getTime() - actualStartDate.getTime()) / (1000 * 60 * 60 * 24));
  
  console.log(`📅 Year scheduling: ${daysInRange} days from ${actualStartDate.toDateString()} to ${endDate.toDateString()}`);
  
  // Get all unscheduled tasks
  const allUnscheduled = allTasks.filter(t => 
    !t.scheduledStart && t.status !== 'completed'
  );
  
  if (allUnscheduled.length === 0) {
    throw new Error('No unscheduled tasks to schedule');
  }
  
  console.log(`📋 Found ${allUnscheduled.length} unscheduled tasks for year scheduling`);
  
  // Create milestone order lookup for smart scheduling
  const milestoneOrderMap = new Map<string, number>();
  if (milestones) {
    milestones.forEach(m => milestoneOrderMap.set(m.id, m.order));
  }
  
  // Smart sort function (same as month)
  const smartSort = (tasks: Task[]) => {
    return [...tasks].sort((a, b) => {
      const aProjectId = a.projectId || '';
      const bProjectId = b.projectId || '';
      
      if (aProjectId !== bProjectId) {
        if (!aProjectId) return 1;
        if (!bProjectId) return -1;
        return aProjectId.localeCompare(bProjectId);
      }
      
      if (a.milestoneId && b.milestoneId) {
        const aOrder = milestoneOrderMap.get(a.milestoneId) ?? 999;
        const bOrder = milestoneOrderMap.get(b.milestoneId) ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
      } else if (a.milestoneId && !b.milestoneId) {
        return -1;
      } else if (!a.milestoneId && b.milestoneId) {
        return 1;
      }
      
      const aCreated = toSafeDate(a.createdAt);
      const bCreated = toSafeDate(b.createdAt);
      if (aCreated && bCreated) {
        return aCreated.getTime() - bCreated.getTime();
      }
      
      const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority as keyof typeof priorityWeight] || 2;
      const bPriority = priorityWeight[b.priority as keyof typeof priorityWeight] || 2;
      return bPriority - aPriority;
    });
  };
  
  // Group tasks by their target schedule date based on due dates
  const tasksByTargetDate = new Map<string, Task[]>();
  
  for (const task of allUnscheduled) {
    const bestDate = findBestScheduleDate(task, workingSchedule.days, actualStartDate, endDate);
    
    if (bestDate) {
      const dateStr = bestDate.toISOString().split('T')[0];
      if (!tasksByTargetDate.has(dateStr)) {
        tasksByTargetDate.set(dateStr, []);
      }
      tasksByTargetDate.get(dateStr)!.push(task);
    }
  }
  
  // Collect tasks without due dates
  const tasksWithoutDue = allUnscheduled.filter(t => !t.dueDate);
  let remainingNoDueTasks = smartSort(tasksWithoutDue);
  let scheduledCount = 0;
  
  // Iterate through each day in the year
  for (let i = 0; i < daysInRange; i++) {
    const date = new Date(actualStartDate);
    date.setDate(date.getDate() + i);
    
    if (date < today) continue;
    
    const dayOfWeek = date.getDay();
    if (!workingSchedule.days.includes(dayOfWeek)) continue;
    
    const dateStr = date.toISOString().split('T')[0];
    
    // Get already scheduled tasks for this day
    const alreadyScheduled = allTasks.filter(t => {
      if (!t.scheduledStart) return false;
      const schedDate = toSafeDate(t.scheduledStart);
      return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
    });

    const workStart = timeToMinutes(workingSchedule.hours.start);
    const workEnd = timeToMinutes(workingSchedule.hours.end);
    const totalMinutes = workEnd - workStart;
    
    const scheduledMinutes = alreadyScheduled.reduce((sum, t) => 
      sum + (t.estimatedMinutes || 30), 0
    );
    
    const availableMinutes = totalMinutes - scheduledMinutes;
    
    if (availableMinutes <= 0) continue;
    
    const tasksForThisDay = smartSort(tasksByTargetDate.get(dateStr) || []);
    const candidateTasks = [...tasksForThisDay, ...remainingNoDueTasks];
    
    let allocatedMinutes = 0;
    let currentTime = workStart + scheduledMinutes;
    
    const slots: SchedulePreview['slots'] = [];
    
    for (const task of candidateTasks) {
      const taskMinutes = task.estimatedMinutes || 30;
      const canFit = allocatedMinutes + taskMinutes <= availableMinutes;
      const isLargeTask = taskMinutes >= totalMinutes * 0.8;
      const dayIsEmpty = allocatedMinutes === 0 && scheduledMinutes === 0;
      
      if (canFit || (isLargeTask && dayIsEmpty)) {
        const startTime = new Date(date);
        startTime.setHours(Math.floor(currentTime / 60), currentTime % 60, 0, 0);
        
        const actualTaskMinutes = Math.min(taskMinutes, totalMinutes - allocatedMinutes);
        const endTime = new Date(date);
        endTime.setHours(Math.floor((currentTime + actualTaskMinutes) / 60), (currentTime + actualTaskMinutes) % 60, 0, 0);
        
        slots.push({
          task,
          startTime,
          endTime,
          reasoning: `Scheduled based on ${task.priority || 'medium'} priority`,
        });
        
        allocatedMinutes += actualTaskMinutes;
        currentTime += actualTaskMinutes + 5;
        
        const targetDateTasks = tasksByTargetDate.get(dateStr);
        if (targetDateTasks) {
          const idx = targetDateTasks.findIndex(t => t.id === task.id);
          if (idx !== -1) targetDateTasks.splice(idx, 1);
        }
        
        remainingNoDueTasks = remainingNoDueTasks.filter(t => t.id !== task.id);
        scheduledCount++;
        
        if (isLargeTask && !canFit) break;
      }
    }
    
    if (slots.length > 0) {
      previews.push({
        date: new Date(date),
        slots,
        summary: `${slots.length} task(s) scheduled`,
        warnings: [],
      });
    }
  }
  
  console.log(`✅ Year scheduling: ${scheduledCount} tasks across ${previews.length} days`);
  
  let remainingCount = remainingNoDueTasks.length;
  for (const tasks of tasksByTargetDate.values()) {
    remainingCount += tasks.length;
  }
  
  if (remainingCount > 0) {
    console.warn(`⚠️ ${remainingCount} tasks could not be scheduled within the year`);
  }
  
  return previews;
}

/**
 * Reschedule a specific day - clears existing schedule and re-optimizes
 */
export async function rescheduleDay(
  allTasks: Task[],
  date: Date,
  workingSchedule: WorkingSchedule
): Promise<SchedulePreview> {
  const dateStr = date.toISOString().split('T')[0];
  const { updateTask } = await import('@/lib/db/tasks');
  
  // Find tasks scheduled for this day
  const dayTasks = allTasks.filter(t => {
    if (!t.scheduledStart) return false;
    const schedDate = toSafeDate(t.scheduledStart);
    return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
  });
  
  // Get unscheduled tasks that could be scheduled today
  const unscheduled = allTasks.filter(t => 
    !t.scheduledStart && t.status !== 'completed'
  );
  
  // Combine: tasks that were scheduled today + unscheduled tasks due today or earlier
  const todayDate = new Date(date);
  todayDate.setHours(23, 59, 59);
  
  const eligibleUnscheduled = unscheduled.filter(t => {
    const dueDate = toSafeDate(t.dueDate);
    if (!dueDate) return true; // No due date, can be scheduled anytime
    return dueDate <= todayDate;
  });
  
  const tasksToReschedule = [...dayTasks, ...eligibleUnscheduled];
  
  if (tasksToReschedule.length === 0) {
    throw new Error('No tasks to reschedule for this day');
  }
  
  // Generate new optimized schedule
  const preview = await generateSchedulePreview(
    tasksToReschedule,
    [], // No existing scheduled tasks - we're rescheduling everything
    date,
    workingSchedule.hours
  );
  
  return preview;
}

/**
 * Apply rescheduled day - clears old schedule then applies new
 */
export async function applyRescheduledDay(
  allTasks: Task[],
  date: Date,
  preview: SchedulePreview
): Promise<void> {
  const dateStr = date.toISOString().split('T')[0];
  const { updateTask } = await import('@/lib/db/tasks');
  
  // Clear existing schedule for the day
  const dayTasks = allTasks.filter(t => {
    if (!t.scheduledStart) return false;
    const schedDate = toSafeDate(t.scheduledStart);
    return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
  });
  
  for (const task of dayTasks) {
    await updateTask(task.id, { scheduledStart: null as any });
  }
  
  // Apply new schedule
  await applySchedulePreview(preview);
}

/**
 * Reschedule week - clears and re-optimizes entire week
 */
export async function rescheduleWeek(
  allTasks: Task[],
  startDate: Date,
  workingSchedule: WorkingSchedule
): Promise<SchedulePreview[]> {
  const { updateTask } = await import('@/lib/db/tasks');
  
  // Clear all scheduled tasks for the week
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayTasks = allTasks.filter(t => {
      if (!t.scheduledStart) return false;
      const schedDate = toSafeDate(t.scheduledStart);
      return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
    });
    
    for (const task of dayTasks) {
      await updateTask(task.id, { scheduledStart: null as any });
    }
  }
  
  // Clear local task state for generateWeekSchedulePreview
  const clearedTasks: Task[] = allTasks.map(t => {
    const schedDate = toSafeDate(t.scheduledStart);
    if (!schedDate) return t;
    
    const schedStr = schedDate.toISOString().split('T')[0];
    const startStr = startDate.toISOString().split('T')[0];
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const endStr = endDate.toISOString().split('T')[0];
    
    if (schedStr >= startStr && schedStr <= endStr) {
      return { ...t, scheduledStart: undefined };
    }
    return t;
  });
  
  // Generate new week schedule
  return generateWeekSchedulePreview(clearedTasks, startDate, workingSchedule);
}

/**
 * Reschedule month - clears and re-optimizes entire month
 */
export async function rescheduleMonth(
  allTasks: Task[],
  startDate: Date,
  workingSchedule: WorkingSchedule,
  milestones?: Milestone[]
): Promise<SchedulePreview[]> {
  const { updateTask } = await import('@/lib/db/tasks');
  
  // Calculate end of month
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
  const daysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  // Clear all scheduled tasks for the month
  for (let i = 0; i < daysInRange; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    const dayTasks = allTasks.filter(t => {
      if (!t.scheduledStart) return false;
      const schedDate = toSafeDate(t.scheduledStart);
      return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
    });
    
    for (const task of dayTasks) {
      await updateTask(task.id, { scheduledStart: null as any });
    }
  }
  
  // Clear local task state for generateMonthSchedulePreview
  const clearedTasks: Task[] = allTasks.map(t => {
    const schedDate = toSafeDate(t.scheduledStart);
    if (!schedDate) return t;
    
    const schedStr = schedDate.toISOString().split('T')[0];
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    if (schedStr >= startStr && schedStr <= endStr) {
      return { ...t, scheduledStart: undefined };
    }
    return t;
  });
  
  // Generate new month schedule
  return generateMonthSchedulePreview(clearedTasks, startDate, workingSchedule, milestones);
}

/**
 * Auto-schedule a week (batch scheduling - legacy)
 */
export async function autoScheduleWeek(
  allTasks: Task[],
  startDate: Date,
  workingHours: { start: string; end: string },
  userId: string
): Promise<void> {
  // Default to weekdays (Monday-Friday)
  const workingSchedule: WorkingSchedule = {
    days: [1, 2, 3, 4, 5], // Mon-Fri
    hours: workingHours,
  };
  
  const previews = await generateWeekSchedulePreview(
    allTasks,
    startDate,
    workingSchedule
  );
  
  await applyWeekSchedulePreview(previews);
}

/**
 * Suggest next best task to work on right now
 */
export async function suggestNextTask(
  tasks: Task[],
  currentTime: Date = new Date()
): Promise<Task | null> {
  const now = currentTime;
  const currentHour = now.getHours();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Filter tasks that are:
  // 1. Not completed
  // 2. Due today or overdue
  // 3. Not already scheduled for later
  const candidateTasks = tasks.filter(task => {
    if (task.status === 'completed') return false;
    
    const dueDate = toSafeDate(task.dueDate);
    if (!dueDate) return false;
    
    // Due today or overdue
    const todayStr = now.toISOString().split('T')[0];
    const dueStr = dueDate.toISOString().split('T')[0];
    
    return dueStr <= todayStr;
  });

  if (candidateTasks.length === 0) return null;

  // Sort by priority and due date
  candidateTasks.sort((a, b) => {
    const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
    const aPriority = priorityWeight[a.priority as keyof typeof priorityWeight] || 2;
    const bPriority = priorityWeight[b.priority as keyof typeof priorityWeight] || 2;
    
    if (aPriority !== bPriority) return bPriority - aPriority;
    
    // If same priority, sort by due date
    const aDue = toSafeDate(a.dueDate);
    const bDue = toSafeDate(b.dueDate);
    
    if (!aDue || !bDue) return 0;
    return aDue.getTime() - bDue.getTime();
  });

  return candidateTasks[0];
}

// ============================================================================
// ADVANCED SMART SCHEDULER
// ============================================================================

/**
 * Analyze schedule before applying - helps user understand impact
 */
export function analyzeSchedule(
  tasks: Task[],
  config: SchedulerConfig,
  workingSchedule: WorkingSchedule
): ScheduleAnalysis {
  const unscheduledTasks = tasks.filter(t => 
    !t.scheduledStart && t.status !== 'completed'
  );
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate total minutes needed
  const totalMinutesNeeded = unscheduledTasks.reduce((sum, t) => 
    sum + (t.estimatedMinutes || 30), 0
  );
  
  // Calculate available capacity
  const daysInRange = Math.ceil(
    (config.endDate.getTime() - config.startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  
  let totalMinutesAvailable = 0;
  const workStart = timeToMinutes(workingSchedule.hours.start);
  const workEnd = timeToMinutes(workingSchedule.hours.end);
  const dailyMinutes = workEnd - workStart;
  
  // Account for lunch break
  let lunchMinutes = 0;
  if (config.lunchBreak) {
    const lunchStart = timeToMinutes(config.lunchBreak.start);
    const lunchEnd = timeToMinutes(config.lunchBreak.end);
    lunchMinutes = lunchEnd - lunchStart;
  }
  
  const effectiveDailyMinutes = dailyMinutes - lunchMinutes;
  
  for (let i = 0; i < daysInRange; i++) {
    const date = new Date(config.startDate);
    date.setDate(date.getDate() + i);
    
    if (workingSchedule.days.includes(date.getDay())) {
      totalMinutesAvailable += effectiveDailyMinutes;
    }
  }
  
  // Analyze deadline tasks
  const deadlineTasks = unscheduledTasks
    .filter(t => toSafeDate(t.dueDate))
    .map(t => {
      const dueDate = toSafeDate(t.dueDate)!;
      const daysUntilDue = Math.ceil(
        (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const canSchedule = daysUntilDue >= config.deadlineBufferDays;
      
      return { task: t, daysUntilDue, canSchedule };
    })
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  
  const unschedulableTasks = deadlineTasks
    .filter(d => !d.canSchedule)
    .map(d => d.task);
  
  // Generate warnings
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  const utilizationPercent = Math.round((totalMinutesNeeded / totalMinutesAvailable) * 100);
  
  if (utilizationPercent > 100) {
    warnings.push(`⚠️ Overloaded: ${utilizationPercent}% capacity needed. Consider extending deadline or reducing scope.`);
    recommendations.push('Enable overtime mode or extend the scheduling window');
  } else if (utilizationPercent > 90) {
    warnings.push(`⚠️ High load: ${utilizationPercent}% capacity will be used. Little room for unexpected work.`);
    recommendations.push('Consider front-loading important tasks');
  }
  
  if (unschedulableTasks.length > 0) {
    warnings.push(`⚠️ ${unschedulableTasks.length} task(s) have past or imminent deadlines`);
    recommendations.push('Review deadline tasks and prioritize urgently');
  }
  
  const urgentTasks = unscheduledTasks.filter(t => t.priority === 'urgent');
  if (urgentTasks.length > 5) {
    warnings.push(`⚠️ ${urgentTasks.length} urgent tasks detected - consider triaging priorities`);
  }
  
  if (config.focusProjects && config.focusProjects.length > 0) {
    const focusTaskCount = unscheduledTasks.filter(t => 
      config.focusProjects?.includes(t.projectId || '')
    ).length;
    recommendations.push(`Focus mode: ${focusTaskCount} tasks from focus project(s) will be prioritized`);
  }
  
  return {
    totalTasks: unscheduledTasks.length,
    schedulableTasks: unscheduledTasks.length - unschedulableTasks.length,
    unschedulableTasks,
    totalMinutesNeeded,
    totalMinutesAvailable,
    utilizationPercent,
    deadlineTasks,
    overloadedDays: [], // Will be calculated during actual scheduling
    warnings,
    recommendations,
  };
}

/**
 * Smart scheduler with full configuration support
 * This is the primary scheduling function that respects all user preferences
 */
export async function generateSmartSchedule(
  allTasks: Task[],
  config: SchedulerConfig,
  workingSchedule: WorkingSchedule,
  milestones?: Milestone[],
  habits?: Habit[]
): Promise<SchedulePreview[]> {
  const previews: SchedulePreview[] = [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Use config dates, but never schedule in the past
  const actualStartDate = config.startDate >= today ? config.startDate : today;
  const endDate = config.endDate;
  
  const daysInRange = Math.ceil(
    (endDate.getTime() - actualStartDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  
  console.log(`🧠 Smart scheduling: ${daysInRange} days from ${actualStartDate.toDateString()} to ${endDate.toDateString()}`);
  console.log(`📋 Config: ${config.intensityMode} mode, ${config.distributionMode} distribution`);
  
  // Get all unscheduled tasks
  const allUnscheduled = allTasks.filter(t => 
    !t.scheduledStart && t.status !== 'completed'
  );
  
  if (allUnscheduled.length === 0) {
    throw new Error('No unscheduled tasks to schedule');
  }
  
  // Separate tasks into focus project vs other
  const focusTasks: Task[] = [];
  const otherTasks: Task[] = [];
  
  if (config.focusProjects && config.focusProjects.length > 0) {
    for (const task of allUnscheduled) {
      if (config.focusProjects.includes(task.projectId || '')) {
        focusTasks.push(task);
      } else {
        otherTasks.push(task);
      }
    }
    console.log(`🎯 Focus mode: ${focusTasks.length} focus tasks, ${otherTasks.length} other tasks`);
  } else {
    otherTasks.push(...allUnscheduled);
  }
  
  // Create milestone order lookup
  const milestoneOrderMap = new Map<string, number>();
  if (milestones) {
    milestones.forEach(m => milestoneOrderMap.set(m.id, m.order));
  }
  
  // Smart sort function with deadline awareness
  const smartSort = (tasks: Task[]): Task[] => {
    return [...tasks].sort((a, b) => {
      // Priority weight
      const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityWeight[a.priority as keyof typeof priorityWeight] || 2;
      const bPriority = priorityWeight[b.priority as keyof typeof priorityWeight] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Deadline urgency
      const aDue = toSafeDate(a.dueDate);
      const bDue = toSafeDate(b.dueDate);
      
      if (aDue && !bDue) return -1;
      if (!aDue && bDue) return 1;
      if (aDue && bDue) {
        const dueDiff = aDue.getTime() - bDue.getTime();
        if (dueDiff !== 0) return dueDiff;
      }
      
      // Project dependencies
      if (a.projectId && b.projectId && a.projectId === b.projectId) {
        if (a.milestoneId && b.milestoneId) {
          const aOrder = milestoneOrderMap.get(a.milestoneId) ?? 999;
          const bOrder = milestoneOrderMap.get(b.milestoneId) ?? 999;
          if (aOrder !== bOrder) return aOrder - bOrder;
        }
      }
      
      return 0;
    });
  };
  
  // Sort both task lists
  const sortedFocusTasks = smartSort(focusTasks);
  const sortedOtherTasks = smartSort(otherTasks);
  
  // Initialize day capacities
  interface DayCapacity {
    date: Date;
    available: number;
    maxMinutes: number;
    slots: SchedulePreview['slots'];
    usedMinutes: number;
    focusMinutes: number;
    otherMinutes: number;
  }
  
  const dayCapacities = new Map<string, DayCapacity>();
  
  const workStart = timeToMinutes(workingSchedule.hours.start);
  const workEnd = timeToMinutes(workingSchedule.hours.end);
  let dailyMinutes = workEnd - workStart;
  
  // Subtract lunch break
  if (config.lunchBreak) {
    const lunchStart = timeToMinutes(config.lunchBreak.start);
    const lunchEnd = timeToMinutes(config.lunchBreak.end);
    dailyMinutes -= (lunchEnd - lunchStart);
  }
  
  // Apply intensity mode
  let targetUtilization = 0.8;
  switch (config.intensityMode) {
    case 'relaxed':
      targetUtilization = 0.6;
      break;
    case 'balanced':
      targetUtilization = 0.75;
      break;
    case 'intense':
      targetUtilization = 0.9;
      break;
    case 'deadline-driven':
      targetUtilization = 1.0; // Will exceed if needed
      break;
  }
  
  const targetDailyMinutes = Math.floor(dailyMinutes * targetUtilization);
  
  // Initialize working days
  for (let i = 0; i < daysInRange; i++) {
    const date = new Date(actualStartDate);
    date.setDate(date.getDate() + i);
    
    if (!workingSchedule.days.includes(date.getDay())) continue;
    
    const dateStr = date.toISOString().split('T')[0];
    const maxMinutes = config.allowOvertime 
      ? dailyMinutes + (config.maxOvertimeHours * 60)
      : dailyMinutes;
    
    dayCapacities.set(dateStr, {
      date,
      available: targetDailyMinutes,
      maxMinutes,
      slots: [],
      usedMinutes: 0,
      focusMinutes: 0,
      otherMinutes: 0,
    });
  }
  
  console.log(`📆 ${dayCapacities.size} working days initialized`);
  
  // Helper: Schedule a task on a specific day
  const scheduleTaskOnDay = (task: Task, dateStr: string, reasoning: string): boolean => {
    const capacity = dayCapacities.get(dateStr);
    if (!capacity) return false;
    
    const taskMinutes = task.estimatedMinutes || 30;
    const breakMinutes = config.breaksBetweenTasks;
    
    // Check if we have capacity
    if (capacity.usedMinutes + taskMinutes > capacity.maxMinutes) {
      return false;
    }
    
    // Calculate start time based on used minutes
    let startMinutes = workStart + capacity.usedMinutes;
    
    // Skip lunch break if overlapping
    if (config.lunchBreak) {
      const lunchStart = timeToMinutes(config.lunchBreak.start);
      const lunchEnd = timeToMinutes(config.lunchBreak.end);
      
      if (startMinutes >= lunchStart && startMinutes < lunchEnd) {
        startMinutes = lunchEnd;
      }
    }
    
    // Add break from previous task
    if (capacity.slots.length > 0) {
      startMinutes += breakMinutes;
    }
    
    const startTime = new Date(capacity.date);
    startTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    
    const endTime = new Date(capacity.date);
    const endMinutes = startMinutes + taskMinutes;
    endTime.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
    
    capacity.slots.push({
      task,
      startTime,
      endTime,
      reasoning,
    });
    
    capacity.usedMinutes += taskMinutes + breakMinutes;
    
    return true;
  };
  
  // Helper: Find best day for a deadline task
  // STRATEGY: Schedule EARLY with buffer days before due date to avoid last-minute crunch
  const findBestDayForDeadline = (task: Task): string | null => {
    const dueDate = toSafeDate(task.dueDate);
    if (!dueDate) return null;
    
    const taskMinutes = task.estimatedMinutes || 30;
    const bufferDays = config.deadlineBufferDays;
    
    // Calculate the ideal schedule date (buffer days before due)
    const idealDate = new Date(dueDate);
    idealDate.setDate(idealDate.getDate() - bufferDays);
    
    // Sort days chronologically (earliest first) - we WANT to schedule early!
    const sortedDays = Array.from(dayCapacities.keys()).sort();
    
    // PASS 1: Find the ideal day (closest to our buffer target)
    let bestDay: string | null = null;
    let bestDistance = Infinity;
    
    for (const dateStr of sortedDays) {
      const dayDate = new Date(dateStr);
      
      // Must be before or on due date
      if (dayDate > dueDate) continue;
      
      // Check if we have capacity
      const capacity = dayCapacities.get(dateStr)!;
      if (capacity.usedMinutes + taskMinutes > capacity.maxMinutes) continue;
      
      // Calculate distance from ideal date (prefer days close to buffer target)
      const distance = Math.abs(dayDate.getTime() - idealDate.getTime());
      
      if (distance < bestDistance) {
        bestDistance = distance;
        bestDay = dateStr;
      }
    }
    
    if (bestDay) return bestDay;
    
    // PASS 2: No ideal day found - find ANY available day before due date (earliest first for max buffer)
    for (const dateStr of sortedDays) {
      const dayDate = new Date(dateStr);
      if (dayDate > dueDate) continue;
      
      const capacity = dayCapacities.get(dateStr)!;
      if (capacity.usedMinutes + taskMinutes <= capacity.maxMinutes) {
        return dateStr;
      }
    }
    
    // PASS 3: If strict deadlines and we couldn't find a day, check if we can use overtime
    if (config.strictDeadlines && config.allowOvertime) {
      for (const dateStr of sortedDays) {
        const dayDate = new Date(dateStr);
        if (dayDate > dueDate) continue;
        
        const capacity = dayCapacities.get(dateStr)!;
        if (capacity.usedMinutes + taskMinutes <= capacity.maxMinutes + (config.maxOvertimeHours * 60)) {
          return dateStr;
        }
      }
    }
    
    return null;
  };
  
  // STEP 1: Schedule deadline tasks with buffer
  console.log(`📅 Scheduling ${sortedFocusTasks.filter(t => toSafeDate(t.dueDate)).length + sortedOtherTasks.filter(t => toSafeDate(t.dueDate)).length} deadline tasks...`);
  
  const allDeadlineTasks = [
    ...sortedFocusTasks.filter(t => toSafeDate(t.dueDate)),
    ...sortedOtherTasks.filter(t => toSafeDate(t.dueDate)),
  ].sort((a, b) => {
    const aDue = toSafeDate(a.dueDate)!;
    const bDue = toSafeDate(b.dueDate)!;
    return aDue.getTime() - bDue.getTime();
  });
  
  const scheduledTaskIds = new Set<string>();
  
  for (const task of allDeadlineTasks) {
    const bestDay = findBestDayForDeadline(task);
    if (bestDay) {
      const dueDate = toSafeDate(task.dueDate)!;
      const daysUntil = Math.ceil((dueDate.getTime() - new Date(bestDay).getTime()) / (1000 * 60 * 60 * 24));
      
      if (scheduleTaskOnDay(task, bestDay, `Due ${dueDate.toLocaleDateString()}, scheduled ${daysUntil} days before`)) {
        scheduledTaskIds.add(task.id);
      }
    }
  }
  
  // STEP 2: Distribute remaining tasks based on focus ratio
  const remainingFocus = sortedFocusTasks.filter(t => !scheduledTaskIds.has(t.id));
  const remainingOther = sortedOtherTasks.filter(t => !scheduledTaskIds.has(t.id));
  
  console.log(`🎯 Distributing ${remainingFocus.length} focus + ${remainingOther.length} other tasks...`);
  
  const sortedDays = Array.from(dayCapacities.keys()).sort();
  
  // Calculate focus vs other ratio per day
  const focusRatio = config.focusProjectRatio || 0.7;
  
  for (const dateStr of sortedDays) {
    const capacity = dayCapacities.get(dateStr)!;
    const remainingCapacity = capacity.maxMinutes - capacity.usedMinutes;
    
    const focusAllocation = Math.floor(remainingCapacity * focusRatio);
    const otherAllocation = remainingCapacity - focusAllocation;
    
    // Schedule focus tasks for this day
    let focusUsed = 0;
    for (const task of [...remainingFocus]) {
      if (scheduledTaskIds.has(task.id)) continue;
      
      const taskMinutes = task.estimatedMinutes || 30;
      if (focusUsed + taskMinutes <= focusAllocation) {
        if (scheduleTaskOnDay(task, dateStr, `Focus project task`)) {
          scheduledTaskIds.add(task.id);
          focusUsed += taskMinutes;
          capacity.focusMinutes += taskMinutes;
        }
      }
    }
    
    // Schedule other tasks for this day
    let otherUsed = 0;
    for (const task of [...remainingOther]) {
      if (scheduledTaskIds.has(task.id)) continue;
      
      const taskMinutes = task.estimatedMinutes || 30;
      if (otherUsed + taskMinutes <= otherAllocation + (focusAllocation - focusUsed)) {
        if (scheduleTaskOnDay(task, dateStr, `${task.priority || 'medium'} priority`)) {
          scheduledTaskIds.add(task.id);
          otherUsed += taskMinutes;
          capacity.otherMinutes += taskMinutes;
        }
      }
    }
  }
  
  // STEP 3: Any remaining tasks - just find any available slot
  const stillRemaining = [...remainingFocus, ...remainingOther].filter(t => !scheduledTaskIds.has(t.id));
  
  for (const task of stillRemaining) {
    for (const dateStr of sortedDays) {
      if (scheduleTaskOnDay(task, dateStr, 'Scheduled in available slot')) {
        scheduledTaskIds.add(task.id);
        break;
      }
    }
  }
  
  // Convert to previews
  for (const [dateStr, capacity] of dayCapacities.entries()) {
    if (capacity.slots.length > 0) {
      previews.push({
        date: capacity.date,
        slots: capacity.slots,
        summary: `${capacity.slots.length} tasks (${Math.round(capacity.usedMinutes / 60 * 10) / 10}h)`,
        warnings: capacity.usedMinutes > capacity.available ? ['Heavy workday'] : [],
      });
    }
  }
  
  previews.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  const totalScheduled = scheduledTaskIds.size;
  const totalUnscheduled = allUnscheduled.length - totalScheduled;
  
  console.log(`✅ Scheduled ${totalScheduled} tasks across ${previews.length} days`);
  if (totalUnscheduled > 0) {
    console.warn(`⚠️ ${totalUnscheduled} tasks could not be scheduled`);
  }
  
  return previews;
}
