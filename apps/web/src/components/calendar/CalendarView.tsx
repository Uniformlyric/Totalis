import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui';
import type { Task, Habit, HabitLog } from '@totalis/shared';

interface CalendarViewProps {
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  workingHours?: { start: string; end: string };
  onDayClick?: (date: Date) => void;
  onTaskClick?: (task: Task) => void;
  onScheduleTask?: (task: Task, preferredDate?: Date) => void;
}

interface DayData {
  date: Date;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  tasks: Task[]; // Tasks due on this day
  scheduledTasks: Task[]; // Tasks scheduled to work on this day
  completedScheduledTasks: Task[]; // Completed tasks that were scheduled for this day
  unscheduledTasks: Task[]; // Tasks due this day but not scheduled
  tasksNeedingAttention: Task[]; // Tasks due that need scheduling or are scheduled on different day
  habitCompletions: number;
  totalHabits: number;
  scheduledMinutes: number;
  availableMinutes: number;
  capacityPercent: number;
}

// Helper to parse time string to minutes
function timeToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Helper to get local date string (YYYY-MM-DD) without timezone issues
function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to safely convert date
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

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({
  tasks,
  habits,
  habitLogs,
  workingHours = { start: '09:00', end: '17:00' },
  onDayClick,
  onTaskClick,
  onScheduleTask,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayString = toLocalDateString(today);

  // Generate calendar grid for current month
  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Last day of month
    const lastDay = new Date(year, month + 1, 0);
    
    // Start from the Sunday of the week containing the first day
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    // End on the Saturday of the week containing the last day
    const endDate = new Date(lastDay);
    endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()));

    const days: DayData[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dateString = toLocalDateString(current);
      const dayOfWeek = current.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // Get tasks DUE on this day
      const dayTasks = tasks.filter((task) => {
        if (!task.dueDate) return false;
        try {
          const taskDate = toSafeDate(task.dueDate);
          if (!taskDate) return false;
          return toLocalDateString(taskDate) === dateString;
        } catch {
          return false;
        }
      });
      
      // Get tasks SCHEDULED to work on this day
      const scheduledTasks = tasks.filter((task) => {
        if (!task.scheduledStart) return false;
        try {
          const schedDate = toSafeDate(task.scheduledStart);
          if (!schedDate) return false;
          return toLocalDateString(schedDate) === dateString;
        } catch {
          return false;
        }
      });
      
      // Get unscheduled tasks (due on this day but not scheduled anywhere)
      const unscheduledTasks = dayTasks.filter(t => 
        !t.scheduledStart && t.status !== 'completed'
      );
      
      // Get completed tasks scheduled for this day
      const completedScheduledTasks = scheduledTasks.filter(t => t.status === 'completed');
      
      // Tasks due on this day that need attention (not completed, either unscheduled or scheduled on a DIFFERENT day)
      const tasksNeedingAttention = dayTasks.filter(t => {
        if (t.status === 'completed') return false;
        if (!t.scheduledStart) return true; // Unscheduled = needs attention
        // Check if scheduled on a different day than due
        const schedDate = toSafeDate(t.scheduledStart);
        if (!schedDate) return true;
        return toLocalDateString(schedDate) !== dateString;
      });
      
      // Calculate capacity
      const workStart = timeToMinutes(workingHours.start);
      const workEnd = timeToMinutes(workingHours.end);
      const availableMinutes = isWeekend ? 0 : (workEnd - workStart);
      const scheduledMinutes = scheduledTasks.reduce((sum, t) => sum + (t.estimatedMinutes || 30), 0);
      // Don't cap at 100 - we need to know if overbooked
      const capacityPercent = availableMinutes > 0 
        ? Math.round((scheduledMinutes / availableMinutes) * 100)
        : 0;

      // Get habit completions for this day
      const dayHabitLogs = habitLogs.filter((log) => log.date === dateString);
      const habitCompletions = dayHabitLogs.filter((log) => log.completed).length;

      days.push({
        date: new Date(current),
        dateString,
        isCurrentMonth: current.getMonth() === month,
        isToday: dateString === todayString,
        isWeekend,
        tasks: dayTasks,
        scheduledTasks,
        completedScheduledTasks,
        unscheduledTasks,
        tasksNeedingAttention,
        habitCompletions,
        totalHabits: habits.length,
        scheduledMinutes,
        availableMinutes,
        capacityPercent,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [currentDate, tasks, habits, habitLogs, todayString, workingHours]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(todayString);
  };

  const handleDayClick = (day: DayData) => {
    setSelectedDate(day.dateString);
    onDayClick?.(day.date);
  };

  // Get selected day data
  const selectedDayData = selectedDate
    ? calendarDays.find((d) => d.dateString === selectedDate)
    : null;

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-text">
          {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            Today
          </button>
          <button
            onClick={goToPreviousMonth}
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {dayNames.map((day) => (
            <div
              key={day}
              className="py-3 text-center text-sm font-medium text-text-secondary"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const hasTasks = day.tasks.length > 0;
            const hasScheduledTasks = day.scheduledTasks.length > 0;
            const hasUnscheduledTasks = day.unscheduledTasks.length > 0;
            const hasCompletedTasks = day.completedScheduledTasks.length > 0;
            const pendingScheduledTasks = day.scheduledTasks.length - day.completedScheduledTasks.length;
            const allScheduledComplete = hasScheduledTasks && pendingScheduledTasks === 0;
            const hasOverdue = day.tasks.some(
              (t) => t.status !== 'completed' && toSafeDate(t.dueDate)! < today
            );
            const hasHabits = day.habitCompletions > 0;
            const allHabitsComplete = day.habitCompletions === day.totalHabits && day.totalHabits > 0;
            
            // Capacity color
            const getCapacityColor = (percent: number) => {
              if (percent === 0) return 'bg-gray-200 dark:bg-gray-700';
              if (percent <= 50) return 'bg-emerald-400';
              if (percent <= 80) return 'bg-amber-400';
              if (percent <= 100) return 'bg-orange-500';
              return 'bg-red-500';
            };

            return (
              <button
                key={day.dateString}
                onClick={() => handleDayClick(day)}
                className={`
                  h-[110px] p-2 border-b border-r border-border text-left relative flex flex-col
                  transition-colors hover:bg-surface-hover
                  ${!day.isCurrentMonth ? 'opacity-40' : ''}
                  ${selectedDate === day.dateString ? 'bg-primary/10' : ''}
                  ${index % 7 === 6 ? 'border-r-0' : ''}
                  ${day.isWeekend && day.isCurrentMonth ? 'bg-surface-hover/30' : ''}
                `}
              >
                {/* Fixed header row - always at top */}
                <div className="flex items-center justify-between flex-shrink-0">
                  <span
                    className={`
                      inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium
                      ${day.isToday
                        ? 'bg-primary text-white'
                        : 'text-text'
                      }
                    `}
                  >
                    {day.date.getDate()}
                  </span>

                  {/* Status indicators */}
                  <div className="flex items-center gap-1">
                    {/* All scheduled tasks completed indicator */}
                    {allScheduledComplete && day.isCurrentMonth && (
                      <span 
                        className="w-2 h-2 rounded-full bg-emerald-500" 
                        title="All scheduled tasks completed!"
                      />
                    )}
                    
                    {/* Unscheduled tasks indicator */}
                    {hasUnscheduledTasks && day.isCurrentMonth && (
                      <span 
                        className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" 
                        title={`${day.unscheduledTasks.length} unscheduled task(s)`}
                      />
                    )}
                    
                    {/* Habit indicator */}
                    {hasHabits && day.isCurrentMonth && (
                      <span
                        className={`
                          w-2 h-2 rounded-full
                          ${allHabitsComplete ? 'bg-success' : 'bg-warning'}
                        `}
                      />
                    )}
                  </div>
                </div>

                {/* Fixed capacity bar row - always same position */}
                <div className="h-5 flex-shrink-0 mt-1">
                  {day.isCurrentMonth && !day.isWeekend ? (
                    <>
                      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${getCapacityColor(day.capacityPercent)}`}
                          style={{ width: `${day.capacityPercent > 100 ? '100%' : `${day.capacityPercent}%`}` }}
                        />
                      </div>
                      <div className={`text-[9px] mt-0.5 ${day.capacityPercent > 100 ? 'text-red-500 font-medium' : 'text-text-muted'}`}>
                        {hasScheduledTasks 
                          ? `${Math.round(day.scheduledMinutes / 60 * 10) / 10}h / ${Math.round(day.availableMinutes / 60)}h${day.capacityPercent > 100 ? ' ⚠️' : ''}`
                          : `${Math.round(day.availableMinutes / 60)}h avail`
                        }
                      </div>
                    </>
                  ) : (
                    <div className="text-[9px] text-text-muted">Weekend</div>
                  )}
                </div>

                {/* Scrollable content area - fills remaining space */}
                <div className="flex-1 mt-1 overflow-hidden">
                  {day.isCurrentMonth && (
                    <div className="space-y-0.5">
                      {/* Completed tasks badge */}
                      {hasCompletedTasks && (
                        <div className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium truncate">
                          ✅ {day.completedScheduledTasks.length} completed
                        </div>
                      )}
                      
                      {/* Scheduled badge - only show pending tasks */}
                      {pendingScheduledTasks > 0 && (
                        <div className="text-[9px] px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium truncate">
                          📋 {pendingScheduledTasks} scheduled
                        </div>
                      )}
                      
                      {/* Due tasks - only show if there are tasks needing attention */}
                      {day.tasksNeedingAttention.length > 0 && (
                        <div className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 truncate">
                          ⚠️ {day.tasksNeedingAttention.length} due
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details */}
      {selectedDayData && (
        <div className="bg-surface rounded-xl border border-border p-4">
          <h3 className="font-semibold text-text mb-4">
            {selectedDayData.date.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </h3>

          {/* Scheduled Tasks for this day */}
          {selectedDayData.scheduledTasks.length > 0 && (
            <div className="space-y-2 mb-4">
              <h4 className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1">
                📋 Scheduled to work on ({selectedDayData.scheduledTasks.length})
              </h4>
              {selectedDayData.scheduledTasks.map((task) => {
                const schedStart = toSafeDate(task.scheduledStart);
                const dueDate = toSafeDate(task.dueDate);
                return (
                  <button
                    key={`sched-${task.id}`}
                    onClick={() => onTaskClick?.(task)}
                    className={`
                      w-full text-left p-3 rounded-lg border transition-colors
                      ${task.status === 'completed'
                        ? 'bg-success/5 border-success/30'
                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:border-primary/30'
                      }
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium ${
                          task.status === 'completed' ? 'line-through text-text-muted' : 'text-text'
                        }`}
                      >
                        {task.title}
                      </span>
                      <Badge
                        variant={
                          task.priority === 'urgent'
                            ? 'danger'
                            : task.priority === 'high'
                              ? 'warning'
                              : 'secondary'
                        }
                        size="sm"
                      >
                        {task.priority}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                      {schedStart && (
                        <span>⏰ {schedStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                      )}
                      {dueDate && (
                        <span className="text-amber-600 dark:text-amber-400">
                          📌 Due: {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      {task.estimatedMinutes && (
                        <span>~{task.estimatedMinutes}min</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tasks DUE on this day */}
          {selectedDayData.tasks.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1">
                📌 Due on this day ({selectedDayData.tasks.length})
              </h4>
              {selectedDayData.tasks.map((task) => {
                const schedStart = toSafeDate(task.scheduledStart);
                const isScheduledOnDifferentDay = schedStart && 
                  toLocalDateString(schedStart) !== selectedDayData.dateString;
                const isUnscheduled = !schedStart && task.status !== 'completed';
                return (
                  <div
                    key={`due-${task.id}`}
                    className={`
                      w-full p-3 rounded-lg border transition-colors
                      ${task.status === 'completed'
                        ? 'bg-success/5 border-success/30'
                        : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                      }
                    `}
                  >
                    <button
                      onClick={() => onTaskClick?.(task)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-medium ${
                            task.status === 'completed' ? 'line-through text-text-muted' : 'text-text'
                          }`}
                        >
                          {task.title}
                        </span>
                        <Badge
                          variant={
                            task.priority === 'urgent'
                              ? 'danger'
                              : task.priority === 'high'
                                ? 'warning'
                                : 'secondary'
                          }
                          size="sm"
                        >
                          {task.priority}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                        {schedStart ? (
                          <span className={isScheduledOnDifferentDay ? 'text-blue-600 dark:text-blue-400' : ''}>
                            ⏰ Scheduled: {schedStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' at '}
                            {schedStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-red-500 font-medium">⚠️ Not yet scheduled</span>
                        )}
                        {task.estimatedMinutes && (
                          <span>~{task.estimatedMinutes}min</span>
                        )}
                      </div>
                    </button>
                    
                    {/* Quick Schedule Button for unscheduled tasks */}
                    {isUnscheduled && onScheduleTask && (
                      <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800/50 flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onScheduleTask(task, selectedDayData.date);
                          }}
                          className="flex-1 text-xs px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium transition-colors"
                        >
                          📅 Schedule for Today
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onScheduleTask(task);
                          }}
                          className="flex-1 text-xs px-2 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded font-medium transition-colors"
                        >
                          🧠 Auto-Schedule
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {selectedDayData.tasks.length === 0 && selectedDayData.scheduledTasks.length === 0 && (
            <p className="text-sm text-text-muted">No tasks due or scheduled for this day</p>
          )}

          {/* Habit summary */}
          {habits.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-medium text-text-secondary mb-2">Habits</h4>
              <p className="text-sm text-text">
                {selectedDayData.habitCompletions} of {selectedDayData.totalHabits} habits completed
              </p>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30" />
          <span>Scheduled</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30" />
          <span>Due</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>All done</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span>Needs scheduling</span>
        </div>
        <span className="text-text-muted/50">|</span>
        <div className="flex items-center gap-1">
          <span className="w-6 h-1.5 rounded-full bg-emerald-400" />
          <span>&lt;50%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-6 h-1.5 rounded-full bg-amber-400" />
          <span>50-80%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-6 h-1.5 rounded-full bg-orange-500" />
          <span>80-100%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-6 h-1.5 rounded-full bg-red-500" />
          <span>Over</span>
        </div>
      </div>
    </div>
  );
}
