import type { Task, Milestone } from '@totalis/shared';
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
 */
export async function generateMonthSchedulePreview(
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
  
  // Build a map of day capacities
  const dayCapacities = new Map<string, { available: number; slots: SchedulePreview['slots']; currentTime: number }>();
  
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
    
    // Calculate already scheduled time
    const alreadyScheduled = allTasks.filter(t => {
      if (!t.scheduledStart) return false;
      const schedDate = toSafeDate(t.scheduledStart);
      return schedDate && schedDate.toISOString().split('T')[0] === dateStr;
    });
    
    const scheduledMinutes = alreadyScheduled.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
    const available = totalDayMinutes - scheduledMinutes;
    
    if (available > 0) {
      dayCapacities.set(dateStr, {
        available,
        slots: [],
        currentTime: workStart + scheduledMinutes,
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
  
  // STEP 1: Schedule tasks WITH due dates first (must be before their due date)
  for (const task of tasksWithDueDate) {
    const taskMinutes = task.estimatedMinutes || 30;
    const taskDue = toSafeDate(task.dueDate)!;
    const dueDateStr = taskDue.toISOString().split('T')[0];
    
    // Find the LAST valid day (closest to due date) that has capacity
    // This spreads work out by scheduling near deadlines rather than early
    let bestDay: string | null = null;
    const sortedDays = Array.from(dayCapacities.keys()).sort().reverse(); // Latest first
    
    for (const dateStr of sortedDays) {
      if (dateStr <= dueDateStr) {
        const capacity = dayCapacities.get(dateStr)!;
        if (capacity.available >= taskMinutes) {
          bestDay = dateStr;
          break;
        }
      }
    }
    
    // Fallback: any day with capacity (task is overdue)
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
  
  // Helper function to schedule a task on a specific day
  function scheduleTaskOnDay(task: Task, dateStr: string, taskMinutes: number) {
    const capacity = dayCapacities.get(dateStr)!;
    const date = new Date(dateStr + 'T00:00:00');
    const taskDue = toSafeDate(task.dueDate);
    
    const startTime = new Date(date);
    startTime.setHours(Math.floor(capacity.currentTime / 60), capacity.currentTime % 60, 0, 0);
    
    const endTime = new Date(date);
    const endMinutes = capacity.currentTime + taskMinutes;
    endTime.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);
    
    capacity.slots.push({
      task,
      startTime,
      endTime,
      reasoning: `${task.priority || 'medium'} priority${taskDue ? `, due ${taskDue.toLocaleDateString()}` : ''}`,
    });
    
    capacity.available -= taskMinutes;
    capacity.currentTime = endMinutes + 5; // 5 min break
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
