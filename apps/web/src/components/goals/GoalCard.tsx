import { Badge } from '@/components/ui';
import type { Goal, Project } from '@totalis/shared';

interface GoalCardProps {
  goal: Goal;
  projects?: Project[];
  onClick?: () => void;
}

const timeframeLabels: Record<Goal['timeframe'], string> = {
  weekly: 'This Week',
  monthly: 'This Month',
  quarterly: 'This Quarter',
  yearly: 'This Year',
  custom: 'Custom',
};

export function GoalCard({ goal, projects = [], onClick }: GoalCardProps) {
  const linkedProjects = projects.filter((p) => p.goalId === goal.id);
  const progressPercentage = Math.round(goal.progress);

  const statusColors = {
    active: 'bg-success/20 text-success',
    completed: 'bg-primary/20 text-primary',
    blocked: 'bg-warning/20 text-warning',
    archived: 'bg-text-muted/20 text-text-muted',
  };

  // Calculate days until deadline
  const daysUntilDeadline = goal.deadline
    ? Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <button
      onClick={onClick}
      className="
        w-full text-left bg-surface rounded-xl border border-border p-5
        hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5
        transition-all duration-200 group
      "
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{goal.icon || '🎯'}</span>
            <h3 className="font-semibold text-text group-hover:text-primary transition-colors line-clamp-1">
              {goal.title}
            </h3>
          </div>
          {goal.description && (
            <p className="text-sm text-text-secondary line-clamp-2 ml-9">
              {goal.description}
            </p>
          )}
        </div>
        <Badge
          variant={goal.status === 'completed' ? 'success' : 'secondary'}
          className={statusColors[goal.status]}
        >
          {goal.status}
        </Badge>
      </div>

      {/* Progress */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-text-secondary">Progress</span>
          <span className="font-medium text-text">{progressPercentage}%</span>
        </div>
        <div className="h-2.5 bg-surface-hover rounded-full overflow-hidden">
          <div
            className={`
              h-full rounded-full transition-all duration-500
              ${goal.status === 'completed' 
                ? 'bg-success' 
                : 'bg-gradient-to-r from-primary to-accent'
              }
            `}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Linked Projects */}
      {linkedProjects.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-text-secondary mb-2">
            {linkedProjects.length} linked project{linkedProjects.length !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {linkedProjects.slice(0, 3).map((project) => (
              <div
                key={project.id}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-surface-hover rounded text-xs"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: project.color || '#6366f1' }}
                />
                <span className="text-text-secondary truncate max-w-[100px]">
                  {project.title}
                </span>
              </div>
            ))}
            {linkedProjects.length > 3 && (
              <span className="px-2 py-0.5 bg-surface-hover rounded text-xs text-text-secondary">
                +{linkedProjects.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <Badge variant="secondary" className="text-xs">
          {timeframeLabels[goal.timeframe]}
        </Badge>

        {daysUntilDeadline !== null && (
          <span
            className={`
              text-xs font-medium
              ${daysUntilDeadline < 0 
                ? 'text-danger' 
                : daysUntilDeadline <= 7 
                  ? 'text-warning' 
                  : 'text-text-secondary'
              }
            `}
          >
            {daysUntilDeadline < 0
              ? `${Math.abs(daysUntilDeadline)} days overdue`
              : daysUntilDeadline === 0
                ? 'Due today'
                : daysUntilDeadline === 1
                  ? 'Due tomorrow'
                  : `${daysUntilDeadline} days left`}
          </span>
        )}

        {goal.targetValue && goal.currentValue !== undefined && (
          <span className="text-xs text-text-secondary">
            {goal.currentValue} / {goal.targetValue} {goal.unit || ''}
          </span>
        )}
      </div>
    </button>
  );
}
