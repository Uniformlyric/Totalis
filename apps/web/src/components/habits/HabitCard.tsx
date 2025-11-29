import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui';
import type { Habit } from '@totalis/shared';

interface HabitCardProps {
  habit: Habit;
  isCompletedToday?: boolean;
  onToggle: (habitId: string) => void;
  onClick?: () => void;
}

const frequencyLabels: Record<Habit['frequency'], string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  custom: 'Custom',
};

export function HabitCard({
  habit,
  isCompletedToday = false,
  onToggle,
  onClick,
}: HabitCardProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnimating(true);
    onToggle(habit.id);
    setTimeout(() => setIsAnimating(false), 300);
  };

  return (
    <div
      onClick={onClick}
      className={`
        group flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer
        ${isCompletedToday
          ? 'bg-success/5 border-success/30'
          : 'bg-surface border-border hover:border-primary/30'
        }
        ${isAnimating ? 'scale-[0.98]' : ''}
      `}
    >
      {/* Completion Circle */}
      <button
        onClick={handleToggle}
        className={`
          relative w-12 h-12 rounded-full flex items-center justify-center
          transition-all duration-300 shrink-0
          ${isCompletedToday
            ? 'bg-success text-white'
            : 'border-2 border-border hover:border-primary'
          }
          ${isAnimating ? 'animate-check-bounce' : ''}
        `}
        style={{
          backgroundColor: isCompletedToday
            ? (habit.color || 'var(--color-success)')
            : 'transparent',
          borderColor: isCompletedToday ? 'transparent' : undefined,
        }}
      >
        {isCompletedToday ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className="text-2xl">{habit.icon || '✓'}</span>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold ${isCompletedToday ? 'text-success' : 'text-text'}`}>
            {habit.title}
          </h3>
          <Badge variant="secondary" size="sm">
            {frequencyLabels[habit.frequency]}
          </Badge>
        </div>

        {habit.description && (
          <p className="text-sm text-text-secondary mt-0.5 line-clamp-1">
            {habit.description}
          </p>
        )}

        {/* Streak Info */}
        <div className="flex items-center gap-4 mt-2 text-xs">
          {habit.currentStreak > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L8.5 11H2L6.5 15L4.5 22L12 17L19.5 22L17.5 15L22 11H15.5L12 2Z" />
              </svg>
              {habit.currentStreak} day streak
            </span>
          )}
          {habit.longestStreak > 0 && (
            <span className="text-text-muted">
              Best: {habit.longestStreak} days
            </span>
          )}
          <span className="text-text-muted">
            {habit.totalCompletions} total
          </span>
        </div>
      </div>

      {/* Edit Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
        className="opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-background text-text-muted hover:text-text transition-all"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
          <circle cx="5" cy="12" r="1" />
        </svg>
      </button>
    </div>
  );
}
