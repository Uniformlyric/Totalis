import type { Habit } from '@totalis/shared';

interface HabitStreakProps {
  habit: Habit;
  completionHistory: Map<string, boolean>;
  days?: number;
}

export function HabitStreak({
  habit,
  completionHistory,
  days = 7,
}: HabitStreakProps) {
  // Generate the last N days
  const today = new Date();
  const dateStrings: string[] = [];
  
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateStrings.push(d.toISOString().split('T')[0]);
  }

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="p-4 bg-surface rounded-xl border border-border">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{habit.icon || '✓'}</span>
          <h4 className="font-medium text-text">{habit.title}</h4>
        </div>
        {habit.currentStreak > 0 && (
          <div className="flex items-center gap-1 text-warning">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L8.5 11H2L6.5 15L4.5 22L12 17L19.5 22L17.5 15L22 11H15.5L12 2Z" />
            </svg>
            <span className="text-sm font-medium">{habit.currentStreak}</span>
          </div>
        )}
      </div>

      {/* Week View */}
      <div className="flex justify-between gap-1">
        {dateStrings.map((dateStr, index) => {
          const date = new Date(dateStr);
          const isCompleted = completionHistory.get(dateStr) === true;
          const isToday = dateStr === today.toISOString().split('T')[0];
          const dayIndex = date.getDay();

          return (
            <div key={dateStr} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-text-muted uppercase">
                {dayLabels[dayIndex]}
              </span>
              <div
                className={`
                  w-8 h-8 rounded-lg flex items-center justify-center
                  transition-all text-xs font-medium
                  ${isCompleted
                    ? 'text-white'
                    : isToday
                      ? 'border-2 border-dashed border-primary/50 text-text-muted'
                      : 'bg-surface-hover text-text-muted'
                  }
                `}
                style={{
                  backgroundColor: isCompleted ? (habit.color || 'var(--color-success)') : undefined,
                }}
              >
                {isCompleted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  date.getDate()
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-xs text-text-muted">
        <span>
          <span className="text-text font-medium">{habit.totalCompletions}</span> total completions
        </span>
        <span>
          Best: <span className="text-text font-medium">{habit.longestStreak}</span> days
        </span>
      </div>
    </div>
  );
}
