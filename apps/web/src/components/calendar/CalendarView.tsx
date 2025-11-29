import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui';
import type { Task, Habit, HabitLog } from '@totalis/shared';

interface CalendarViewProps {
  tasks: Task[];
  habits: Habit[];
  habitLogs: HabitLog[];
  onDayClick?: (date: Date) => void;
  onTaskClick?: (task: Task) => void;
}

interface DayData {
  date: Date;
  dateString: string;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
  habitCompletions: number;
  totalHabits: number;
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
  onDayClick,
  onTaskClick,
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayString = today.toISOString().split('T')[0];

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
      const dateString = current.toISOString().split('T')[0];
      
      // Get tasks for this day
      const dayTasks = tasks.filter((task) => {
        if (!task.dueDate) return false;
        const taskDate = new Date(task.dueDate).toISOString().split('T')[0];
        return taskDate === dateString;
      });

      // Get habit completions for this day
      const dayHabitLogs = habitLogs.filter((log) => log.date === dateString);
      const habitCompletions = dayHabitLogs.filter((log) => log.completed).length;

      days.push({
        date: new Date(current),
        dateString,
        isCurrentMonth: current.getMonth() === month,
        isToday: dateString === todayString,
        tasks: dayTasks,
        habitCompletions,
        totalHabits: habits.length,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  }, [currentDate, tasks, habits, habitLogs, todayString]);

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
            const hasOverdue = day.tasks.some(
              (t) => t.status !== 'completed' && new Date(t.dueDate!) < today
            );
            const hasHabits = day.habitCompletions > 0;
            const allHabitsComplete = day.habitCompletions === day.totalHabits && day.totalHabits > 0;

            return (
              <button
                key={day.dateString}
                onClick={() => handleDayClick(day)}
                className={`
                  min-h-[80px] p-2 border-b border-r border-border text-left
                  transition-colors hover:bg-surface-hover
                  ${!day.isCurrentMonth ? 'opacity-40' : ''}
                  ${selectedDate === day.dateString ? 'bg-primary/10' : ''}
                  ${index % 7 === 6 ? 'border-r-0' : ''}
                `}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`
                      inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium
                      ${day.isToday
                        ? 'bg-primary text-white'
                        : 'text-text'
                      }
                    `}
                  >
                    {day.date.getDate()}
                  </span>

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

                {/* Task indicators */}
                {hasTasks && day.isCurrentMonth && (
                  <div className="mt-1 space-y-0.5">
                    {day.tasks.slice(0, 2).map((task) => (
                      <div
                        key={task.id}
                        className={`
                          text-[10px] px-1.5 py-0.5 rounded truncate
                          ${task.status === 'completed'
                            ? 'bg-success/20 text-success line-through'
                            : hasOverdue && new Date(task.dueDate!) < today
                              ? 'bg-danger/20 text-danger'
                              : 'bg-primary/20 text-primary'
                          }
                        `}
                      >
                        {task.title}
                      </div>
                    ))}
                    {day.tasks.length > 2 && (
                      <div className="text-[10px] text-text-muted px-1.5">
                        +{day.tasks.length - 2} more
                      </div>
                    )}
                  </div>
                )}
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

          {/* Tasks for selected day */}
          {selectedDayData.tasks.length > 0 ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-text-secondary">Tasks</h4>
              {selectedDayData.tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick?.(task)}
                  className={`
                    w-full text-left p-3 rounded-lg border transition-colors
                    ${task.status === 'completed'
                      ? 'bg-success/5 border-success/30'
                      : 'bg-surface-hover border-border hover:border-primary/30'
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
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No tasks scheduled for this day</p>
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
      <div className="flex items-center gap-4 text-xs text-text-muted">
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-primary/20" />
          <span>Task due</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-success/20" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-danger/20" />
          <span>Overdue</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-success" />
          <span>All habits done</span>
        </div>
      </div>
    </div>
  );
}
