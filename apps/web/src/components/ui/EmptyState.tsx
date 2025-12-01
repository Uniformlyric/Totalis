import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  secondaryAction?: {
    label: string;
    onClick?: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">{title}</h3>
      <p className="text-text-secondary max-w-sm mb-6">{description}</p>
      <div className="flex items-center gap-3">
        {action && (
          action.href ? (
            <a href={action.href}>
              <Button>{action.label}</Button>
            </a>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )
        )}
        {secondaryAction && (
          <Button variant="ghost" onClick={secondaryAction.onClick}>
            {secondaryAction.label}
          </Button>
        )}
      </div>
    </div>
  );
}

// Pre-built empty states for common scenarios
export function EmptyTasks({ onAddTask }: { onAddTask?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      }
      title="No tasks yet"
      description="Start by adding your first task. You can also press Ctrl+K to use AI Quick Capture."
      action={{
        label: '+ Add Task',
        onClick: onAddTask,
      }}
    />
  );
}

export function EmptyGoals({ onAddGoal }: { onAddGoal?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      }
      title="Set your first goal"
      description="Goals help you stay focused on what matters most. What do you want to achieve?"
      action={{
        label: '+ Create Goal',
        onClick: onAddGoal,
      }}
    />
  );
}

export function EmptyProjects({ onAddProject }: { onAddProject?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
        </svg>
      }
      title="No projects yet"
      description="Projects help you organize related tasks and track progress towards bigger objectives."
      action={{
        label: '+ Create Project',
        onClick: onAddProject,
      }}
    />
  );
}

export function EmptyHabits({ onAddHabit }: { onAddHabit?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20v-6M6 20V10M18 20V4" />
        </svg>
      }
      title="Build your first habit"
      description="Small daily habits compound into remarkable results over time."
      action={{
        label: '+ Add Habit',
        onClick: onAddHabit,
      }}
    />
  );
}

export function EmptyNotes({ onAddNote }: { onAddNote?: () => void }) {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      }
      title="No notes yet"
      description="Capture ideas, meeting notes, or anything you want to remember."
      action={{
        label: '+ Create Note',
        onClick: onAddNote,
      }}
    />
  );
}

export function EmptyCalendar() {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      }
      title="Nothing scheduled"
      description="Your calendar is clear! Add tasks with due dates to see them here."
      action={{
        label: 'Go to Tasks',
        href: '/tasks',
      }}
    />
  );
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      }
      title="No results found"
      description={`We couldn't find anything matching "${query}". Try a different search term.`}
    />
  );
}

export function EmptyTimeline() {
  return (
    <EmptyState
      icon={
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <polyline points="8 8 12 4 16 8" />
          <polyline points="8 16 12 20 16 16" />
        </svg>
      }
      title="Nothing to show"
      description="Create projects, tasks, or goals with deadlines to see them on the timeline."
      action={{
        label: 'Create Project',
        href: '/projects',
      }}
    />
  );
}
