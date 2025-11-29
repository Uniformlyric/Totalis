import { useState, useMemo } from 'react';
import { ProjectCard } from './ProjectCard';
import { Input } from '@/components/ui';
import type { Project } from '@totalis/shared';

interface ProjectListProps {
  projects: Project[];
  onProjectClick?: (project: Project) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

type FilterStatus = 'all' | 'active' | 'completed' | 'blocked' | 'archived';
type SortBy = 'updatedAt' | 'title' | 'deadline' | 'progress';

const statusFilters: { value: FilterStatus; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'archived', label: 'Archived' },
];

const sortOptions: { value: SortBy; label: string }[] = [
  { value: 'updatedAt', label: 'Recently Updated' },
  { value: 'title', label: 'Title' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'progress', label: 'Progress' },
];

export function ProjectList({
  projects,
  onProjectClick,
  isLoading = false,
  emptyMessage = 'No projects yet',
}: ProjectListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<SortBy>('updatedAt');

  const filteredAndSortedProjects = useMemo(() => {
    let result = [...projects];

    // Filter by status
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'deadline':
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        case 'progress':
          return b.progress - a.progress;
        case 'updatedAt':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [projects, searchQuery, statusFilter, sortBy]);

  const statusCounts = useMemo(() => {
    return {
      all: projects.length,
      active: projects.filter((p) => p.status === 'active').length,
      completed: projects.filter((p) => p.status === 'completed').length,
      blocked: projects.filter((p) => p.status === 'blocked').length,
      archived: projects.filter((p) => p.status === 'archived').length,
    };
  }, [projects]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Loading skeleton for filters */}
        <div className="animate-pulse flex flex-wrap gap-4">
          <div className="h-10 bg-surface-hover rounded-lg w-64"></div>
          <div className="h-10 bg-surface-hover rounded-lg w-32"></div>
          <div className="h-10 bg-surface-hover rounded-lg w-40"></div>
        </div>
        {/* Loading skeleton for cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-surface rounded-xl p-4 h-48">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-surface-hover"></div>
                <div className="flex-1">
                  <div className="h-5 bg-surface-hover rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-surface-hover rounded w-1/2"></div>
                </div>
              </div>
              <div className="h-2 bg-surface-hover rounded-full w-full mb-4"></div>
              <div className="flex gap-2">
                <div className="h-5 bg-surface-hover rounded w-16"></div>
                <div className="h-5 bg-surface-hover rounded w-12"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and Search */}
      <div className="flex flex-wrap gap-4 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <Input
            type="search"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status Filter */}
        <div className="flex bg-surface rounded-lg p-1">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`
                px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                ${
                  statusFilter === filter.value
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text hover:bg-surface-hover'
                }
              `}
            >
              {filter.label}
              {statusCounts[filter.value] > 0 && (
                <span
                  className={`
                    ml-1.5 px-1.5 py-0.5 text-xs rounded-full
                    ${
                      statusFilter === filter.value
                        ? 'bg-white/20'
                        : 'bg-surface-hover'
                    }
                  `}
                >
                  {statusCounts[filter.value]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Sort by: {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Projects Grid */}
      {filteredAndSortedProjects.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-surface flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-text-secondary"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-text mb-1">
            {searchQuery || statusFilter !== 'all'
              ? 'No projects match your filters'
              : emptyMessage}
          </h3>
          <p className="text-sm text-text-secondary">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Create your first project to get started'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => onProjectClick?.(project)}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {filteredAndSortedProjects.length > 0 && (
        <p className="text-sm text-text-secondary text-center">
          Showing {filteredAndSortedProjects.length} of {projects.length} projects
        </p>
      )}
    </div>
  );
}
