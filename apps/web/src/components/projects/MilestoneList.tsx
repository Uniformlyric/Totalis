/**
 * MilestoneList Component
 * Displays all milestones for a project with collapsible tasks
 */

import { useState, useEffect } from 'react';
import { MilestoneCard } from './MilestoneCard';
import type { Milestone, Task } from '@totalis/shared';

interface MilestoneListProps {
  projectId: string;
  onTaskClick?: (task: Task) => void;
}

export function MilestoneList({ projectId, onTaskClick }: MilestoneListProps) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set());

  // Load milestones and tasks
  useEffect(() => {
    let unsubMilestones: (() => void) | undefined;
    let unsubTasks: (() => void) | undefined;

    const loadData = async () => {
      try {
        const { subscribeToMilestones } = await import('@/lib/db/milestones');
        const { subscribeToTasks } = await import('@/lib/db/tasks');

        unsubMilestones = subscribeToMilestones(projectId, (updatedMilestones) => {
          setMilestones(updatedMilestones);
          setLoading(false);
          
          // Auto-expand first milestone
          if (updatedMilestones.length > 0 && expandedMilestones.size === 0) {
            setExpandedMilestones(new Set([updatedMilestones[0].id]));
          }
        });

        unsubTasks = subscribeToTasks((updatedTasks) => {
          // Filter tasks for this project
          const projectTasks = updatedTasks.filter((t) => t.projectId === projectId);
          console.log('📋 Loaded tasks for project:', {
            projectId,
            totalTasks: updatedTasks.length,
            projectTasks: projectTasks.length,
            tasksWithMilestones: projectTasks.filter(t => t.milestoneId).length,
            tasks: projectTasks.map(t => ({
              title: t.title,
              milestoneId: t.milestoneId,
            })),
          });
          setTasks(projectTasks);
        }, { projectId });
      } catch (error) {
        console.error('Failed to load milestones:', error);
        setLoading(false);
      }
    };

    loadData();

    return () => {
      unsubMilestones?.();
      unsubTasks?.();
    };
  }, [projectId]);

  const toggleMilestone = (milestoneId: string) => {
    setExpandedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedMilestones(new Set(milestones.map((m) => m.id)));
  };

  const collapseAll = () => {
    setExpandedMilestones(new Set());
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-surface rounded-xl p-6 h-32" />
        ))}
      </div>
    );
  }

  if (milestones.length === 0) {
    return (
      <div className="text-center py-12 bg-surface rounded-xl">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-hover flex items-center justify-center">
          <svg
            className="w-8 h-8 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-text mb-2">No Milestones Yet</h3>
        <p className="text-text-secondary">
          This project doesn't have milestones. Use AI Quick Capture to create a structured project!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text">
          Milestones ({milestones.length})
        </h3>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-sm text-primary hover:text-primary-hover transition-colors"
          >
            Expand All
          </button>
          <span className="text-text-secondary">|</span>
          <button
            onClick={collapseAll}
            className="text-sm text-primary hover:text-primary-hover transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Milestone Cards */}
      <div className="space-y-3">
        {milestones.map((milestone) => {
          const milestoneTasks = tasks.filter((t) => t.milestoneId === milestone.id);

          return (
            <MilestoneCard
              key={milestone.id}
              milestone={milestone}
              tasks={milestoneTasks}
              isExpanded={expandedMilestones.has(milestone.id)}
              onToggleExpand={() => toggleMilestone(milestone.id)}
              onTaskClick={onTaskClick}
            />
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 p-4 bg-surface rounded-lg">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-text-secondary">Total Milestones</p>
            <p className="text-2xl font-bold text-text">{milestones.length}</p>
          </div>
          <div>
            <p className="text-text-secondary">Completed</p>
            <p className="text-2xl font-bold text-green-500">
              {milestones.filter((m) => m.status === 'completed').length}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">In Progress</p>
            <p className="text-2xl font-bold text-blue-500">
              {milestones.filter((m) => m.status === 'in_progress').length}
            </p>
          </div>
          <div>
            <p className="text-text-secondary">Total Tasks</p>
            <p className="text-2xl font-bold text-text">
              {milestones.reduce((sum, m) => sum + m.taskCount, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
