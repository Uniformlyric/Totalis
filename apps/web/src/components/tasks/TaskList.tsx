import { useState, useMemo } from 'react';
import { TaskItem } from './TaskItem';
import { Input, Button } from '@/components/ui';
import type { Task, Project } from '@totalis/shared';

interface TaskListProps {
  tasks: Task[];
  projects?: Project[];
  onToggleTask: (taskId: string, completed: boolean) => void;
  onSelectTask: (task: Task) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

type FilterStatus = 'all' | 'pending' | 'in_progress' | 'completed';
type FilterPriority = 'all' | 'urgent' | 'high' | 'medium' | 'low';
type SortOption = 'dueDate' | 'priority' | 'created' | 'title';

const statusFilters: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

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

export function TaskList({
  tasks,
  projects = [],
  onToggleTask,
  onSelectTask,
  isLoading = false,
  emptyMessage = 'No tasks yet',
}: TaskListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<FilterPriority>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('dueDate');
  const [showFilters, setShowFilters] = useState(false);

  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      result = result.filter(
        (task) =>
          task.title.toLowerCase().includes(searchLower) ||
          task.description?.toLowerCase().includes(searchLower) ||
          task.tags.some((tag) => tag.toLowerCase().includes(searchLower))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((task) => task.status === statusFilter);
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      result = result.filter((task) => task.priority === priorityFilter);
    }

    // Project filter
    if (projectFilter !== 'all') {
      result = result.filter((task) => task.projectId === projectFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'dueDate': {
          const dateA = toSafeDate(a.dueDate);
          const dateB = toSafeDate(b.dueDate);
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1;
          if (!dateB) return -1;
          return dateA.getTime() - dateB.getTime();
        }
        case 'priority':
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case 'created': {
          const createdA = toSafeDate(a.createdAt);
          const createdB = toSafeDate(b.createdAt);
          if (!createdA || !createdB) return 0;
          return createdB.getTime() - createdA.getTime();
        }
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    // Always show incomplete tasks first
    if (statusFilter === 'all') {
      result.sort((a, b) => {
        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;
        return 0;
      });
    }

    return result;
  }, [tasks, search, statusFilter, priorityFilter, projectFilter, sortBy]);

  const taskCounts = useMemo(() => {
    return {
      all: tasks.length,
      pending: tasks.filter((t) => t.status === 'pending').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      completed: tasks.filter((t) => t.status === 'completed').length,
    };
  }, [tasks]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-surface rounded-xl border border-border p-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded bg-border" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-border rounded w-3/4" />
                <div className="h-3 bg-border rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and filters */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              }
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className={showFilters ? 'bg-primary/10 text-primary' : ''}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filters
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 p-1 bg-background rounded-lg border border-border">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`
                flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all
                ${statusFilter === filter.value
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-text-muted hover:text-text'
                }
              `}
            >
              {filter.label}
              <span className="ml-1 text-xs text-text-muted">
                ({taskCounts[filter.value]})
              </span>
            </button>
          ))}
        </div>

        {/* Extended filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 p-3 bg-background rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">Project:</label>
              <select
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                className="px-2 py-1 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All Projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">Priority:</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as FilterPriority)}
                className="px-2 py-1 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="px-2 py-1 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="dueDate">Due Date</option>
                <option value="priority">Priority</option>
                <option value="created">Created</option>
                <option value="title">Title</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Active filters indicator */}
      {(search || statusFilter !== 'all' || priorityFilter !== 'all' || projectFilter !== 'all') && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-text-muted">Active filters:</span>
          {search && (
            <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
              Search: "{search}"
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
              Status: {statusFilters.find(f => f.value === statusFilter)?.label}
            </span>
          )}
          {priorityFilter !== 'all' && (
            <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
              Priority: {priorityFilter}
            </span>
          )}
          {projectFilter !== 'all' && (
            <span className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-md">
              Project: {projects.find(p => p.id === projectFilter)?.title}
            </span>
          )}
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('all');
              setPriorityFilter('all');
              setProjectFilter('all');
            }}
            className="text-xs text-text-muted hover:text-text underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Task list */}
      {filteredAndSortedTasks.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface border border-border flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <p className="text-text-muted">{search ? 'No tasks match your search' : emptyMessage}</p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredAndSortedTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              project={projects.find((p) => p.id === task.projectId)}
              onToggle={onToggleTask}
              onClick={onSelectTask}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {filteredAndSortedTasks.length > 0 && (
        <div className="text-center text-xs text-text-muted pt-2">
          Showing {filteredAndSortedTasks.length} of {tasks.length} tasks
        </div>
      )}
    </div>
  );
}
