/**
 * MilestoneCard Component
 * Displays a single milestone with its tasks, progress, and status
 */

import { useState } from 'react';
import { Card, CardContent, Badge } from '@/components/ui';
import type { Milestone, Task } from '@totalis/shared';

interface MilestoneCardProps {
  milestone: Milestone;
  tasks: Task[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onTaskClick?: (task: Task) => void;
  onToggleTaskComplete?: (task: Task) => void;
  showDetails?: boolean;
}

export function MilestoneCard({
  milestone,
  tasks,
  isExpanded = false,
  onToggleExpand,
  onTaskClick,
  onToggleTaskComplete,
  showDetails = true,
}: MilestoneCardProps) {
  const [localExpanded, setLocalExpanded] = useState(isExpanded);

  const handleToggle = () => {
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setLocalExpanded(!localExpanded);
    }
  };

  const expanded = onToggleExpand ? isExpanded : localExpanded;

  // Sort tasks by status (pending first)
  const sortedTasks = [...tasks].sort((a, b) => {
    const statusOrder = { pending: 0, in_progress: 1, blocked: 2, completed: 3 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  // Status colors
  const statusColors = {
    pending: 'bg-gray-500',
    in_progress: 'bg-blue-500',
    completed: 'bg-green-500',
    blocked: 'bg-red-500',
  };

  const statusLabels = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    blocked: 'Blocked',
  };

  return (
    <Card className="border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: milestone.progress === 100 ? '#10b981' : '#6366f1' }}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={handleToggle}
                className="text-text-secondary hover:text-text transition-colors flex-shrink-0"
                aria-label={expanded ? 'Collapse' : 'Expand'}
                title={expanded ? 'Click to collapse' : 'Click to expand tasks'}
              >
                <svg
                  className={`w-5 h-5 transition-transform ${expanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-text flex items-center gap-2 flex-wrap">
                  <span className="text-text-secondary">#{milestone.order}</span>
                  <span className="break-words">{milestone.title}</span>
                  {milestone.status === 'completed' && (
                    <span className="text-green-500 text-xl" title="Completed">✓</span>
                  )}
                </h3>
                {milestone.description && (
                  <p className="text-sm text-text-secondary mt-1 break-words">{milestone.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Status Badge */}
          <Badge className={`${statusColors[milestone.status]} text-white flex-shrink-0`}>
            {statusLabels[milestone.status]}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-text-secondary">
              {milestone.completedTaskCount} / {milestone.taskCount} tasks completed
            </span>
            <span className="font-medium text-text">{milestone.progress}%</span>
          </div>
          <div className="w-full bg-surface-hover rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${milestone.progress}%` }}
            />
          </div>
        </div>

        {/* Details */}
        {showDetails && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-text-secondary">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Est: {milestone.estimatedHours}h</span>
            </div>
            {milestone.actualHours > 0 && (
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Actual: {Math.round(milestone.actualHours * 10) / 10}h</span>
              </div>
            )}
            {milestone.deadline && (
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Due: {new Date(milestone.deadline).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        )}

        {/* Task List (Expanded) */}
        {expanded && (
          <div className="mt-4 space-y-2 border-t border-border pt-3">
            {sortedTasks.length === 0 ? (
              <p className="text-sm text-text-secondary italic text-center py-4">
                No tasks in this milestone yet
              </p>
            ) : (
              sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover transition-colors ${
                    onTaskClick ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Clickable Checkbox for completion toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTaskComplete?.(task);
                    }}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                      task.status === 'completed'
                        ? 'bg-green-500 border-green-500'
                        : 'border-border hover:border-primary'
                    }`}
                    title={task.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.status === 'completed' && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>

                  {/* Clickable Task Info - opens edit modal */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskClick?.(task);
                    }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className={`text-sm font-medium ${
                      task.status === 'completed' ? 'line-through text-text-secondary' : 'text-text'
                    }`}>
                      {task.title}
                    </p>
                    {task.description && (
                      <p className="text-xs text-text-secondary truncate">{task.description}</p>
                    )}
                  </button>

                  {/* Task Metadata */}
                  <div className="flex items-center gap-2 text-xs text-text-secondary flex-shrink-0">
                    {task.estimatedMinutes && (
                      <span>{Math.round(task.estimatedMinutes / 60 * 10) / 10}h</span>
                    )}
                    {task.priority !== 'low' && task.priority !== 'medium' && (
                      <Badge
                        className={
                          task.priority === 'urgent'
                            ? 'bg-red-500 text-white'
                            : 'bg-orange-500 text-white'
                        }
                      >
                        {task.priority}
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
