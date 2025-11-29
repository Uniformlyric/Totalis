import { Badge } from '@/components/ui';
import type { Project } from '@totalis/shared';

interface ProjectCardProps {
  project: Project;
  onClick?: (project: Project) => void;
  taskCount?: number;
  completedTaskCount?: number;
}

const statusConfig = {
  active: { color: 'primary', label: 'Active' },
  completed: { color: 'success', label: 'Completed' },
  archived: { color: 'secondary', label: 'Archived' },
  blocked: { color: 'danger', label: 'Blocked' },
} as const;

export function ProjectCard({ project, onClick, taskCount = 0, completedTaskCount = 0 }: ProjectCardProps) {
  const status = statusConfig[project.status];
  const progress = taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : project.progress;

  const formatDate = (date: Date | undefined) => {
    if (!date) return null;
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div
      onClick={() => onClick?.(project)}
      className={`
        group p-4 rounded-xl border bg-surface hover:shadow-md transition-all cursor-pointer
        ${project.status === 'completed' ? 'opacity-75 border-border' : 'border-border hover:border-primary/30'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: project.color || '#6366f1' }}
          />
          <h3 className="font-semibold text-text group-hover:text-primary transition-colors">
            {project.title}
          </h3>
        </div>
        <Badge variant={status.color as any} size="sm">
          {status.label}
        </Badge>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-text-muted line-clamp-2 mb-3">
          {project.description}
        </p>
      )}

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 bg-background rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <div className="flex items-center gap-3">
          {/* Task count */}
          <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            {completedTaskCount}/{taskCount} tasks
          </span>

          {/* Estimated hours */}
          {project.estimatedHours > 0 && (
            <span className="flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {project.estimatedHours}h
            </span>
          )}
        </div>

        {/* Deadline */}
        {project.deadline && (
          <span className="flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {formatDate(project.deadline)}
          </span>
        )}
      </div>

      {/* Tags */}
      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {project.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-background text-text-muted rounded"
            >
              {tag}
            </span>
          ))}
          {project.tags.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-text-muted">
              +{project.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
