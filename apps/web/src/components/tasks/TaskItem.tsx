import { useState } from 'react';
import { Badge, Checkbox } from '@/components/ui';
import type { Task, Project } from '@totalis/shared';

interface TaskItemProps {
  task: Task;
  onToggle: (taskId: string, completed: boolean) => void;
  onClick: (task: Task) => void;
  project?: Project;
  showProject?: boolean;
}

const priorityConfig = {
  urgent: { color: 'danger', label: 'Urgent' },
  high: { color: 'warning', label: 'High' },
  medium: { color: 'primary', label: 'Medium' },
  low: { color: 'secondary', label: 'Low' },
} as const;

const statusConfig = {
  pending: { color: 'secondary', label: 'To Do' },
  in_progress: { color: 'primary', label: 'In Progress' },
  completed: { color: 'success', label: 'Done' },
  blocked: { color: 'danger', label: 'Blocked' },
} as const;

// Safe date conversion helper
const toSafeDate = (value: unknown): Date | null => {
  if (!value) return null;
  try {
    // Handle Firestore Timestamp
    if (typeof value === 'object' && 'toDate' in value) {
      return (value as any).toDate();
    }
    const date = new Date(value as string | number);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
};

export function TaskItem({ task, onToggle, onClick, project, showProject = true }: TaskItemProps) {
  const [isCompleting, setIsCompleting] = useState(false);
  const isCompleted = task.status === 'completed';
  
  const handleToggle = async (checked: boolean) => {
    setIsCompleting(true);
    await onToggle(task.id, checked);
    setIsCompleting(false);
  };

  const formatDueDate = (dateValue: unknown) => {
    const date = toSafeDate(dateValue);
    if (!date) return null;
    const d = date;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDay = new Date(d);
    dueDay.setHours(0, 0, 0, 0);
    
    const diff = Math.floor((dueDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return { text: 'Overdue', isOverdue: true };
    if (diff === 0) return { text: 'Today', isOverdue: false };
    if (diff === 1) return { text: 'Tomorrow', isOverdue: false };
    if (diff < 7) return { text: d.toLocaleDateString('en-US', { weekday: 'short' }), isOverdue: false };
    return { text: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), isOverdue: false };
  };

  const dueInfo = formatDueDate(task.dueDate);
  const priority = priorityConfig[task.priority];

  return (
    <div
      className={`
        group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer
        ${isCompleted 
          ? 'bg-surface/50 border-border/50 opacity-60' 
          : 'bg-surface border-border hover:border-primary/30 hover:shadow-sm'
        }
        ${isCompleting ? 'scale-[0.98]' : ''}
      `}
      onClick={() => onClick(task)}
    >
      {/* Checkbox */}
      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onChange={handleToggle}
          className={isCompleting ? 'animate-pulse' : ''}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4
            className={`
              text-sm font-medium transition-all
              ${isCompleted ? 'line-through text-text-muted' : 'text-text'}
            `}
          >
            {task.title}
          </h4>
          
          {/* Priority Badge */}
          {task.priority !== 'medium' && !isCompleted && (
            <Badge variant={priority.color as any} size="sm">
              {priority.label}
            </Badge>
          )}
        </div>

        {/* Description preview */}
        {task.description && !isCompleted && (
          <p className="text-xs text-text-muted mt-1 line-clamp-1">
            {task.description}
          </p>
        )}

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-2 text-xs text-text-muted">
          {/* Due date */}
          {dueInfo && (
            <span className={`flex items-center gap-1 ${dueInfo.isOverdue ? 'text-danger' : ''}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dueInfo.text}
            </span>
          )}

          {/* Estimated time */}
          {task.estimatedMinutes > 0 && (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {task.estimatedMinutes < 60 
                ? `${task.estimatedMinutes}m` 
                : `${Math.floor(task.estimatedMinutes / 60)}h ${task.estimatedMinutes % 60}m`
              }
            </span>
          )}

          {/* Tags */}
          {task.tags.length > 0 && (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              {task.tags.slice(0, 2).join(', ')}
              {task.tags.length > 2 && ` +${task.tags.length - 2}`}
            </span>
          )}

          {/* Project */}
          {showProject && project && (
            <span className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: project.color || '#6366f1' }}
              />
              <span className="truncate max-w-[100px]">{project.title}</span>
            </span>
          )}
        </div>
      </div>

      {/* Quick actions (visible on hover) */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick(task);
          }}
          className="p-1.5 rounded-lg hover:bg-background text-text-muted hover:text-text transition-colors"
          title="Edit task"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
